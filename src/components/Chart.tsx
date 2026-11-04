import { useEffect, useRef, useState } from 'react';

// アクセシブルなSVGチャート（指示書 §9.3: グラフには表による代替情報を併置する）。
// 監査ラウンド2 P2-5: 軸目盛り・軸の単位を描画し、SVG の座標系をコンテナの実幅に合わせることで、
// 狭幅でも文字が縮小されない（従来は viewBox 640 の縮小で375px幅の文字が約5pxになっていた）。
export interface SeriesPoint { x: number | string; y: number; }
export interface Series { name: string; points: SeriesPoint[]; color?: string; }
interface Props {
  label: string;
  points?: SeriesPoint[];
  series?: Series[];
  color?: string;
  height?: number;
  /** 横軸の意味と単位（例: 「年」「利回り（%）」） */
  xLabel?: string;
  /** 縦軸の単位（例: 「円」「%」） */
  yLabel?: string;
  yFormat?: (v: number) => string;
  /** x を数値として位置決めする（散布図的な曲線） */
  xNumeric?: boolean;
  xFormat?: (v: number) => string;
  /** 強調する点（例: 現在の配分） */
  marker?: { x: number | string; y: number; label?: string };
}
const PALETTE = ['#38bdf8', '#fbbf24', '#34d399', '#f472b6', '#a78bfa'];

function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) { const d = Math.abs(min) || 1; min -= d / 2; max += d / 2; }
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? raw;
  const out: number[] = [];
  const end = Math.ceil(max / step - 1e-9) * step;
  for (let v = Math.floor(min / step + 1e-9) * step; v <= end + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

export function LineChart({ label, points, series, color = PALETTE[0], height = 190, xLabel, yLabel, yFormat = formatCompact, xNumeric = false, xFormat = formatCompact, marker }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const update = () => { const w = Math.round(el.getBoundingClientRect().width); if (w > 0) setW(w); };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const all: Series[] = series ?? (points ? [{ name: label, points, color }] : []);
  const pts = all.flatMap(s => s.points);
  if (pts.length === 0) return <p>データがありません</p>;
  const H = height, padL = 56, padR = 12, padT = yLabel ? 22 : 10, padB = 34;
  const ys = pts.map(p => p.y).filter(Number.isFinite);
  const yt = niceTicks(Math.min(...ys), Math.max(...ys));
  const yMin = Math.min(yt[0] ?? 0, ...ys), yMax = Math.max(yt[yt.length - 1] ?? 1, ...ys);
  const ySpan = yMax - yMin || 1;
  const sy = (v: number) => H - padB - ((v - yMin) / ySpan) * (H - padT - padB);
  const longest = Math.max(...all.map(s => s.points.length));
  const xsNum = xNumeric ? pts.map(p => Number(p.x)) : [];
  const xMin = xNumeric ? Math.min(...xsNum) : 0, xMax = xNumeric ? Math.max(...xsNum) : longest - 1;
  const xSpan = xMax - xMin || 1;
  const sxIdx = (i: number) => padL + (i * (W - padL - padR)) / Math.max(longest - 1, 1);
  const sxNum = (v: number) => padL + ((v - xMin) / xSpan) * (W - padL - padR);
  const sx = (p: SeriesPoint, i: number) => (xNumeric ? sxNum(Number(p.x)) : sxIdx(i));
  const ref = all.find(s => s.points.length === longest)?.points ?? [];
  const nx = W < 420 ? 3 : 5;
  const xTicks: { pos: number; text: string }[] = xNumeric
    ? niceTicks(xMin, xMax, nx).filter(v => v >= xMin - xSpan * 1e-9 && v <= xMax + xSpan * 1e-9).map(v => ({ pos: sxNum(v), text: xFormat(v) }))
    : Array.from(new Set(Array.from({ length: nx }, (_, k) => Math.round((k * (longest - 1)) / (nx - 1))))).map(i => ({ pos: sxIdx(i), text: String(ref[i]?.x ?? '') }));
  const markerPt = marker ? { cx: xNumeric ? sxNum(Number(marker.x)) : sxIdx(ref.findIndex(p => p.x === marker.x)), cy: sy(marker.y) } : null;
  return (
    <figure className="chart">
      <div ref={box} className="chart-box">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}${yLabel ? `（縦軸: ${yLabel}）` : ''}${xLabel ? `（横軸: ${xLabel}）` : ''}`}>
          {yt.map(v => (
            <g key={`y${v}`}>
              <line x1={padL} x2={W - padR} y1={sy(v)} y2={sy(v)} stroke="var(--line)" strokeDasharray={v === 0 ? undefined : '2 3'} />
              <text x={padL - 6} y={sy(v) + 4} textAnchor="end" className="chart-tick">{yFormat(v)}</text>
            </g>
          ))}
          <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="var(--line-strong)" />
          {xTicks.map((t, i) => (
            <text key={`x${i}`} x={t.pos} y={H - padB + 15} textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'} className="chart-tick">{t.text}</text>
          ))}
          {xLabel && <text x={W - padR} y={H - 3} textAnchor="end" className="chart-axis">{xLabel}</text>}
          {yLabel && <text x={4} y={4} className="chart-axis" dominantBaseline="hanging">{yLabel}</text>}
          {all.map((s, k) => (
            <path key={s.name} d={s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p, i).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')}
              fill="none" stroke={s.color ?? PALETTE[k % PALETTE.length]} strokeWidth="2.2" />
          ))}
          {markerPt && Number.isFinite(markerPt.cx) && <circle cx={markerPt.cx} cy={markerPt.cy} r={5} fill="var(--accent-2)" stroke="var(--bg)" strokeWidth="2" />}
        </svg>
      </div>
      {all.length > 1 && (
        <figcaption className="chart-legend">
          {all.map((s, k) => <span key={s.name}><i style={{ background: s.color ?? PALETTE[k % PALETTE.length] }} />{s.name}</span>)}
        </figcaption>
      )}
      <details>
        <summary>数値表で見る</summary>
        <div className="table-scroll">
          <table>
            <thead><tr><th>{xLabel ?? '時点'}</th>{all.map(s => <th key={s.name}>{all.length > 1 ? s.name : `値${yLabel ? `（${yLabel}）` : ''}`}</th>)}</tr></thead>
            <tbody>{ref.map((p, i) => <tr key={i}><td>{String(p.x)}</td>{all.map(s => <td key={s.name}>{formatNum(s.points[i]?.y ?? NaN)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
export function formatNum(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 10000) return Math.round(v).toLocaleString('ja-JP');
  if (abs >= 100) return (Math.round(v * 10) / 10).toLocaleString('ja-JP');
  return String(Math.round(v * 1000) / 1000);
}
/** 有効数字で表示する（監査ラウンド2 P3-7: ガンマ 0.00104 が「0.001」に丸められ有効桁を失っていた） */
export function formatSig(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  if (Math.abs(v) >= 1000) return formatNum(v);
  return String(Number(v.toPrecision(digits)));
}
/** 軸目盛り用の短い表記（万・億） */
export function formatCompact(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e8) return `${Number((v / 1e8).toPrecision(3))}億`;
  if (a >= 1e4) return `${Number((v / 1e4).toPrecision(3))}万`;
  return String(Number(v.toPrecision(3)));
}
export function formatYen(v: number): string { return `${formatNum(v)}円`; }
export function formatPct(v: number, digits = 1): string { if (!Number.isFinite(v)) return '—'; return `${(v * 100).toFixed(digits)}%`; }
