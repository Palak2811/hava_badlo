import { useState } from 'react';
import { EVENT_MAP } from '../../config/events';
import type { NewsKind } from '../../engine/types';
import { useGame } from '../../state/store';
import { Icon } from '../icons';

const KINDS: { k: NewsKind | 'all'; label: string }[] = [
  { k: 'all', label: 'All' },
  { k: 'breaking', label: 'Breaking' },
  { k: 'satire', label: 'Headlines' },
  { k: 'citizen', label: 'Citizens' },
  { k: 'gov', label: 'Government' },
  { k: 'alert', label: 'Alerts' },
  { k: 'investigation', label: 'Investigations' },
];

export default function NewsScreen() {
  const g = useGame((s) => s.game);
  const openEvent = useGame((s) => s.openEvent);
  const [filter, setFilter] = useState<NewsKind | 'all'>('all');
  const items = g.news.filter((n) => filter === 'all' || n.kind === filter || (filter === 'citizen' && n.kind === 'viral'));
  const lead = g.news.find((n) => n.kind === 'satire' || n.kind === 'breaking' || n.kind === 'investigation');

  return (
    <div className="screen">
      {g.events.length > 0 && (
        <section>
          <h4 className="label">Waiting for your decision</h4>
          <div className="pending">
            {g.events.map((e) => {
              const d = EVENT_MAP[e.defId];
              return (
                <button key={e.uid} className={`pending-item sev-${d.severity}`} onClick={() => openEvent(e.uid)}>
                  <span aria-hidden>{d.art}</span>
                  <span><b>{d.title}</b><small>{d.category}</small></span>
                  <Icon name="chevron" />
                </button>
              );
            })}
          </div>
        </section>
      )}

      {lead && (
        <article className="lead">
          <small>Delhi Daily · Day {lead.day}</small>
          <h2>{lead.headline}</h2>
          {lead.body && <p>{lead.body}</p>}
        </article>
      )}

      <div className="pills">
        {KINDS.map((x) => <button key={x.k} className={`pill ${filter === x.k ? 'on' : ''}`} onClick={() => setFilter(x.k)}>{x.label}</button>)}
      </div>

      <div className="feed">
        {items.length === 0 && <p className="empty">Nothing here yet. The press is waiting.</p>}
        {items.map((n) => (
          <article key={n.id} className={`story k-${n.kind}`}>
            <small>Day {n.day} · {KINDS.find((x) => x.k === n.kind)?.label ?? (n.kind === 'viral' ? 'Viral' : 'Update')}</small>
            <h4>{n.headline}</h4>
            {n.body && <p>{n.body}</p>}
          </article>
        ))}
      </div>

      {g.eventHistory.length > 0 && (
        <section>
          <h4 className="label">Your decisions</h4>
          <ul className="log">
            {g.eventHistory.slice(-8).reverse().map((h, i) => (
              <li key={i}><small>Day {h.day}</small> {EVENT_MAP[h.defId]?.title} — <i>{EVENT_MAP[h.defId]?.choices[h.choice]?.label}</i></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
