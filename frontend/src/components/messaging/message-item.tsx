'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Copy, CornerUpLeft, FileText, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ApiError } from '@/lib/api/client';
import { attachmentUrl, useDeleteMessage, useEditMessage } from '@/lib/api/messaging';
import type { ChatMention, ChatMessage } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { PersonAvatar, bytesLabel, useSystemText } from './util';

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;

/** Message text with @mentions highlighted (yours stronger) and links made clickable. */
export function MessageBody({ body, mentions, meId }: { body: string; mentions: ChatMention[]; meId: number }) {
  const byHandle = new Map(mentions.map((m) => [m.username.toLowerCase(), m]));
  const parts = body.split(/((?<![\w@])@[A-Za-z0-9._-]{2,64})/g);
  return (
    <>
      {parts.map((part, i) => {
        const mention = part.startsWith('@') ? byHandle.get(part.slice(1).toLowerCase()) : undefined;
        if (mention) {
          return (
            <span key={i} title={`@${mention.username}`} className={cn('rounded px-0.5 font-medium', mention.id === meId ? 'bg-primary/20 text-primary' : 'text-primary')}>
              @{mention.fullName}
            </span>
          );
        }
        return part.split(URL_RE).map((chunk, j) =>
          /^https?:\/\//.test(chunk)
            ? <a key={`${i}-${j}`} href={chunk} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-2">{chunk}</a>
            : <React.Fragment key={`${i}-${j}`}>{chunk}</React.Fragment>);
      })}
    </>
  );
}

export function SystemLine({ m }: { m: ChatMessage }) {
  const text = useSystemText();
  const locale = useLocale();
  return (
    <div id={`msg-${m.id}`} className="my-2 flex items-center gap-3 text-sm text-muted-foreground" role="note">
      <span className="h-px flex-1 bg-border" aria-hidden />
      <span className="max-w-[80%] text-center">{text(m)} · <time dateTime={m.createdAt}>{new Date(m.createdAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</time></span>
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
  );
}

export function MessageItem({ m, mine, grouped, meId, canModerate, canPost, onReply, receipt }: {
  m: ChatMessage; mine: boolean; grouped: boolean; meId: number; canModerate: boolean; canPost: boolean;
  onReply: (m: ChatMessage) => void; receipt?: React.ReactNode;
}) {
  const t = useTranslations('messaging');
  const locale = useLocale();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(m.body ?? '');
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const edit = useEditMessage();
  const del = useDeleteMessage();
  const time = new Date(m.createdAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  const save = async () => {
    const body = draft.trim();
    if (!body) return;
    setError(null);
    try { await edit.mutateAsync({ id: m.id, body }); setEditing(false); }
    catch (e) { setError(e instanceof ApiError ? e.detail || e.title : t('errors.generic')); }
  };
  const remove = async () => {
    setError(null);
    try { await del.mutateAsync(m.id); setConfirmDelete(false); }
    catch (e) { setError(e instanceof ApiError ? e.detail || e.title : t('errors.generic')); }
  };
  const jump = (id: number) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-primary/50');
    setTimeout(() => el.classList.remove('ring-2', 'ring-primary/50'), 1600);
  };

  const images = m.attachments.filter((a) => a.mediaType.startsWith('image/'));
  const files = m.attachments.filter((a) => !a.mediaType.startsWith('image/'));
  const actionable = !m.deleted && !editing;

  return (
    <div id={`msg-${m.id}`} className={cn('group flex gap-2.5 rounded-md transition-shadow', mine ? 'flex-row-reverse' : 'flex-row', grouped ? 'mt-0.5' : 'mt-3')}>
      <div className="w-9 shrink-0">{!mine && !grouped && <PersonAvatar name={m.senderName} />}</div>
      <div className={cn('flex min-w-0 max-w-[min(42rem,85%)] flex-col', mine ? 'items-end' : 'items-start')}>
        {!grouped && (
          <div className={cn('mb-0.5 flex items-baseline gap-2 text-sm', mine && 'flex-row-reverse')}>
            {!mine && <span className="font-semibold">{m.senderName ?? t('unknownSender')}</span>}
            <time dateTime={m.createdAt} className="text-xs text-muted-foreground">{time}</time>
          </div>
        )}
        <div className={cn('relative flex items-start gap-1', mine && 'flex-row-reverse')}>
          <div className={cn('min-w-0 rounded-lg px-3.5 py-2 text-base leading-relaxed shadow-sm',
            m.deleted ? 'border border-dashed bg-transparent italic text-muted-foreground' : mine ? 'bg-primary/15 text-foreground' : 'border bg-card')}>
            {m.replyTo && !m.deleted && (
              <button type="button" onClick={() => jump(m.replyTo!.id)} className="mb-1.5 block w-full rounded border-l-2 border-primary/60 bg-background/60 px-2 py-1 text-left text-sm hover:bg-background">
                <span className="font-medium">{m.replyTo.senderName ?? t('unknownSender')}</span>
                <span className="line-clamp-2 text-muted-foreground">{m.replyTo.deleted ? t('deletedMessage') : m.replyTo.excerpt ?? t('attachmentOnly')}</span>
              </button>
            )}
            {m.deleted ? <span>{t('deletedMessage')}</span> : editing ? (
              <div className="w-[min(36rem,70vw)] space-y-2">
                <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={4000} autoFocus aria-label={t('editMessage')}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); } if (e.key === 'Escape') { setEditing(false); setDraft(m.body ?? ''); } }} />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(m.body ?? ''); }}>{t('cancel')}</Button>
                  <Button size="sm" onClick={save} disabled={edit.isPending || !draft.trim()}>{t('save')}</Button>
                </div>
              </div>
            ) : (
              <>
                {m.body && <div className="whitespace-pre-wrap break-words"><MessageBody body={m.body} mentions={m.mentions} meId={meId} /></div>}
                {images.length > 0 && (
                  <div className={cn('mt-1.5 grid gap-1.5', images.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
                    {images.map((a) => (
                      <a key={a.id} href={attachmentUrl(a.id)} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-md border">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={attachmentUrl(a.id)} alt={a.fileName} loading="lazy" className="max-h-72 w-full object-cover" />
                      </a>
                    ))}
                  </div>
                )}
                {files.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {files.map((a) => (
                      <li key={a.id}>
                        <a href={attachmentUrl(a.id)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-md border bg-background/70 px-2.5 py-1.5 text-sm hover:bg-background">
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 truncate font-medium">{a.fileName}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{bytesLabel(a.sizeBytes)}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {m.editedAt && !m.deleted && !editing && <span className="ml-1 text-xs text-muted-foreground">({t('edited')})</span>}
          </div>
          {actionable && (
            <div className={cn('flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100')}>
              {canPost && <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t('reply')} onClick={() => onReply(m)}><CornerUpLeft className="h-4 w-4" /></Button>}
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t('moreActions')}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align={mine ? 'end' : 'start'}>
                  {canPost && <DropdownMenuItem onSelect={() => onReply(m)}><CornerUpLeft />{t('reply')}</DropdownMenuItem>}
                  {m.body && <DropdownMenuItem onSelect={() => navigator.clipboard?.writeText(m.body ?? '')}><Copy />{t('copy')}</DropdownMenuItem>}
                  {mine && canPost && m.body !== null && <DropdownMenuItem onSelect={() => { setDraft(m.body ?? ''); setEditing(true); }}><Pencil />{t('edit')}</DropdownMenuItem>}
                  {(mine || canModerate) && <DropdownMenuItem onSelect={() => setConfirmDelete(true)} className="text-[color:var(--status-critical)]"><Trash2 />{t('delete')}</DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
        {confirmDelete && (
          <div className="mt-1 flex items-center gap-2 text-sm" role="alert">
            <span>{t('confirmDelete')}</span>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>{t('cancel')}</Button>
            <Button size="sm" variant="destructive" onClick={remove} disabled={del.isPending}>{t('delete')}</Button>
          </div>
        )}
        {error && <p className="mt-1 text-sm" style={{ color: 'var(--status-critical)' }} role="alert">{error}</p>}
        {receipt && <div className="mt-0.5 text-xs text-muted-foreground">{receipt}</div>}
      </div>
    </div>
  );
}
