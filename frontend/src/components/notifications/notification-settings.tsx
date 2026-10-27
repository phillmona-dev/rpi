'use client';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { BadgeCheck, BellRing, MonitorSmartphone, Play, Siren, Volume2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { desktopState, requestDesktopPermission, showDesktop, type DesktopState } from '@/lib/notify/desktop';
import { NOTIFY_CATEGORIES, setPrefs, useNotifyPrefs } from '@/lib/notify/prefs';
import { playTone, unlockAudio, type ToneKind } from '@/lib/notify/sound';
import { toast } from './toaster';

const TONES: ToneKind[] = ['message', 'info', 'success', 'warning', 'critical'];

export function NotificationSettings({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useTranslations('notifications');
  const prefs = useNotifyPrefs();
  const [state, setState] = React.useState<DesktopState>('default');
  React.useEffect(() => { if (open) setState(desktopState()); }, [open]);

  const enable = async () => { unlockAudio(); setState(await requestDesktopPermission()); };
  const test = async () => {
    unlockAudio();
    playTone('info', { force: true });
    toast.push({ key: 'test', title: t('test.title'), body: t('test.body'), icon: BellRing, severity: 'INFO', meta: t('categories.approvals') });
    if (prefs.desktop && state === 'granted') await showDesktop({ title: t('test.title'), body: t('test.body'), url: '/', tag: 'rpis-test' }, () => undefined);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('settings.title')}</DialogTitle>
          <DialogDescription>{t('settings.description')}</DialogDescription>
        </DialogHeader>

        <section className="space-y-3 rounded-lg border p-4">
          <Row icon={MonitorSmartphone} label={t('settings.desktop')} hint={t(`settings.state.${state}`)}>
            {state === 'default' ? <Button size="sm" onClick={enable}>{t('settings.allow')}</Button>
              : <Switch checked={prefs.desktop && state === 'granted'} disabled={state !== 'granted'} onCheckedChange={(v) => setPrefs({ desktop: v })} aria-label={t('settings.desktop')} />}
          </Row>
          {state === 'granted' && prefs.desktop && (
            <Row label={t('settings.onlyBackground')} hint={t('settings.onlyBackgroundHint')} indent>
              <Switch checked={prefs.desktopOnlyInBackground} onCheckedChange={(v) => setPrefs({ desktopOnlyInBackground: v })} aria-label={t('settings.onlyBackground')} />
            </Row>
          )}
        </section>

        <section className="space-y-3 rounded-lg border p-4">
          <Row icon={Volume2} label={t('settings.sound')} hint={t('settings.soundHint')}>
            <Switch checked={prefs.sound} onCheckedChange={(v) => { unlockAudio(); setPrefs({ sound: v }); if (v) playTone('message', { force: true }); }} aria-label={t('settings.sound')} />
          </Row>
          {prefs.sound && (
            <>
              <div className="flex items-center gap-3 pl-8">
                <label htmlFor="notify-volume" className="w-20 shrink-0 text-sm text-muted-foreground">{t('settings.volume')}</label>
                <input id="notify-volume" type="range" min={0} max={100} step={5} value={Math.round(prefs.volume * 100)}
                  onChange={(e) => setPrefs({ volume: Number(e.target.value) / 100 })}
                  onPointerUp={() => playTone('info', { force: true })} onKeyUp={() => playTone('info', { force: true })}
                  className="h-2 flex-1 cursor-pointer accent-[hsl(var(--primary))]" />
                <span className="w-10 text-right text-sm tabular">{Math.round(prefs.volume * 100)}%</span>
              </div>
              <div className="flex flex-wrap gap-1.5 pl-8">
                {TONES.map((k) => (
                  <Button key={k} variant="outline" size="xs" onClick={() => { unlockAudio(); playTone(k, { force: true }); }}>
                    {k === 'critical' ? <Siren /> : k === 'success' ? <BadgeCheck /> : <Play />}{t(`settings.tones.${k}`)}
                  </Button>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="rounded-lg border p-4">
          <h3 className="mb-1 text-sm font-semibold">{t('settings.categoriesTitle')}</h3>
          <p className="mb-3 text-sm text-muted-foreground">{t('settings.categoriesHint')}</p>
          <ul className="divide-y">
            {NOTIFY_CATEGORIES.map((c) => (
              <li key={c} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0"><span className="block text-sm font-medium">{t(`categories.${c}`)}</span><span className="block text-xs text-muted-foreground">{t(`categoryHints.${c}`)}</span></span>
                <Switch checked={prefs.categories[c]} onCheckedChange={(v) => setPrefs({ categories: { ...prefs.categories, [c]: v } })} aria-label={t(`categories.${c}`)} />
              </li>
            ))}
          </ul>
        </section>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{t('settings.deviceOnly')}</p>
          <Button variant="outline" onClick={test}><BellRing />{t('settings.test')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ icon: Icon, label, hint, indent, children }: { icon?: React.ComponentType<{ className?: string }>; label: string; hint?: string; indent?: boolean; children: React.ReactNode }) {
  return (
    <div className={indent ? 'flex items-center justify-between gap-4 pl-8' : 'flex items-center justify-between gap-4'}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />}
        <div className="min-w-0"><div className="text-sm font-medium">{label}</div>{hint && <div className="text-xs text-muted-foreground">{hint}</div>}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
