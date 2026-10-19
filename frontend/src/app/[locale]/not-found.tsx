import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function NotFound() {
  const t = useTranslations('common');
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-3xl font-semibold">404</h1>
      <p className="text-muted-foreground">{t('notFound')}</p>
      <Link href="/" className="text-primary underline">{t('back')}</Link>
    </main>
  );
}
