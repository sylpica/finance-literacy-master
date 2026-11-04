import { useMemo, useState, type ReactNode } from 'react';
import * as F from '../finance/core';
import { CALC_RULES } from '../content/regulations';
import { LineChart, formatNum, formatPct, formatSig, formatYen } from '../components/Chart';
import { NumField } from '../components/NumField';

// シミュレーター共通レイアウト（監査ラウンド2 P2-2）:
// 広い画面は「左: 入力／右: 主要結果・グラフ（追従表示）」の2カラム、狭い画面は主要結果を入力の上に固定表示する。
// 結果の理解に不可欠な前提は結果の直下に1行で示し、モデルの限界の詳しい説明はパネル下部に置く。
type Kpi = [label: string, value: string, tone?: 'good' | 'bad' | 'warn'];
function Sim({ inputs, kpis, alert, chart, extra, assume, note, onReset }: {
  inputs: ReactNode; kpis: Kpi[]; alert?: ReactNode; chart?: ReactNode; extra?: ReactNode; assume?: string; note: string; onReset: () => void;
}) {
  return (
    <>
      <div className="sim-grid">
        <div className="sim-inputs">
          {inputs}
          <button className="reset" onClick={onReset}>初期値に戻す</button>
        </div>
        <div className="sim-output">
          <dl className="kpis" aria-live="polite">
            {kpis.map(([k, v, tone]) => <div key={k} className={tone ? `kpi ${tone}` : 'kpi'}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
          <div className="sim-detail">
            {alert}
            {assume && <p className="sim-assume">{assume}</p>}
            {chart}
            {extra}
          </div>
        </div>
      </div>
      <p className="sim-note">{note}</p>
    </>
  );
}

const SIMS = [
  { id: 'accum', cat: '資産形成', name: '一括・積立投資と複利（名目／実質）' },
  { id: 'nisa', cat: '資産形成', name: 'NISAと課税口座の比較' },
  { id: 'withdraw', cat: '資産形成', name: '取り崩しと資産枯渇（モンテカルロ）' },
  { id: 'multiples', cat: '株式・企業分析', name: 'PER・PBR・EV/EBITDA' },
  { id: 'dcf', cat: '株式・企業分析', name: 'DCFと割引率の感度分析' },
  { id: 'dilution', cat: '株式・企業分析', name: '増資・希薄化・株式分割' },
  { id: 'bond', cat: '市場・金融工学', name: '金利と債券価格・デュレーション' },
  { id: 'portfolio', cat: '市場・金融工学', name: '2資産の分散投資と効率的フロンティア' },
  { id: 'risk', cat: '市場・金融工学', name: 'VaR・CVaR・最大ドローダウン' },
  { id: 'option', cat: '市場・金融工学', name: 'オプション損益とブラック・ショールズ' },
  { id: 'leverage', cat: '市場・金融工学', name: 'レバレッジ清算価格と資金調達コスト' },
  { id: 'amm', cat: '暗号資産', name: 'AMMの価格インパクトとインパーマネントロス' },
  { id: 'lending', cat: '暗号資産', name: 'DeFiレンディングの担保率と清算' },
  { id: 'supply', cat: '暗号資産', name: '供給量・時価総額・FDV・アンロック' },
  { id: 'staking', cat: '暗号資産', name: 'ステーキング報酬とスラッシング' },
] as const;
type SimId = (typeof SIMS)[number]['id'];
export const SIM_IDS: readonly string[] = SIMS.map(s => s.id);
const CATS = [...new Set(SIMS.map(s => s.cat))];

export function SimulatorsPage({ initial, go }: { initial?: string; go: (p: string) => void }) {
  const sim = (SIMS.some(s => s.id === initial) ? initial : 'accum') as SimId;
  return (
    <main className="sim-page">
      <div className="sim-head">
        <h2 className="visually-hidden">金融シミュレーション</h2>
        <label className="sim-select">
          <span className="visually-hidden">シミュレーターを選ぶ</span>
          <select value={sim} onChange={e => go(`sim/${e.target.value}`)} aria-label="シミュレーターを選ぶ">
            {CATS.map(c => <optgroup key={c} label={c}>{SIMS.filter(s => s.cat === c).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>)}
          </select>
        </label>
      </div>
      <section className="sim-panel" aria-label={SIMS.find(s => s.id === sim)?.name}>
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

const man = (v: number) => `${formatNum(v / 10000)}万円`;

function AccumSim() {
  const DEF = { initial: 100, monthly: 3, ret: 5, years: 20, fee: 0.1, infl: 1 };
  const [v, setV] = useState(DEF);
  const series = useMemo(() => F.accumulationSeries({ initial: v.initial * 10000, monthly: v.monthly * 10000, annualReturn: v.ret / 100, years: v.years, annualFeeRate: v.fee / 100, inflation: v.infl / 100 }), [v]);
  const last = series[series.length - 1] as (typeof series)[number];
  return <Sim onReset={() => setV(DEF)}
    inputs={<>
      <NumField label="初期投資" value={v.initial} set={x => setV({ ...v, initial: x })} min={0} max={1000} unit="万円" />
      <NumField label="毎月積立" value={v.monthly} set={x => setV({ ...v, monthly: x })} min={0} max={30} step={0.5} unit="万円" />
      <NumField label="年率リターン" value={v.ret} set={x => setV({ ...v, ret: x })} min={-5} max={15} step={0.5} unit="%" />
      <NumField label="期間" value={v.years} set={x => setV({ ...v, years: x })} min={1} max={50} unit="年" />
      <NumField label="年率手数料" value={v.fee} set={x => setV({ ...v, fee: x })} min={0} max={2} step={0.05} unit="%" />
      <NumField label="インフレ率" value={v.infl} set={x => setV({ ...v, infl: x })} min={0} max={5} step={0.5} unit="%" />
    </>}
    kpis={[['元本合計', man(last.contributed)], ['名目資産', man(last.nominal)], ['実質購買力', man(last.real)], ['名目の増加', man(last.nominal - last.contributed)]]}
    assume="リターン毎年一定・手数料は年末残高から控除・税金は含まない"
    chart={<LineChart label="資産残高の推移" xLabel="経過年" yLabel="円" series={[
      { name: '名目', points: series.map(p => ({ x: p.year, y: p.nominal })) },
      { name: '実質（インフレ調整）', points: series.map(p => ({ x: p.year, y: p.real })) },
      { name: '元本', points: series.map(p => ({ x: p.year, y: p.contributed })) },
    ]} />}
    note="月次換算の複利で、FV = PV(1+r)^n + 積立の年金終価 を毎月積み上げています。一定リターンは現実の変動や順序リスクを表しません。税の影響は「NISAと課税口座の比較」で確認できます。" />;
}

function NisaSim() {
  const DEF = { monthly: 5, ret: 5, years: 20, fee: 0.1 };
  const [v, setV] = useState(DEF);
  const r = useMemo(() => F.nisaComparison({ monthly: v.monthly * 10000, annualReturn: v.ret / 100, years: v.years, annualFeeRate: v.fee / 100, taxRate: CALC_RULES.listedStockTaxRate, annualCap: CALC_RULES.nisa.annualTotal, lifetimeCap: CALC_RULES.nisa.lifetime }), [v]);
  const over = r.overflowContrib > 0;
  return <Sim onReset={() => setV(DEF)}
    inputs={<>
      <NumField label="毎月積立" value={v.monthly} set={x => setV({ ...v, monthly: x })} min={0} max={50} step={0.5} unit="万円" />
      <NumField label="年率リターン" value={v.ret} set={x => setV({ ...v, ret: x })} min={-5} max={15} step={0.5} unit="%" />
      <NumField label="期間" value={v.years} set={x => setV({ ...v, years: x })} min={1} max={40} unit="年" />
      <NumField label="年率手数料" value={v.fee} set={x => setV({ ...v, fee: x })} min={0} max={2} step={0.05} unit="%" />
    </>}
    kpis={[['元本', man(r.contributed)], ['NISA利用（枠超過分は課税）', man(r.withNisa), 'good'], ['課税口座のみ', man(r.taxableOnly)], ['差', man(r.diff)]]}
    alert={over ? <p className="warn-text" role="status">NISAの枠（年{man(CALC_RULES.nisa.annualTotal)}・生涯{man(CALC_RULES.nisa.lifetime)}）を超える{man(r.overflowContrib)}は課税口座で運用した計算です。</p> : undefined}
    assume={`課税口座は最終売却時に利益へ${(CALC_RULES.listedStockTaxRate * 100).toFixed(3)}%を一括課税する単純化`}
    note="NISAの年間枠は、つみたて投資枠と成長投資枠を併用して合計枠まで使える前提です（つみたて投資枠だけなら年120万円）。配当課税・損益通算・売却による枠の再利用は扱いません。制度数値は「制度情報」の制度データと同じ値を使っています。" />;
}

function WithdrawSim() {
  const DEF = { initial: 3000, withdrawal: 120, years: 30, mu: 4, sigma: 12, trials: 1000, seed: 42 };
  const [v, setV] = useState(DEF);
  const res = useMemo(() => F.monteCarloWithdrawal({ initial: v.initial * 10000, annualWithdrawal: v.withdrawal * 10000, years: v.years, mu: v.mu / 100, sigma: v.sigma / 100, trials: v.trials, seed: v.seed }), [v]);
  return <Sim onReset={() => setV(DEF)}
    inputs={<>
      <NumField label="初期資産" value={v.initial} set={x => setV({ ...v, initial: x })} min={100} max={10000} step={100} unit="万円" />
      <NumField label="年間取崩額" value={v.withdrawal} set={x => setV({ ...v, withdrawal: x })} min={0} max={500} step={10} unit="万円" />
      <NumField label="取崩期間" value={v.years} set={x => setV({ ...v, years: x })} min={5} max={50} unit="年" />
      <NumField label="期待リターン" value={v.mu} set={x => setV({ ...v, mu: x })} min={-2} max={12} step={0.5} unit="%" />
      <NumField label="ボラティリティ" value={v.sigma} set={x => setV({ ...v, sigma: x })} min={0} max={30} step={1} unit="%" />
      <NumField label="試行回数" value={v.trials} set={x => setV({ ...v, trials: x })} min={100} max={5000} step={100} unit="回" />
      <NumField label="乱数シード" value={v.seed} set={x => setV({ ...v, seed: x })} min={1} max={9999} />
    </>}
    kpis={[['枯渇確率', formatPct(res.ruinProbability), res.ruinProbability > 0.1 ? 'bad' : undefined], ['最終資産 中央値', man(res.p50)], ['10%点', man(res.p10)], ['90%点', man(res.p90)]]}
    assume="年次リターンは正規分布・各年独立。各年の運用後（年末）に取り崩す"
    note="現実のファットテール、ボラティリティの時間変化、税・手数料・インフレは考慮していません。同一シード・同一条件では同じ結果が再現されます。取崩しを年初に行う前提では、枯渇確率はこの表示より高くなります。" />;
}

function MultiplesSim() {
  const DEF = { price: 2000, eps: 100, bps: 1500, marketCap: 1000, debt: 200, cash: 100, ebitda: 150 };
  const [v, setV] = useState(DEF);
  const ev = F.enterpriseValue(v.marketCap, v.debt, v.cash);
  return <Sim onReset={() => setV(DEF)}
    inputs={<>
      <NumField label="株価" value={v.price} set={x => setV({ ...v, price: x })} min={10} max={20000} step={10} unit="円" />
      <NumField label="EPS（1株利益）" value={v.eps} set={x => setV({ ...v, eps: x })} min={-500} max={1000} step={5} unit="円" />
      <NumField label="BPS（1株純資産）" value={v.bps} set={x => setV({ ...v, bps: x })} min={10} max={10000} step={10} unit="円" />
      <NumField label="時価総額" value={v.marketCap} set={x => setV({ ...v, marketCap: x })} min={10} max={10000} step={10} unit="億円" />
      <NumField label="有利子負債" value={v.debt} set={x => setV({ ...v, debt: x })} min={0} max={5000} step={10} unit="億円" />
      <NumField label="現金同等物" value={v.cash} set={x => setV({ ...v, cash: x })} min={0} max={5000} step={10} unit="億円" />
      <NumField label="EBITDA" value={v.ebitda} set={x => setV({ ...v, ebitda: x })} min={-100} max={1000} step={5} unit="億円" />
    </>}
    kpis={[['PER', v.eps !== 0 ? `${formatNum(F.per(v.price, v.eps))}倍` : '定義不可（EPS 0）', v.eps < 0 ? 'warn' : undefined], ['PBR', `${formatNum(F.pbr(v.price, v.bps))}倍`], ['EV', `${formatNum(ev)}億円`], ['EV/EBITDA', v.ebitda !== 0 ? `${formatNum(F.evEbitda(ev, v.ebitda))}倍` : '定義不可']]}
    alert={v.eps < 0 ? <p className="warn-text">EPSが負のためPERは負になり、「割安」を意味しません。</p> : undefined}
    assume="EV = 時価総額 + 有利子負債 − 現金同等物"
    note="マルチプルは業種・成長率・利益の質・会計基準が異なる企業間では単純比較できません。比較は同業・同じ会計期間でそろえ、一時的な損益を除いた値で行います。" />;
}

function DcfSim() {
  const DEF = { fcf: 100, growth: 5, years: 5, wacc: 8, tg: 1 };
  const [v, setV] = useState(DEF);
  const { value, tvShare, table } = useMemo(() => {
    // 1年目のFCF = 基準年FCF × (1+g)。ラベルを「基準年（直近）FCF」とする（監査ラウンド2 P2-6）
    const fcfs = Array.from({ length: v.years }, (_, i) => v.fcf * Math.pow(1 + v.growth / 100, i + 1));
    let val = NaN, share = NaN;
    try {
      val = F.dcfValue(fcfs, v.wacc / 100, v.tg / 100);
      const last = fcfs[fcfs.length - 1] as number;
      share = (last * (1 + v.tg / 100)) / (v.wacc / 100 - v.tg / 100) / Math.pow(1 + v.wacc / 100, v.years) / val;
    } catch { /* WACC ≤ 永続成長率では定義できないため下で案内する */ }
    const tbl = [-1, 0, 1].map(dw => [-0.5, 0, 0.5].map(dg => {
      try { return F.dcfValue(fcfs, (v.wacc + dw) / 100, (v.tg + dg) / 100); } catch { return NaN; }
    }));
    return { value: val, tvShare: share, table: tbl };
  }, [v]);
  return <Sim onReset={() => setV(DEF)}
    inputs={<>
      <NumField label="基準年（直近）FCF" value={v.fcf} set={x => setV({ ...v, fcf: x })} min={1} max={1000} step={5} unit="億円" />
      <NumField label="FCF成長率" value={v.growth} set={x => setV({ ...v, growth: x })} min={-5} max={20} step={0.5} unit="%" />
      <NumField label="明示期間" value={v.years} set={x => setV({ ...v, years: x })} min={1} max={10} unit="年" />
      <NumField label="WACC" value={v.wacc} set={x => setV({ ...v, wacc: x })} min={3} max={15} step={0.5} unit="%" />
      <NumField label="永続成長率" value={v.tg} set={x => setV({ ...v, tg: x })} min={-2} max={4} step={0.5} unit="%" />
    </>}
    kpis={Number.isFinite(value)
      ? [['企業価値（FCFF現在価値＋終価）', `${formatNum(value)}億円`], ['うち終価の割合', formatPct(tvShare), tvShare > 0.75 ? 'warn' : undefined], ['1年目FCF', `${formatNum(v.fcf * (1 + v.growth / 100))}億円`]]
      : [['企業価値', '計算不可', 'bad']]}
    alert={!Number.isFinite(value) ? <p className="error-text" role="status">終価を求めるには WACC が永続成長率より大きい必要があります（WACC {v.wacc}% ／ 永続成長率 {v.tg}%）。</p> : undefined}
    assume="終価はゴードン成長モデル TV = FCF(1+g)/(WACC−g)、期末に割引"
    extra={<div className="table-scroll"><table className="compact"><caption>感度分析（億円）行: WACC、列: 永続成長率</caption>
      <thead><tr><th></th><th>{formatNum(v.tg - 0.5)}%</th><th>{formatNum(v.tg)}%</th><th>{formatNum(v.tg + 0.5)}%</th></tr></thead>
      <tbody>{table.map((row, i) => <tr key={i}><th>{formatNum(v.wacc - 1 + i)}%</th>{row.map((c, j) => <td key={j}>{Number.isFinite(c) ? formatNum(c) : '計算不可'}</td>)}</tr>)}</tbody></table></div>}
    note="DCFの結果は成長率と割引率の仮定に強く依存し、終価の割合が大きいほど遠い将来の仮定の影響が大きくなります。株主価値は企業価値から純有利子負債等を差し引いて求めます。" />;
}

function DilutionSim() {
  const DEF = { shares: 1000, newShares: 100, income: 50, price: 2000, split: 2 };
  const [v, setV] = useState(DEF);
  const before = F.dilutedEps(v.income * 1e8, v.shares * 1e4, 0);
  const after = F.dilutedEps(v.income * 1e8, v.shares * 1e4, v.newShares * 1e4);
  const sp = F.afterSplit(v.price, (v.shares + v.newShares) * 1e4, v.split);
  return <Sim onReset={() => setV(DEF)}
    inputs={<>
      <NumField label="発行済株式数" value={v.shares} set={x => setV({ ...v, shares: x })} min={100} max={10000} step={100} unit="万株" />
      <NumField label="新株発行数" value={v.newShares} set={x => setV({ ...v, newShares: x })} min={0} max={5000} step={10} unit="万株" />
      <NumField label="純利益" value={v.income} set={x => setV({ ...v, income: x })} min={1} max={500} step={5} unit="億円" />
      <NumField label="分割前の株価" value={v.price} set={x => setV({ ...v, price: x })} min={10} max={100000} step={10} unit="円" />
      <NumField label="分割比率" value={v.split} set={x => setV({ ...v, split: x })} min={1} max={10} step={0.5} unit="倍" />
    </>}
    kpis={[['EPS 増資前', `${formatNum(before)}円`], ['EPS 増資後', `${formatNum(after)}円`], ['希薄化', formatPct(1 - after / before)], ['分割後の株価', `${formatNum(sp.price)}円`], ['分割後の発行済株式数（増資後）', `${formatNum(sp.shares / 1e4)}万株`]]}
    assume="希薄化は調達資金が生む利益を含まない機械的効果。分割は時価総額を変えない"
    note="増資の良否は資金使途のリターン（ROIC と WACC の比較）で判断します。株式分割は1株当たりの数値を変えるだけで、株主の持分比率と企業価値は変わりません。" />;
}

function BondSim() {
  const DEF = { coupon: 1, ytm: 2, years: 10 };
  const [v, setV] = useState(DEF);
  const face = 100;
  const price = F.bondPrice(face, v.coupon / 100, v.ytm / 100, v.years);
  const dur = F.macaulayDuration(face, v.coupon / 100, v.ytm / 100, v.years);
  const mod = F.modifiedDuration(face, v.coupon / 100, v.ytm / 100, v.years);
  const up = F.bondPrice(face, v.coupon / 100, v.ytm / 100 + 0.01, v.years) / price - 1;
  const curve = useMemo(() => Array.from({ length: 21 }, (_, i) => ({ x: i * 0.5, y: F.bondPrice(face, v.coupon / 100, (i * 0.5) / 100, v.years) })), [v]);
  return <Sim onReset={() => setV(DEF)}
    inputs={<>
      <NumField label="クーポン（年利率）" value={v.coupon} set={x => setV({ ...v, coupon: x })} min={0} max={8} step={0.25} unit="%" />
      <NumField label="最終利回り" value={v.ytm} set={x => setV({ ...v, ytm: x })} min={0} max={10} step={0.25} unit="%" />
      <NumField label="残存期間" value={v.years} set={x => setV({ ...v, years: x })} min={1} max={30} unit="年" />
    </>}
    kpis={[['価格（額面100）', formatNum(price)], ['マコーレー・デュレーション', `${formatNum(dur)}年`], ['修正デュレーション', formatNum(mod)], ['利回り+1%の価格変化', `${formatPct(up)}（近似 ${formatPct(-mod * 0.01)}）`]]}
    assume="年1回利払い・額面100の固定利付債"
    chart={<LineChart label="利回りと債券価格" xNumeric xLabel="利回り（%）" yLabel="価格" points={curve} marker={{ x: v.ytm, y: price }} />}
    note="価格と利回りの関係は凸型（コンベクシティ）で、デュレーションによる線形近似は金利変動が大きいほど実際の変化とずれます（上の「近似」との差）。経過利子・信用リスクは扱いません。" />;
}

function PortfolioSim() {
  const DEF = { w: 60, r1: 6, r2: 2, s1: 18, s2: 5, rho: 0.2 };
  const [v, setV] = useState(DEF);
  const cov = useMemo(() => [[(v.s1 / 100) ** 2, v.rho * (v.s1 / 100) * (v.s2 / 100)], [v.rho * (v.s1 / 100) * (v.s2 / 100), (v.s2 / 100) ** 2]], [v]);
  const stats = F.portfolioStats([v.w / 100, 1 - v.w / 100], [v.r1 / 100, v.r2 / 100], cov);
  const wMin = F.minVarianceWeight2(v.s1 / 100, v.s2 / 100, v.rho);
  const minStats = F.portfolioStats([wMin, 1 - wMin], [v.r1 / 100, v.r2 / 100], cov);
  // 監査ラウンド2 P2-8: 横軸リスク・縦軸リターンの投資機会曲線として描く（従来は配分ごとのボラティリティのみ）
  const curve = useMemo(() => Array.from({ length: 21 }, (_, i) => {
    const s = F.portfolioStats([i / 20, 1 - i / 20], [v.r1 / 100, v.r2 / 100], cov);
    return { x: s.volatility * 100, y: s.expected * 100 };
  }), [v, cov]);
  return <Sim onReset={() => setV(DEF)}
    inputs={<>
      <NumField label="資産1（株式）の配分" value={v.w} set={x => setV({ ...v, w: x })} min={0} max={100} unit="%" />
      <NumField label="資産1 期待リターン" value={v.r1} set={x => setV({ ...v, r1: x })} min={-5} max={15} step={0.5} unit="%" />
      <NumField label="資産2（債券）期待リターン" value={v.r2} set={x => setV({ ...v, r2: x })} min={-2} max={8} step={0.5} unit="%" />
      <NumField label="資産1 ボラティリティ" value={v.s1} set={x => setV({ ...v, s1: x })} min={1} max={40} unit="%" />
      <NumField label="資産2 ボラティリティ" value={v.s2} set={x => setV({ ...v, s2: x })} min={1} max={20} unit="%" />
      <NumField label="相関係数" value={v.rho} set={x => setV({ ...v, rho: x })} min={-1} max={1} step={0.1} />
    </>}
    kpis={[['期待リターン', formatPct(stats.expected)], ['ボラティリティ', formatPct(stats.volatility)], ['最小分散の株式配分', formatPct(wMin, 0)], ['最小分散のボラティリティ', formatPct(minStats.volatility)]]}
    assume="期待リターン・分散・相関が既知で一定（平均分散モデル）。空売りなし"
    chart={<LineChart label="投資機会曲線（株式0〜100%）" xNumeric xLabel="ボラティリティ（%）" yLabel="期待リターン（%）" points={curve} marker={{ x: stats.volatility * 100, y: stats.expected * 100 }} />}
    note="曲線のうち最小分散点より上側が効率的フロンティア（同じリスクでより高い期待リターン）です。相関は危機時に上昇しがちで、期待リターンの推定誤差が最適配分を大きく左右します。" />;
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
  return <Sim onReset={() => setV(DEF)}
    inputs={<>
      <NumField label="日次平均リターン" value={v.mu} set={x => setV({ ...v, mu: x })} min={-0.5} max={0.5} step={0.01} unit="%" />
      <NumField label="日次ボラティリティ" value={v.sigma} set={x => setV({ ...v, sigma: x })} min={0.2} max={4} step={0.1} unit="%" />
      <NumField label="乱数シード" value={v.seed} set={x => setV({ ...v, seed: x })} min={1} max={9999} />
    </>}
    kpis={[['VaR 95%・1日', `損失 ${formatPct(varRes.var)}`], ['CVaR 95%', `損失 ${formatPct(varRes.cvar)}`], ['最大ドローダウン', formatPct(mdd), 'bad']]}
    assume="正規乱数で生成した250日の架空系列（実データではない）。ヒストリカル法"
    chart={<LineChart label="生成した価格系列" xLabel="営業日" yLabel="価格指数" points={priceSeries.map((y, i) => ({ x: i, y }))} />}
    note="VaRは「その水準を超えた場合の損失の大きさ」を示さず、CVaR（超過時の平均損失）で補います。正規分布は実際の市場よりテールが薄く、損失を過小評価しがちです。分位は切り捨て側の規約のため、実効の信頼水準は名目よりわずかに高くなります。" />;
}

function OptionSim() {
  const DEF = { spot: 3000, strike: 3000, vol: 25, days: 90, rate: 1 };
  const [v, setV] = useState(DEF);
  const bs = useMemo(() => F.blackScholes({ spot: v.spot, strike: v.strike, rate: v.rate / 100, vol: v.vol / 100, years: v.days / 365, type: 'call' }), [v]);
  const payoff = useMemo(() => Array.from({ length: 25 }, (_, i) => { const s = v.strike * (0.6 + i * (0.8 / 24)); return { x: s, y: F.optionPayoff('call', v.strike, bs.price, s, true) }; }), [v, bs.price]);
  return <Sim onReset={() => setV(DEF)}
    inputs={<>
      <NumField label="原資産価格" value={v.spot} set={x => setV({ ...v, spot: x })} min={500} max={10000} step={50} unit="円" />
      <NumField label="権利行使価格" value={v.strike} set={x => setV({ ...v, strike: x })} min={500} max={10000} step={50} unit="円" />
      <NumField label="ボラティリティ" value={v.vol} set={x => setV({ ...v, vol: x })} min={5} max={80} unit="%" />
      <NumField label="満期まで" value={v.days} set={x => setV({ ...v, days: x })} min={1} max={365} unit="日" />
      <NumField label="無リスク金利" value={v.rate} set={x => setV({ ...v, rate: x })} min={0} max={10} step={0.25} unit="%" />
    </>}
    kpis={[['コール理論価格', `${formatNum(bs.price)}円`], ['内在価値＋時間価値', `${formatNum(bs.intrinsic)}＋${formatNum(bs.timeValue)}円`], ['デルタ', formatSig(bs.delta)], ['ガンマ', formatSig(bs.gamma)]]}
    assume="ヨーロピアン型・配当なし・ボラティリティ一定（ブラック・ショールズ）"
    chart={<LineChart label="コール買いの満期損益（プレミアム控除後）" xNumeric xLabel="満期時の原資産価格（円）" yLabel="損益（円）" color="#fbbf24" points={payoff} marker={{ x: v.spot, y: F.optionPayoff('call', v.strike, bs.price, v.spot, true) }} />}
    note="ブラック・ショールズは価格の対数正規分布・連続取引・取引費用なし等を前提とします。実際の市場ではボラティリティ・スマイルがあり、権利行使価格ごとに用いるボラティリティが異なります。配当のある原資産では理論価格が変わります。" />;
}

function LeverageSim() {
  const DEF = { entry: 100000, lev: 5, mmr: 0.5, funding: 0.01, periods: 30, notional: 500000 };
  const [v, setV] = useState(DEF);
  let liq = NaN; let liqError = '';
  try { liq = F.liquidationPriceLong(v.entry, v.lev, v.mmr / 100); } catch (e) { liqError = e instanceof Error ? e.message : '計算範囲外です'; }
  return <Sim onReset={() => setV(DEF)}
    inputs={<>
      <NumField label="参入価格" value={v.entry} set={x => setV({ ...v, entry: x })} min={1000} max={1000000} step={1000} unit="円" />
      <NumField label="レバレッジ" value={v.lev} set={x => setV({ ...v, lev: x })} min={1} max={25} unit="倍" />
      <NumField label="維持証拠金率" value={v.mmr} set={x => setV({ ...v, mmr: x })} min={0} max={5} step={0.25} unit="%" />
      <NumField label="想定元本" value={v.notional} set={x => setV({ ...v, notional: x })} min={10000} max={5000000} step={10000} unit="円" />
      <NumField label="資金調達率（1期間）" value={v.funding} set={x => setV({ ...v, funding: x })} min={-0.1} max={0.3} step={0.01} unit="%" />
      <NumField label="保有期間数" value={v.periods} set={x => setV({ ...v, periods: x })} min={1} max={90} unit="期間" />
    </>}
    kpis={[['簡易清算価格', Number.isFinite(liq) ? `${formatNum(liq)}円` : '計算不可', 'bad'], ['参入からの下落率', Number.isFinite(liq) ? formatPct(liq / v.entry - 1) : '—', 'bad'], ['資金調達コスト累計', formatYen(F.fundingCost(v.notional, v.funding / 100, v.periods))]]}
    alert={liqError ? <p className="error-text" role="status">計算できません: {liqError}</p> : undefined}
    assume="ロング・清算価格 = 参入価格 ×（1 − 1/レバレッジ + 維持証拠金率）の教材用近似"
    note="取引所ごとに証拠金階層・マーク価格・清算手数料の方式が異なり、実際の清算価格はこの近似と一致しません。急変時には清算価格を超えて損失が拡大することがあります。資金調達率は正なら買い手が支払います。" />;
}

function AmmSim() {
  const DEF = { rin: 100, rout: 100, ain: 10, ratio: 2 };
  const [v, setV] = useState(DEF);
  const swap = F.ammSwap(v.rin, v.rout, v.ain, 0.003);
  const il = F.impermanentLoss(v.ratio);
  return <Sim onReset={() => setV(DEF)}
    inputs={<>
      <NumField label="プール準備量（入力トークン）" value={v.rin} set={x => setV({ ...v, rin: x })} min={10} max={10000} step={10} />
      <NumField label="プール準備量（出力トークン）" value={v.rout} set={x => setV({ ...v, rout: x })} min={10} max={10000} step={10} />
      <NumField label="投入量（入力トークン）" value={v.ain} set={x => setV({ ...v, ain: x })} min={0.1} max={1000} step={0.1} />
      <NumField label="価格変動倍率（IL計算）" value={v.ratio} set={x => setV({ ...v, ratio: x })} min={0.25} max={5} step={0.25} unit="倍" />
    </>}
    kpis={[['受取量（出力トークン）', formatSig(swap.amountOut, 4)], ['価格インパクト（手数料除く）', formatPct(swap.pureImpact, 2)], ['手数料込みの不利幅', formatPct(swap.priceImpact, 2)], ['取引後のプール価格', `${formatSig(swap.newPrice, 4)} 出力/入力`], [`インパーマネントロス（${v.ratio}倍）`, formatPct(il, 2), 'bad']]}
    assume="定数積型 x·y=k、手数料0.3%を入力側から控除。ILはHODL比で手数料収入を含まない"
    note="集中流動性型（Uniswap v3等）では、価格帯ごとに流動性が異なるため価格形成とILの大きさが変わります。大口の取引ほど価格インパクトが大きく、裁定取引で他市場の価格へ戻されます。" />;
}

function LendingSim() {
  const DEF = { collateral: 100, threshold: 80, borrow: 50, drop: 30 };
  const [v, setV] = useState(DEF);
  const hf = F.healthFactor(v.collateral * 10000, v.threshold / 100, v.borrow * 10000);
  const hfAfter = F.healthFactor(v.collateral * 10000 * (1 - v.drop / 100), v.threshold / 100, v.borrow * 10000);
  const room = 1 - v.borrow / (v.collateral * v.threshold / 100);
  return <Sim onReset={() => setV(DEF)}
    inputs={<>
      <NumField label="担保価値" value={v.collateral} set={x => setV({ ...v, collateral: x })} min={1} max={1000} unit="万円" />
      <NumField label="清算閾値" value={v.threshold} set={x => setV({ ...v, threshold: x })} min={50} max={95} unit="%" />
      <NumField label="借入価値" value={v.borrow} set={x => setV({ ...v, borrow: x })} min={1} max={1000} unit="万円" />
      <NumField label="担保価格の下落" value={v.drop} set={x => setV({ ...v, drop: x })} min={0} max={80} unit="%" />
    </>}
    kpis={[['ヘルスファクター（現在）', formatNum(hf), hf < 1 ? 'bad' : undefined], [`${formatNum(v.drop)}%下落後`, formatNum(hfAfter), hfAfter < 1 ? 'bad' : undefined], ['清算までの下落余地', room > 0 ? formatPct(room) : '清算水準', room > 0 ? undefined : 'bad']]}
    assume="HF = 担保価値 × 清算閾値 ÷ 借入価値。1未満で清算対象"
    note="プロトコルごとに清算ボーナス・清算できる割合・オラクル方式が異なります。急落時にはオラクル遅延や流動性枯渇で、この計算以上の損失が生じることがあります。借入側の資産価格の上昇でもHFは下がります。" />;
}

function SupplySim() {
  const DEF = { price: 15000000, circ: 1900, max: 2100, unlock: 100 };
  const [v, setV] = useState(DEF);
  const mc = F.marketCap(v.price, v.circ * 10000);
  const fdvV = F.fdv(v.price, v.max * 10000);
  const dilution = v.unlock / (v.circ + v.unlock);
  return <Sim onReset={() => setV(DEF)}
    inputs={<>
      <NumField label="価格" value={v.price} set={x => setV({ ...v, price: x })} min={1000} max={50000000} step={1000} unit="円" />
      <NumField label="流通供給量" value={v.circ} set={x => setV({ ...v, circ: x })} min={1} max={100000} step={10} unit="万単位" />
      <NumField label="最大供給量" value={v.max} set={x => setV({ ...v, max: x })} min={1} max={200000} step={10} unit="万単位" />
      <NumField label="今後のアンロック量" value={v.unlock} set={x => setV({ ...v, unlock: x })} min={0} max={10000} step={10} unit="万単位" />
    </>}
    kpis={[['時価総額', `${formatNum(mc / 1e12)}兆円`], ['FDV', `${formatNum(fdvV / 1e12)}兆円`], ['未流通比率', formatPct(1 - v.circ / v.max), v.circ > v.max ? 'bad' : undefined], ['アンロック後の持分希薄化', formatPct(dilution)]]}
    alert={v.circ > v.max ? <p className="error-text" role="status">流通供給量が最大供給量を超えています。入力値を確認してください。</p> : undefined}
    assume="FDV = 現在価格 × 最大供給量"
    note="FDVは現在価格が全量流通後も維持されるという仮定の指標で、将来価格の予測ではありません。アンロックされたトークンが直ちに売却されるとは限りませんが、需給への影響は事前に確認します。" />;
}

function StakingSim() {
  const DEF = { apr: 4, slashP: 1, slashF: 5 };
  const [v, setV] = useState(DEF);
  const eff = F.stakingEffectiveAnnual(v.apr / 100, 365, v.slashP / 100, v.slashF / 100);
  const gross = F.stakingEffectiveAnnual(v.apr / 100, 365, 0, 0);
  return <Sim onReset={() => setV(DEF)}
    inputs={<>
      <NumField label="名目APR" value={v.apr} set={x => setV({ ...v, apr: x })} min={0} max={30} step={0.5} unit="%" />
      <NumField label="年間のスラッシング発生確率（仮定）" value={v.slashP} set={x => setV({ ...v, slashP: x })} min={0} max={20} step={0.5} unit="%" />
      <NumField label="発生時の元本毀損率" value={v.slashF} set={x => setV({ ...v, slashF: x })} min={0} max={50} step={1} unit="%" />
    </>}
    kpis={[['日次複利の実効年利', formatPct(gross, 2)], ['スラッシング期待損失の控除後', formatPct(eff, 2)], ['期待損失', formatPct(gross - eff, 2)]]}
    assume="期待損失（確率×毀損率）を線形に控除する近似。トークン建ての利回り"
    note="スラッシング確率・毀損率は利用者が置く仮定であり、プロトコルが公表する確定値ではありません。円建ての損益はトークン価格の変動に支配され、ロック期間・アンステーク待ち時間の機会損失も含みません。" />;
}
