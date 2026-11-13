import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { LOADING_LINES } from '../config/content';
import { phaseOf } from '../engine/core';
import { useGame, type Tab } from '../state/store';
import { Hud } from './Hud';
import { ContextPanel, EventChip, InspectPanel, ObjectivesWidget, ZoomControls } from './MapOverlay';
import { Intro } from './Intro';
import { BuildPalette, ToolPanel } from './BuildPalette';
import { CityPulse } from './CityPulse';
import { Tutorial } from './Tutorial';
import { Icon, type IconName } from './icons';
import ResearchScreen from './screens/ResearchTab';
import NewsScreen from './screens/NewsTab';
import AdminScreen from './screens/AdminTab';
import { BriefingModal, ConfirmModal, DecisionModal, EndingModal, OfflineModal, ReportModal, SettingsModal } from './components/Modals';
import { Confetti, Toasts } from './components/Feedback';

const CityView = lazy(() => import('../city/CityView'));

const NAV: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'city', label: 'City', icon: 'city' },
  { id: 'research', label: 'Research', icon: 'flask' },
  { id: 'news', label: 'News & Events', icon: 'news' },
  { id: 'admin', label: 'Administration', icon: 'landmark' },
];

/** The simulation only runs while nothing important is waiting on the player. */
function shouldPause() {
  const { game: g } = useGame.getState();
  if (!g.introDone || !g.tutorialDone || g.reportPending) return true;
  if (g.ended && !g.sandbox) return true;
  if (!g.sandbox && g.briefingSeen < phaseOf(g)) return true;
  return false;
}

function useGameLoop() {
  const acc = useRef(0);
  useEffect(() => {
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(2, (now - last) / 1000);
      last = now;
      const st = useGame.getState();
      if (shouldPause()) return;
      acc.current += dt * st.game.speed;
      const n = Math.floor(acc.current);
      if (n > 0) {
        acc.current -= n;
        const before = st.game.res.budget;
        st.tickReal(n);
        const gained = useGame.getState().game.res.budget - before;
        if (st.settings.animations && gained > 0 && Math.random() < 0.25) st.float(`+₹${Math.round(gained)}`, 'var(--good)');
      }
    }, 250);
    const save = window.setInterval(() => useGame.getState().persist(), 5000);
    const onHide = () => useGame.getState().persist();
    window.addEventListener('beforeunload', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.clearInterval(id);
      window.clearInterval(save);
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);
}

function Loading({ onDone }: { onDone: () => void }) {
  const [p, setP] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setP((x) => Math.min(100, x + 8 + Math.random() * 12)), 90);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (p >= 100) {
      const t = window.setTimeout(onDone, 250);
      return () => window.clearTimeout(t);
    }
  }, [p, onDone]);
  return (
    <div className="loading">
      <div className="loading-grid" aria-hidden />
      <div className="loading-card">
        <div className="wordmark">Hawa <b>Badlo</b></div>
        <p>A nation-sized problem. A government-sized budget.</p>
        <div className="progress"><i style={{ width: `${p}%` }} /></div>
        <small>{LOADING_LINES[Math.min(LOADING_LINES.length - 1, Math.floor(p / 21))]}</small>
      </div>
    </div>
  );
}

function Drawer({ tab }: { tab: Tab }) {
  const setTab = useGame((s) => s.setTab);
  const item = NAV.find((n) => n.id === tab)!;
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setTab('city');
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [setTab]);
  return (
    <aside className="drawer" aria-label={item.label}>
      <header className="drawer-head">
        <h2><Icon name={item.icon} size={20} /> {item.label}</h2>
        <button className="icon-btn" onClick={() => setTab('city')} aria-label="Back to city"><Icon name="x" /></button>
      </header>
      <div className="drawer-body">
        {tab === 'research' && <ResearchScreen />}
        {tab === 'news' && <NewsScreen />}
        {tab === 'admin' && <AdminScreen />}
      </div>
    </aside>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const boot = useGame((s) => s.boot);
  const tab = useGame((s) => s.tab);
  const setTab = useGame((s) => s.setTab);
  const pending = useGame((s) => s.game.events.length);
  const buildOpen = useGame((s) => s.buildOpen);
  const toggleBuild = useGame((s) => s.toggleBuild);
  const loadNotice = useGame((s) => s.loadNotice);
  const toast = useGame((s) => s.toast);
  useEffect(() => {
    boot();
  }, [boot]);
  useEffect(() => {
    if (ready && loadNotice) toast({ kind: 'bad', title: 'Save could not be loaded', body: loadNotice });
  }, [ready, loadNotice, toast]);
  useGameLoop();

  if (!ready) return <Loading onDone={() => setReady(true)} />;

  return (
    <div className="game">
      <div className="map-layer">
        <Suspense fallback={<div className="map-fallback">Drawing Delhi…</div>}>
          <CityView />
        </Suspense>
      </div>
      <Hud />
      <EventChip />
      <ContextPanel />
      <InspectPanel />
      <ZoomControls />
      {!buildOpen && (
        <div className="left-stack">
          <CityPulse />
          <ObjectivesWidget />
        </div>
      )}
      <BuildPalette />
      <ToolPanel />
      {tab !== 'city' && <div className="scrim" onClick={() => setTab('city')} />}
      {tab !== 'city' && <Drawer tab={tab} />}
      <nav className="nav" aria-label="Main">
        <button className={`nav-item build ${buildOpen ? 'on' : ''}`} onClick={() => toggleBuild()} aria-pressed={buildOpen}>
          <Icon name="hammer" size={20} />
          <span>Build</span>
        </button>
        {NAV.map((n) => (
          <button key={n.id} className={`nav-item ${tab === n.id && !buildOpen ? 'on' : ''}`} onClick={() => setTab(n.id)} aria-current={tab === n.id}>
            <Icon name={n.icon} size={20} />
            <span>{n.label}</span>
            {n.id === 'news' && pending > 0 && <em className="dot">{pending}</em>}
          </button>
        ))}
      </nav>
      <Toasts />
      <Confetti />
      <DecisionModal />
      <ConfirmModal />
      <SettingsModal />
      <OfflineModal />
      <ReportModal />
      <EndingModal />
      <BriefingModal />
      <Tutorial />
      <Intro />
    </div>
  );
}
