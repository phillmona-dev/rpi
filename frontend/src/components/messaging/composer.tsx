'use client';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { FileText, Loader2, Paperclip, SendHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api/client';
import { MAX_ATTACHMENT_BYTES, uploadAttachment } from '@/lib/api/messaging';
import type { ChatAttachment, ChatMessage, ChatPerson } from '@/lib/api/types';
import { useLive } from '@/components/layout/live-indicator';
import { cn } from '@/lib/utils';
import { PersonAvatar, bytesLabel } from './util';

interface Pending { key: string; name: string; size: number; status: 'uploading' | 'done' | 'error'; attachment?: ChatAttachment; error?: string }

export interface ComposerHandle { addFiles: (files: FileList | File[]) => void; focus: () => void }

export const Composer = React.forwardRef<ComposerHandle, {
  conversationId: number; people: ChatPerson[]; replyTo: ChatMessage | null; onCancelReply: () => void;
  onSend: (b: { body: string; replyToId?: number; attachmentIds?: number[] }) => Promise<void>; compact?: boolean;
}>(function Composer({ conversationId, people, replyTo, onCancelReply, onSend, compact }, ref) {
  const t = useTranslations('messaging');
  const live = useLive();
  const draftKey = `rpis.chat.draft.${conversationId}`;
  const [text, setText] = React.useState('');
  const [files, setFiles] = React.useState<Pending[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [mention, setMention] = React.useState<{ query: string; start: number } | null>(null);
  const [active, setActive] = React.useState(0);
  const area = React.useRef<HTMLTextAreaElement>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const lastTyping = React.useRef(0);

  // Unsent drafts survive navigation (per conversation, this browser only).
  React.useEffect(() => {
    try { setText(sessionStorage.getItem(draftKey) ?? ''); } catch { setText(''); }
    setFiles([]); setError(null);
  }, [draftKey]);
  React.useEffect(() => { try { if (text) sessionStorage.setItem(draftKey, text); else sessionStorage.removeItem(draftKey); } catch { /* storage unavailable */ } }, [text, draftKey]);

  React.useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [text]);

  React.useEffect(() => { if (replyTo) area.current?.focus(); }, [replyTo]);

  const addFiles = React.useCallback((list: FileList | File[]) => {
    const incoming = Array.from(list).slice(0, 10);
    for (const f of incoming) {
      const key = `${f.name}-${f.size}-${Math.random().toString(36).slice(2)}`;
      if (f.size > MAX_ATTACHMENT_BYTES) {
        setFiles((x) => [...x, { key, name: f.name, size: f.size, status: 'error', error: t('errors.tooLarge') }]);
        continue;
      }
      setFiles((x) => [...x, { key, name: f.name, size: f.size, status: 'uploading' }]);
      uploadAttachment(f)
        .then((a) => setFiles((x) => x.map((p) => (p.key === key ? { ...p, status: 'done', attachment: a } : p))))
        .catch((e) => setFiles((x) => x.map((p) => (p.key === key ? { ...p, status: 'error', error: e instanceof ApiError ? e.detail || e.title : t('errors.upload') } : p))));
    }
  }, [t]);

  React.useImperativeHandle(ref, () => ({ addFiles, focus: () => area.current?.focus() }), [addFiles]);

  const candidates = React.useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return people.filter((p) => p.username.toLowerCase().includes(q) || p.fullName.toLowerCase().includes(q)).slice(0, 6);
  }, [mention, people]);

  const detectMention = (value: string, caret: number) => {
    const m = /(^|[\s(])@([A-Za-z0-9._-]{0,64})$/.exec(value.slice(0, caret));
    setMention(m ? { query: m[2], start: caret - m[2].length - 1 } : null);
    setActive(0);
  };

  const pick = (p: ChatPerson) => {
    if (!mention) return;
    const el = area.current;
    const caret = el?.selectionStart ?? text.length;
    const next = `${text.slice(0, mention.start)}@${p.username} ${text.slice(caret)}`;
    setText(next);
    setMention(null);
    requestAnimationFrame(() => { const pos = mention.start + p.username.length + 2; el?.focus(); el?.setSelectionRange(pos, pos); });
  };

  const uploading = files.some((f) => f.status === 'uploading');
  const ready = files.filter((f) => f.status === 'done' && f.attachment);
  const canSend = !sending && !uploading && (text.trim().length > 0 || ready.length > 0);

  const submit = async () => {
    if (!canSend) return;
    setSending(true); setError(null);
    try {
      await onSend({ body: text.trim(), replyToId: replyTo?.id, attachmentIds: ready.map((f) => f.attachment!.id) });
      setText(''); setFiles([]); onCancelReply();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail || e.title : t('errors.send'));
    } finally {
      setSending(false);
      area.current?.focus();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention && candidates.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % candidates.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + candidates.length) % candidates.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(candidates[active]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setMention(null); return; }
    }
    if (e.key === 'Escape' && replyTo) { onCancelReply(); return; }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
  };

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    detectMention(e.target.value, e.target.selectionStart);
    const now = Date.now();
    if (e.target.value && now - lastTyping.current > 3000) { lastTyping.current = now; live?.sendTyping(conversationId); }
  };

  return (
    <div className="relative border-t bg-card px-3 pb-3 pt-2">
      {replyTo && (
        <div className="mb-2 flex items-start gap-2 rounded-md border-l-2 border-primary bg-muted/50 px-3 py-1.5 text-sm">
          <div className="min-w-0 flex-1">
            <div className="font-medium">{t('replyingTo', { name: replyTo.senderName ?? t('unknownSender') })}</div>
            <div className="truncate text-muted-foreground">{replyTo.body ?? t('attachmentOnly')}</div>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t('cancelReply')} onClick={onCancelReply}><X className="h-4 w-4" /></Button>
        </div>
      )}
      {files.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2" aria-label={t('attachments')}>
          {files.map((f) => (
            <li key={f.key} className={cn('flex max-w-[16rem] items-center gap-2 rounded-md border px-2 py-1 text-sm', f.status === 'error' && 'border-[color:var(--status-critical)]')}>
              {f.status === 'uploading' ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <span className="min-w-0 truncate" title={f.error ?? f.name}>{f.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{f.status === 'error' ? t('failed') : bytesLabel(f.size)}</span>
              <button type="button" className="shrink-0 rounded p-0.5 hover:bg-muted" aria-label={t('removeAttachment', { name: f.name })} onClick={() => setFiles((x) => x.filter((p) => p.key !== f.key))}><X className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
      {mention && candidates.length > 0 && (
        <ul role="listbox" aria-label={t('mentionSomeone')} className="absolute bottom-full left-3 z-20 mb-1 w-72 overflow-hidden rounded-md border bg-popover shadow-lg">
          {candidates.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(p); }} onMouseEnter={() => setActive(i)}
                className={cn('flex w-full items-center gap-2 px-3 py-2 text-left text-sm', i === active && 'bg-accent')}>
                <PersonAvatar person={p} size="sm" />
                <span className="min-w-0"><span className="block truncate font-medium">{p.fullName}</span><span className="block truncate text-xs text-muted-foreground">@{p.username}{p.title ? ` · ${p.title}` : ''}</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,text/csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip" />
        <Button type="button" variant="ghost" size="icon" aria-label={t('attach')} onClick={() => fileInput.current?.click()}><Paperclip className="h-5 w-5" /></Button>
        <textarea
          ref={area}
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setMention(null), 150)}
          onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); addFiles(e.clipboardData.files); } }}
          rows={1}
          maxLength={4000}
          placeholder={t('placeholder')}
          aria-label={t('placeholder')}
          className={cn('min-h-[44px] flex-1 resize-none rounded-md border border-input bg-background px-3 py-2.5 text-base leading-snug outline-none focus-visible:ring-2 focus-visible:ring-ring', compact && 'min-h-[40px]')}
        />
        <Button type="button" size="icon" aria-label={t('send')} onClick={submit} disabled={!canSend}>
          {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <SendHorizontal className="h-5 w-5" />}
        </Button>
      </div>
      <div className="mt-1 flex justify-between gap-3 text-xs text-muted-foreground">
        <span role="alert" style={error ? { color: 'var(--status-critical)' } : undefined}>{error ?? (text.length > 3500 ? t('charsLeft', { count: 4000 - text.length }) : '')}</span>
        {!compact && <span className="hidden tablet:inline">{t('composerHint')}</span>}
      </div>
    </div>
  );
});
