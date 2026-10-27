'use client';
import { getPrefs } from './prefs';

/**
 * Notification sounds, synthesised with the Web Audio API so there are no audio assets to ship.
 * Each tone is a short bell-like voice (fundamental plus a soft inharmonic partial, fast attack,
 * exponential decay) through a gentle low-pass and a compressor so it stays clean at any volume.
 * Browsers only allow audio after the user has interacted with the page; unlockAudio() is wired to
 * the first click or key press.
 */
export type ToneKind = 'message' | 'info' | 'success' | 'warning' | 'critical';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let lastPlayed = 0;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 6500; lp.Q.value = 0.4;
    master = ctx.createGain();
    master.connect(lp); lp.connect(comp); comp.connect(ctx.destination);
  }
  return ctx;
}

export function unlockAudio() {
  const c = context();
  if (c && c.state === 'suspended') c.resume().catch(() => undefined);
}

/** One bell voice. */
function bell(c: AudioContext, out: AudioNode, freq: number, start: number, dur: number, level: number, bright = 0.18) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(level, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  g.connect(out);
  const partials: [number, number, OscillatorType][] = [[1, 1, 'sine'], [2.01, bright, 'sine'], [3.98, bright * 0.25, 'triangle']];
  for (const [mult, amp, type] of partials) {
    const o = c.createOscillator();
    const og = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq * mult, start);
    og.gain.value = amp;
    o.connect(og); og.connect(g);
    o.start(start); o.stop(start + dur + 0.05);
  }
}

const NOTE = { Fs5: 739.99, G5: 783.99, A5: 880, B5: 987.77, C6: 1046.5, Cs6: 1108.73, D6: 1174.66, E6: 1318.51, G6: 1567.98 };

/** Plays a notification tone if sound is on. Rapid bursts are coalesced so a flurry of events is one chime. */
export function playTone(kind: ToneKind, opts: { force?: boolean; volume?: number } = {}) {
  const prefs = getPrefs();
  if (!opts.force && !prefs.sound) return;
  const now = Date.now();
  if (!opts.force && now - lastPlayed < 1200) return;
  lastPlayed = now;
  const c = context();
  if (!c || !master) return;
  if (c.state === 'suspended') c.resume().catch(() => undefined);
  const vol = Math.max(0, Math.min(1, opts.volume ?? prefs.volume));
  if (vol === 0) return;
  master.gain.setValueAtTime(vol * 0.9, c.currentTime);
  const t = c.currentTime + 0.02;
  switch (kind) {
    case 'message':   // soft rising fourth: unobtrusive, for chat
      bell(c, master, NOTE.A5, t, 0.32, 0.30, 0.12);
      bell(c, master, NOTE.D6, t + 0.09, 0.45, 0.26, 0.12);
      break;
    case 'info':      // rising major triad: general notification
      bell(c, master, NOTE.G5, t, 0.35, 0.28);
      bell(c, master, NOTE.B5, t + 0.11, 0.38, 0.26);
      bell(c, master, NOTE.D6, t + 0.22, 0.6, 0.24);
      break;
    case 'success':   // bright major arpeggio resolving upward
      bell(c, master, NOTE.C6, t, 0.3, 0.26);
      bell(c, master, NOTE.E6, t + 0.09, 0.3, 0.24);
      bell(c, master, NOTE.G6, t + 0.18, 0.7, 0.22);
      break;
    case 'warning':   // falling minor third, repeated: needs attention
      bell(c, master, NOTE.E6, t, 0.25, 0.30, 0.25);
      bell(c, master, NOTE.Cs6, t + 0.16, 0.45, 0.28, 0.25);
      break;
    case 'critical':  // two firm double strikes: unmistakable but not harsh
      for (const off of [0, 0.42]) {
        bell(c, master, NOTE.B5, t + off, 0.18, 0.36, 0.35);
        bell(c, master, NOTE.Fs5, t + off + 0.13, 0.26, 0.34, 0.35);
      }
      break;
  }
}
