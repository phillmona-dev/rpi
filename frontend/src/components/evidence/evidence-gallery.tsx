'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Camera, Clock, FileText, MapPin, Mic, Play, Video } from 'lucide-react';
import type { MediaDto } from '@/lib/api/types';
import { DataState } from '@/components/common/data-state';
import { ToneBadge } from '@/components/common/badges';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import { fmtDateTime, relTime } from '@/lib/format';
import { mediaSrc, verificationTone } from '@/lib/domain';
import { cn } from '@/lib/utils';

const kindIcon = { PHOTO: Camera, VIDEO: Video, AUDIO: Mic, DOCUMENT: FileText } as const;

/** Evidence gallery (GEMS pattern): every item shows what the device recorded (geotag, timestamp) and its verification status. */
export function EvidenceGallery({ items, isLoading, error, onRetry, compact, showSubject, demoNote }: { items?: MediaDto[]; isLoading: boolean; error?: unknown; onRetry?: () => void; compact?: boolean; showSubject?: boolean; demoNote?: boolean }) {
  const t = useTranslations('evidence');
  const [open, setOpen] = React.useState<MediaDto | null>(null);
  return (
    <>
      <DataState isLoading={isLoading} error={error} onRetry={onRetry} isEmpty={!items?.length} emptyTitle={t('emptyMedia')} emptyHint={t('empty')}
        skeleton={<div className={cn('grid gap-3', compact ? 'grid-cols-3 tablet:grid-cols-4' : 'grid-cols-2 tablet:grid-cols-3 desktop:grid-cols-4 wide:grid-cols-6')}>{Array.from({ length: compact ? 4 : 8 }).map((_, i) => <Skeleton key={i} className="aspect-[4/3]" />)}</div>}>
        <ul className={cn('grid gap-3', compact ? 'grid-cols-3 tablet:grid-cols-4' : 'grid-cols-2 tablet:grid-cols-3 desktop:grid-cols-4 wide:grid-cols-6')}>
          {items?.map((m) => <li key={`${m.origin}-${m.id}`}><MediaCard m={m} onOpen={() => setOpen(m)} showSubject={showSubject} /></li>)}
        </ul>
        {demoNote && <p className="mt-2 text-2xs text-muted-foreground">{t('demoNote')}</p>}
      </DataState>
      <MediaLightbox m={open} onClose={() => setOpen(null)} />
    </>
  );
}

function MediaCard({ m, onOpen, showSubject }: { m: MediaDto; onOpen: () => void; showSubject?: boolean }) {
  const t = useTranslations('evidence');
  const te = useTranslations('enums.verification');
  const Icon = kindIcon[m.kind];
  const src = mediaSrc(m.thumbnailUrl ?? m.url);
  return (
    <button type="button" onClick={onOpen} className="group relative block w-full overflow-hidden rounded-md border bg-muted text-left focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${t(`kind.${m.kind}`)}: ${m.caption ?? m.subjectName ?? ''}`}>
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        {m.kind === 'PHOTO' || m.kind === 'VIDEO' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={m.caption ?? ''} loading="lazy" className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]" />
        ) : <div className="flex h-full items-center justify-center text-muted-foreground"><Icon className="h-8 w-8" /></div>}
        {m.kind === 'VIDEO' && <span className="absolute inset-0 flex items-center justify-center"><span className="rounded-full bg-black/55 p-2 text-white"><Play className="h-4 w-4" /></span></span>}
        <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-black/55 px-1.5 py-0.5 text-2xs font-medium text-white"><Icon className="h-3 w-3" />{m.durationSeconds ? `${m.durationSeconds}s` : t(`kind.${m.kind}`)}</span>
        <span className="absolute right-1.5 top-1.5 flex gap-1">
          <span title={m.geotagged ? t('detail.placeRecorded') : t('detail.noGps')} className={cn('rounded bg-black/55 p-0.5 text-white', !m.geotagged && 'opacity-40')}><MapPin className="h-3 w-3" /></span>
          <span title={m.timestamped ? t('detail.timeRecorded') : t('detail.noTime')} className={cn('rounded bg-black/55 p-0.5 text-white', !m.timestamped && 'opacity-40')}><Clock className="h-3 w-3" /></span>
        </span>
        {m.verificationStatus !== 'UNVERIFIED' && <span className="absolute bottom-1.5 left-1.5"><ToneBadge tone={verificationTone[m.verificationStatus]} label={te(m.verificationStatus)} compact /></span>}
      </div>
      <div className="px-2 py-1.5">
        <div className="truncate text-xs font-medium">{m.caption ?? t(`origin.${m.origin}`)}</div>
        <div className="truncate text-2xs text-muted-foreground">{showSubject && m.subjectName ? `${m.subjectName} · ` : ''}{m.capturedAt ? relTime(m.capturedAt) : t('detail.noTime')}</div>
      </div>
    </button>
  );
}

function MediaLightbox({ m, onClose }: { m: MediaDto | null; onClose: () => void }) {
  const t = useTranslations('evidence');
  const te = useTranslations('enums.verification');
  const locale = useLocale();
  if (!m) return <Dialog open={false} onOpenChange={() => undefined}><DialogContent><DialogTitle className="sr-only">{t('gallery')}</DialogTitle></DialogContent></Dialog>;
  const Icon = kindIcon[m.kind];
  const href = m.inspectionId ? `/evidence?inspection=${m.inspectionId}` : m.projectId ? `/projects/${m.projectId}` : m.facilityId ? `/facilities/${m.facilityId}` : null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden">
        <div className="grid desktop:grid-cols-[1fr_300px]">
          <div className="relative bg-black/90 flex items-center justify-center min-h-[320px]">
            {m.kind === 'PHOTO' || m.kind === 'VIDEO' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaSrc(m.url)} alt={m.caption ?? ''} className="max-h-[70vh] w-full object-contain" />
            ) : <Icon className="h-16 w-16 text-white/70" />}
            {m.kind === 'VIDEO' && <span className="absolute rounded-full bg-black/60 p-4 text-white"><Play className="h-8 w-8" /></span>}
          </div>
          <div className="space-y-3 p-5 text-sm">
            <DialogHeader><DialogTitle className="text-base">{m.caption ?? t(`kind.${m.kind}`)}</DialogTitle><DialogDescription>{m.subjectName}{m.origin ? ` · ${t(`origin.${m.origin}`)}` : ''}</DialogDescription></DialogHeader>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <div className="col-span-2"><dt className="text-muted-foreground">{t('detail.verification')}</dt><dd className="mt-0.5"><ToneBadge tone={verificationTone[m.verificationStatus]} label={te(m.verificationStatus)} /></dd></div>
              <div><dt className="text-muted-foreground">{t('detail.captured')}</dt><dd>{m.capturedAt ? fmtDateTime(m.capturedAt, locale) : t('detail.noTime')}</dd></div>
              <div><dt className="text-muted-foreground">{t('detail.takenBy')}</dt><dd>{m.capturedBy ?? '—'}</dd></div>
              <div className="col-span-2"><dt className="text-muted-foreground">{t('detail.place')}</dt><dd>{m.location ? t('detail.placeRecorded') : t('detail.noGps')}</dd></div>
            </dl>
                        {href && <Link href={href as '/'} className="text-xs text-primary underline" onClick={onClose}>{m.inspectionId ? t('detail.openVisit') : m.projectId ? t('detail.openProject') : t('detail.openFacility')}</Link>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
