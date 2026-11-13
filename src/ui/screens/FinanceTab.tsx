import { BUILDINGS } from '../../config/balance';
import { allocation, recoveryOptions, revenueStreams } from '../../engine/economy';
import { rates } from '../../engine/core';
import { useGame } from '../../state/store';
import { Icon } from '../icons';
import { inr } from '../format';

export default function FinanceScreen() {
  const g = useGame((s) => s.game);
  const recover = useGame((s) => s.recover);
  const askConfirm = useGame((s) => s.askConfirm);
  const r = rates(g);
  const lines = revenueStreams(g);
  const facilityUpkeep = BUILDINGS.reduce((t, b) => t + (g.buildings[b.id] > 0 ? b.levels[g.buildings[b.id] - 1].maintenance : 0), 0) * r.a.maintenanceMult;
  const projectUpkeep = g.mapStats.upkeep;
  const debt = g.finance.loans.reduce((t, l) => t + l.perWeek, 0);
  const policyCost = g.policies.reduce((t, p) => t + (p.modifier.upkeepPerWeek ?? 0), 0);
  const options = recoveryOptions(g);
  const broke = g.res.budget < 5000 || r.net < 0;

  return (
    <div className="screen">
      <div className="finance-top">
        <div><small>Treasury</small><b className={g.res.budget < 0 ? 'neg' : ''}>{inr(g.res.budget)}</b></div>
        <div><small>Income / week</small><b className="pos">{inr(r.income)}</b></div>
        <div><small>Spending / week</small><b className="neg">{inr(r.maintenance)}</b></div>
        <div><small>Net / week</small><b className={r.net >= 0 ? 'pos' : 'neg'}>{inr(r.net)}</b></div>
      </div>

      <div className="finance-cols">
        <section>
          <h3 className="section-h">Revenue</h3>
          <ul className="ledger">
            <li><span>Central allocation<small>Scales with public trust</small></span><b>{inr(allocation(g))}</b></li>
            {lines.map((l) => <li key={l.id}><span>{l.label}{l.note && <small>{l.note}</small>}</span><b>{inr(l.amount)}</b></li>)}
            {g.finance.devFeesLastWeek > 0 && <li className="oneoff"><span>Development fees<small>Last week, one-off</small></span><b>{inr(g.finance.devFeesLastWeek)}</b></li>}
          </ul>
        </section>
        <section>
          <h3 className="section-h">Spending</h3>
          <ul className="ledger">
            <li><span>Department facilities<small>Upkeep of your 8 facilities</small></span><b>{inr(facilityUpkeep)}</b></li>
            {projectUpkeep > 0 && <li><span>City projects<small>Parks, schools, hospitals…</small></span><b>{inr(projectUpkeep)}</b></li>}
            {policyCost > 0 && <li><span>Policy subsidies</span><b>{inr(policyCost)}</b></li>}
            {debt > 0 && <li><span>Debt service<small>{g.finance.loans.length} loan(s)</small></span><b>{inr(debt)}</b></li>}
          </ul>
        </section>
      </div>

      <section>
        <h3 className="section-h">Raise money {broke && <span className="neg">The treasury needs attention</span>}</h3>
        <div className="recovery">
          {options.map((o) => (
            <div key={o.id} className={`rec ${o.available ? '' : 'off'}`}>
              <b>{o.name}</b>
              <small>{o.summary}</small>
              <button
                className="btn small"
                disabled={!o.available}
                title={o.available ? undefined : o.reason}
                onClick={() => askConfirm({ title: `${o.name}?`, body: o.summary, onYes: () => recover(o.id) })}
              >
                {o.available ? 'Use' : <><Icon name="lock" size={12} /> {o.reason}</>}
              </button>
            </div>
          ))}
        </div>
        <p className="hint">Approving development proposals also brings in fees — at a price.</p>
      </section>
    </div>
  );
}
