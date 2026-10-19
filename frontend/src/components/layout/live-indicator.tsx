'use client';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useRealtime } from '@/lib/realtime/useRealtime';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const Ctx = React.createContext<ReturnType<typeof useRealtime> | null>(null);
export function RealtimeProvider({ children }: { children: React.ReactNode }) { const rt = useRealtime(); return <Ctx.Provider value={rt}>{children}</Ctx.Provider>; }
export const useLive = () => React.useContext(Ctx);

export function LiveIndicator() {
  const t = useTranslations('common');
  const live = useLive();
  const status = live?.status ?? 'connecting';
  const [recent, setRecent] = React.useState(false);
  React.useEffect(() => { if (!live?.lastEventAt) return; setRecent(true); const id = setTimeout(() => setRecent(false), 4000); return () => clearTimeout(id); }, [live?.lastEventAt]);
  const color = status === 'live' ? 'var(--status-good)' : status === 'connecting' ? 'var(--status-warning)' : 'var(--status-critical)';
  const label = status === 'live' ? t('liveUpdates') : status === 'connecting' ? t('reconnecting') : t('offline');
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs text-muted-foreground">
          <span aria-hidden className={cn('h-2 w-2 rounded-full', (status === 'live' && recent) && 'animate-pulseDot')} style={{ background: color }} />
          <span className="hidden tablet:inline">{status === 'live' ? t('live') : status === 'connecting' ? t('connecting') : t('offline')}</span>
          <span className="sr-only">{label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
