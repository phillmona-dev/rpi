'use client';
import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';

const Ctx = React.createContext<{ trail: { href?: string; label: string }[]; setTrail: (t: { href?: string; label: string }[]) => void }>({ trail: [], setTrail: () => undefined });
export function BreadcrumbProvider({ children }: { children: React.ReactNode }) { const [trail, setTrail] = React.useState<{ href?: string; label: string }[]>([]); return <Ctx.Provider value={{ trail, setTrail }}>{children}</Ctx.Provider>; }

/** Pages register their drill-down trail (Region → Sector → Wereda → Project); the top bar renders it. */
export function useBreadcrumbs(trail: { href?: string; label: string }[]) {
  const { setTrail } = React.useContext(Ctx);
  const key = JSON.stringify(trail);
  React.useEffect(() => { setTrail(JSON.parse(key)); return () => setTrail([]); }, [key, setTrail]);
}

export function Breadcrumbs() {
  const t = useTranslations('scope');
  const { trail } = React.useContext(Ctx);
  const pathname = usePathname();
  const items = [{ href: '/', label: t('region') }, ...trail];
  if (pathname === '/') items.splice(1);
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted-foreground overflow-hidden">
      {items.map((it, i) => {
        const last = i === items.length - 1;
        return (
          <React.Fragment key={i}>
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />}
            {it.href && !last ? <Link href={it.href} className="truncate hover:text-foreground">{it.label}</Link> : <span className={last ? 'truncate font-medium text-foreground' : 'truncate'} aria-current={last ? 'page' : undefined}>{it.label}</span>}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
