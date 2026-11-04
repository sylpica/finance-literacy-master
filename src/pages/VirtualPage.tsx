import { useMemo, useState } from 'react';
import { CASES } from '../content/cases';
import { LineChart, formatNum, formatPct, formatYen } from '../components/Chart';
import { NumField } from '../components/NumField';
import * as F from '../finance/core';
import { useApp } from '../state';

// 仮想投資（指示書 §8）: 判断演習（判断時点までの情報だけで根拠とリスクを評価）と、
// バックテスト（架空系列で戦略・費用・バイアスを体験。監査ラウンド2 P1-4 で追加）の2つのタブ。
export function VirtualPage({ go }: { go: (p: string) => void }) {
  const [tab, setTab] = useState<'case' | 'backtest'>('case');
  return (
    <main>
      <div className="page-head">
        <h2>仮想投資</h2>
        <div className="tabs" role="tablist" aria-label="仮想投資の種類">
          <button role="tab" aria-selected={tab === 'case'} className={tab === 'case' ? 'tab active' : 'tab'} onClick={() => setTab('case')}>判断演習</button>
          <button role="tab" aria-selected={tab === 'backtest'} className={tab === 'backtest' ? 'tab active' : 'tab'} onClick={() => setTab('backtest')}>バックテスト</button>
        </div>
      </div>
      {tab === 'case' ? <CaseDrill /> : <BacktestLab go={go} />}
    </main>
  );
}

function CaseDrill() {
  const [caseId, setCaseId] = useState(CASES[0]?.id ?? '');
  const [chosen, setChosen] = useState<Record<string, string[]>>({});
  const [revealed, setRevealed] = useState(false);
  const [saved, setSaved] = useState(false);
  const { addVirtual } = useApp();
  const cs = CASES.find(c => c.id === caseId) ?? CASES[0];
  const visibleSeries = useMemo(() => (cs ? cs.series.filter(p => p.date <= cs.decisionDate) : []), [cs]);
  if (!cs) return <p>ケースがありません。</p>;
  const allChosen = cs.criteria.every(c => (chosen[c.id]?.length ?? 0) > 0);
  const score = cs.criteria.reduce((sum, c) => {
    const sel = chosen[c.id] ?? [];
    const hits = sel.filter(id => c.goodIds.includes(id)).length;
    const bad = sel.filter(id => !c.goodIds.includes(id)).length;
    return sum + Math.max(0, hits - bad) / c.goodIds.length;
  }, 0) / cs.criteria.length;
  const toggle = (critId: string, optId: string) =>
    setChosen(prev => ({ ...prev, [critId]: prev[critId]?.includes(optId) ? prev[critId].filter(x => x !== optId) : [...(prev[critId] ?? []), optId] }));
  const finish = async () => { setRevealed(true); await addVirtual({ caseId: cs.id, chosen, score, doneAt: Date.now() }); setSaved(true); };
  return (
    <>
      <label className="sim-select">
        <select value={cs.id} onChange={e => { setCaseId(e.target.value); setChosen({}); setRevealed(false); setSaved(false); }} aria-label="ケースを選ぶ">
          {CASES.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </label>
      <div className="case-grid">
        <section className="case-brief">
          <p><strong>判断日 {cs.decisionDate}</strong>（{cs.kind === 'historical' ? '過去事例型' : '架空ケース'}。判断日より後の情報は確定後に表示）</p>
          <p>{cs.briefing}</p>
          <LineChart label={`${cs.seriesLabel}（判断日まで）`} xLabel="日付" points={visibleSeries.map(p => ({ x: p.date, y: p.value }))} height={170} />
        </section>
        <section className="case-criteria">
          {cs.criteria.map(c => (
            <fieldset key={c.id} className="criteria">
              <legend>{c.prompt}</legend>
              {c.options.map(o => (
                <label key={o.id} className="check-row">
                  <input type="checkbox" disabled={revealed} checked={(chosen[c.id] ?? []).includes(o.id)} onChange={() => toggle(c.id, o.id)} />
                  <span>{o.text}{revealed && <b className={c.goodIds.includes(o.id) ? 'result-ok' : 'warn-text'}>{c.goodIds.includes(o.id) ? '（妥当な根拠）' : '（要再考）'}</b>}</span>
                </label>
              ))}
              {revealed && <p className="meta">評価の考え方: {c.rationale}</p>}
            </fieldset>
          ))}
          {!revealed && <div className="quiz-actions"><button className="primary" disabled={!allChosen} onClick={() => void finish()}>判断を確定して振り返る</button></div>}
        </section>
      </div>
      {revealed && (
        <section className="panel">
          <p><strong>評価スコア {formatNum(score * 100)} / 100</strong>（価格の的中ではなく、根拠・リスク識別の質で評価）{saved && <span className="meta"> 学習記録に保存しました</span>}</p>
          <LineChart label={`${cs.seriesLabel}（全期間）`} xLabel="日付" points={cs.series.map(p => ({ x: p.date, y: p.value }))} color="#fbbf24" height={170} />
          <p>{cs.postNote}</p>
        </section>
      )}
      <p className="meta page-foot">現実の資金は使いません。将来の価格を当てる演習ではなく、判断時点の情報で根拠とリスクを評価する演習です。事後の値動きは採点に使いません。</p>
    </>
  );
}

const ASSETS = {
  stock: { label: '株価指数型（年率ボラ18%）', annualDrift: 0.06, annualVol: 0.18, jumpProb: 0, jumpSize: 0 },
  crypto: { label: '暗号資産型（年率ボラ70%・急変あり）', annualDrift: 0.1, annualVol: 0.7, jumpProb: 0.01, jumpSize: 0.15 },
} as const;

function BacktestLab({ go }: { go: (p: string) => void }) {
  const DEF = { asset: 'stock' as keyof typeof ASSETS, seed: 1, days: 1500, fee: 0.1, spread: 0.1, slip: 0.05, short: 20, long: 100, shock: false };
  const [v, setV] = useState(DEF);
  const r = useMemo(() => {
    const a = ASSETS[v.asset];
    const { prices, halted } = F.generatePriceSeries({ days: v.days, annualDrift: a.annualDrift, annualVol: a.annualVol, jumpProb: a.jumpProb, jumpSize: a.jumpSize, seed: v.seed, ...(v.shock ? { shockDay: Math.floor(v.days * 0.55), shockDrop: 0.35, haltDays: 3 } : {}) });
    const costs = { fee: v.fee / 100, spread: v.spread / 100, slippage: v.slip / 100 };
    const strategies = [
      { name: '買い持ち', run: F.runBacktest(prices, F.buyAndHold, costs, 1_000_000, halted) },
      { name: `SMAクロス(${v.short}/${v.long})`, run: F.runBacktest(prices, F.smaCross(v.short, Math.max(v.long, v.short + 1)), costs, 1_000_000, halted) },
      { name: '50%を月次リバランス', run: F.runBacktest(prices, F.periodicRebalance(0.5, 21), costs, 1_000_000, halted) },
    ].map(s => ({ ...s, perf: F.summarizeEquity(s.run.equity) }));
    const split = Math.floor(v.days * 0.6);
    const grid = F.smaGridSearch(prices, split, costs, [5, 10, 15, 20, 30, 40, 50], [50, 75, 100, 150, 200]);
    const surv = F.survivorshipDemo(40, { days: v.days, annualDrift: a.annualDrift, annualVol: Math.max(a.annualVol, 0.35) }, v.seed);
    return { prices, strategies, grid, split, surv };
  }, [v]);
  const step = Math.max(1, Math.floor(v.days / 120));
  const thin = <T,>(xs: T[]) => xs.filter((_, i) => i % step === 0 || i === xs.length - 1);
  return (
    <>
      <div className="sim-grid">
        <div className="sim-inputs">
          <label className="num-field"><span className="num-label">架空の資産</span>
            <select value={v.asset} onChange={e => setV({ ...v, asset: e.target.value as keyof typeof ASSETS })}>{Object.entries(ASSETS).map(([k, a]) => <option key={k} value={k}>{a.label}</option>)}</select></label>
          <NumField label="乱数シード" value={v.seed} set={x => setV({ ...v, seed: x })} min={1} max={9999} />
          <NumField label="期間" value={v.days} set={x => setV({ ...v, days: x })} min={300} max={5000} step={100} unit="営業日" />
          <NumField label="売買手数料" value={v.fee} set={x => setV({ ...v, fee: x })} min={0} max={1} step={0.05} unit="%" />
          <NumField label="スプレッド（往復）" value={v.spread} set={x => setV({ ...v, spread: x })} min={0} max={2} step={0.05} unit="%" />
          <NumField label="スリッページ" value={v.slip} set={x => setV({ ...v, slip: x })} min={0} max={1} step={0.05} unit="%" />
          <NumField label="SMA 短期" value={v.short} set={x => setV({ ...v, short: x })} min={2} max={100} unit="日" />
          <NumField label="SMA 長期" value={v.long} set={x => setV({ ...v, long: x })} min={3} max={300} unit="日" />
          <label className="check-row"><input type="checkbox" checked={v.shock} onChange={e => setV({ ...v, shock: e.target.checked })} /> 急落ショック（−35%、3日間の取引停止）を入れる</label>
          <button className="reset" onClick={() => setV(DEF)}>初期値に戻す</button>
        </div>
        <div className="sim-output">
          <div className="table-scroll"><table className="compact kpi-table">
            <thead><tr><th>戦略</th><th>最終資産</th><th>年率</th><th>最大DD</th><th>シャープ</th><th>売買</th><th>費用</th></tr></thead>
            <tbody>{r.strategies.map(s => <tr key={s.name}><th>{s.name}</th><td>{formatNum(s.run.equity.at(-1)! / 10000)}万円</td><td>{formatPct(s.perf.cagr)}</td><td>{formatPct(s.perf.maxDrawdown)}</td><td>{formatNum(s.perf.sharpe)}</td><td>{s.run.trades}回</td><td>{formatYen(s.run.totalCost)}</td></tr>)}</tbody>
          </table></div>
          <p className="sim-assume">初期資金100万円・架空のシード固定系列。判断は当日終値まで、約定は翌日終値（先読みなし）</p>
          <LineChart label="資産推移" xLabel="営業日" yLabel="円" series={r.strategies.map(s => ({ name: s.name, points: thin(s.run.equity.map((y, i) => ({ x: i, y }))) }))} />
          <section className="bias-box">
            <h3>過剰最適化（期間前半で{r.grid.trials.length}通りを総当たり）</h3>
            <p>前半の最良 SMA({r.grid.best.short}/{r.grid.best.long}) は前半 <b>{formatPct(r.grid.best.inSample)}</b> → 後半 <b>{formatPct(r.grid.best.outSample)}</b>。後半の買い持ちは {formatPct(r.grid.holdOut)}、全組合せの後半の中央値は {formatPct(r.grid.medianOut)}。</p>
            <h3>サバイバーシップ（架空{r.surv.n}銘柄の買い持ち）</h3>
            <p>上場廃止{r.surv.delisted}銘柄を除いた平均 <b>{formatPct(r.surv.meanSurvivors)}</b> ／ 廃止銘柄を含む全銘柄平均 <b>{formatPct(r.surv.meanAll)}</b></p>
          </section>
        </div>
      </div>
      <p className="sim-note">系列は幾何ブラウン運動（暗号資産型はジャンプ付き）で生成した架空データで、配当込み・分割調整済みの価格指数として扱い、為替・税・金利（現金の利息）は含みません。乱数の系列には予測可能な規則性がないため、前半で最良だった期間が後半でも優れる保証はありません。多数の組合せを試して最良だけを報告するとデータスヌーピングになります。上場廃止は開始時の30%未満への下落で判定し、残余価値0で精算する前提です。詳しくは<button className="linklike" onClick={() => go('lesson/J-04')}>J-04 バックテストの検証方法</button>を参照してください。</p>
    </>
  );
}
