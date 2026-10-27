'use client';

/**
 * System (OS) notifications. They go through a small service worker when one can be registered, which
 * is what lets a click focus the right tab and also works on Android; otherwise the plain Notification
 * constructor is used. Browsers only offer notifications in a secure context (HTTPS or localhost).
 */
export type DesktopState = 'unsupported' | 'insecure' | 'default' | 'granted' | 'denied';

let registration: ServiceWorkerRegistration | null = null;
let registering: Promise<ServiceWorkerRegistration | null> | null = null;

export function desktopState(): DesktopState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  if (!window.isSecureContext) return 'insecure';
  return Notification.permission as DesktopState;
}

export function registerNotificationWorker(): Promise<ServiceWorkerRegistration | null> {
  if (registration) return Promise.resolve(registration);
  if (registering) return registering;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !window.isSecureContext) return Promise.resolve(null);
  registering = navigator.serviceWorker.register('/notification-sw.js', { scope: '/' })
    .then((r) => (registration = r))
    .catch(() => null);
  return registering;
}

/** Must be called from a user gesture (a click), or browsers ignore it. */
export async function requestDesktopPermission(): Promise<DesktopState> {
  const s = desktopState();
  if (s !== 'default') return s;
  try { await Notification.requestPermission(); } catch { /* old Safari callback form: ignore */ }
  await registerNotificationWorker();
  return desktopState();
}

export interface DesktopNotice { title: string; body: string; url: string; tag: string; urgent?: boolean; timestamp?: number }

export async function showDesktop(n: DesktopNotice, onClickFallback: (url: string) => void): Promise<boolean> {
  if (desktopState() !== 'granted') return false;
  const options: NotificationOptions & { renotify?: boolean; timestamp?: number } = {
    body: n.body,
    icon: '/icons/notification-192.png',
    badge: '/icons/badge-96.png',
    tag: n.tag,
    renotify: true,              // a replacement for the same thread still alerts
    requireInteraction: !!n.urgent,
    silent: true,                // RPIS plays its own tone, so the OS sound would double it
    data: { url: n.url },
    timestamp: n.timestamp ?? Date.now(),
  };
  try {
    const reg = await registerNotificationWorker();
    if (reg) { await reg.showNotification(n.title, options); return true; }
    const plain = new Notification(n.title, options);
    plain.onclick = () => { window.focus(); onClickFallback(n.url); plain.close(); };
    return true;
  } catch {
    return false;
  }
}
