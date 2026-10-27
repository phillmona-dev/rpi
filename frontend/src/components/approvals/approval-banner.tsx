'use client';
import { useTranslations } from 'next-intl';
import { ArrowRight, Ban, Hourglass, Undo2 } from 'lucide-react';
import type { ApprovalInfo } from '@/lib/api/types';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { relTime } from '@/lib/format';
import { approvalTone, canDecideApprovals, canResubmitProjects, toneVar } from '@/lib/domain';
import { useUser } from '@/providers/session';

/** Shown on a project that has not been approved: what state it is in, what is on hold, and the next action for this user. */
export function ApprovalBanner({ projectId, approval }: { projectId: number; approval: ApprovalInfo }) {
  const t = useTranslations('approvals.banner');
  const user = useUser();
  if (approval.status === 'APPROVED') return null;
  const color = toneVar[approvalTone[approval.status]];
  const Icon = approval.status === 'PENDING' ? Hourglass : approval.status === 'RETURNED' ? Undo2 : Ban;
  const name = approval.status === 'PENDING' ? approval.submittedByName : approval.decidedByName;
  const time = relTime(approval.status === 'PENDING' ? approval.submittedAt : approval.decidedAt);
  const action = approval.status === 'PENDING' && canDecideApprovals(user.roles) ? t('decide')
    : approval.status === 'RETURNED' && canResubmitProjects(user.roles) ? t('resubmit') : t('viewDossier');
  return (
    <div role="status" className="flex flex-col gap-3 rounded-lg border-2 p-5 tablet:flex-row tablet:items-center tablet:justify-between" style={{ borderColor: color, background: `color-mix(in srgb, ${color} 7%, transparent)` }}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-6 w-6 shrink-0" style={{ color }} aria-hidden />
        <div><div className="text-lg font-semibold">{t(approval.status)}</div><p className="mt-0.5 text-sm text-muted-foreground">{t(`${approval.status}_hint`, { name: name ?? '—', time })}</p></div>
      </div>
      <Button asChild variant={action === t('viewDossier') ? 'outline' : 'default'} className="shrink-0"><Link href={`/approvals/${projectId}`}>{action}<ArrowRight /></Link></Button>
    </div>
  );
}
