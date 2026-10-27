'use client';
import * as React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string; header: React.ReactNode; cell: (row: T) => React.ReactNode; sortable?: boolean; className?: string; headerClassName?: string; align?: 'left' | 'right' | 'center'; width?: string;
}
export interface SortState { field: string; dir: 'asc' | 'desc' }

/**
 * Lightweight, accessible data table with server-side sort/pagination hooks.
 * Rows are keyboard-activatable when `onRowClick` is provided.
 */
export function DataTable<T>({ columns, rows, rowKey, onRowClick, sort, onSort, dense, caption, rowHref, rowClassName }: {
  columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string | number; onRowClick?: (r: T) => void; sort?: SortState; onSort?: (s: SortState) => void; dense?: boolean; caption?: string; rowHref?: (r: T) => string; rowClassName?: (r: T) => string | undefined;
}) {
  const toggle = (c: Column<T>) => {
    if (!c.sortable || !onSort) return;
    onSort({ field: c.key, dir: sort?.field === c.key && sort.dir === 'asc' ? 'desc' : 'asc' });
  };
  return (
    <Table>
      {caption && <caption className="sr-only">{caption}</caption>}
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {columns.map((c) => (
            <TableHead key={c.key} className={cn(c.headerClassName, c.align === 'right' && 'text-right', c.align === 'center' && 'text-center')} style={{ width: c.width }} aria-sort={sort?.field === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
              {c.sortable && onSort ? (
                <button type="button" onClick={() => toggle(c)} className={cn('inline-flex items-center gap-1 hover:text-foreground', c.align === 'right' && 'flex-row-reverse')}>
                  {c.header}
                  {sort?.field === c.key ? (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                </button>
              ) : c.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={rowKey(r)} data-clickable={Boolean(onRowClick)} tabIndex={onRowClick ? 0 : undefined} onClick={onRowClick ? () => onRowClick(r) : undefined}
            onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(r); } } : undefined}
            aria-label={rowHref ? undefined : undefined} className={cn(dense && '[&>td]:py-2', rowClassName?.(r))}>
            {columns.map((c) => <TableCell key={c.key} className={cn(c.className, c.align === 'right' && 'text-right tabular whitespace-nowrap', c.align === 'center' && 'text-center')}>{c.cell(r)}</TableCell>)}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function Pagination({ page, totalPages, totalElements, size, onPage, onSize, sizes = [10, 25, 50, 100] }: {
  page: number; totalPages: number; totalElements: number; size: number; onPage: (p: number) => void; onSize?: (s: number) => void; sizes?: number[];
}) {
  const t = useTranslations('common');
  const from = totalElements === 0 ? 0 : page * size + 1;
  const to = Math.min(totalElements, (page + 1) * size);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
      <span>{t('showing', { from, to, total: totalElements })}</span>
      <div className="flex items-center gap-2">
        {onSize && (
          <Select value={String(size)} onValueChange={(v) => onSize(Number(v))}>
            <SelectTrigger className="h-9 w-[92px] text-sm" aria-label={t('rowsPerPage')}><SelectValue /></SelectTrigger>
            <SelectContent>{sizes.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <span className="tabular">{t('page', { page: totalPages === 0 ? 0 : page + 1, total: totalPages })}</span>
        <Button variant="outline" size="iconSm" disabled={page <= 0} onClick={() => onPage(page - 1)} aria-label={t('previous')}><ChevronLeft /></Button>
        <Button variant="outline" size="iconSm" disabled={page >= totalPages - 1} onClick={() => onPage(page + 1)} aria-label={t('next')}><ChevronRight /></Button>
      </div>
    </div>
  );
}
