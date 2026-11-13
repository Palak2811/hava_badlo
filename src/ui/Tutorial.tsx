import { useEffect, useState } from 'react';
import { SECRETARY, TUTORIAL } from '../config/content';
import { CITY } from '../engine/map';
import { cityControls } from '../city/controls';
import { useGame } from '../state/store';

const WAITING: Record<string, string> = {
  pan: 'Drag the map to continue',
  zoom: 'Zoom in or out to continue',
  inspect: 'Tap something on the map to continue',
  'build-monitor': 'Build the AQI Monitoring Centre to continue',
};

function Avatar() {
  return (
    <svg viewBox="0 0 64 64" className="avatar" aria-hidden>
      <circle cx="32" cy="32" r="32" fill="#fbe7f0" />
      <path d="M12 64 C14 46 50 46 52 64Z" fill="#c2417a" />
      <circle cx="32" cy="28" r="14" fill="#c98b62" />
      <path d="M18 28 C16 8 48 8 46 28 C44 18 20 18 18 28Z" fill="#241a14" />
      <circle cx="47" cy="17" r="6" fill="#241a14" />
      <rect x="23" y="26" width="7" height="5" rx="2" fill="none" stroke="#1b2a5c" strokeWidth="1.6" />
      <rect x="34" y="26" width="7" height="5" rx="2" fill="none" stroke="#1b2a5c" strokeWidth="1.6" />
      <path d="M27 36 Q32 39 37 36" stroke="#7a3b2e" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="32" cy="22" r="1.6" fill="#e11d48" />
    </svg>
  );
}

/** Spotlight rectangle around a UI element, re-measured as layout changes. */
function useTargetRect(selector: string | null) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    const measure = () => setRect(document.querySelector(selector)?.getBoundingClientRect() ?? null);
    measure();
    const id = window.setInterval(measure, 300);
    return () => window.clearInterval(id);
  }, [selector]);
  return rect;
}

export function Tutorial() {
  const g = useGame((s) => s.game);
  const advance = useGame((s) => s.advanceTutorial);
  const skip = useGame((s) => s.skipTutorial);
  const step = TUTORIAL[g.tutorialStep];
  const active = g.introDone && !g.tutorialDone && !!step;
  const rect = useTargetRect(active ? step.target : null);

  useEffect(() => {
    if (!active || step.focus !== 'monitor') return;
    const p = CITY.plots.monitor;
    cityControls.focusTile(p.x + p.w / 2, p.y + p.h / 2, 1.2);
  }, [active, step?.id, step?.focus]);

  if (!active) return null;
  const pad = 8;
  return (
    <>
      {rect && (
        <div
          className="spotlight"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
          aria-hidden
        />
      )}
      <aside className="secretary" role="dialog" aria-label={`${SECRETARY.name}, ${SECRETARY.role}`}>
        <Avatar />
        <div className="sec-body">
          <small>{SECRETARY.name} · {SECRETARY.role}</small>
          <p>{step.text}</p>
          <div className="sec-actions">
            <span className="sec-progress">{g.tutorialStep + 1} / {TUTORIAL.length}</span>
            <button className="link-btn" onClick={skip}>Skip tutorial</button>
            {step.gate === 'next' ? (
              <button className="btn primary small" onClick={advance}>{g.tutorialStep === TUTORIAL.length - 1 ? 'Start the clock' : 'Next'}</button>
            ) : (
              <span className="waiting"><i className="pulse-dot" /> {WAITING[step.gate]}</span>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
