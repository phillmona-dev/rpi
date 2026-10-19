'use client';

/** Tiny inline trend; decorative (the number beside it carries the value). */
export function Sparkline({ values, color = 'var(--seq-450)', width = 96, height = 28 }: { values: (number | null)[]; color?: string; width?: number; height?: number }) {
  const pts = values.filter((v): v is number => v !== null && !Number.isNaN(v));
  if (pts.length < 2) return <svg width={width} height={height} aria-hidden />;
  const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1;
  const step = width / (pts.length - 1);
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} aria-hidden className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={(pts.length - 1) * step} cy={height - 2 - ((last - min) / span) * (height - 4)} r={2.5} fill={color} />
    </svg>
  );
}
