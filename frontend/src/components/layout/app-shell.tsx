'use client';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Topbar } from './topbar';
import { BreadcrumbProvider } from './breadcrumbs';
import { RealtimeProvider } from './live-indicator';
import { SessionProvider } from '@/providers/session';
import { OfflineBanner } from '@/components/common/offline-banner';

export function AppShell({ children, demo }: { children: React.ReactNode; demo: boolean }) {
  const t = useTranslations('nav');
  const tc = useTranslations('common');
  return (
    <SessionProvider>
      <RealtimeProvider>
        <BreadcrumbProvider>
          <a href="#main" className="skip-link">{t('skip')}</a>
          <div className="flex min-h-screen flex-col">
            <Topbar onMenu={() => undefined} />
            <OfflineBanner />
            {demo && (
              <div className="no-print border-b bg-status-warning/15 px-4 py-1 text-center text-2xs font-medium text-foreground/80">
                {tc('demoBanner')}
              </div>
            )}
            <main id="main" tabIndex={-1} className="flex-1 px-4 py-5 tablet:px-6 desktop:px-8 outline-none">
              <React.Suspense fallback={null}>{children}</React.Suspense>
            </main>
          </div>
        </BreadcrumbProvider>
      </RealtimeProvider>
    </SessionProvider>
  );
}
