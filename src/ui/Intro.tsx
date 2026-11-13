import { useEffect, useState } from 'react';
import { CAMPAIGN_WEEKS } from '../config/balance';
import { actualAqi, aqiBand, emissions } from '../engine/core';
import { CITY, areaStats } from '../engine/map';
import { SOURCES } from '../engine/types';
import { useGame } from '../state/store';
import { SOURCE_META } from './components/Charts';
import { Icon } from './icons';
import { inr, num } from './format';

/** Reveals text character by character; click to complete instantly. */
function useTypewriter(text: string, speed = 22) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const id = window.setInterval(() => setN((x) => (x >= text.length ? x : x + 1)), speed);
    return () => window.clearInterval(id);
  }, [text, speed]);
  return { shown: text.slice(0, n), done: n >= text.length, finish: () => setN(text.length) };
}

function Skyline({ smog }: { smog: number }) {
  return (
    <svg viewBox="0 0 400 160" className="skyline" aria-hidden preserveAspectRatio="xMidYMax slice">
      <defs>
        <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#9a917c" />
          <stop offset="1" stopColor="#d3c39d" />
        </linearGradient>
      </defs>
      <rect width="400" height="160" fill="url(#sky)" />
      <circle cx="300" cy="46" r="18" fill="#efe2b9" opacity="0.6" />
      <g fill="#7d7464">
        {[0, 30, 52, 80, 120, 150, 190, 250, 280, 320, 350, 372].map((x, i) => <rect key={x} x={x} y={92 - ((i * 37) % 40)} width={24} height={80} />)}
      </g>
      <g fill="#8c6e58">
        <rect x="176" y="72" width="12" height="70" /><rect x="212" y="72" width="12" height="70" />
        <rect x="170" y="62" width="60" height="14" /><rect x="186" y="54" width="28" height="9" />
      </g>
      <path d="M40 160 L46 70 L52 160Z" fill="#8c6e58" />
      <rect x="0" y="140" width="400" height="20" fill="#5b5a55" />
      <rect width="400" height="160" fill="#b3a88f" opacity={smog} />
    </svg>
  );
}

function SceneNews({ onNext }: { onNext: () => void }) {
  const aqi = actualAqi(useGame.getState().game) + 160; // the infamous November peak on the news
  const lines = [
    { icon: 'wind', text: `AQI crosses ${aqi} in Anand Vihar — doctors call it “a public health emergency”.` },
    { icon: 'users', text: 'Parents protest outside schools; masks sell out in Lajpat Nagar.' },
    { icon: 'wallet', text: 'Traders warn smog is driving away shoppers and investment.' },
    { icon: 'flame', text: 'Factories, trucks and 1 crore vehicles blamed. Everyone blames everyone else.' },
    { icon: 'landmark', text: 'Opposition: “Government sleeping under a blanket of smog.”' },
  ] as const;
  return (
    <div className="scene scene-news">
      <div className="tv">
        <div className="tv-top"><span className="live">● LIVE</span> DELHI 24×7 <span className="clock">08:00 AM</span></div>
        <div className="tv-body">
          <Skyline smog={0.55} />
          <svg className="anchor" viewBox="0 0 120 140" aria-hidden>
            <rect x="10" y="100" width="100" height="40" rx="6" fill="#1b2a5c" />
            <rect x="38" y="58" width="44" height="50" rx="16" fill="#c2417a" />
            <circle cx="60" cy="40" r="20" fill="#c98b62" />
            <path d="M40 38 C40 14 80 14 80 38 L80 30 C74 18 46 18 40 30Z" fill="#2b2118" />
            <rect x="48" y="44" width="24" height="8" rx="4" fill="#ffffff" opacity="0.85" />
          </svg>
          <div className="lower-third">
            <span className="tag">BREAKING</span>
            <b>Delhi chokes: AQI {aqi} — “Severe Plus”</b>
          </div>
        </div>
        <div className="tv-ticker"><span>Flights diverted · Schools shut · Odd-even “under consideration” · Minister says air “mostly air” · Committee formed to study committee ·</span></div>
      </div>
      <ul className="news-points">
        {lines.map((l, i) => (
          <li key={l.text} style={{ animationDelay: `${0.4 + i * 0.35}s` }}><Icon name={l.icon} size={16} /> {l.text}</li>
        ))}
      </ul>
      <button className="btn primary big" onClick={onNext}>Meanwhile, at the Secretariat… <Icon name="arrow" /></button>
    </div>
  );
}

function SceneAppointment({ onNext }: { onNext: () => void }) {
  const speech = `Congratulations, Commissioner! Delhi has a small problem. Actually, quite a large one. The air is not particularly breathable. You are hereby appointed head of the Clean Air Mission. The election is in ${CAMPAIGN_WEEKS} weeks — so, no pressure. Actually, a lot of pressure.`;
  const tw = useTypewriter(speech);
  return (
    <div className="scene scene-office">
      <div className="office">
        <svg className="official" viewBox="0 0 220 240" aria-hidden>
          <rect x="0" y="180" width="220" height="60" rx="8" fill="#7a5134" />
          <rect x="18" y="168" width="60" height="16" rx="2" fill="#f3eee2" /><rect x="22" y="158" width="56" height="12" rx="2" fill="#e8dfcc" />
          <rect x="70" y="96" width="80" height="92" rx="28" fill="#f4f1e8" />
          <path d="M70 120 L110 150 L150 120 L150 188 L70 188Z" fill="#3b4a6b" />
          <circle cx="110" cy="70" r="34" fill="#b9805a" />
          <path d="M80 62 C82 38 138 38 140 62" fill="#e5e5e5" />
          <rect x="92" y="64" width="14" height="10" rx="5" fill="none" stroke="#222" strokeWidth="3" /><rect x="114" y="64" width="14" height="10" rx="5" fill="none" stroke="#222" strokeWidth="3" />
          <path d="M96 84 Q110 92 124 84" stroke="#3a2a20" strokeWidth="5" fill="none" strokeLinecap="round" />
          <rect x="112" y="196" width="100" height="22" rx="3" fill="#d4b483" /><text x="162" y="211" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#3a2a20">ADDL. CHIEF SECY.</text>
        </svg>
        <div className="speech" onClick={tw.finish}>
          <small>Shri R. K. Dhuanwala · Additional Chief Secretary</small>
          <p>{tw.shown}<span className="caret" /></p>
        </div>
      </div>
      <div className="letter">
        <small>Government of NCT of Delhi · Order No. 52/CAM/2026</small>
        <h3>Appointment Order</h3>
        <p>The undersigned is pleased to appoint <b>You</b> as Commissioner, Clean Air Mission, with immediate effect and limited budget.</p>
        <span className="stamp">Appointed</span>
      </div>
      <button className="btn primary big" onClick={() => (tw.done ? onNext() : tw.finish())}>{tw.done ? 'Read the briefing file' : 'Continue'} <Icon name="arrow" /></button>
    </div>
  );
}

function SceneBriefing({ onNext }: { onNext: () => void }) {
  const g = useGame.getState().game;
  const aqi = actualAqi(g);
  const st = areaStats(CITY);
  const em = emissions(g);
  const total = SOURCES.reduce((t, k) => t + em[k], 0);
  const top = [...SOURCES].sort((a, b) => em[b] - em[a]).slice(0, 4);
  return (
    <div className="scene scene-brief">
      <div className="file">
        <div className="file-tab">CONFIDENTIAL · MISSION FILE</div>
        <h2>The situation, Commissioner</h2>
        <div className="trio four">
          <div><small>Actual AQI</small><b style={{ color: aqiBand(aqi).color }}>{aqi}</b><em>{aqiBand(aqi).label}</em></div>
          <div><small>Public trust</small><b>{num(g.res.trust)}%</b></div>
          <div><small>Treasury</small><b>{inr(g.res.budget)}</b></div>
          <div><small>Population</small><b>{num(st.population / 100000, 1)} lakh</b><em>{num(st.jobs / 100000, 1)} lakh jobs</em></div>
        </div>
        <div className="brief-grid">
          <section>
            <h4>Where the smoke comes from</h4>
            {top.map((k) => (
              <div key={k} className="src-row">
                <span>{SOURCE_META[k].label}</span>
                <span className="src-bars"><i className="now" style={{ width: `${(em[k] / em[top[0]]) * 100}%`, background: SOURCE_META[k].color, height: '100%', top: 0 }} /></span>
                <em>{Math.round((em[k] / total) * 100)}%</em>
              </div>
            ))}
            <h4>What we already have</h4>
            <p className="infra">{CITY.metro.stations.length} metro stations · {CITY.busStops.length} bus stops · {st.counts.factory} factories · {st.counts.park} parks · 1 Commissioner (you)</p>
          </section>
          <section>
            <h4>Your mandate</h4>
            <ol className="mandate">
              <li><Icon name="wind" size={16} /> <span>Improve <b>actual</b> air quality</span></li>
              <li><Icon name="city" size={16} /> Develop the city</li>
              <li><Icon name="coins" size={16} /> Keep the economy healthy</li>
              <li><Icon name="users" size={16} /> Hold on to public trust</li>
              <li><Icon name="trophy" size={16} /> Win the election in week {CAMPAIGN_WEEKS}</li>
            </ol>
          </section>
        </div>
      </div>
      <button className="btn primary big" onClick={onNext}>Take charge <Icon name="arrow" /></button>
    </div>
  );
}

export function Intro() {
  const introDone = useGame((s) => s.game.introDone);
  const finish = useGame((s) => s.finishIntro);
  const [scene, setScene] = useState(0);
  if (introDone) return null;
  const done = () => {
    setScene(0);
    finish();
  };
  return (
    <div className="intro" role="dialog" aria-modal aria-label="Opening story">
      <div className="intro-dots">{[0, 1, 2].map((i) => <i key={i} className={i <= scene ? 'on' : ''} />)}</div>
      <button className="btn ghost skip" onClick={done}>Skip intro</button>
      <div className="intro-stage" key={scene}>
        {scene === 0 && <SceneNews onNext={() => setScene(1)} />}
        {scene === 1 && <SceneAppointment onNext={() => setScene(2)} />}
        {scene === 2 && <SceneBriefing onNext={done} />}
      </div>
    </div>
  );
}
