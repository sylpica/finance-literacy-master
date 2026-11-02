// アクセシブルなSVGチャート（指示書 §9.3: グラフには表による代替情報を併置する）
export interface SeriesPoint { x: number | string; y: number; }
export function LineChart({ label, points, color = '#38bdf8', height = 180 }: { label: string; points: SeriesPoint[]; color?: string; height?: number }) {
  const W = 640, H = height, P = 28;
  if (points.length === 0) return <p>データがありません</p>;
  const ys = points.map(p => p.y);
  const min = Math.min(...ys), max = Math.max(...ys);
  const span = max - min || 1;
  const sx = (i: number) => P + (i * (W - 2 * P)) / Math.max(points.length - 1, 1);
  const sy = (v: number) => H - P - ((v - min) / span) * (H - 2 * P);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(i).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  return (
    <figure className="chart">
      <svg viewBox={`-2 -2 ${W + 4} ${H + 4}`} role="img" aria-label={label}>
        <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#64748b" />
        {min < 0 && max > 0 && <line x1={P} y1={sy(0)} x2={W - P} y2={sy(0)} stroke="#94a3b8" strokeDasharray="4 3" />}
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" />
        <text x={P} y={14} fill="currentColor" fontSize="12">最大 {formatNum(max)}</text>
        <text x={P} y={H - 6} fill="currentColor" fontSize="12">最小 {formatNum(min)}</text>
      </svg>
      <details>
        <summary>数値表で見る</summary>
        <div className="table-scroll">
          <table>
            <thead><tr><th>時点</th><th>値</th></tr></thead>
            <tbody>{points.map((p, i) => <tr key={i}><td>{String(p.x)}</td><td>{formatNum(p.y)}</td></tr>)}</tbody>
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
export function formatYen(v: number): string { return `${formatNum(v)}円`; }
export function formatPct(v: number, digits = 1): string { if (!Number.isFinite(v)) return '—'; return `${(v * 100).toFixed(digits)}%`; }
