import { useEffect, useState } from 'react';

// 数値入力の共通部品:
// - スライダーと数値欄を併せ持つ。計算層へは常に min〜max の範囲内の値だけを渡す
// - キー入力の途中では値を書き換えない（監査ラウンド2 P1-1: 1文字ごとに範囲へ丸めていたため、
//   WACC に「12」と打つと「1」が最小値3に丸められて最終的に15になる等、正しい値を入力できなかった）。
//   範囲内の値になった時点でだけ反映し、範囲外・入力途中の文字列は下書きのまま保持して範囲を表示する。
//   丸め（クランプ）は確定時（blur・Enter）に行う
// - 確定値（value）が外部から変わった場合（初期値リセット等）は下書きを破棄して追随する
interface Props {
  label: string;
  value: number;
  set: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  slider?: boolean;
}

/** 確定時の正規化。範囲へ収め、step=1 の整数フィールドだけは整数に丸める
 *  （粗い step の連続量まで格子へ吸着させると、入力値が静かに書き換わるため）。 */
export function snapToStep(v: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, v));
  return step === 1 ? Math.round(clamped) : clamped;
}

/** 入力途中の文字列を評価する。範囲内の有限数なら反映値、そうでなければ null（下書きのまま保持）。 */
export function parseDraft(text: string, min: number, max: number, step: number): number | null {
  if (text.trim() === '') return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return step === 1 ? Math.round(n) : n;
}

export function NumField({ label, value, set, min, max, step = 1, unit = '', slider = true }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  // 外部からの値変更（リセット・スライダー）では下書きを捨てる。自分の入力で反映した値なら下書きを保つ。
  useEffect(() => { setDraft(d => (d !== null && Number(d) === value ? d : null)); }, [value]);
  const onType = (text: string) => {
    setDraft(text);
    const n = parseDraft(text, min, max, step);
    if (n !== null && n !== value) set(n);
  };
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    if (draft.trim() !== '' && Number.isFinite(n)) {
      const v = snapToStep(n, min, max, step);
      if (v !== value) set(v);
    }
    setDraft(null);
  };
  const invalid = draft !== null && parseDraft(draft, min, max, step) === null;
  return (
    <label className={invalid ? 'num-field invalid' : 'num-field'}>
      <span className="num-label">{label}</span>
      {slider && (
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => set(Math.min(max, Math.max(min, Number(e.target.value))))} aria-label={`${label}スライダー`} />
      )}
      <span className="num-box">
        <input type="number" min={min} max={max} step={step} inputMode="decimal"
          value={draft ?? String(value)} onChange={e => onType(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); }} aria-label={label} aria-invalid={invalid || undefined} />
        {unit && <span className="num-unit">{unit}</span>}
      </span>
      {invalid && <span className="num-hint" role="status">範囲 {min.toLocaleString('ja-JP')}〜{max.toLocaleString('ja-JP')}{unit}</span>}
    </label>
  );
}
