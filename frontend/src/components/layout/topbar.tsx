'use client';
import * as React from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BarChart3, Globe, Home, LogOut, Moon, Search, Sun, SunMoon, UserCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { localeNames, localeShort, locales, type Locale } from '@/i18n/routing';
import { useUser } from '@/providers/session';
import { useTheme } from '@/providers/theme';
import { useLogout } from '@/lib/api/hooks';
import { LiveIndicator } from './live-indicator';
import { CommandSearch } from './command-search';
import { Breadcrumbs } from './breadcrumbs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function Topbar({ onMenu: _onMenu }: { onMenu: () => void }) {
  const t  = useTranslations('common');
  const tr = useTranslations('roles');
  const ts = useTranslations('scope');
  const te = useTranslations('enums.sector');
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const user = useUser();
  const { theme, setTheme } = useTheme();
  const logout = useLogout();
  const [searchOpen, setSearchOpen] = React.useState(false);

  const isHome = pathname === '/';

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen((o) => !o); } };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, []);

  const initials = user.fullName.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const switchLocale = (l: string) => router.replace(pathname, { locale: l as Locale });
  const signOut = async () => { await logout.mutateAsync(); router.replace('/login'); };

  return (
    <header className="dark-chrome sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-sidebar-border bg-sidebar/95 px-4 text-sidebar-foreground backdrop-blur supports-[backdrop-filter]:bg-sidebar/90">

      {/* Brand / Home pill */}
      <Link
        href="/"
        aria-label="Module Launcher — Home"
        className={cn(
          'flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-sidebar-accent',
          isHome && 'bg-sidebar-accent',
        )}
      >
        <BarChart3 className="h-5 w-5 text-primary shrink-0" />
        <span className="hidden tablet:block text-sm font-semibold text-white leading-none">RPIS</span>
      </Link>

      {/* Separator */}
      <div className="h-5 w-px bg-sidebar-border shrink-0" aria-hidden />

      {/* Breadcrumbs / page title */}
      {!isHome && (
        <>
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-label="Return to module launcher"
          >
            <Link href="/"><Home className="h-4 w-4" /></Link>
          </Button>
          <div className="min-w-0 flex-1"><Breadcrumbs /></div>
        </>
      )}
      {isHome && <div className="flex-1" />}

      {/* Search */}
      <Button
        variant="outline"
        size="sm"
        className="hidden tablet:inline-flex w-56 justify-between text-muted-foreground font-normal"
        onClick={() => setSearchOpen(true)}
      >
        <span className="inline-flex items-center gap-2"><Search className="h-4 w-4" />{t('search')}…</span>
        <kbd className="rounded border bg-muted px-1.5 text-2xs">{t('searchShortcut')}</kbd>
      </Button>
      <Button variant="ghost" size="icon" className="tablet:hidden" onClick={() => setSearchOpen(true)} aria-label={t('search')}><Search /></Button>
      <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} />

      <LiveIndicator />
      {user.sectorScope && <Badge variant="outline" className="hidden laptop:inline-flex">{ts('scopedTo', { sector: te(user.sectorScope) })}</Badge>}
      {user.roles.includes('PMO_FEDERAL') && <Badge variant="outline" className="hidden laptop:inline-flex">{ts('readOnly')}</Badge>}

      {/* Language */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label={t('language')}>
            <Globe className="h-4 w-4" />
            <span className="text-xs font-semibold">{localeShort[locale]}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{t('language')}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={locale} onValueChange={switchLocale}>
            {locales.map((l) => <DropdownMenuRadioItem key={l} value={l}>{localeNames[l]}</DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Profile */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-full focus-visible:ring-2 focus-visible:ring-ring" aria-label={t('profile')}>
            <Avatar><AvatarFallback>{initials}</AvatarFallback></Avatar>
            <span className="hidden desktop:block text-left leading-tight">
              <span className="block text-sm font-medium truncate max-w-[180px]">{user.fullName}</span>
              <span className="block text-2xs text-muted-foreground">{user.roles.map((r) => tr(r as 'ADMIN')).join(', ')}</span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="font-normal">
            <div className="text-sm font-medium text-foreground">{user.fullName}</div>
            <div className="text-xs">{user.title ?? user.email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{t('theme')}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as 'light')}>
            <DropdownMenuRadioItem value="light"><Sun className="mr-2 h-4 w-4" />{t('light')}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark"><Moon className="mr-2 h-4 w-4" />{t('dark')}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system"><SunMoon className="mr-2 h-4 w-4" />{t('system')}</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={signOut}><LogOut />{t('signOut')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="sr-only"><UserCircle2 /></span>
    </header>
  );
}
