'use client';
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { BarChart3 } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Label } from '@/components/ui/input';
import { useQueryClient } from '@tanstack/react-query';

/* ─── Colour palette ─────────────────────────────────────────────────────── */
const C = {
  /* ── Page/outer background ─────────────────────────────────────────────── */
  // Radial gradient: bright warm glow in centre-right, darker at corners
  pageBg:
    'radial-gradient(ellipse 160% 140% at 68% 38%,' +
    ' #8A7258 0%,' +   // warm tan/bronze glow centre
    ' #6A5438 20%,' +  // medium warm brown
    ' #4A3828 45%,' +
    ' #342A1C 70%,' +
    ' #261E14 100%)',

  windowBg:
    'linear-gradient(155deg,' +
    ' #846A4C 0%,' +
    ' #6E5840 52%,' +
    ' #5C4832 100%)',
  orange:       '#C84010',
  orangeGlow:   'rgba(200,64,16,0.38)',
  logoText:     '#FFFFFF',
  cream:        '#F0EAE0',
  subtitle:     '#D6CFBE',
  mutedText:    '#C2B094',
  headerBg:     'rgba(0,0,0,0.12)',
  headerBorder: 'rgba(80,62,38,0.35)',

  /* ── Right column (login form area) ────────────────────────────────────── */
  rightColBg:   'rgba(0,0,0,0.08)',
  colDivider:   'rgba(80,62,38,0.28)',

  /* ── Window border ──────────────────────────────────────────────────────── */
  winBorder:    'rgba(105,82,48,0.45)',

  /* ── Input fields ───────────────────────────────────────────────────────── */
  inputBg:      'rgba(0,0,0,0.14)',
  inputBorder:  'rgba(148,118,65,0.32)',
  inputFocus:   'rgba(200,64,16,0.75)',
  inputRing:    'rgba(200,64,16,0.28)',

  /* ── Button ─────────────────────────────────────────────────────────────── */
  btnBg:        'linear-gradient(135deg, #C84010 0%, #982808 100%)',
  btnBgBusy:    'linear-gradient(135deg, #883008 0%, #682008 100%)',
  btnBorder:    'rgba(195,95,28,0.45)',
  btnShadow:    '0 3px 18px rgba(200,64,16,0.38)',

  /* ── Demo accounts panel ────────────────────────────────────────────────── */
  demoPanelBg:  'rgba(0,0,0,0.08)',
  demoBorder:   'rgba(80,62,38,0.22)',
  demoTitle:    '#C8A050',
  demoUser:     '#D87038',
  demoDim:      '#BCA684',

  /* ── Error ───────────────────────────────────────────────────────────────── */
  errorBg:      'rgba(200,64,16,0.14)',
  errorBorder:  'rgba(200,64,16,0.36)',
  errorText:    '#F08060',

  /* ── Footer ─────────────────────────────────────────────────────────────── */
  footerBg:     'rgba(0,0,0,0.10)',
  footerBorder: 'rgba(80,62,38,0.20)',
  footerText:   '#B4A080',
};

/* ─── Demo accounts ──────────────────────────────────────────────────────── */
const DEMO_ACCOUNTS = [
  ['executive',    'EXECUTIVE'   ],
  ['health.head',  'SECTOR_HEAD' ],
  ['analyst',      'ANALYST'     ],
  ['pmo.observer', 'PMO_FEDERAL' ],
  ['admin',        'ADMIN'       ],
] as const;

/* ─────────────────────────────────────────────────────────────────────────────
   Tigray constellation — procedural page background.

   No raster image: every point is a real wereda / town centroid from
   V2__reference_data.sql projected with a plain equirectangular transform
   into a 1440×900 viewBox (preserveAspectRatio "slice" ≙ background-size:
   cover). Deterministic, so SSR and client render identically.
   ──────────────────────────────────────────────────────────────────────────── */

const VB_W = 1440, VB_H = 900;
const LON0 = 36.4, LAT0 = 14.7;          // top-left of the frame
const PX_LON = 300, PX_LAT = 310;        // px per degree (≈ cos 13.5° ratio)
// Offset so the Adigrat–Mekelle–Alamata column (≈39.5°E) sits to the right of
// the centred 860px window and the northern towns sit above it.
const X0 = 335;
const Y0 = -30;
const px = (lon: number) => X0 + (lon - LON0) * PX_LON;
const py = (lat: number) => Y0 + (LAT0 - lat) * PX_LAT;

/** Every wereda centroid (lon, lat) — faint dots that trace the region's shape. */
const WEREDAS: [number, number][] = [
  [38.896,14.166],[38.900,14.172],[38.724,14.121],[38.680,14.130],[39.150,14.280],[38.950,14.050],[38.780,14.420],
  [38.750,13.950],[38.850,13.650],[38.950,13.450],[39.002,13.623],[39.462,14.277],[39.400,14.250],[39.400,14.420],
  [39.560,14.370],[39.550,14.070],[39.433,13.977],[39.580,13.780],[39.600,13.790],[39.730,13.870],[39.550,13.400],
  [39.550,13.180],[39.190,13.170],[39.170,13.650],[39.558,12.421],[39.640,12.720],[39.400,12.500],[39.450,12.780],
  [39.500,12.950],[39.538,12.783],[39.522,12.509],[38.283,14.102],[38.400,14.150],[38.500,14.100],[38.070,14.050],
  [38.150,13.570],[38.250,14.300],[37.800,14.400],[36.900,14.100],[36.609,14.288],[37.300,13.750],[36.950,13.500],
  [39.480,13.505],[39.465,13.495],[39.455,13.475],[39.470,13.488],[39.540,13.470],[39.475,13.520],[39.490,13.470],
];

const TOWNS = [
  { id: 'humera',  label: 'Humera',   lon: 36.609, lat: 14.288, capital: false, delay: 0.0 },
  { id: 'shire',   label: 'Shire',    lon: 38.283, lat: 14.102, capital: false, delay: 0.5 },
  { id: 'axum',    label: 'Axum',     lon: 38.724, lat: 14.121, capital: false, delay: 0.9 },
  { id: 'adwa',    label: 'Adwa',     lon: 38.900, lat: 14.172, capital: false, delay: 1.3 },
  { id: 'adigrat', label: 'Adigrat',  lon: 39.462, lat: 14.277, capital: false, delay: 0.7 },
  { id: 'hawzen',  label: 'Hawzen',   lon: 39.433, lat: 13.977, capital: false, delay: 1.7 },
  { id: 'wukro',   label: 'Wukro',    lon: 39.600, lat: 13.790, capital: false, delay: 1.0 },
  { id: 'abiyadi', label: 'Abiy Adi', lon: 39.002, lat: 13.623, capital: false, delay: 1.9 },
  { id: 'mekelle', label: 'Mekelle',  lon: 39.470, lat: 13.490, capital: true,  delay: 0.0 },
  { id: 'maichew', label: 'Maichew',  lon: 39.538, lat: 12.783, capital: false, delay: 1.4 },
  { id: 'korem',   label: 'Korem',    lon: 39.522, lat: 12.509, capital: false, delay: 0.3 },
  { id: 'alamata', label: 'Alamata',  lon: 39.558, lat: 12.421, capital: false, delay: 1.1 },
] as const;

type TownId = typeof TOWNS[number]['id'];

/** Main road corridors between towns, with a dash-animation phase offset. */
const CORRIDORS: [TownId, TownId, number][] = [
  ['humera',  'shire',   0.0],
  ['shire',   'axum',    0.4],
  ['axum',    'adwa',    0.8],
  ['adwa',    'adigrat', 1.2],
  ['adigrat', 'wukro',   0.2],
  ['wukro',   'mekelle', 0.6],
  ['adwa',    'hawzen',  1.5],
  ['hawzen',  'wukro',   0.9],
  ['shire',   'abiyadi', 1.8],
  ['abiyadi', 'mekelle', 0.3],
  ['mekelle', 'maichew', 1.0],
  ['maichew', 'korem',   1.4],
  ['korem',   'alamata', 0.7],
];

/** Graticule every 0.5° inside the frame. */
const MERIDIANS = [36.5, 37, 37.5, 38, 38.5, 39, 39.5, 40];
const PARALLELS = [12.5, 13, 13.5, 14, 14.5];

/* ─── Procedural background + constellation overlay ─────────────────────── */
function TigrayConstellation() {
  const byId = Object.fromEntries(TOWNS.map(t => [t.id, t])) as Record<TownId, typeof TOWNS[number]>;

  return (
    <>
      {/* ── Base: layered warm-brown gradients (no image) ── */}
      <div
        style={{
          position: 'absolute', inset: 0, zIndex: 0,
          background:
            'radial-gradient(ellipse 70% 60% at 78% 18%, rgba(150,106,58,0.46) 0%, rgba(150,106,58,0) 70%),' +
            'radial-gradient(ellipse 60% 55% at 12% 88%, rgba(200,64,16,0.16) 0%, rgba(200,64,16,0) 70%),' +
            'radial-gradient(ellipse 120% 90% at 50% 50%, #3C2C1D 0%, #2A1E13 60%, #1F160D 100%)',
        }}
      />

      {/* ── Constellation SVG ── */}
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid slice"
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          zIndex: 1,
          pointerEvents: 'none',
        }}
        aria-hidden
      >
        <defs>
          <pattern id="dotGrid" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="rgba(220,185,120,0.10)" />
          </pattern>
          <radialGradient id="vig" cx="50%" cy="50%" r="72%">
            <stop offset="55%"  stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.55" />
          </radialGradient>
          <filter id="townGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="labelGlow" x="-30%" y="-60%" width="160%" height="220%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <style>{`
            @keyframes dashFlow { to { stroke-dashoffset: -72; } }
            .cl { stroke-dasharray: 10 14; animation: dashFlow 3.2s linear infinite; }
            @keyframes ringPulse {
              0%   { transform: scale(1);   opacity: 0.75; }
              80%  { transform: scale(4.2); opacity: 0;    }
              100% { transform: scale(4.2); opacity: 0;    }
            }
            .cr  { animation: ringPulse 2.6s ease-out infinite; transform-box: fill-box; transform-origin: center; }
            @keyframes dotBreath {
              0%,100% { opacity: 1;    transform: scale(1);    }
              50%     { opacity: 0.72; transform: scale(0.88); }
            }
            .cd  { animation: dotBreath 2.2s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
            @keyframes lblPulse { 0%,100% { opacity: 0.9; } 50% { opacity: 0.55; } }
            .clbl { animation: lblPulse 3.2s ease-in-out infinite; }
            @media (prefers-reduced-motion: reduce) {
              .cl, .cr, .cd, .clbl { animation: none; }
              .cr { opacity: 0.35; }
            }
          `}</style>
        </defs>

        {/* Dot grid */}
        <rect width={VB_W} height={VB_H} fill="url(#dotGrid)" />

        {/* Graticule */}
        {MERIDIANS.map(lon => (
          <line key={`m${lon}`} x1={px(lon)} y1={0} x2={px(lon)} y2={VB_H}
            stroke="rgba(220,185,120,0.07)" strokeWidth="1" />
        ))}
        {PARALLELS.map(lat => (
          <line key={`p${lat}`} x1={0} y1={py(lat)} x2={VB_W} y2={py(lat)}
            stroke="rgba(220,185,120,0.07)" strokeWidth="1" />
        ))}
        {MERIDIANS.map(lon => (
          <text key={`ml${lon}`} x={px(lon) + 5} y={VB_H - 10}
            fontSize="10" fontFamily="monospace" fill="rgba(220,185,120,0.22)">
            {lon.toFixed(1)}°E
          </text>
        ))}
        {PARALLELS.map(lat => (
          <text key={`pl${lat}`} x={10} y={py(lat) - 5}
            fontSize="10" fontFamily="monospace" fill="rgba(220,185,120,0.22)">
            {lat.toFixed(1)}°N
          </text>
        ))}

        {/* Wereda centroids */}
        {WEREDAS.map(([lon, lat], i) => (
          <circle key={i} cx={px(lon)} cy={py(lat)} r="2.2" fill="rgba(225,190,125,0.35)" />
        ))}

        {/* Road corridors */}
        {CORRIDORS.map(([fromId, toId, delay], i) => {
          const a = byId[fromId], b = byId[toId];
          const isMek = fromId === 'mekelle' || toId === 'mekelle';
          return (
            <g key={i}>
              <line x1={px(a.lon)} y1={py(a.lat)} x2={px(b.lon)} y2={py(b.lat)}
                stroke="rgba(200,150,40,0.14)" strokeWidth="5" />
              <line x1={px(a.lon)} y1={py(a.lat)} x2={px(b.lon)} y2={py(b.lat)}
                stroke={isMek ? 'rgba(220,100,30,0.70)' : 'rgba(200,165,55,0.55)'}
                strokeWidth={isMek ? '2' : '1.5'}
                className="cl"
                style={{ animationDelay: `${delay}s` }} />
            </g>
          );
        })}

        {/* Town markers */}
        {TOWNS.map(town => {
          const x = px(town.lon), y = py(town.lat);
          const cap = town.capital;
          return (
            <g key={town.id} filter="url(#townGlow)">
              <circle cx={x} cy={y} r={cap ? 11 : 7} fill="none"
                stroke={cap ? 'rgba(210,60,10,0.85)' : 'rgba(210,165,40,0.75)'}
                strokeWidth={cap ? '2' : '1.5'}
                className="cr" style={{ animationDelay: `${town.delay}s` }} />
              <circle cx={x} cy={y} r={cap ? 8 : 5}
                fill={cap ? '#CF4010' : '#D4A040'}
                className="cd" style={{ animationDelay: `${town.delay}s` }} />
              <circle cx={x} cy={y} r={cap ? 3 : 2} fill="rgba(255,255,255,0.92)" />
              <text x={x} y={y} dy={cap ? -17 : -12} textAnchor="middle"
                fontSize={cap ? 15 : 11.5} fontWeight={cap ? 700 : 600}
                fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
                fill={cap ? 'rgba(255,225,155,0.98)' : 'rgba(235,205,125,0.88)'}
                filter="url(#labelGlow)" className="clbl"
                style={{ animationDelay: `${town.delay}s` }} letterSpacing="0.4">
                {town.label}
              </text>
              {cap && (
                <text x={x} y={y} dy={-32} textAnchor="middle" fontSize="9.5"
                  fontFamily="sans-serif" fontWeight="700" letterSpacing="2"
                  fill="rgba(220,90,25,0.92)" className="clbl">
                  ★ CAPITAL
                </text>
              )}
            </g>
          );
        })}

        {/* Vignette keeps the eye on the window */}
        <rect width={VB_W} height={VB_H} fill="url(#vig)" />
      </svg>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Orbital illustration — pixel-faithful recreation of the DBeaver graphic.

   Against the LIGHTER medium-brown background the ring strokes are DARK,
   the gold × node and sweeping arm are warm golden-cream, the 3D icon is
   a dark-red metallic stack, and white dot/arrow accents sit on dark nodes.
   ───────────────────────────────────────────────────────────────────────── */
function OrbitalGraphic() {
  return (
    <svg
      viewBox="0 0 420 285"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      style={{ width: '100%', height: '100%', display: 'block' }}
    >
      <defs>
        {/* ── Outer ambient glow ── */}
        <radialGradient id="bgGlow" cx="62%" cy="38%" r="55%">
          <stop offset="0%"   stopColor="#9A8060" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#4A3828" stopOpacity="0"    />
        </radialGradient>

        {/* ── Dark ring gradient ── */}
        <radialGradient id="ringGrad" cx="50%" cy="50%" r="50%">
          <stop offset="60%"  stopColor="#2A1E10" stopOpacity="0"    />
          <stop offset="82%"  stopColor="#2A1E10" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#2A1E10" stopOpacity="0"    />
        </radialGradient>

        {/* ── 3-D icon gradient (top face) ── */}
        <linearGradient id="iconTop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#A03420" />
          <stop offset="100%" stopColor="#701808" />
        </linearGradient>
        {/* 3-D icon left side */}
        <linearGradient id="iconLeft" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#501008" />
          <stop offset="100%" stopColor="#601408" />
        </linearGradient>
        {/* 3-D icon right side */}
        <linearGradient id="iconRight" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#881C10" />
          <stop offset="100%" stopColor="#701408" />
        </linearGradient>

        {/* ── Sweep arm gradient ── */}
        <linearGradient id="sweepGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#C8A040" stopOpacity="0"    />
          <stop offset="55%"  stopColor="#C8A040" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#E0C060" stopOpacity="0.90" />
        </linearGradient>

        {/* ── Drop shadow filter ── */}
        <filter id="iconShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="2" dy="3" stdDeviation="3"
            floodColor="#000" floodOpacity="0.40" />
        </filter>

        {/* ── Animated CSS ── */}
        <style>{`
          @keyframes sweepRotate {
            from { transform: rotate(0deg);   }
            to   { transform: rotate(360deg); }
          }
          @keyframes nodePulse {
            0%,100% { opacity: 1;    r: 5px; }
            50%     { opacity: 0.55; r: 4px; }
          }
          @keyframes dotRipple {
            0%   { r: 3px;  opacity: 0.85; }
            80%  { r: 14px; opacity: 0;    }
            100% { r: 14px; opacity: 0;    }
          }
          @keyframes exportFlow {
            to { stroke-dashoffset: -28; }
          }
          .sweep-arm {
            transform-origin: 218px 138px;
            animation: sweepRotate 8s linear infinite;
          }
          .node-dot { animation: nodePulse 2.2s ease-in-out infinite; }
          .dot-ripple { animation: dotRipple 2.2s ease-out infinite; }
          .export-line {
            stroke-dasharray: 5 7;
            animation: exportFlow 1.6s linear infinite;
          }
        `}</style>
      </defs>

      {/* ── Ambient page glow ── */}
      <rect width="420" height="285" fill="url(#bgGlow)" />

      {/* ════════════════════════════════════════════════════════════════════
          ORBITAL RINGS  (dark strokes on medium-brown background)
          Three concentric ellipses at 15° tilt, centred ~218,138
          ═══════════════════════════════════════════════════════════════════ */}

      {/* Outer ring */}
      <ellipse cx="218" cy="138" rx="172" ry="92"
        fill="url(#ringGrad)"
        stroke="rgba(30,18,8,0.55)" strokeWidth="1.4"
        transform="rotate(-15, 218, 138)" />

      {/* Middle ring */}
      <ellipse cx="218" cy="138" rx="128" ry="68"
        fill="none"
        stroke="rgba(30,18,8,0.45)" strokeWidth="1.1"
        transform="rotate(-15, 218, 138)" />

      {/* Inner ring */}
      <ellipse cx="218" cy="138" rx="82" ry="44"
        fill="none"
        stroke="rgba(30,18,8,0.38)" strokeWidth="0.9"
        transform="rotate(-15, 218, 138)" />

      {/* ════════════════════════════════════════════════════════════════════
          ANIMATED SWEEP ARM  (golden, rotates around centre 218,138)
          ═══════════════════════════════════════════════════════════════════ */}
      <g className="sweep-arm">
        {/* Sweep sector fill */}
        <path
          d="M 218 138
             L 218 46
             A 92 92 0 0 1 310 138
             Z"
          fill="rgba(200,160,50,0.07)"
          stroke="none"
        />
        {/* Sweep leading edge */}
        <line x1="218" y1="138" x2="218" y2="52"
          stroke="url(#sweepGrad)" strokeWidth="1.6" strokeLinecap="round" />
      </g>

      {/* ════════════════════════════════════════════════════════════════════
          ORBIT NODES — dark discs with white accent dots / arrow symbols
          Positions: outer ring at 12 o'clock, 3 o'clock, 6 o'clock, 9 o'clock
          ═══════════════════════════════════════════════════════════════════ */}

      {/* Node 1 — top (12 o'clock outer ring, rotated -15°) → approx 224,46 */}
      <g>
        <circle cx="224" cy="47" r="11"
          fill="#2A1C0C" stroke="rgba(80,55,25,0.6)" strokeWidth="1" />
        <circle cx="224" cy="47" r="5"
          fill="#C89030" className="node-dot" />
        <circle cx="224" cy="47" r="3" fill="none"
          stroke="rgba(255,255,255,0.70)" strokeWidth="1" />
        {/* Dot-ripple */}
        <circle cx="224" cy="47" r="3"
          fill="none" stroke="rgba(200,160,50,0.6)" strokeWidth="1"
          className="dot-ripple" />
      </g>

      {/* Node 2 — right (3 o'clock outer ring) → approx 387,146 */}
      <g>
        <circle cx="386" cy="148" r="10"
          fill="#2A1C0C" stroke="rgba(80,55,25,0.6)" strokeWidth="1" />
        {/* Arrow / chevron symbol */}
        <polyline points="381,144 386,148 381,152"
          fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* Node 3 — bottom (6 o'clock middle ring) → approx 208,206 */}
      <g>
        <circle cx="208" cy="204" r="9"
          fill="#2A1C0C" stroke="rgba(80,55,25,0.6)" strokeWidth="1" />
        <line x1="204" y1="204" x2="212" y2="204"
          stroke="rgba(255,255,255,0.65)" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="208" y1="200" x2="208" y2="208"
          stroke="rgba(255,255,255,0.65)" strokeWidth="1.5" strokeLinecap="round" />
      </g>

      {/* Node 4 — left (9 o'clock inner ring) → approx 138,136 */}
      <g>
        <circle cx="138" cy="136" r="8"
          fill="#2A1C0C" stroke="rgba(80,55,25,0.5)" strokeWidth="1" />
        <circle cx="138" cy="136" r="3.5"
          fill="none" stroke="rgba(255,255,255,0.60)" strokeWidth="1" />
        <circle cx="138" cy="136" r="1.5" fill="rgba(255,255,255,0.70)" />
      </g>

      {/* ════════════════════════════════════════════════════════════════════
          GOLD × NODE (intersection / datum point — prominent)
          ═══════════════════════════════════════════════════════════════════ */}
      <g>
        {/* Outer ring */}
        <circle cx="218" cy="138" r="18"
          fill="none" stroke="rgba(190,145,30,0.35)" strokeWidth="1" />
        {/* Main disc */}
        <circle cx="218" cy="138" r="12"
          fill="#7A5010" stroke="rgba(200,160,50,0.70)" strokeWidth="1.5" />
        {/* × symbol */}
        <line x1="213" y1="133" x2="223" y2="143"
          stroke="rgba(255,220,120,0.95)" strokeWidth="2" strokeLinecap="round" />
        <line x1="223" y1="133" x2="213" y2="143"
          stroke="rgba(255,220,120,0.95)" strokeWidth="2" strokeLinecap="round" />
      </g>

      {/* ════════════════════════════════════════════════════════════════════
          3-D STACKED ICON — top-left quadrant (data/server stack)
          ═══════════════════════════════════════════════════════════════════ */}
      <g filter="url(#iconShadow)" transform="translate(62, 62)">
        {/* Three stacked isometric layers */}
        {[0, 1, 2].map(i => {
          const yOff = i * 14;
          return (
            <g key={i} transform={`translate(0, ${-yOff})`}>
              {/* Top face */}
              <polygon
                points="28,0 56,14 28,28 0,14"
                fill={i === 0 ? 'url(#iconTop)' : i === 1 ? '#8A2010' : '#6A1808'}
              />
              {/* Left face */}
              <polygon
                points="0,14 0,28 28,42 28,28"
                fill={i === 0 ? 'url(#iconLeft)' : i === 1 ? '#481008' : '#380A04'}
              />
              {/* Right face */}
              <polygon
                points="56,14 56,28 28,42 28,28"
                fill={i === 0 ? 'url(#iconRight)' : i === 1 ? '#701808' : '#581008'}
              />
              {/* Top-face shine */}
              <polygon
                points="28,4 50,14 28,24 6,14"
                fill="rgba(255,255,255,0.07)"
              />
            </g>
          );
        })}
        {/* Data lines on front face of top layer */}
        {[0,1,2,3].map(i => (
          <line key={i}
            x1="6" y1={`${17 + i * 4}`}
            x2={`${22 - i * 2}`} y2={`${17 + i * 4}`}
            stroke="rgba(255,200,100,0.45)" strokeWidth="1" />
        ))}
      </g>

      {/* ════════════════════════════════════════════════════════════════════
          EXPORT / IMPORT connector lines (bottom-right)
          ═══════════════════════════════════════════════════════════════════ */}
      <g opacity="0.75">
        {/* Left anchor circle */}
        <circle cx="296" cy="218" r="5"
          fill="#2A1C0C" stroke="rgba(180,140,50,0.55)" strokeWidth="1" />
        <circle cx="296" cy="218" r="2" fill="rgba(200,160,60,0.75)" />

        {/* Right anchor circle */}
        <circle cx="380" cy="218" r="5"
          fill="#2A1C0C" stroke="rgba(180,140,50,0.55)" strokeWidth="1" />
        <circle cx="380" cy="218" r="2" fill="rgba(200,160,60,0.75)" />

        {/* Animated connector */}
        <line x1="301" y1="218" x2="375" y2="218"
          stroke="rgba(190,145,40,0.55)" strokeWidth="1.2"
          className="export-line" />

        {/* Mid-point arrow node */}
        <circle cx="338" cy="218" r="7"
          fill="#2A1C0C" stroke="rgba(180,140,50,0.45)" strokeWidth="1" />
        <polyline points="334,215 338,218 334,221"
          fill="none" stroke="rgba(255,210,100,0.70)" strokeWidth="1.4"
          strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* ── Subtle vignette ── */}
      <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
        <stop offset="60%"  stopColor="#000" stopOpacity="0"    />
        <stop offset="100%" stopColor="#000" stopOpacity="0.20" />
      </radialGradient>
      <rect width="420" height="285" fill="url(#vignette)" />
    </svg>
  );
}

/* ─── Dark-styled input ─────────────────────────────────────────────────── */
function DarkInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [focused, setFocused] = React.useState(false);
  return (
    <input
      {...props}
      onFocus={(e) => { setFocused(true);  props.onFocus?.(e); }}
      onBlur={(e)  => { setFocused(false); props.onBlur?.(e);  }}
      style={{
        width: '100%',
        height: '34px',
        padding: '0 10px',
        borderRadius: '3px',
        background: C.inputBg,
        border: `1px solid ${focused ? C.inputFocus : C.inputBorder}`,
        outline: focused ? `2px solid ${C.inputRing}` : 'none',
        outlineOffset: '2px',
        color: C.cream,
        fontSize: '13px',
        fontFamily: 'inherit',
        transition: 'border-color 0.15s, outline 0.15s',
        boxSizing: 'border-box',
        ...props.style,
      }}
    />
  );
}

/* ─── Main login form ────────────────────────────────────────────────────── */
function LoginForm() {
  const t  = useTranslations('auth');
  const ta = useTranslations('app');
  const tr = useTranslations('roles');
  const router = useRouter();
  const params = useSearchParams();
  const qc     = useQueryClient();

  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error,    setError   ] = React.useState<string | null>(null);
  const [busy,     setBusy    ] = React.useState(false);
  const demo = process.env.NEXT_PUBLIC_DEMO_BANNER === 'true';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
        credentials: 'same-origin',
      });
      if (res.status === 401) { setError(t('invalid'));  return; }
      if (res.status === 423) { setError(t('locked'));   return; }
      if (!res.ok)            { setError(t('generic'));  return; }
      qc.clear();
      const next = params.get('next');
      router.replace(next && next.startsWith('/') ? (next as '/') : '/');
    } catch { setError(t('generic')); } finally { setBusy(false); }
  };

  return (
    <main
      className="flex min-h-screen items-center justify-center p-4"
      style={{ position: 'relative', background: '#241A10', overflow: 'hidden' }}
    >
      {/* ── Procedural Tigray constellation (behind the window) ── */}
      <TigrayConstellation />

      {/* ── Login window (above the map overlay) ── */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          minWidth: 0,
          maxWidth: '860px',
          background: C.windowBg,
          border: `1px solid ${C.winBorder}`,
          borderRadius: '5px',
          overflow: 'hidden',
          boxShadow:
            '0 24px 70px rgba(0,0,0,0.45),' +
            '0  0   0 1px rgba(180,140,60,0.14),' +
            'inset 0 1px 0 rgba(220,195,120,0.08)',
        }}
      >
        {/* ── Header strip ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '7px 16px',
            background: C.headerBg,
            borderBottom: `1px solid ${C.headerBorder}`,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: '26px', height: '26px',
              background: 'linear-gradient(145deg, #D04818 0%, #8E2006 100%)',
              borderRadius: '5px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(200,64,16,0.32)',
            }}
          >
            <BarChart3 style={{ width: '15px', height: '15px', color: '#fff' }} />
          </div>
          <span
            style={{
              color: C.logoText,
              fontSize: '14px',
              fontWeight: 700,
              letterSpacing: '0.04em',
              fontFamily: 'sans-serif',
            }}
          >
            RPIS · ReconstructTigray
          </span>
        </div>

        {/* ── Two-column body ── */}
        <div className="flex flex-1 flex-col tablet:flex-row tablet:min-h-[330px]">

          {/* ══ LEFT column — orbital graphic + headline ══ */}
          <div
            className="tablet:basis-[57%] tablet:grow-0 tablet:shrink-0"
            style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '4px 12px 20px 12px',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {/* Orbital graphic */}
            <div style={{ flex: 1, minHeight: '185px', maxHeight: '255px' }}>
              <OrbitalGraphic />
            </div>

            {/* ── Giant orange-red headline ── */}
            <div style={{ paddingLeft: '4px', paddingRight: '6px' }}>
              <div
                style={{
                  fontSize: 'clamp(30px, 4.6vw, 52px)',
                  fontWeight: 900,
                  lineHeight: 0.95,
                  letterSpacing: '-0.01em',
                  textTransform: 'uppercase',
                  fontFamily:
                    '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  userSelect: 'none',
                }}
              >
                <div style={{ color: C.orange, textShadow: `0 0 50px ${C.orangeGlow}` }}>
                  Reconstruct
                </div>
                <div style={{ color: C.cream }}>Tigray</div>
              </div>

              {/* ── Subtitle ── */}
              <div
                style={{
                  marginTop: '10px',
                  fontSize: 'clamp(11px, 1.35vw, 14px)',
                  color: C.cream,
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                  fontFamily: 'sans-serif',
                }}
              >
                {ta('tagline')}
              </div>
              <div
                style={{
                  marginTop: '4px',
                  fontSize: 'clamp(10px, 1.2vw, 12.5px)',
                  color: C.subtitle,
                  letterSpacing: '0.03em',
                  fontFamily: 'sans-serif',
                }}
              >
                {ta('office')}
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════
              RIGHT column — login form                                     */}
          <div
            className="tablet:basis-[43%] tablet:grow-0 tablet:shrink-0 border-t tablet:border-t-0 tablet:border-l"
            style={{
              borderColor: C.colDivider,
              background: C.rightColBg,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '22px 24px 18px',
            }}
          >
            {/* Form header */}
            <div style={{ marginBottom: '16px' }}>
              <div
                style={{
                  color: C.cream,
                  fontSize: '15px',
                  fontWeight: 600,
                  marginBottom: '3px',
                  fontFamily: 'sans-serif',
                }}
              >
                {t('title')}
              </div>
              <div
                style={{
                  color: C.mutedText,
                  fontSize: '11.5px',
                  fontFamily: 'sans-serif',
                }}
              >
                {t('secure')}
              </div>
            </div>

            {/* Form */}
            <form
              onSubmit={submit}
              style={{ display: 'flex', flexDirection: 'column', gap: '13px' }}
              aria-describedby={error ? 'login-error' : undefined}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <Label
                  htmlFor="username"
                  style={{ color: '#C0A878', fontSize: '11px', fontWeight: 500 }}
                >
                  {t('username')}
                </Label>
                <DarkInput
                  id="username"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <Label
                  htmlFor="password"
                  style={{ color: '#C0A878', fontSize: '11px', fontWeight: 500 }}
                >
                  {t('password')}
                </Label>
                <DarkInput
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {error && (
                <p
                  id="login-error"
                  role="alert"
                  style={{
                    margin: 0,
                    padding: '7px 10px',
                    borderRadius: '3px',
                    background: C.errorBg,
                    border: `1px solid ${C.errorBorder}`,
                    color: C.errorText,
                    fontSize: '11.5px',
                    fontFamily: 'sans-serif',
                  }}
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                style={{
                  height: '34px',
                  borderRadius: '3px',
                  background: busy ? C.btnBgBusy : C.btnBg,
                  border: `1px solid ${C.btnBorder}`,
                  color: '#fff',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  boxShadow: busy ? 'none' : C.btnShadow,
                  transition: 'all 0.15s',
                  letterSpacing: '0.04em',
                  fontFamily: 'sans-serif',
                }}
              >
                {busy ? t('signingIn') : `${t('signIn')} →`}
              </button>
            </form>

            {/* Demo accounts */}
            {demo && (
              <div
                style={{
                  marginTop: '14px',
                  padding: '9px 11px',
                  borderRadius: '3px',
                  background: C.demoPanelBg,
                  border: `1px solid ${C.demoBorder}`,
                }}
              >
                <div
                  style={{
                    color: C.demoTitle,
                    fontSize: '10.5px',
                    fontWeight: 600,
                    marginBottom: '6px',
                    fontFamily: 'sans-serif',
                  }}
                >
                  {t('demoAccounts')}
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: '3px 10px',
                  }}
                >
                  {DEMO_ACCOUNTS.map(([u, r]) => (
                    <div key={u} style={{ fontSize: '10px', fontFamily: 'sans-serif' }}>
                      <button
                        type="button"
                        style={{
                          background: 'none', border: 'none', padding: 0,
                          color: C.demoUser,
                          fontFamily: 'monospace',
                          fontSize: '10px',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.textDecoration = 'underline')}
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.textDecoration = 'none')}
                        onClick={() => { setUsername(u); setPassword('Rpis@2026!'); }}
                      >
                        {u}
                      </button>
                      <span style={{ color: C.demoDim, marginLeft: '3px' }}>
                        · {tr(r)}
                      </span>
                    </div>
                  ))}
                </div>
                <div
                  style={{
                    color: '#B4A080',
                    fontSize: '10px',
                    marginTop: '6px',
                    fontFamily: 'sans-serif',
                  }}
                >
                  {t('demoPassword')}:{' '}
                  <code style={{ color: C.demoTitle, fontFamily: 'monospace' }}>
                    Rpis@2026!
                  </code>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer strip ── */}
        <div
          style={{
            padding: '4px 16px',
            borderTop: `1px solid ${C.footerBorder}`,
            background: C.footerBg,
            fontSize: '10px',
            color: C.footerText,
            fontFamily: 'sans-serif',
            flexShrink: 0,
          }}
        >
          © {new Date().getFullYear()} Tigray Regional Government — Office of Economic Affairs &amp; Reconstruction
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense fallback={null}>
      <LoginForm />
    </React.Suspense>
  );
}
