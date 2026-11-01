import { useMemo, useState } from 'react';
import { formatNum, formatPct } from '../components/Chart';
import * as F from '../finance/core';

// 株式分析ラボ / 暗号資産ラボ（指示書 §9.2-5,6）
// 詳細シミュレーターへ導線を張りつつ、ラボ固有の「財務三表の連動」と「暗号資産リスク点検」を置く。
export function LabsPage({ go }: { go: (path: string) => void }) {
  const [tab, setTab] = useState<'stock' | 'crypto'>('stock');
  return (
    <main>
      <h2>{tab === 'stock' ? '株式分析ラボ' : '暗号資産ラボ'}</h2>
      <div className="tabs">
        <button className={tab === 'stock' ? 'tab active' : 'tab'} onClick={() => setTab('stock')}>株式分析ラボ</button>
        <button className={tab === 'crypto' ? 'tab active' : 'tab'} onClick={() => setTab('crypto')}>暗号資産ラボ</button>
      </div>
      {tab === 'stock' ? <StockLab go={go} /> : <CryptoLab go={go} />}
    </main>
  );
}

function StockLab({ go }: { go: (p: string) => void }) {
  const DEF = { revenue: 1000, grossMargin: 40, opex: 250, depreciation: 50, capex: 80, wcChange: 20, equity: 800, debt: 300 };
  const [v, setV] = useState(DEF);
  const calc = useMemo(() => {
    const gross = v.revenue * (v.grossMargin / 100);
    const op = gross - v.opex - v.depreciation;
    const ni = op * 0.7; // 税率30%の単純化（教材用と明記）
    const ocf = ni + v.depreciation - v.wcChange;
    const fcf = F.freeCashFlow(ocf, v.capex);
    const roe = ni / v.equity;
    const roicApprox = (op * 0.7) / (v.equity + v.debt);
    return { gross, op, ni, ocf, fcf, roe, roicApprox };
  }, [v]);
  const num = (label: string, key: keyof typeof DEF, unit: string) => (
    <label className="num-field"><span>{label}</span>
      <input type="number" value={v[key]} onChange={e => setV({ ...v, [key]: Number(e.target.value) })} aria-label={label} /><span>{unit}</span></label>
  );
  return (
    <div>
      <h3>財務三表の連動（簡易モデル）</h3>
      {num('売上高', 'revenue', '億円')}{num('売上総利益率', 'grossMargin', '%')}
      {num('販管費（減価償却を除く）', 'opex', '億円')}{num('減価償却費', 'depreciation', '億円')}
      {num('設備投資', 'capex', '億円')}{num('運転資本の増加', 'wcChange', '億円')}
      {num('純資産', 'equity', '億円')}{num('有利子負債', 'debt', '億円')}
      <div className="table-scroll"><table>
        <tbody>
          <tr><th>売上総利益</th><td>{formatNum(calc.gross)}億円</td><th>営業利益</th><td>{formatNum(calc.op)}億円</td></tr>
          <tr><th>純利益（税率30%で単純化）</th><td>{formatNum(calc.ni)}億円</td><th>営業CF（純利益＋減価償却−運転資本増加）</th><td>{formatNum(calc.ocf)}億円</td></tr>
          <tr><th>フリーキャッシュフロー</th><td>{formatNum(calc.fcf)}億円</td><th>ROE</th><td>{formatPct(calc.roe)}</td></tr>
          <tr><th>ROIC近似（NOPAT÷（純資産＋有利子負債））</th><td colSpan={3}>{formatPct(calc.roicApprox)}</td></tr>
        </tbody></table></div>
      <p className="meta">純利益は貸借対照表の利益剰余金を増やし、減価償却は非資金費用として営業CFに足し戻されます。これは三表のつながりを示す教材用簡易モデルで、実際の財務諸表の全項目は扱いません。</p>
      <h3>分析シミュレーター</h3>
      <button className="chip" onClick={() => go('sim/multiples')}>PER・PBR・EV/EBITDA</button>
      <button className="chip" onClick={() => go('sim/dcf')}>DCF感度分析</button>
      <button className="chip" onClick={() => go('sim/dilution')}>増資・希薄化・分割</button>
      <button className="chip" onClick={() => go('lesson/D-02')}>教材: DCFと資本コスト</button>
      <button className="chip" onClick={() => go('lesson/C-01')}>教材: 財務三表の構造</button>
    </div>
  );
}

const RISK_ITEMS = [
  '秘密鍵・シードフレーズを他人に送ったり、Webフォームに入力したりしていない（入力を求めるサービスは詐欺を疑う）',
  '取引所は金融庁登録業者かを確認した',
  '価格変動だけでなく、流動性（薄い板でのスリッページ）を把握している',
  'トークンのアンロックスケジュールとFDVを確認した',
  'ステーブルコインの担保・発行体・償還条件を確認した',
  'DeFiの担保ヘルスファクターと清算条件を把握している',
  'レバレッジの清算価格と資金調達率の累積コストを計算した',
  '税務（原則として雑所得・総合課税）の記録を付けている',
];
function CryptoLab({ go }: { go: (p: string) => void }) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const toggle = (i: number) => setChecked(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  return (
    <div>
      <h3>投資前リスク点検（自己確認用）</h3>
      {RISK_ITEMS.map((t, i) => (
        <label key={i} className="check-row"><input type="checkbox" checked={checked.has(i)} onChange={() => toggle(i)} /> {t}</label>
      ))}
      <p aria-live="polite">{checked.size} / {RISK_ITEMS.length} 項目を確認済み</p>
      <h3>分析シミュレーター</h3>
      <button className="chip" onClick={() => go('sim/supply')}>供給量・時価総額・FDV</button>
      <button className="chip" onClick={() => go('sim/amm')}>AMM・スリッページ</button>
      <button className="chip" onClick={() => go('sim/lending')}>DeFiレンディング清算</button>
      <button className="chip" onClick={() => go('sim/staking')}>ステーキング</button>
      <button className="chip" onClick={() => go('sim/leverage')}>レバレッジ清算・資金調達率</button>
      <button className="chip" onClick={() => go('lesson/I-01')}>教材: 鍵管理と攻撃</button>
      <button className="chip" onClick={() => go('lesson/H-01')}>教材: トークノミクスと供給</button>
    </div>
  );
}
