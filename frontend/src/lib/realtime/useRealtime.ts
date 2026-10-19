'use client';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Client, type IMessage } from '@stomp/stompjs';

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
      },
      onStompError: () => setStatus('offline'),
      onWebSocketClose: () => { if (!disposed) setStatus('connecting'); },
      onWebSocketError: () => setStatus('offline'),
    });
    client.activate();
    return () => { disposed = true; client.deactivate().catch(() => undefined); };
  }, [qc]);

  return { status, lastEventAt };
}
