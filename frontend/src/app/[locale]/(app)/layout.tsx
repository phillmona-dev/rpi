import { AppShell } from '@/components/layout/app-shell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell demo={process.env.NEXT_PUBLIC_DEMO_BANNER === 'true'}>{children}</AppShell>;
}
