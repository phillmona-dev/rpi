'use client';
import { useLocale, useTranslations } from 'next-intl';
import { Camera, MapPinOff } from 'lucide-react';
import type { InspectionSummary } from '@/lib/api/types';
import { DataTable, type Column, type SortState } from '@/components/common/data-table';
import { SectorDot, ToneBadge } from '@/components/common/badges';
import { fmtDate, localizedName, pct } from '@/lib/format';
import { toneVar, verificationTone } from '@/lib/domain';

export function InspectionTable({ rows, onOpen, sort, onSort, hideSubject }: { rows: InspectionSummary[]; onOpen: (i: InspectionSummary) => void; sort?: SortState; onSort?: (s: SortState) => void; hideSubject?: boolean }) {
  const t = useTranslations('evidence');
  const te = useTranslations('enums');
  const locale = useLocale();
  const cols: Column<InspectionSummary>[] = [
    { key: 'visitedOn', header: t('columns.visited'), sortable: true, cell: (i) => <div className="whitespace-nowrap"><div className="tabular">{fmtDate(i.visitedOn, locale, 'short')}</div><div className="text-2xs text-muted-foreground">{te(`inspectionType.${i.inspectionType}`)}</div></div> },
    ...(hideSubject ? [] : [{ key: 'subject', header: t('columns.subject'), cell: (i: InspectionSummary) => <div className="min-w-[200px]"><div className="flex items-center gap-1.5 font-medium">{i.sector && <SectorDot sector={i.sector} />}<span className="truncate max-w-[300px]">{i.projectName ?? i.facilityName}</span></div><div className="text-2xs text-muted-foreground">{localizedName(i.wereda.name, locale)}</div></div> } as Column<InspectionSummary>]),
    { key: 'inspectorName', header: t('columns.inspector'), cell: (i) => <div className="text-xs"><div>{i.inspectorName}</div><div className="text-2xs text-muted-foreground truncate max-w-[180px]">{i.organization}</div></div> },
    { key: 'observed', header: t('columns.observed'), align: 'right', cell: (i) => i.observedProgressPct === null ? '—' : (
      <span>{pct(i.observedProgressPct)}<span className="block text-2xs" style={{ color: (i.progressGapPp ?? 0) <= -10 ? toneVar.critical : (i.progressGapPp ?? 0) <= -5 ? toneVar.serious : 'var(--muted-foreground)' }}>{t('columns.reportedSaid', { value: pct(i.reportedProgressPct) })}</span></span>
    ) },
    { key: 'media', header: t('columns.media'), align: 'center', cell: (i) => <span className="inline-flex items-center gap-1 tabular text-xs"><Camera className="h-3 w-3 text-muted-foreground" />{i.mediaCount}</span> },
    { key: 'verificationStatus', header: t('columns.status'), sortable: true, cell: (i) => (
      <div className="flex flex-col items-start gap-1">
        <ToneBadge tone={verificationTone[i.verificationStatus]} label={te(`verification.${i.verificationStatus}`)} />
        {i.farFromSite && <span className="inline-flex items-center gap-1 text-2xs" style={{ color: toneVar.serious }}><MapPinOff className="h-3 w-3" />{t('columns.far')}</span>}
      </div>
    ) },
  ];
  return <DataTable columns={cols} rows={rows} rowKey={(i) => i.id} onRowClick={onOpen} sort={sort} onSort={onSort} dense caption={t('inspections')} />;
}
