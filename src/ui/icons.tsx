/** Minimal stroke icon set (Lucide-style, 24×24). Inline to avoid a new dependency. */
const P: Record<string, string[]> = {
  wallet: ['M20 7H5a2 2 0 0 1 0-4h13v4', 'M3 5v14a2 2 0 0 0 2 2h15V7', 'M16 14h.01'],
  wind: ['M3 8h11a3 3 0 1 0-3-3', 'M3 12h15a3 3 0 1 1-3 3', 'M3 16h7'],
  smile: ['c12,12,10', 'M8 14s1.5 2 4 2 4-2 4-2', 'M9 9h.01', 'M15 9h.01'],
  play: ['M7 4l13 8-13 8z'],
  pause: ['M8 5v14', 'M16 5v14'],
  fast: ['M4 5l8 7-8 7z', 'M12 5l8 7-8 7z'],
  city: ['M3 21h18', 'M5 21V8l6-4v17', 'M11 21V9h8v12', 'M8 12h.01', 'M8 16h.01', 'M15 13h.01', 'M15 17h.01'],
  flask: ['M9 3h6', 'M10 3v6L4.5 18.5A1.6 1.6 0 0 0 6 21h12a1.6 1.6 0 0 0 1.5-2.5L14 9V3', 'M7 15h10'],
  news: ['M4 5h13v14H6a2 2 0 0 1-2-2z', 'M17 9h3v8a2 2 0 0 1-2 2', 'M8 9h5', 'M8 13h5'],
  landmark: ['M3 21h18', 'M4 10h16', 'M12 3l8 5H4z', 'M6 10v8', 'M10 10v8', 'M14 10v8', 'M18 10v8'],
  x: ['M6 6l12 12', 'M18 6L6 18'],
  settings: ['c12,12,3', 'M12 2v3', 'M12 19v3', 'M2 12h3', 'M19 12h3', 'M4.9 4.9l2.1 2.1', 'M17 17l2.1 2.1', 'M4.9 19.1L7 17', 'M17 7l2.1-2.1'],
  chevron: ['M9 6l6 6-6 6'],
  alert: ['M12 3l10 18H2z', 'M12 10v4', 'M12 17h.01'],
  up: ['M4 17l6-6 4 4 6-6', 'M14 9h6v6'],
  down: ['M4 7l6 6 4-4 6 6', 'M14 15h6V9'],
  check: ['M5 12l5 5 9-10'],
  lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
  sparkle: ['M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z'],
  calendar: ['M4 6h16v15H4z', 'M4 10h16', 'M8 3v4', 'M16 3v4'],
  leaf: ['M5 19c0-9 6-14 15-14 0 9-5 15-14 15', 'M5 19l7-7'],
  coins: ['c9,9,6', 'M18.1 10.4a6 6 0 1 1-7.7 7.7'],
  users: ['c9,8,4', 'M2 21a7 7 0 0 1 14 0', 'M16 4a4 4 0 0 1 0 8', 'M22 21a7 7 0 0 0-5-6.7'],
  hammer: ['M14 6l4 4', 'M3 21l9-9', 'M12 4l8 8-3 3-8-8z'],
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
  clock: ['c12,12,10', 'M12 7v5l3 2'],
  flame: ['M12 22a7 7 0 0 0 7-7c0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-3 3-5 6-5 8a7 7 0 0 0 7 7z'],
  trophy: ['M8 21h8', 'M12 17v4', 'M7 4h10v5a5 5 0 0 1-10 0z', 'M17 6h3a3 3 0 0 1-3 4', 'M7 6H4a3 3 0 0 0 3 4'],
  eye: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z', 'c12,12,3'],
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 18, stroke = 2, className }: { name: IconName; size?: number; stroke?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {P[name].map((d, i) => {
        if (d.startsWith('c')) {
          const [cx, cy, r] = d.slice(1).split(',').map(Number);
          return <circle key={i} cx={cx} cy={cy} r={r} />;
        }
        return <path key={i} d={d} />;
      })}
    </svg>
  );
}
