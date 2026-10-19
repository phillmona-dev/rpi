'use client';
import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { usePathname, useRouter } from '@/i18n/navigation';

/** URL-backed filter state so executive views are shareable and back-button friendly. */
export function useQueryParams() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const get = React.useCallback((k: string) => params.get(k), [params]);
  const getAll = React.useCallback((k: string) => params.getAll(k), [params]);
  const set = React.useCallback((patch: Record<string, string | string[] | number | null | undefined>, resetPage = true) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      p.delete(k);
      if (v === null || v === undefined || v === '' ) continue;
      if (Array.isArray(v)) v.forEach((x) => p.append(k, x)); else p.set(k, String(v));
    }
    if (resetPage && !('page' in patch)) p.delete('page');
    router.replace(`${pathname}${p.toString() ? `?${p.toString()}` : ''}` as '/', { scroll: false });
  }, [params, pathname, router]);
  return { get, getAll, set, params };
}
