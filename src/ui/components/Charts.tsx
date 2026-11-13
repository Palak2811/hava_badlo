import { aqiBand } from '../../engine/core';
import type { Sample, Source } from '../../engine/types';

export const SOURCE_META: Record<Source, { label: string; icon: string; color: string }> = {
  transport: { label: 'Transport', icon: '🚗', color: '#0ea5e9' },
  dust: { label: 'Road dust', icon: '🧱', color: '#f59e0b' },
  industry: { label: 'Industry', icon: '🏭', color: '#64748b' },
  agriculture: { label: 'Stubble burning', icon: '🌾', color: '#eab308' },
  waste: { label: 'Waste burning', icon: '🗑️', color: '#14b8a6' },
  other: { label: 'Other / regional', icon: '🌐', color: '#a855f7' },
};

export function Gauge({ value, label }: { value: number; label: string }) {
  const band = aqiBand(value);
  const pct = Math.min(1, value / 500);
  const r = 62;
  const circ = Math.PI * r;
  return (
    <div className="gauge">
      <svg viewBox="0 0 160 96" width="170" height="102" aria-label={`${label} ${value}`}>
        <defs>
          <linearGradient id="gg" x1="0" x2="1">
            <stop offset="0" stopColor="#22c55e" />
            <stop offset="0.35" stopColor="#eab308" />
            <stop offset="0.65" stopColor="#f97316" />
            <stop offset="1" stopColor="#7f1d1d" />
          </linearGradient>
        </defs>
        <path d={`M ${80 - r} 84 A ${r} ${r} 0 0 1 ${80 + r} 84`} fill="none" stroke="var(--track)" strokeWidth="14" strokeLinecap="round" />
        <path d={`M ${80 - r} 84 A ${r} ${r} 0 0 1 ${80 + r} 84`} fill="none" stroke="url(#gg)" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${circ * pct} ${circ}`} style={{ transition: 'stroke-dasharray .6s ease' }} />
        <text x="80" y="74" textAnchor="middle" className="gauge-num" fill={band.color}>{value}</text>
        <text x="80" y="92" textAnchor="middle" className="gauge-label">{band.label}</text>
      </svg>
      <span className="gauge-cap">{label}</span>
    </div>
  );
}

export function LineChart({ data, series, max }: { data: Sample[]; series: { key: keyof Sample; label: string; color: string; dash?: boolean }[]; max?: number }) {
  const W = 520, H = 170, P = 28;
  if (data.length < 2) return <p className="empty">📈 Collecting data… check back in a few seconds.</p>;
  const pts = data.slice(-240);
  const top = max ?? Math.max(50, ...pts.flatMap((d) => series.map((s) => d[s.key] as number))) * 1.1;
  const bottom = 0;
  const x = (i: number) => P + (i / (pts.length - 1)) * (W - P - 8);
  const y = (v: number) => H - P + 6 - ((v - bottom) / (top - bottom)) * (H - P - 6);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => bottom + (top - bottom) * t);
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={P} x2={W - 8} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
            <text x={P - 4} y={y(t) + 3} textAnchor="end" className="axis">{Math.round(t)}</text>
          </g>
        ))}
        {series.map((s) => (
          <polyline key={String(s.key)} fill="none" stroke={s.color} strokeWidth="2.2" strokeDasharray={s.dash ? '5 4' : undefined} points={pts.map((d, i) => `${x(i)},${y(d[s.key] as number)}`).join(' ')} />
        ))}
        <text x={P} y={H - 4} className="axis">Week {pts[0].week}</text>
        <text x={W - 8} y={H - 4} textAnchor="end" className="axis">Week {pts[pts.length - 1].week}</text>
      </svg>
      <div className="legend">
        {series.map((s) => <span key={String(s.key)}><i style={{ background: s.color }} />{s.label}</span>)}
      </div>
    </div>
  );
}
