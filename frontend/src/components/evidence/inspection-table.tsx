'use client';
import { useLocale, useTranslations } from 'next-intl';
import { Camera, MapPinOff } from 'lucide-react';
import type { InspectionSummary } from '@/lib/api/types';
import { DataTable, type Column, type SortState } from '@/components/common/data-table';
import { SectorDot, ToneBadge } from '@/components/common/badges';
import { fmtDate, localizedName, pct, signedPp } from '@/lib/format';
import { toneVar, verificationTone } from '@/lib/domain';

export function InspectionTable({ rows, onOpen, sort, onSort, hideSubject }: { rows: InspectionSummary[]; onOpen: (i: InspectionSummary) => void; sort?: SortState; onSort?: (s: SortState) => void; hideSubject?: boolean }) {
  const t = useTranslations('evidence');
  const te = useTranslations('enums');
  const locale = useLocale();
  const cols: Column<InspectionSummary>[] = [
    { key: 'visitedOn', header: t('columns.visited'), sortable: true, cell: (i) => <span className="tabular whitespace-nowrap">{fmtDate(i.visitedOn, locale, 'short')}</span> },
    { key: 'inspectionType', header: t('columns.type'), sortable: true, cell: (i) => <span className="text-xs">{te(`inspectionType.${i.inspectionType}`)}</span> },
    ...(hideSubject ? [] : [{ key: 'subject', header: t('columns.subject'), cell: (i: InspectionSummary) => <div className="min-w-[200px]"><div className="flex items-center gap-1.5 font-medium">{i.sector && <SectorDot sector={i.sector} />}<span className="truncate max-w-[300px]">{i.projectName ?? i.facilityName}</span></div><div className="text-2xs text-muted-foreground">{i.projectCode ?? ''}{i.projectCode ? ' · ' : ''}{localizedName(i.wereda.name, locale)}</div></div> } as Column<InspectionSummary>]),
    { key: 'inspectorName', header: t('columns.inspector'), cell: (i) => <div className="text-xs"><div>{i.inspectorName}</div><div className="text-2xs text-muted-foreground truncate max-w-[180px]">{i.organization}</div></div> },
    { key: 'observed', header: t('columns.observed'), align: 'right', cell: (i) => i.observedProgressPct === null ? '—' : <span>{pct(i.observedProgressPct)}<span className="block text-2xs text-muted-foreground">{t('columns.reported')} {pct(i.reportedProgressPct)}</span></span> },
    { key: 'gap', header: t('columns.gap'), align: 'right', cell: (i) => i.progressGapPp === null ? '—' : <span className="font-medium" style={{ color: i.progressGapPp <= -10 ? toneVar.critical : i.progressGapPp <= -5 ? toneVar.serious : undefined }}>{signedPp(i.progressGapPp)}</span> },
    { key: 'ratings', header: `${t('columns.quality')} / ${t('columns.safety')}`, align: 'center', cell: (i) => <span className="tabular text-xs">{i.qualityRating ?? '—'} / {i.safetyRating ?? '—'}</span> },
    { key: 'distance', header: t('columns.distance'), align: 'right', cell: (i) => i.distanceFromSiteM === null ? <span className="inline-flex items-center gap-1 text-muted-foreground"><MapPinOff className="h-3 w-3" />—</span> : <span style={{ color: i.farFromSite ? toneVar.serious : undefined }}>{Math.round(i.distanceFromSiteM)} m</span> },
    { key: 'media', header: t('columns.media'), align: 'center', cell: (i) => <span className="inline-flex items-center gap-1 tabular text-xs"><Camera className="h-3 w-3 text-muted-foreground" />{i.mediaCount}</span> },
    { key: 'verificationStatus', header: t('columns.status'), sortable: true, cell: (i) => <ToneBadge tone={verificationTone[i.verificationStatus]} label={te(`verification.${i.verificationStatus}`)} /> },
  ];
  return <DataTable columns={cols} rows={rows} rowKey={(i) => i.id} onRowClick={onOpen} sort={sort} onSort={onSort} dense caption={t('inspections')} />;
}
