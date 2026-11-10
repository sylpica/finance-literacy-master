import { futureValue, bondPrice, optionPayoff, ammSwap } from '../finance/core';
import { REGULATIONS } from '../content/regulations';

/** 教材の図解（監査ラウンド3で新設、指令書6章）。
 *  数値曲線はすべて src/finance/core.ts の検証済み関数で計算する（図だけ別の式で計算しない）。
 *  模式図は文章の置き換えではなく構造の可視化で、本文は従来どおり残す。
 *  各図には前提・単位・架空値である旨をキャプションに明示し、本文テキストでも同じ内容を説明する。 */

const W = 640, H = 300, PL = 46, PR = 12, PT = 14, PB = 34;
function pathFrom(points: { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}
function Frame({ children, xLabel, yLabel }: { children: React.ReactNode; xLabel: string; yLabel: string }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${yLabel}と${xLabel}の関係図`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <line x1={PL} y1={PT} x2={PL} y2={H - PB} stroke="var(--line-strong)" />
      <line x1={PL} y1={H - PB} x2={W - PR} y2={H - PB} stroke="var(--line-strong)" />
      <text x={PL + 2} y={PT + 4} fill="var(--muted)" fontSize="12">{yLabel}</text>
      <text x={W - PR} y={H - 8} fill="var(--muted)" fontSize="12" textAnchor="end">{xLabel}</text>
      {children}
    </svg>
  );
}

function CompoundFigure() {
  const years = 30, rate = 0.05, pv = 100; // 万円（架空の例示条件。本文A-02の検算例とは別の可視化用）
  const xs = Array.from({ length: years + 1 }, (_, y) => y);
  const max = futureValue(pv, rate, years);
  const sx = (y: number) => PL + (y / years) * (W - PL - PR);
  const sy = (v: number) => (H - PB) - (v / max) * (H - PT - PB);
  const compound = xs.map(y => ({ x: sx(y), y: sy(futureValue(pv, rate, y)) }));
  const simple = xs.map(y => ({ x: sx(y), y: sy(pv * (1 + rate * y)) }));
  return (
    <Frame xLabel="年" yLabel="金額（万円）">
      <path d={pathFrom(compound)} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
      <path d={pathFrom(simple)} fill="none" stroke="var(--accent-2)" strokeWidth="2.5" strokeDasharray="5 4" />
      <text x={sx(21)} y={sy(futureValue(pv, rate, 21)) - 8} fill="var(--accent)" fontSize="13">複利 {Math.round(max)}万円（30年）</text>
      <text x={sx(21)} y={sy(pv * (1 + rate * 21)) + 18} fill="var(--accent-2)" fontSize="13">単利 {Math.round(pv * (1 + rate * years))}万円（30年）</text>
      {[0, 10, 20, 30].map(y => <text key={y} x={sx(y)} y={H - PB + 16} fill="var(--muted)" fontSize="11" textAnchor="middle">{y}</text>)}
    </Frame>
  );
}

function BondFigure() {
  // 額面100、クーポン年1%、残存10年、年1回払い。価格は core.bondPrice で計算。
  const ys = Array.from({ length: 61 }, (_, i) => 0.0 + i * 0.001 * 10); // 0%〜6%
  const prices = ys.map(y => bondPrice(100, 0.01, y, 10, 1));
  const max = Math.max(...prices), min = Math.min(...prices);
  const sx = (y: number) => PL + (y / 0.06) * (W - PL - PR);
  const sy = (v: number) => (H - PB) - ((v - min) / (max - min)) * (H - PT - PB);
  const pts = ys.map((y, i) => ({ x: sx(y), y: sy(prices[i]!) }));
  const atPar = { x: sx(0.01), y: sy(bondPrice(100, 0.01, 0.01, 10, 1)) };
  return (
    <Frame xLabel="利回り（%）" yLabel="債券価格">
      <path d={pathFrom(pts)} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
      <circle cx={atPar.x} cy={atPar.y} r="4" fill="var(--accent-2)" />
      <text x={atPar.x + 8} y={atPar.y - 6} fill="var(--text)" fontSize="12">利回り1%で価格は額面100</text>
      {[0, 2, 4, 6].map(y => <text key={y} x={sx(y / 100)} y={H - PB + 16} fill="var(--muted)" fontSize="11" textAnchor="middle">{y}%</text>)}
      <text x={sx(0.045)} y={sy(bondPrice(100, 0.01, 0.045, 10, 1)) + 20} fill="var(--muted)" fontSize="12">金利が上がると価格は下がる（凸型の曲線）</text>
    </Frame>
  );
}

function OptionFigure() {
  const K = 100, premium = 5; // 架空の例示
  const xs = Array.from({ length: 81 }, (_, i) => 60 + i); // 満期株価 60〜140
  const sx = (s: number) => PL + ((s - 60) / 80) * (W - PL - PR);
  const maxP = 35, minP = -6;
  const sy = (v: number) => (H - PB) - ((v - minP) / (maxP - minP)) * (H - PT - PB);
  const call = xs.map(s => ({ x: sx(s), y: sy(optionPayoff('call', K, premium, s, true)) }));
  const put = xs.map(s => ({ x: sx(s), y: sy(optionPayoff('put', K, premium, s, true)) }));
  return (
    <Frame xLabel="満期時の株価" yLabel="損益">
      <line x1={PL} y1={sy(0)} x2={W - PR} y2={sy(0)} stroke="var(--line-strong)" strokeDasharray="3 3" />
      <path d={pathFrom(call)} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
      <path d={pathFrom(put)} fill="none" stroke="var(--accent-2)" strokeWidth="2.5" />
      <text x={sx(122)} y={sy(17)} fill="var(--accent)" fontSize="13">コール買い（損失は保険料分まで）</text>
      <text x={sx(63)} y={sy(28)} fill="var(--accent-2)" fontSize="13">プット買い</text>
      <text x={sx(K)} y={H - PB + 16} fill="var(--muted)" fontSize="11" textAnchor="middle">行使価格100</text>
    </Frame>
  );
}

function AmmFigure() {
  // 曲線は定積モデル x*y=k の定義そのもの（k=10,000）。取引後の点は core.ammSwap（手数料0）で計算する。
  const k = 10000;
  const xs = Array.from({ length: 81 }, (_, i) => 40 + i * 2); // x: 40〜200
  const sx = (x: number) => PL + ((x - 40) / 160) * (W - PL - PR);
  const sy = (y: number) => (H - PB) - ((y - 40) / 220) * (H - PT - PB);
  const pts = xs.map(x => ({ x: sx(x), y: sy(k / x) }));
  const before = { x: sx(100), y: sy(100) };
  const afterY = 100 - ammSwap(100, 100, 10, 0).amountOut; // Xを10入れて得たYを差し引いた残量（約90.9）
  const after = { x: sx(110), y: sy(afterY) };
  return (
    <Frame xLabel="資産Xのプール量" yLabel="資産Yのプール量">
      <path d={pathFrom(pts)} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
      <circle cx={before.x} cy={before.y} r="4" fill="var(--accent-2)" />
      <circle cx={after.x} cy={after.y} r="4" fill="var(--text)" />
      <text x={before.x - 6} y={before.y - 10} fill="var(--text)" fontSize="12" textAnchor="end">取引前（100, 100）</text>
      <text x={after.x + 8} y={after.y + 16} fill="var(--text)" fontSize="12">{`Xを10追加→Yは約${afterY.toFixed(1)}に（同じ曲線上を移動）`}</text>
      <text x={sx(150)} y={sy(k / 150) - 10} fill="var(--muted)" fontSize="12">x × y = 一定（手数料なしの単純化）</text>
    </Frame>
  );
}

function FlowFigure() {
  const boxes = [
    { x: 30, label: '収入（可処分所得）' },
    { x: 190, label: '消費支出' },
    { x: 330, label: '貯蓄' },
    { x: 450, label: '生活防衛資金→投資' },
  ];
  return (
    <svg viewBox="0 0 640 120" role="img" aria-label="家計の資金フロー図" style={{ width: '100%', height: 'auto', display: 'block' }}>
      {boxes.map((b, i) => (
        <g key={b.label}>
          <rect x={b.x} y={38} width={i === 3 ? 160 : 128} height={44} rx={8} fill="var(--panel-2)" stroke="var(--line-strong)" />
          <text x={b.x + (i === 3 ? 80 : 64)} y={65} fill="var(--text)" fontSize="13" textAnchor="middle">{b.label}</text>
          {i < 3 && <text x={b.x + (i === 3 ? 160 : 128) + 16} y={66} fill="var(--muted)" fontSize="16" textAnchor="middle">→</text>}
        </g>
      ))}
      <text x={254} y={104} fill="var(--muted)" fontSize="12" textAnchor="middle">貯蓄率 ＝ 貯蓄 ÷ 可処分所得</text>
    </svg>
  );
}

function StatementsFigure() {
  const col = (x: number, title: string, lines: string[]) => (
    <g>
      <rect x={x} y={30} width={180} height={170} rx={8} fill="var(--panel-2)" stroke="var(--line-strong)" />
      <text x={x + 90} y={56} fill="var(--text)" fontSize="14" textAnchor="middle" fontWeight="bold">{title}</text>
      {lines.map((t, i) => <text key={t} x={x + 90} y={86 + i * 26} fill="var(--muted)" fontSize="12" textAnchor="middle">{t}</text>)}
    </g>
  );
  return (
    <svg viewBox="0 0 640 250" role="img" aria-label="財務三表のつながり図" style={{ width: '100%', height: 'auto', display: 'block' }}>
      {col(10, '損益計算書（PL）', ['収益 − 費用 ＝ 利益', '一定期間の成績'])}
      {col(230, '貸借対照表（BS）', ['資産 ＝ 負債 ＋ 純資産', '期末時点の財政状態', '利益→純資産（利益剰余金）'])}
      {col(450, 'キャッシュフロー（CF）', ['営業・投資・財務の現金', '現金の増減＝BS現金の変化'])}
      <text x={215} y={120} fill="var(--muted)" fontSize="16">→</text>
      <text x={435} y={120} fill="var(--muted)" fontSize="16">→</text>
      <text x={320} y={228} fill="var(--muted)" fontSize="12" textAnchor="middle">利益と現金は一致しない（減価償却・売掛金などのため）</text>
    </svg>
  );
}

function NisaFigure() {
  const reg = REGULATIONS.find(r => r.id === 'REG-NISA-2024');
  const kn = new Map((reg?.keyNumbers ?? []).map(k => [k.label, k.value]));
  return (
    <svg viewBox="0 0 640 210" role="img" aria-label="NISAの年間投資枠と生涯限度額の図" style={{ width: '100%', height: 'auto', display: 'block' }}>
      <text x={46} y={30} fill="var(--text)" fontSize="13">年間投資枠（合計 {kn.get('年間投資枠（合計）') ?? '360万円'}）</text>
      <rect x={46} y={42} width={180} height={26} fill="var(--accent)" opacity={0.75} />
      <rect x={226} y={42} width={360} height={26} fill="var(--accent-2)" opacity={0.8} />
      <text x={52} y={60} fill="var(--accent-ink)" fontSize="12">つみたて {kn.get('つみたて投資枠（年間）') ?? '120万円'}</text>
      <text x={232} y={60} fill="var(--accent-ink)" fontSize="12">成長投資枠 {kn.get('成長投資枠（年間）') ?? '240万円'}</text>
      <text x={46} y={104} fill="var(--text)" fontSize="13">生涯非課税保有限度額 {kn.get('生涯非課税保有限度額（総枠）') ?? '1,800万円'}（うち成長投資枠は {kn.get('成長投資枠の上限（生涯限度額の内数）') ?? '1,200万円'}まで）</text>
      <rect x={46} y={116} width={540} height={26} fill="var(--panel-2)" stroke="var(--line-strong)" />
      <rect x={46} y={116} width={360} height={26} fill="var(--accent)" opacity={0.45} />
      <text x={52} y={134} fill="var(--text)" fontSize="12">売却すると簿価分の枠が翌年以降に復活する</text>
      <text x={46} y={176} fill="var(--muted)" fontSize="12">数値は制度情報（金融庁確認）の登録値から表示。枠の再利用は売却した年の翌年以降。</text>
    </svg>
  );
}

const FIGURES: Record<string, { title: string; caption: string; node: () => React.ReactNode }> = {
  'A-01': { title: '家計の資金の流れ', caption: '模式図。収入から消費を差し引いた残りが貯蓄で、まず流動性の高い生活防衛資金を確保し、余剰を投資へ回す順序が土台になる。', node: FlowFigure },
  'A-02': { title: '複利と単利の差（年5%・元本100万円・架空の例示）', caption: '単利は元本にのみ利息が付き、複利は利息にも利息が付くため、期間が長いほど差が広がる。税金・手数料は含まない。', node: CompoundFigure },
  'C-01': { title: '財務三表のつながり', caption: '模式図。PLの利益はBSの純資産（利益剰余金）へ、CFの現金増減はBSの現金へつながる。利益と現金が一致しない理由は本文で説明する。', node: StatementsFigure },
  'F-01': { title: '利回りと債券価格（額面100・クーポン1%・残存10年）', caption: '市場金利（利回り）が上がると既発債の価格は下がり、下がると上がる。曲線が凸型なのは残存期間が長いほど価格感応度が大きい性質による。', node: BondFigure },
  'L-03': { title: 'オプション買いの満期損益（行使価格100・保険料5・架空の例示）', caption: '買い手の損失は支払った保険料までに限られ、コールは株価上昇、プットは株価下落で利益が出る。売り手は逆の損益になる。', node: OptionFigure },
  'H-04': { title: 'AMMの定積曲線 x×y=k', caption: '手数料なしの単純化モデル。取引は曲線上の移動で、片方の資産を多く入れるほど単価が不利になる（価格インパクト）。数値は模式的な例。', node: AmmFigure },
  'M-01': { title: 'NISAの枠の構造', caption: '制度情報に登録した金融庁確認値から描画。年間枠と生涯限度額は別物で、成長投資枠には生涯の内数上限がある。', node: NisaFigure },
};

export function LessonFigure({ lessonId }: { lessonId: string }) {
  const f = FIGURES[lessonId];
  if (!f) return null;
  const Node = f.node;
  return (
    <figure className="lesson-figure">
      <figcaption className="figure-title">{f.title}</figcaption>
      <Node />
      <figcaption className="meta">{f.caption}</figcaption>
    </figure>
  );
}
