'use client';
import * as React from 'react';
import { useRouter } from '@/i18n/navigation';
import { useSession } from '@/lib/api/hooks';
import type { UserProfile } from '@/lib/api/types';
import { Skeleton } from '@/components/ui/skeleton';

const Ctx = React.createContext<UserProfile | null>(null);
export const useUser = () => {
  const u = React.useContext(Ctx);
  if (!u) throw new Error('useUser outside SessionProvider');
  return u;
};

/** Gates the app shell on a valid session (refreshing tokens through the BFF when needed). */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data, isLoading, isError } = useSession();
  React.useEffect(() => { if (isError) router.replace('/login'); }, [isError, router]);
  if (isLoading || !data) {
    return (
      <div className="flex min-h-screen" aria-busy="true">
        <div className="hidden w-60 bg-sidebar laptop:block" />
        <div className="flex-1 p-6 space-y-4"><Skeleton className="h-10 w-1/3" /><div className="grid grid-cols-3 gap-4"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div><Skeleton className="h-64" /></div>
      </div>
    );
  }
  return <Ctx.Provider value={data}>{children}</Ctx.Provider>;
}
