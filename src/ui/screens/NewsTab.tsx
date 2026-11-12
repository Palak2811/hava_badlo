import { useState } from 'react';
import { EVENT_MAP } from '../../config/events';
import type { NewsKind } from '../../engine/types';
import { useGame } from '../../state/store';

const KIND_LABEL: Record<NewsKind, string> = {
  breaking: '🔴 Breaking',
  alert: '⚠️ Alert',
  gov: '🏛️ Govt',
  citizen: '🗣️ Citizens',
  viral: '📱 Viral',
  satire: '🎭 Satire',
  investigation: '🕵️ Investigation',
  achievement: '🏅 Achievement',
};

export default function NewsTab() {
  const g = useGame((s) => s.game);
  const openEvent = useGame((s) => s.openEvent);
  const [filter, setFilter] = useState<NewsKind | 'all'>('all');
  const items = g.news.filter((n) => filter === 'all' || n.kind === filter);
  const breaking = g.news.find((n) => n.kind === 'breaking' || n.kind === 'investigation');
  return (
    <div className="tab-page">
      <div className="ticker">
        <span className="ticker-tag">DELHI 24×7</span>
        <div className="ticker-track"><span>{g.news.slice(0, 6).map((n) => n.headline).join('   •   ')}</span></div>
      </div>
      <div className="news-layout">
        <div>
          {breaking && (
            <div className="breaking-card">
              <span className="kicker">{KIND_LABEL[breaking.kind]} · Day {breaking.day}</span>
              <h2>{breaking.headline}</h2>
              {breaking.body && <p>{breaking.body}</p>}
            </div>
          )}
          <div className="filters">
            {(['all', ...Object.keys(KIND_LABEL)] as (NewsKind | 'all')[]).map((k) => (
              <button key={k} className={`pill ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{k === 'all' ? 'All' : KIND_LABEL[k]}</button>
            ))}
          </div>
          <div className="feed">
            {items.length === 0 && <p className="empty">No stories in this category yet. The press is waiting.</p>}
            {items.map((n) => (
              <article key={n.id} className={`story kind-${n.kind}`}>
                <span className="kicker">{KIND_LABEL[n.kind]} · Day {n.day}</span>
                <h4>{n.headline}</h4>
                {n.body && <p>{n.body}</p>}
              </article>
            ))}
          </div>
        </div>
        <aside className="card">
          <h3>⚡ Pending Decisions</h3>
          {g.events.length === 0 && <p className="empty">No decisions pending.</p>}
          {g.events.map((e) => {
            const d = EVENT_MAP[e.defId];
            return (
              <button key={e.uid} className={`event-row sev-${d.severity}`} onClick={() => openEvent(e.uid)}>
                <span className="event-art">{d.art}</span>
                <span><b>{d.title}</b><small>{'🔥'.repeat(d.severity)} {d.category}</small></span>
                <span className="go">→</span>
              </button>
            );
          })}
          <h3 style={{ marginTop: 16 }}>📜 Decision Log</h3>
          <ul className="log">
            {g.eventHistory.slice(-8).reverse().map((h, i) => (
              <li key={i}><small>Day {h.day}</small> {EVENT_MAP[h.defId]?.title}: <i>{EVENT_MAP[h.defId]?.choices[h.choice]?.label}</i></li>
            ))}
            {g.eventHistory.length === 0 && <li className="empty">Nothing decided yet.</li>}
          </ul>
        </aside>
      </div>
    </div>
  );
}
