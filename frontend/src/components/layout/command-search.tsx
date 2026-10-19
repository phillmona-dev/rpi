'use client';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Building2, FolderKanban, MapPin } from 'lucide-react';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useSearch } from '@/lib/api/hooks';
import { useRouter } from '@/i18n/navigation';
import type { SearchHit } from '@/lib/api/types';
import { SectorDot } from '@/components/common/badges';

export function CommandSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations('common');
  const te = useTranslations('enums.entityType');
  const router = useRouter();
  const [q, setQ] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  React.useEffect(() => { const id = setTimeout(() => setDebounced(q.trim()), 200); return () => clearTimeout(id); }, [q]);
  const { data, isFetching } = useSearch(debounced);
  const go = (h: SearchHit) => {
    onOpenChange(false); setQ('');
    router.push(h.type === 'PROJECT' ? `/projects/${h.id}` : h.type === 'FACILITY' ? `/facilities/${h.id}` : `/weredas/${h.id}`);
  };
  const groups: SearchHit['type'][] = ['WEREDA', 'PROJECT', 'FACILITY'];
  const icon = { WEREDA: MapPin, PROJECT: FolderKanban, FACILITY: Building2 } as const;
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title={t('search')}>
      <CommandInput placeholder={t('searchPlaceholder')} value={q} onValueChange={setQ} />
      <CommandList>
        {debounced.length < 2 && <div className="py-6 text-center text-sm text-muted-foreground">{t('searchHint')}</div>}
        {debounced.length >= 2 && !isFetching && (data?.length ?? 0) === 0 && <CommandEmpty>{t('noResults')}</CommandEmpty>}
        {groups.map((g) => {
          const hits = data?.filter((h) => h.type === g) ?? [];
          if (!hits.length) return null;
          const Icon = icon[g];
          return (
            <CommandGroup key={g} heading={te(g)}>
              {hits.map((h) => (
                <CommandItem key={`${h.type}-${h.id}`} value={`${h.type}-${h.id}`} onSelect={() => go(h)}>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{h.title}</span>
                  {h.sector && <SectorDot sector={h.sector} />}
                  <span className="text-xs text-muted-foreground truncate max-w-[40%]">{h.subtitle}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
