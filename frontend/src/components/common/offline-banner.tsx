'use client';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { WifiOff } from 'lucide-react';

/** Surfaces loss of connectivity so executives know cached figures are being shown. */
export function OfflineBanner() {
  const t = useTranslations('common');
  const [offline, setOffline] = React.useState(false);
  const [restored, setRestored] = React.useState(false);
  React.useEffect(() => {
    const on = () => { setOffline(false); setRestored(true); setTimeout(() => setRestored(false), 4000); };
    const off = () => setOffline(true);
    setOffline(typeof navigator !== 'undefined' && !navigator.onLine);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  if (offline) return <div role="status" aria-live="assertive" className="no-print flex items-center justify-center gap-2 border-b bg-status-critical/10 px-4 py-1.5 text-xs font-medium"><WifiOff className="h-3.5 w-3.5" />{t('offlineBanner')}</div>;
  if (restored) return <div role="status" aria-live="polite" className="no-print border-b bg-status-good/10 px-4 py-1 text-center text-2xs font-medium">{t('backOnline')}</div>;
  return null;
}
