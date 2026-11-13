import { PROPOSAL_MAP } from '../../config/approvals';
import { TICKS_PER_WEEK } from '../../config/balance';
import { CITY } from '../../engine/map';
import { districtAt } from '../../engine/map';
import { useGame } from '../../state/store';
import { Icon } from '../icons';
import { num } from '../format';

const ROWS: { key: 'immediate' | 'recurring' | 'environment' | 'trust' | 'political' | 'delayed'; label: string }[] = [
  { key: 'immediate', label: 'Money now' },
  { key: 'recurring', label: 'Every week' },
  { key: 'environment', label: 'Environment' },
  { key: 'trust', label: 'Public trust' },
  { key: 'political', label: 'Politics' },
  { key: 'delayed', label: 'Later' },
];

export default function ApprovalsScreen() {
  const g = useGame((s) => s.game);
  const decide = useGame((s) => s.decide);
  const repeal = useGame((s) => s.repeal);
  const weeksLeft = (tick: number) => Math.max(0, Math.ceil(((tick - g.tick) / TICKS_PER_WEEK) * 10) / 10);

  return (
    <div className="screen">
      <div className="screen-intro">
        <p>Proposals land on your desk every few weeks. Some pay handsomely and pollute; some cost money and pay off later. Unanswered files lapse as rejections.</p>
      </div>

      <section>
        <h3 className="section-h">Pending approvals <span>{g.proposals.length} waiting</span></h3>
        {g.proposals.length === 0 && <p className="empty">The in-tray is empty. Enjoy it; it won’t last.</p>}
        <div className="proposals">
          {g.proposals.map((p) => {
            const t = PROPOSAL_MAP[p.templateId];
            const imp = t.impact(p.amount);
            const where = p.site ? districtAt(CITY, p.site.x, p.site.y)?.name : null;
            return (
              <article key={p.uid} className={`proposal cat-${t.category.toLowerCase()}`}>
                <header>
                  <span className="tag">{t.category}</span>
                  <span className="timer"><Icon name="clock" size={14} /> lapses in {weeksLeft(p.expires)} wk</span>
                </header>
                <h4>{t.title}{where ? <small> · {where}</small> : null}</h4>
                <p className="proposer"><b>{t.proposer}</b> {t.quote}</p>
                <dl className="impact-grid">
                  {ROWS.map((r) => (
                    <div key={r.key}>
                      <dt>{r.label}</dt>
                      <dd>{imp[r.key]}</dd>
                    </div>
                  ))}
                </dl>
                <p className="hint">If rejected: {t.rejectText}</p>
                <div className="row-btns">
                  <button className="btn ghost" onClick={() => decide(p.uid, false)}>Reject</button>
                  <button className="btn primary" onClick={() => decide(p.uid, true)}>Approve</button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="section-h">Active policies <span>{g.policies.length}</span></h3>
        {g.policies.length === 0 && <p className="empty">No standing policies yet.</p>}
        <ul className="policy-list">
          {g.policies.map((p) => (
            <li key={p.id}>
              <span>
                <b>{p.name}</b>
                <small>since week {Math.floor(p.since / TICKS_PER_WEEK) + 1}{p.until ? ` · ends in ${weeksLeft(p.until)} wk` : ' · standing'}</small>
              </span>
              {p.repealable && <button className="btn small" onClick={() => repeal(p.id)}>Repeal</button>}
            </li>
          ))}
        </ul>
      </section>

      {g.delayed.length > 0 && (
        <section>
          <h3 className="section-h">Coming up <span>delayed consequences</span></h3>
          <ul className="policy-list">
            {g.delayed.map((d, i) => (
              <li key={i}><span><b>{d.label}</b><small>in about {num(weeksLeft(d.at), 1)} weeks</small></span></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
