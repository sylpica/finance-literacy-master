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

export function NumField({ label, value, set, min, max, step = 1, unit = '', slider = true }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => { setDraft(null); }, [value]);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const onType = (text: string) => {
    setDraft(text);
    if (text.trim() === '') return;
    const n = Number(text);
    if (Number.isFinite(n)) set(clamp(n));
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
