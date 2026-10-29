'use client';
import { useTranslations } from 'next-intl';
import { Camera, ClipboardCheck, ShieldCheck } from 'lucide-react';
import type { EvidenceSnapshot, EvidenceSummary } from '@/lib/api/types';
import { Stat } from '@/components/common/page-header';
import { ToneBadge } from '@/components/common/badges';
import { relTime } from '@/lib/format';
import { STALE_CRITICAL_DAYS } from '@/lib/domain';

/** Compact evidence coverage strip for project and facility pages. */
export function EvidenceSummaryStrip({ s }: { s: EvidenceSnapshot | EvidenceSummary }) {
  const t = useTranslations('evidence');
  const tone = s.coverage === 'RECENT' ? 'good' : s.coverage === 'STALE' ? 'warning' : 'neutral';
  return (
    <div className="grid grid-cols-2 gap-2 tablet:grid-cols-4">
      <Stat label={t('summary.inspections')} value={<span className="inline-flex items-center gap-1.5"><ClipboardCheck className="h-4 w-4 text-muted-foreground" />{s.inspections}</span>} hint={t('summary.unverifiedCount', { count: s.unverified })} />
      <Stat label={t('summary.verified')} value={<span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" style={{ color: 'var(--status-good)' }} />{s.verified}</span>} hint={s.disputed ? t('summary.disputedCount', { count: s.disputed }) : undefined} />
      <Stat label={t('summary.media')} value={<span className="inline-flex items-center gap-1.5"><Camera className="h-4 w-4 text-muted-foreground" />{s.mediaItems}</span>} hint={t('summary.mediaHint', { photos: s.photos, videos: s.videos })} />
      <Stat label={t('summary.lastVerified')} value={<ToneBadge tone={tone} label={t(`coverage.${s.coverage}`, { days: STALE_CRITICAL_DAYS })} />} hint={s.lastVerifiedAt ? relTime(s.lastVerifiedAt) : s.lastInspectionAt ? t('summary.lastInspection', { time: relTime(s.lastInspectionAt) }) : undefined} />
    </div>
  );
}
