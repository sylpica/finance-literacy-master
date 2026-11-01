import { useMemo, useState } from 'react';
import * as F from '../finance/core';
import { LineChart, formatNum, formatPct, formatYen } from '../components/Chart';
import { NumField } from '../components/NumField';

function Note({ children }: { children: string }) { return <p className="sim-note">{children}</p>; }
function Reset({ onClick }: { onClick: () => void }) { return <button onClick={onClick}>初期値に戻す</button>; }

const SIMS = [
  { id: 'accum', cat: '資産形成', name: '一括・積立投資と複利（名目／実質）' },
  { id: 'nisa', cat: '資産形成', name: 'NISAと課税口座の比較（税・手数料の影響）' },
  { id: 'withdraw', cat: '資産形成', name: '取り崩しと資産枯渇（モンテカルロ）' },
  { id: 'multiples', cat: '株式・企業分析', name: 'PER・PBR・EV/EBITDA比較' },
  { id: 'dcf', cat: '株式・企業分析', name: 'DCFと割引率の感度分析' },
  { id: 'dilution', cat: '株式・企業分析', name: '増資・希薄化・株式分割' },
  { id: 'bond', cat: '市場・金融工学', name: '金利と債券価格・デュレーション' },
  { id: 'portfolio', cat: '市場・金融工学', name: '分散投資・相関・効率的フロンティア' },
  { id: 'risk', cat: '市場・金融工学', name: 'VaR・CVaR・ドローダウン（分布仮定つき）' },
  { id: 'option', cat: '市場・金融工学', name: 'オプション損益とブラック・ショールズ' },
  { id: 'leverage', cat: '市場・金融工学', name: 'レバレッジ清算価格と資金調達コスト' },
  { id: 'amm', cat: '暗号資産', name: 'AMMの価格形成・スリッページ・インパーマネントロス' },
  { id: 'lending', cat: '暗号資産', name: 'DeFiレンディングの担保率と清算' },
  { id: 'supply', cat: '暗号資産', name: '供給量・時価総額・FDV・アンロック希薄化' },
  { id: 'staking', cat: '暗号資産', name: 'ステーキング報酬とスラッシングリスク' },
] as const;
type SimId = (typeof SIMS)[number]['id'];

export function SimulatorsPage({ initial }: { initial?: string }) {
  const [sim, setSim] = useState<SimId>((SIMS.some(s => s.id === initial) ? initial : 'accum') as SimId);
  return (
    <main>
      <h2>金融シミュレーション</h2>
      <div className="sim-list" role="list">
        {SIMS.map(s => <button key={s.id} className={sim === s.id ? 'chip active' : 'chip'} onClick={() => setSim(s.id)}>{s.cat}: {s.name}</button>)}
      </div>
      <section className="sim-panel">
        {sim === 'accum' && <AccumSim />}
        {sim === 'nisa' && <NisaSim />}
        {sim === 'withdraw' && <WithdrawSim />}
        {sim === 'multiples' && <MultiplesSim />}
        {sim === 'dcf' && <DcfSim />}
        {sim === 'dilution' && <DilutionSim />}
        {sim === 'bond' && <BondSim />}
        {sim === 'portfolio' && <PortfolioSim />}
        {sim === 'risk' && <RiskSim />}
        {sim === 'option' && <OptionSim />}
        {sim === 'leverage' && <LeverageSim />}
        {sim === 'amm' && <AmmSim />}
        {sim === 'lending' && <LendingSim />}
        {sim === 'supply' && <SupplySim />}
        {sim === 'staking' && <StakingSim />}
      </section>
    </main>
  );
}

function AccumSim() {
  const DEF = { initial: 100, monthly: 3, ret: 5, years: 20, fee: 0.1, infl: 1 };
  const [v, setV] = useState(DEF);
  const series = useMemo(() => F.accumulationSeries({ initial: v.initial * 10000, monthly: v.monthly * 10000, annualReturn: v.ret / 100, years: v.years, annualFeeRate: v.fee / 100, inflation: v.infl / 100 }), [v]);
  const last = series[series.length - 1] as (typeof series)[number];
  return (<div><h3>一括・積立投資と複利</h3>
    <NumField label="初期投資" value={v.initial} set={x => setV({ ...v, initial: x })} min={0} max={1000} unit="万円" />
    <NumField label="毎月積立" value={v.monthly} set={x => setV({ ...v, monthly: x })} min={0} max={30} unit="万円" />
    <NumField label="年率リターン" value={v.ret} set={x => setV({ ...v, ret: x })} min={-5} max={15} step={0.5} unit="%" />
    <NumField label="期間" value={v.years} set={x => setV({ ...v, years: x })} min={1} max={50} unit="年" />
    <NumField label="年率手数料" value={v.fee} set={x => setV({ ...v, fee: x })} min={0} max={2} step={0.05} unit="%" />
    <NumField label="インフレ率" value={v.infl} set={x => setV({ ...v, infl: x })} min={0} max={5} step={0.5} unit="%" />
    <p>元本合計 {formatYen(last.contributed)} → 名目 {formatYen(last.nominal)} ／ 実質購買力 {formatYen(last.real)}</p>
    <LineChart label="名目資産残高の推移" points={series.map(p => ({ x: `${p.year}年`, y: p.nominal }))} />
    <Note>前提: リターンは毎年一定、手数料は年末残高から控除、税金は未考慮（NISA比較シミュレーション参照）。一定リターンは現実の変動を表しません。式: FV = PV(1+r)^n + PMT×((1+r)^n−1)/r の月次換算。</Note>
    <Reset onClick={() => setV(DEF)} /></div>);
}
function NisaSim() {
  const DEF = { monthly: 5, ret: 5, years: 20, fee: 0.1 };
  const [v, setV] = useState(DEF);
  const calc = useMemo(() => {
    const s = F.accumulationSeries({ initial: 0, monthly: v.monthly * 10000, annualReturn: v.ret / 100, years: v.years, annualFeeRate: v.fee / 100 });
    const last = s[s.length - 1] as (typeof s)[number];
    const gain = last.nominal - last.contributed;
    const taxable = F.afterTaxGain(last.contributed, gain, 0.20315);
    return { contributed: last.contributed, nisa: last.nominal, taxable, diff: last.nominal - taxable };
  }, [v]);
  return (<div><h3>NISAと課税口座の比較</h3>
    <NumField label="毎月積立" value={v.monthly} set={x => setV({ ...v, monthly: x })} min={0} max={30} unit="万円" />
    <NumField label="年率リターン" value={v.ret} set={x => setV({ ...v, ret: x })} min={-5} max={15} step={0.5} unit="%" />
    <NumField label="期間" value={v.years} set={x => setV({ ...v, years: x })} min={1} max={40} unit="年" />
    <NumField label="年率手数料" value={v.fee} set={x => setV({ ...v, fee: x })} min={0} max={2} step={0.05} unit="%" />
    <p>元本 {formatYen(calc.contributed)} ／ NISA（非課税） {formatYen(calc.nisa)} ／ 課税口座（売却時に利益へ20.315%） {formatYen(calc.taxable)} ／ 差 {formatYen(calc.diff)}</p>
    <Note>前提: 課税口座は最終売却時に利益全体へ20.315%を一括課税する単純化です。配当課税・損益通算・NISAの年間/生涯枠（360万円/年、1,800万円）の上限は未モデル化のため、枠を超える積立ではこの差は過大になります。制度数値は制度データ（M分野）で確認してください。</Note>
    <Reset onClick={() => setV(DEF)} /></div>);
}
function WithdrawSim() {
  const DEF = { initial: 3000, withdrawal: 120, years: 30, mu: 4, sigma: 12, trials: 1000, seed: 42 };
  const [v, setV] = useState(DEF);
  const res = useMemo(() => F.monteCarloWithdrawal({ initial: v.initial * 10000, annualWithdrawal: v.withdrawal * 10000, years: v.years, mu: v.mu / 100, sigma: v.sigma / 100, trials: v.trials, seed: v.seed }), [v]);
  return (<div><h3>取り崩しと資産枯渇（モンテカルロ）</h3>
    <NumField label="初期資産" value={v.initial} set={x => setV({ ...v, initial: x })} min={100} max={10000} step={100} unit="万円" />
    <NumField label="年間取崩額" value={v.withdrawal} set={x => setV({ ...v, withdrawal: x })} min={0} max={500} step={10} unit="万円" />
    <NumField label="取崩期間" value={v.years} set={x => setV({ ...v, years: x })} min={5} max={50} unit="年" />
    <NumField label="期待リターン" value={v.mu} set={x => setV({ ...v, mu: x })} min={-2} max={12} step={0.5} unit="%" />
    <NumField label="ボラティリティ" value={v.sigma} set={x => setV({ ...v, sigma: x })} min={0} max={30} step={1} unit="%" />
    <NumField label="試行回数" value={v.trials} set={x => setV({ ...v, trials: x })} min={100} max={5000} step={100} />
    <NumField label="乱数シード" value={v.seed} set={x => setV({ ...v, seed: x })} min={1} max={9999} />
    <p>枯渇確率 {formatPct(res.ruinProbability)} ／ 最終資産 中央値 {formatYen(res.p50)}（10%点 {formatYen(res.p10)}、90%点 {formatYen(res.p90)}）</p>
    <Note>仮定（重要）: 年次リターンは正規分布・各年独立・パラメータ一定です。現実のファットテール、ボラティリティの時間変化、リターンの順序以外の要因（税・手数料・インフレ）は未考慮です。同一シード・同一条件では同一結果が再現されます。</Note>
    <Reset onClick={() => setV(DEF)} /></div>);
}
function MultiplesSim() {
  const DEF = { price: 2000, eps: 100, bps: 1500, marketCap: 1000, debt: 200, cash: 100, ebitda: 150 };
  const [v, setV] = useState(DEF);
  const ev = F.enterpriseValue(v.marketCap, v.debt, v.cash);
  return (<div><h3>PER・PBR・EV/EBITDA</h3>
    <NumField label="株価" value={v.price} set={x => setV({ ...v, price: x })} min={10} max={20000} step={10} unit="円" />
    <NumField label="EPS" value={v.eps} set={x => setV({ ...v, eps: x })} min={-500} max={1000} step={5} unit="円" />
    <NumField label="BPS" value={v.bps} set={x => setV({ ...v, bps: x })} min={10} max={10000} step={10} unit="円" />
    <NumField label="時価総額" value={v.marketCap} set={x => setV({ ...v, marketCap: x })} min={10} max={10000} step={10} unit="億円" />
    <NumField label="有利子負債" value={v.debt} set={x => setV({ ...v, debt: x })} min={0} max={5000} step={10} unit="億円" />
    <NumField label="現金同等物" value={v.cash} set={x => setV({ ...v, cash: x })} min={0} max={5000} step={10} unit="億円" />
    <NumField label="EBITDA" value={v.ebitda} set={x => setV({ ...v, ebitda: x })} min={-100} max={1000} step={5} unit="億円" />
    <p>PER {v.eps !== 0 ? `${formatNum(F.per(v.price, v.eps))}倍` : '定義不可（EPS 0）'} ／ PBR {formatNum(F.pbr(v.price, v.bps))}倍 ／ EV {formatNum(ev)}億円 ／ EV/EBITDA {v.ebitda !== 0 ? `${formatNum(F.evEbitda(ev, v.ebitda))}倍` : '定義不可'}</p>
    <Note>マルチプルは業種・成長率・利益の質が異なる企業間では単純比較できません。EPSが負の場合、PERは「割安」を意味しません。</Note>
    <Reset onClick={() => setV(DEF)} /></div>);
}
function DcfSim() {
  const DEF = { fcf: 100, growth: 5, years: 5, wacc: 8, tg: 1 };
  const [v, setV] = useState(DEF);
  const { value, table } = useMemo(() => {
    const fcfs = Array.from({ length: v.years }, (_, i) => v.fcf * Math.pow(1 + v.growth / 100, i + 1));
    let val = NaN;
    try { val = F.dcfValue(fcfs, v.wacc / 100, v.tg / 100); } catch { /* WACC ≤ 永続成長率では定義できないため下で案内する */ }
    const tbl = [-1, 0, 1].map(dw => [-0.5, 0, 0.5].map(dg => {
      try { return F.dcfValue(fcfs, (v.wacc + dw) / 100, (v.tg + dg) / 100); } catch { return NaN; }
    }));
    return { value: val, table: tbl };
  }, [v]);
  return (<div><h3>DCFと感度分析</h3>
    <NumField label="初年度FCF" value={v.fcf} set={x => setV({ ...v, fcf: x })} min={1} max={1000} step={5} unit="億円" />
    <NumField label="FCF成長率" value={v.growth} set={x => setV({ ...v, growth: x })} min={-5} max={20} step={0.5} unit="%" />
    <NumField label="明示期間" value={v.years} set={x => setV({ ...v, years: x })} min={1} max={10} unit="年" />
    <NumField label="WACC" value={v.wacc} set={x => setV({ ...v, wacc: x })} min={3} max={15} step={0.5} unit="%" />
    <NumField label="永続成長率" value={v.tg} set={x => setV({ ...v, tg: x })} min={-2} max={4} step={0.5} unit="%" />
    {Number.isFinite(value)
      ? <p>企業価値（FCFF割引現在価値＋終価）: {formatNum(value)}億円</p>
      : <p className="error-text">計算できません: 終価を求めるには WACC が永続成長率より大きい必要があります（現在 WACC {v.wacc}% ／ 永続成長率 {v.tg}%）。</p>}
    <div className="table-scroll"><table><caption>感度分析（行: WACC変化、列: 永続成長率変化）</caption>
      <thead><tr><th></th><th>-0.5%</th><th>基準</th><th>+0.5%</th></tr></thead>
      <tbody>{table.map((row, i) => <tr key={i}><th>{['-1%', '基準', '+1%'][i]}</th>{row.map((c, j) => <td key={j}>{Number.isFinite(c) ? formatNum(c) : '計算不可'}</td>)}</tr>)}</tbody></table></div>
    <Note>終価はゴードン成長モデル TV = FCF(1+g)/(WACC−g)。WACC ≤ g では定義できません。DCFの結果は成長率と割引率の仮定に大きく依存します。</Note>
    <Reset onClick={() => setV(DEF)} /></div>);
}
function DilutionSim() {
  const DEF = { shares: 1000, newShares: 100, income: 50, split: 2 };
  const [v, setV] = useState(DEF);
  const before = F.dilutedEps(v.income * 1e8, v.shares * 1e4, 0);
  const after = F.dilutedEps(v.income * 1e8, v.shares * 1e4, v.newShares * 1e4);
  const sp = F.afterSplit(2000, v.shares * 1e4, v.split);
  return (<div><h3>増資・希薄化・株式分割</h3>
    <NumField label="発行済株式数" value={v.shares} set={x => setV({ ...v, shares: x })} min={100} max={10000} step={100} unit="万株" />
    <NumField label="新株発行数" value={v.newShares} set={x => setV({ ...v, newShares: x })} min={0} max={5000} step={10} unit="万株" />
    <NumField label="純利益" value={v.income} set={x => setV({ ...v, income: x })} min={1} max={500} step={5} unit="億円" />
    <NumField label="分割比率" value={v.split} set={x => setV({ ...v, split: x })} min={1} max={10} step={0.5} unit="倍" />
    <p>EPS: 増資前 {formatNum(before)}円 → 増資後 {formatNum(after)}円（希薄化 {formatPct(1 - after / before)}）</p>
    <p>株式分割（株価2,000円・{v.split}分割）: 株価 {formatNum(sp.price)}円、保有株数 {formatNum(sp.shares)}株。分割自体は経済価値を変えません。</p>
    <Note>希薄化計算は調達資金が生む利益貢献を含まない機械的効果です。増資の良否は資金使途のリターン（ROIC vs WACC）で判断します。</Note>
    <Reset onClick={() => setV(DEF)} /></div>);
}
function BondSim() {
  const DEF = { face: 100, coupon: 1, ytm: 2, years: 10 };
  const [v, setV] = useState(DEF);
  const price = F.bondPrice(v.face, v.coupon / 100, v.ytm / 100, v.years);
  const dur = F.macaulayDuration(v.face, v.coupon / 100, v.ytm / 100, v.years);
  const mod = F.modifiedDuration(v.face, v.coupon / 100, v.ytm / 100, v.years);
  const curve = useMemo(() => Array.from({ length: 21 }, (_, i) => ({ x: `利回り${(i * 0.5).toFixed(1)}%`, y: F.bondPrice(v.face, v.coupon / 100, (i * 0.5) / 100, v.years) })), [v]);
  return (<div><h3>金利と債券価格</h3>
    <NumField label="クーポン" value={v.coupon} set={x => setV({ ...v, coupon: x })} min={0} max={8} step={0.25} unit="%" />
    <NumField label="最終利回り" value={v.ytm} set={x => setV({ ...v, ytm: x })} min={0} max={10} step={0.25} unit="%" />
    <NumField label="残存期間" value={v.years} set={x => setV({ ...v, years: x })} min={1} max={30} unit="年" />
    <p>価格（額面100）: {formatNum(price)} ／ マコーレー・デュレーション {formatNum(dur)}年 ／ 修正デュレーション {formatNum(mod)}（利回り+1%で価格は約{formatPct(-mod * 0.01)}変化）</p>
    <LineChart label="利回りと債券価格の関係" points={curve} />
    <Note>年1回払い・額面100の固定利付債を前提とします。価格と利回りの関係は凸型（コンベクシティ）で、デュレーション近似は大きな金利変動では誤差が広がります。</Note>
    <Reset onClick={() => setV(DEF)} /></div>);
}
function PortfolioSim() {
  const DEF = { w: 60, r1: 6, r2: 2, s1: 18, s2: 5, rho: 0.2 };
  const [v, setV] = useState(DEF);
  const stats = useMemo(() => {
    const cov = [[(v.s1 / 100) ** 2, v.rho * (v.s1 / 100) * (v.s2 / 100)], [v.rho * (v.s1 / 100) * (v.s2 / 100), (v.s2 / 100) ** 2]];
    return F.portfolioStats([v.w / 100, 1 - v.w / 100], [v.r1 / 100, v.r2 / 100], cov);
  }, [v]);
  const frontier = useMemo(() => Array.from({ length: 11 }, (_, i) => {
    const w = i / 10; const cov = [[(v.s1 / 100) ** 2, v.rho * (v.s1 / 100) * (v.s2 / 100)], [v.rho * (v.s1 / 100) * (v.s2 / 100), (v.s2 / 100) ** 2]];
    const s = F.portfolioStats([w, 1 - w], [v.r1 / 100, v.r2 / 100], cov);
    return { x: `株式${Math.round(w * 100)}%`, y: s.volatility * 100 };
  }), [v]);
  return (<div><h3>分散投資と効率的フロンティア（2資産）</h3>
    <NumField label="資産1（株式）配分" value={v.w} set={x => setV({ ...v, w: x })} min={0} max={100} unit="%" />
    <NumField label="資産1 期待リターン" value={v.r1} set={x => setV({ ...v, r1: x })} min={-5} max={15} step={0.5} unit="%" />
    <NumField label="資産2（債券）期待リターン" value={v.r2} set={x => setV({ ...v, r2: x })} min={-2} max={8} step={0.5} unit="%" />
    <NumField label="資産1 ボラティリティ" value={v.s1} set={x => setV({ ...v, s1: x })} min={1} max={40} unit="%" />
    <NumField label="資産2 ボラティリティ" value={v.s2} set={x => setV({ ...v, s2: x })} min={1} max={20} unit="%" />
    <NumField label="相関係数" value={v.rho} set={x => setV({ ...v, rho: x })} min={-1} max={1} step={0.1} />
    <p>期待リターン {formatPct(stats.expected)} ／ ポートフォリオ・ボラティリティ {formatPct(stats.volatility)}</p>
    <LineChart label="配分ごとのボラティリティ" points={frontier} />
    <Note>平均分散モデルは期待リターン・分散・相関が既知で安定しているという仮定に依存します。相関は危機時に上昇しがちで、推定誤差が最適化結果を大きく左右します。</Note>
    <Reset onClick={() => setV(DEF)} /></div>);
}
function RiskSim() {
  const DEF = { mu: 0.03, sigma: 1.2, seed: 7 };
  const [v, setV] = useState(DEF);
  const { varRes, mdd, priceSeries } = useMemo(() => {
    const rng = F.mulberry32(v.seed);
    const rets: number[] = []; let price = 100; const series = [100];
    for (let i = 0; i < 250; i++) { const r = v.mu / 100 + (v.sigma / 100) * F.normalRandom(rng); rets.push(r); price *= 1 + r; series.push(price); }
    return { varRes: F.valueAtRisk(rets, 0.95), mdd: F.maxDrawdown(series), priceSeries: series };
  }, [v]);
  return (<div><h3>VaR・CVaR・最大ドローダウン</h3>
    <NumField label="日次平均リターン" value={v.mu} set={x => setV({ ...v, mu: x })} min={-0.5} max={0.5} step={0.01} unit="%" />
    <NumField label="日次ボラティリティ" value={v.sigma} set={x => setV({ ...v, sigma: x })} min={0.2} max={4} step={0.1} unit="%" />
    <NumField label="乱数シード" value={v.seed} set={x => setV({ ...v, seed: x })} min={1} max={9999} />
    <p>ヒストリカルVaR(95%, 1日): 損失 {formatPct(varRes.var)} 以内が95% ／ CVaR(95%): ワースト5%の平均損失 {formatPct(varRes.cvar)} ／ 期間最大ドローダウン {formatPct(mdd)}</p>
    <LineChart label="生成した価格系列" points={priceSeries.map((y, i) => ({ x: i, y }))} />
    <Note>価格系列は正規乱数で生成した教材用データです（実データではありません）。VaRは「超えた場合の損失の大きさ」を示さず、分布の仮定に依存します。</Note>
    <Reset onClick={() => setV(DEF)} /></div>);
}
function OptionSim() {
  const DEF = { spot: 3000, strike: 3000, vol: 25, days: 90, rate: 1 };
  const [v, setV] = useState(DEF);
  const bs = useMemo(() => F.blackScholes({ spot: v.spot, strike: v.strike, rate: v.rate / 100, vol: v.vol / 100, years: v.days / 365, type: 'call' }), [v]);
  const payoff = useMemo(() => Array.from({ length: 13 }, (_, i) => { const s = v.strike * (0.7 + i * 0.05); return { x: formatNum(s), y: F.optionPayoff('call', v.strike, bs.price, s, true) }; }), [v, bs.price]);
  return (<div><h3>オプション（コール買い）</h3>
    <NumField label="原資産価格" value={v.spot} set={x => setV({ ...v, spot: x })} min={500} max={10000} step={50} unit="円" />
    <NumField label="権利行使価格" value={v.strike} set={x => setV({ ...v, strike: x })} min={500} max={10000} step={50} unit="円" />
    <NumField label="ボラティリティ" value={v.vol} set={x => setV({ ...v, vol: x })} min={5} max={80} unit="%" />
    <NumField label="満期まで" value={v.days} set={x => setV({ ...v, days: x })} min={7} max={365} step={7} unit="日" />
    <p>理論価格 {formatNum(bs.price)}円（内在価値 {formatNum(bs.intrinsic)}円＋時間価値 {formatNum(bs.timeValue)}円）／ デルタ {formatNum(bs.delta)} ／ ガンマ {formatNum(bs.gamma)}</p>
    <LineChart label="満期時の損益" points={payoff} color="#fbbf24" />
    <Note>ブラック・ショールズは「ボラティリティ一定・価格が対数正規分布・連続取引可能」等の前提に依存します。現実のボラティリティ・スマイルや流動性は反映されません。</Note>
    <Reset onClick={() => setV(DEF)} /></div>);
}
function LeverageSim() {
  const DEF = { entry: 100000, lev: 5, mmr: 0.5, funding: 0.01, periods: 30, notional: 500000 };
  const [v, setV] = useState(DEF);
  let liq = NaN; try { liq = F.liquidationPriceLong(v.entry, v.lev, v.mmr / 100); } catch { /* 範囲外 */ }
  return (<div><h3>レバレッジ清算価格（ロング）</h3>
    <NumField label="参入価格" value={v.entry} set={x => setV({ ...v, entry: x })} min={1000} max={1000000} step={1000} unit="円" />
    <NumField label="レバレッジ" value={v.lev} set={x => setV({ ...v, lev: x })} min={1} max={25} unit="倍" />
    <NumField label="維持証拠金率" value={v.mmr} set={x => setV({ ...v, mmr: x })} min={0} max={5} step={0.25} unit="%" />
    <NumField label="想定元本" value={v.notional} set={x => setV({ ...v, notional: x })} min={10000} max={5000000} step={10000} unit="円" />
    <NumField label="資金調達率（1期間）" value={v.funding} set={x => setV({ ...v, funding: x })} min={-0.1} max={0.3} step={0.01} unit="%" />
    <NumField label="保有期間数" value={v.periods} set={x => setV({ ...v, periods: x })} min={1} max={90} />
    <p>簡易清算価格: {Number.isFinite(liq) ? `${formatNum(liq)}円（参入から ${formatPct(liq / v.entry - 1)}）` : '計算範囲外です'} ／ 資金調達コスト累計 {formatYen(F.fundingCost(v.notional, v.funding / 100, v.periods))}</p>
    <Note>清算価格は維持証拠金率を用いた教材用の近似式であり、取引所ごとの証拠金階層・マーク価格方式とは異なります。実際の清算条件は利用する取引所の仕様で確認してください。</Note>
    <Reset onClick={() => setV(DEF)} /></div>);
}
function AmmSim() {
  const DEF = { rin: 100, rout: 100, ain: 10, ratio: 2 };
  const [v, setV] = useState(DEF);
  const swap = F.ammSwap(v.rin, v.rout, v.ain, 0.003);
  const il = F.impermanentLoss(v.ratio);
  return (<div><h3>AMM（定数積 x*y=k、手数料0.3%）</h3>
    <NumField label="プール準備量（入力側）" value={v.rin} set={x => setV({ ...v, rin: x })} min={10} max={10000} step={10} />
    <NumField label="プール準備量（出力側）" value={v.rout} set={x => setV({ ...v, rout: x })} min={10} max={10000} step={10} />
    <NumField label="投入量" value={v.ain} set={x => setV({ ...v, ain: x })} min={0.1} max={1000} step={0.5} />
    <NumField label="価格変動倍率（IL計算）" value={v.ratio} set={x => setV({ ...v, ratio: x })} min={0.25} max={5} step={0.25} unit="倍" />
    <p>受取量 {formatNum(swap.amountOut)} ／ 価格インパクト {formatPct(swap.priceImpact)} ／ 取引後プール価格 {formatNum(swap.newPrice)}</p>
    <p>インパーマネントロス（価格が{v.ratio}倍に変動時）: {formatPct(il)}（HODL比、手数料収入を除く）</p>
    <Note>定数積型AMMの教材モデルです。集中流動性型（Uniswap v3等）では価格形成が異なります。</Note>
    <Reset onClick={() => setV(DEF)} /></div>);
}
function LendingSim() {
  const DEF = { collateral: 100, threshold: 80, borrow: 50, drop: 30 };
  const [v, setV] = useState(DEF);
  const hf = F.healthFactor(v.collateral * 10000, v.threshold / 100, v.borrow * 10000);
  const hfAfter = F.healthFactor(v.collateral * 10000 * (1 - v.drop / 100), v.threshold / 100, v.borrow * 10000);
  return (<div><h3>DeFiレンディングの担保と清算</h3>
    <NumField label="担保価値" value={v.collateral} set={x => setV({ ...v, collateral: x })} min={1} max={1000} unit="万円" />
    <NumField label="清算閾値" value={v.threshold} set={x => setV({ ...v, threshold: x })} min={50} max={95} unit="%" />
    <NumField label="借入価値" value={v.borrow} set={x => setV({ ...v, borrow: x })} min={1} max={1000} unit="万円" />
    <NumField label="担保価格の下落" value={v.drop} set={x => setV({ ...v, drop: x })} min={0} max={80} unit="%" />
    <p>ヘルスファクター: 現在 {formatNum(hf)} → 担保が{formatNum(v.drop)}%下落すると {formatNum(hfAfter)}（1未満で清算対象）</p>
    <Note>HF = 担保価値×清算閾値÷借入価値。プロトコルごとに清算ボーナス・オラクル方式が異なり、急落時にはオラクル遅延や流動性枯渇で想定外の損失が生じます。</Note>
    <Reset onClick={() => setV(DEF)} /></div>);
}
function SupplySim() {
  const DEF = { price: 15000000, circ: 1900, max: 2100, unlock: 100 };
  const [v, setV] = useState(DEF);
  const mc = F.marketCap(v.price, v.circ * 10000);
  const fdvV = F.fdv(v.price, v.max * 10000);
  const dilution = v.unlock / (v.circ + v.unlock);
  return (<div><h3>供給量・時価総額・FDV</h3>
    <NumField label="価格" value={v.price} set={x => setV({ ...v, price: x })} min={100} max={50000000} step={100000} unit="円" />
    <NumField label="流通供給量" value={v.circ} set={x => setV({ ...v, circ: x })} min={1} max={100000} step={10} unit="万単位" />
    <NumField label="最大供給量" value={v.max} set={x => setV({ ...v, max: x })} min={1} max={200000} step={10} unit="万単位" />
    <NumField label="今後のアンロック量" value={v.unlock} set={x => setV({ ...v, unlock: x })} min={0} max={10000} step={10} unit="万単位" />
    <p>時価総額 {formatNum(mc / 1e12)}兆円 ／ FDV {formatNum(fdvV / 1e12)}兆円 ／ 未流通比率 {formatPct(1 - v.circ / v.max)} ／ アンロック後の既存保有者の持分希薄化 {formatPct(dilution)}</p>
    {v.circ > v.max && <p className="error-text">流通供給量が最大供給量を超えています。入力値を確認してください（未流通比率が負になっています）。</p>}
    <Note>FDVは現在価格が全量流通後も維持されるという仮定の指標であり、将来価格の予測ではありません。アンロックが直ちに売却されるとも限りません。</Note>
    <Reset onClick={() => setV(DEF)} /></div>);
}
function StakingSim() {
  const DEF = { apr: 4, slashP: 1, slashF: 5 };
  const [v, setV] = useState(DEF);
  const eff = F.stakingEffectiveAnnual(v.apr / 100, 365, v.slashP / 100, v.slashF / 100);
  const gross = F.stakingEffectiveAnnual(v.apr / 100, 365, 0, 0);
  return (<div><h3>ステーキングの実効利回り</h3>
    <NumField label="名目APR" value={v.apr} set={x => setV({ ...v, apr: x })} min={0} max={30} step={0.5} unit="%" />
    <NumField label="年間のスラッシング発生確率（仮定）" value={v.slashP} set={x => setV({ ...v, slashP: x })} min={0} max={20} step={0.5} unit="%" />
    <NumField label="発生時の元本毀損率" value={v.slashF} set={x => setV({ ...v, slashF: x })} min={0} max={50} step={1} unit="%" />
    <p>日次複利の実効年間利回り {formatPct(gross)} ／ スラッシング期待損失を線形控除した近似 {formatPct(eff)}</p>
    <Note>スラッシング確率・毀損率は利用者が置く仮定であり、プロトコルが公表する確定値ではありません。価格変動リスク、ロック期間、アンステーク待ち時間の機会損失は含みません。</Note>
    <Reset onClick={() => setV(DEF)} /></div>);
}
