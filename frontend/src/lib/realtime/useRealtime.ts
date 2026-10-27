'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Client, type IMessage } from '@stomp/stompjs';
import { applyChatFrame } from '@/lib/api/messaging';
import { applyNotificationFrame } from '@/lib/api/notifications';
import type { ChatFrame, NotificationFrame } from '@/lib/api/types';

export type LiveStatus = 'connecting' | 'live' | 'offline';
export interface LiveEvent { id: string; type: string; entityType: string; entityId: number | null; sector: string | null; weredaId: number | null; occurredAt: string; payload: Record<string, unknown> }

/**
 * Subscribes to the backend STOMP topics and invalidates the affected TanStack Query caches,
 * so every panel refreshes with the real data rather than trusting the event payload.
 */
export function useRealtime(onEvent?: (e: LiveEvent) => void) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const handler = useRef(onEvent);
  handler.current = onEvent;
  const clientRef = useRef<Client | null>(null);
  const chatListeners = useRef(new Set<(f: ChatFrame) => void>());
  const notificationListeners = useRef(new Set<(f: NotificationFrame) => void>());
  const connectedOnce = useRef(false);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8080/ws';
    let disposed = false;
    const client = new Client({
      brokerURL: url,
      reconnectDelay: 5000,
      heartbeatIncoming: 20000,
      heartbeatOutgoing: 20000,
      beforeConnect: async () => {
        try {
          const r = await fetch('/api/auth/ws-token', { credentials: 'same-origin' });
          if (!r.ok) throw new Error('no token');
          const { token } = (await r.json()) as { token: string };
          client.connectHeaders = { Authorization: `Bearer ${token}` };
        } catch { setStatus('offline'); }
      },
      onConnect: () => {
        if (disposed) return;
        setStatus('live');
        const dispatch = (m: IMessage) => {
          try {
            const e = JSON.parse(m.body) as LiveEvent;
            setLastEventAt(Date.now());
            handler.current?.(e);
            qc.invalidateQueries({ queryKey: ['overview'] });
            qc.invalidateQueries({ queryKey: ['stream'] });
            qc.invalidateQueries({ queryKey: ['weredaMetrics'] });
            if (e.type.startsWith('ALERT_')) { qc.invalidateQueries({ queryKey: ['alerts'] }); qc.invalidateQueries({ queryKey: ['alertCounts'] }); }
            if (e.entityType === 'PROJECT') { qc.invalidateQueries({ queryKey: ['projects'] }); if (e.entityId) qc.invalidateQueries({ queryKey: ['project', e.entityId] }); }
            if (e.entityType === 'FACILITY') { qc.invalidateQueries({ queryKey: ['facilities'] }); qc.invalidateQueries({ queryKey: ['assessments'] }); if (e.entityId) qc.invalidateQueries({ queryKey: ['facility', e.entityId] }); }
          } catch { /* ignore malformed frames */ }
        };
        client.subscribe('/topic/dashboard', dispatch);
        // Messaging: private frames for this user, plus who is online.
        client.subscribe('/user/queue/chat', (m: IMessage) => {
          try {
            const f = JSON.parse(m.body) as ChatFrame;
            applyChatFrame(qc, f);
            chatListeners.current.forEach((l) => l(f));
          } catch { /* ignore malformed frames */ }
        });
        client.subscribe('/user/queue/notifications', (m: IMessage) => {
          try {
            const f = JSON.parse(m.body) as NotificationFrame;
            applyNotificationFrame(qc, f);
            notificationListeners.current.forEach((l) => l(f));
          } catch { /* ignore malformed frames */ }
        });
        client.subscribe('/topic/presence', () => {
          qc.invalidateQueries({ queryKey: ['chatPeople'] });
          qc.invalidateQueries({ queryKey: ['chatConversation'] });
          qc.invalidateQueries({ queryKey: ['chatConversations'] });
        });
        // Anything sent while disconnected is fetched again rather than lost.
        if (connectedOnce.current) ['chatMessages', 'chatConversations', 'chatUnread', 'chatConversation', 'notifications', 'notificationUnread'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
        connectedOnce.current = true;
      },
      onStompError: () => setStatus('offline'),
      onWebSocketClose: () => { if (!disposed) setStatus('connecting'); },
      onWebSocketError: () => setStatus('offline'),
    });
    clientRef.current = client;
    client.activate();
    return () => { disposed = true; clientRef.current = null; client.deactivate().catch(() => undefined); };
  }, [qc]);

  const sendTyping = useCallback((conversationId: number) => {
    const c = clientRef.current;
    if (c?.connected) c.publish({ destination: '/app/chat.typing', body: JSON.stringify({ conversationId }) });
  }, []);
  const onChatFrame = useCallback((l: (f: ChatFrame) => void) => {
    chatListeners.current.add(l);
    return () => { chatListeners.current.delete(l); };
  }, []);

  const onNotificationFrame = useCallback((l: (f: NotificationFrame) => void) => {
    notificationListeners.current.add(l);
    return () => { notificationListeners.current.delete(l); };
  }, []);

  return { status, lastEventAt, sendTyping, onChatFrame, onNotificationFrame };
}
