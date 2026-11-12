import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { LOADING_LINES } from '../config/content';
import { useGame, type Tab } from '../state/store';
import TopBar from './TopBar';
import CityTab from './screens/CityTab';
import InfraTab from './screens/InfraTab';
import ResearchTab from './screens/ResearchTab';
import NewsTab from './screens/NewsTab';
import AdminTab from './screens/AdminTab';
import StatsTab from './screens/StatsTab';
import { BuildingModal, ConfirmModal, EndingModal, EventModal, OfflineModal, SettingsModal, TutorialModal } from './components/Modals';
import { Confetti, Floaters, Toasts } from './components/Feedback';

const CityView = lazy(() => import('../city/CityView'));

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'city', label: 'City Overview', icon: '🏙️' },
  { id: 'infra', label: 'Infrastructure', icon: '🏗️' },
  { id: 'research', label: 'Research & Tech', icon: '🔬' },
  { id: 'news', label: 'News & Events', icon: '📰' },
  { id: 'admin', label: 'Administration', icon: '🎭' },
  { id: 'stats', label: 'Statistics', icon: '📊' },
];

function useGameLoop() {
  const acc = useRef(0);
  useEffect(() => {
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(2, (now - last) / 1000);
      last = now;
      const st = useGame.getState();
      if ((st.game.ended && !st.game.sandbox) || !st.game.tutorialDone) return;
      acc.current += dt * st.game.speed;
      const n = Math.floor(acc.current);
      if (n > 0) {
        acc.current -= n;
        const before = st.game.res.budget;
        st.tickReal(n);
        const gained = useGame.getState().game.res.budget - before;
        if (st.settings.animations && st.tab === 'city' && gained > 0 && Math.random() < 0.3) st.float(`+₹${Math.round(gained)}`, '#16a34a');
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
    const id = window.setInterval(() => setP((x) => Math.min(100, x + 7 + Math.random() * 12)), 90);
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
      <div className="loading-sky">
        <div className="loading-sun" />
        <div className="loading-smog" style={{ opacity: 1 - p / 110 }} />
      </div>
      <h1 className="logo">HAWA <span>BADLO</span></h1>
      <p className="tagline">A nation-sized problem. A government-sized budget.</p>
      <div className="bar"><div style={{ width: `${p}%` }} /></div>
      <p className="loading-line">{LOADING_LINES[Math.min(LOADING_LINES.length - 1, Math.floor(p / 21))]}</p>
    </div>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const boot = useGame((s) => s.boot);
  const tab = useGame((s) => s.tab);
  const setTab = useGame((s) => s.setTab);
  const pending = useGame((s) => s.game.events.length);
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
    <div className="app">
      <TopBar />
      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            <span className="tab-icon">{t.icon}</span>
            <span className="tab-label">{t.label}</span>
            {t.id === 'news' && pending > 0 && <span className="badge pulse">{pending}</span>}
          </button>
        ))}
      </nav>
      <main className={`main ${tab === 'city' ? 'is-city' : ''}`}>
        <section className="city-wrap">
          <Suspense fallback={<div className="city-canvas city-fallback">Drawing Delhi…</div>}>
            <CityView />
          </Suspense>
          <Floaters />
        </section>
        <section className="panel-area" key={tab}>
          {tab === 'city' && <CityTab />}
          {tab === 'infra' && <InfraTab />}
          {tab === 'research' && <ResearchTab />}
          {tab === 'news' && <NewsTab />}
          {tab === 'admin' && <AdminTab />}
          {tab === 'stats' && <StatsTab />}
        </section>
      </main>
      <Toasts />
      <Confetti />
      <EventModal />
      <BuildingModal />
      <ConfirmModal />
      <SettingsModal />
      <OfflineModal />
      <TutorialModal />
      <EndingModal />
    </div>
  );
}
