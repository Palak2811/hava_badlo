import { useEffect, useState } from 'react';
import { useGame } from '../../state/store';

export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => dismiss(t.id)}>
          <b>{t.title}</b>
          {t.body && <p>{t.body}</p>}
        </div>
      ))}
    </div>
  );
}


const COLORS = ['#f43f5e', '#f59e0b', '#22c55e', '#0ea5e9', '#a855f7', '#facc15'];

export function Confetti() {
  const [burst, setBurst] = useState(0);
  const animations = useGame((s) => s.settings.animations);
  useEffect(() => {
    const on = () => setBurst((b) => b + 1);
    window.addEventListener('hb-confetti', on);
    return () => window.removeEventListener('hb-confetti', on);
  }, []);
  useEffect(() => {
    if (!burst) return;
    const t = window.setTimeout(() => setBurst(0), 2200);
    return () => window.clearTimeout(t);
  }, [burst]);
  if (!burst || !animations) return null;
  return (
    <div className="confetti" key={burst} aria-hidden>
      {Array.from({ length: 60 }, (_, i) => (
        <i key={i} style={{ left: `${(i * 53) % 100}%`, background: COLORS[i % COLORS.length], animationDelay: `${(i % 10) * 0.05}s`, transform: `rotate(${i * 31}deg)` }} />
      ))}
    </div>
  );
}
