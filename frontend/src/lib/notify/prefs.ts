'use client';
import { useSyncExternalStore } from 'react';

/** What a notification is about; each can be switched off independently. */
export type NotifyCategory = 'messages' | 'mentions' | 'approvals' | 'alerts' | 'assignments' | 'inspections' | 'assessments';
export const NOTIFY_CATEGORIES: NotifyCategory[] = ['messages', 'mentions', 'approvals', 'alerts', 'assignments', 'assessments', 'inspections'];

export interface NotifyPrefs {
  /** System (OS) notifications, once the browser has granted permission. */
  desktop: boolean;
  /** Show system notifications only while RPIS is in the background; in-app toasts cover the foreground. */
  desktopOnlyInBackground: boolean;
  sound: boolean;
  /** 0–1 */
  volume: number;
  categories: Record<NotifyCategory, boolean>;
}

const KEY = 'rpis.notify.prefs.v1';
const DEFAULTS: NotifyPrefs = {
  desktop: true, desktopOnlyInBackground: true, sound: true, volume: 0.6,
  categories: { messages: true, mentions: true, approvals: true, alerts: true, assignments: true, inspections: true, assessments: true },
};

// Device preferences: kept per browser, since sound and system notifications are properties of the device.
let current: NotifyPrefs = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

function load(): NotifyPrefs {
  if (loaded) return current;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<NotifyPrefs>;
      current = { ...DEFAULTS, ...p, categories: { ...DEFAULTS.categories, ...(p.categories ?? {}) } };
    }
  } catch { /* storage unavailable: defaults */ }
  return current;
}

export function getPrefs(): NotifyPrefs { return typeof window === 'undefined' ? DEFAULTS : load(); }

export function setPrefs(patch: Partial<NotifyPrefs>) {
  current = { ...getPrefs(), ...patch, categories: { ...getPrefs().categories, ...(patch.categories ?? {}) } };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* not persisted */ }
  listeners.forEach((l) => l());
}

export function useNotifyPrefs(): NotifyPrefs {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, getPrefs, () => DEFAULTS);
}
