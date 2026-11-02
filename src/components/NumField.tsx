import { useEffect, useState } from 'react';

// 数値入力の共通部品（監査指摘対応）:
// - スライダーと数値欄を併せ持ち、タイプ入力でも min/max の範囲内に必ず収める（クランプ）
// - 空欄や "-" など入力途中の文字列は下書きとして保持し、計算層へ NaN や範囲外値を渡さない
// - 確定値（value）が外部から変わった場合（初期値リセット等）は下書きも追随する
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

/** 型入力の正規化。第1回監査の指摘は「年数など整数であるべき値に 2.5 と打つと、表示は2.5年のまま
 *  3年債として計算される」という不整合であり、対象は step=1 の整数フィールドに限られる。
 *  粗い step（5、7、100000 等）を持つ連続量フィールドまで格子に吸着させると、入力値が静かに
 *  書き換わり初期値ともずれる（第2回再監査の指摘）ため、吸着は step=1 のときだけ整数丸めにする。 */
export function snapToStep(v: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, v));
  return step === 1 ? Math.round(clamped) : clamped;
}

export function NumField({ label, value, set, min, max, step = 1, unit = '', slider = true }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => { setDraft(null); }, [value]);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const onType = (text: string) => {
    setDraft(text);
    if (text.trim() === '') return;
    const n = Number(text);
    if (Number.isFinite(n)) set(snapToStep(n, min, max, step));
  };
  const onBlur = () => { setDraft(null); };
  return (
    <label className="num-field">
      <span>{label}</span>
      {slider && (
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => set(clamp(Number(e.target.value)))} aria-label={`${label}スライダー`} />
      )}
      <input type="number" min={min} max={max} step={step}
        value={draft ?? String(value)} onChange={e => onType(e.target.value)} onBlur={onBlur} aria-label={label} />
      <span>{unit}</span>
    </label>
  );
}
