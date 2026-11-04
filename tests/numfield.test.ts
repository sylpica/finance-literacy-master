import { describe, it, expect } from 'vitest';
import { snapToStep } from '../src/components/NumField';

describe('NumField の型入力正規化（第2回再監査の回帰）', () => {
  it('step=1 の整数フィールドでは小数を丸める（年数の表示/計算の不整合を防ぐ）', () => {
    expect(snapToStep(2.5, 1, 40, 1)).toBe(3);
    expect(snapToStep(2.4, 1, 40, 1)).toBe(2);
    expect(snapToStep(10, 1, 40, 1)).toBe(10);
  });
  it('粗い step の連続量フィールドでは入力値を書き換えない', () => {
    expect(snapToStep(100, 1, 500, 5)).toBe(100); // DcfSim 初年度FCF（初期値100が101にならない）
    expect(snapToStep(60, 7, 365, 7)).toBe(60); // OptionSim 満期まで（60が63にならない）
    expect(snapToStep(1000000, 100, 100000000, 100000)).toBe(1000000); // SupplySim 価格
    expect(snapToStep(1, 0.1, 10000, 0.5)).toBe(1); // AmmSim 投入量（1が1.1にならない）
    expect(snapToStep(0.03, -0.5, 0.5, 0.01)).toBeCloseTo(0.03, 10);
  });
  it('範囲外は min/max に収める', () => {
    expect(snapToStep(999, 1, 40, 1)).toBe(40);
    expect(snapToStep(-5, 0, 100, 5)).toBe(0);
  });
});

import { createElement, useState, act } from 'react';
import { createRoot } from 'react-dom/client';
import { NumField, parseDraft } from '../src/components/NumField';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** 1文字ずつのキー入力を再現する（監査ラウンド2 P1-1 の回帰: fill() による一括設定では検出できなかった） */
function mount(min: number, max: number, step: number, initial: number) {
  const host = document.createElement('div'); document.body.appendChild(host);
  const seen: number[] = [];
  function Harness() {
    const [v, setV] = useState(initial);
    return createElement(NumField, { label: 'テスト', value: v, set: (x: number) => { seen.push(x); setV(x); }, min, max, step });
  }
  const root = createRoot(host);
  act(() => root.render(createElement(Harness)));
  const input = host.querySelector('input[type="number"]') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  const type = (text: string) => {
    act(() => { setter.call(input, ''); input.dispatchEvent(new Event('input', { bubbles: true })); });
    let cur = '';
    for (const ch of text) {
      cur += ch;
      act(() => { setter.call(input, cur); input.dispatchEvent(new Event('input', { bubbles: true })); });
    }
  };
  const blur = () => act(() => { input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  return { input, type, blur, seen, host, unmount: () => act(() => root.unmount()) };
}

describe('NumField のキー入力（監査ラウンド2 P1-1）', () => {
  it('最小値より小さい先頭桁を経由する値（WACC 12%、min 3）を正しく入力できる', () => {
    const f = mount(3, 15, 0.5, 8);
    f.type('12'); f.blur();
    expect(f.input.value).toBe('12');
    expect(f.seen.at(-1)).toBe(12);
    expect(f.seen.every(x => x >= 3 && x <= 15)).toBe(true); // 計算層には範囲内の値だけが渡る
    f.unmount();
  });
  it('参入価格 50,000円（min 1,000）を1文字ずつ入力できる', () => {
    const f = mount(1000, 1000000, 1000, 100000);
    f.type('50000'); f.blur();
    expect(f.input.value).toBe('50000');
    expect(f.seen.at(-1)).toBe(50000);
    f.unmount();
  });
  it('範囲外の入力は入力中は保持し範囲を示し、確定時に範囲へ収める', () => {
    const f = mount(3, 15, 0.5, 8);
    f.type('40');
    expect(f.input.value).toBe('40');
    expect(f.host.textContent).toContain('範囲');
    f.blur();
    expect(f.input.value).toBe('15');
    f.unmount();
  });
  it('小数点の入力途中（「2.」）で文字が消えない', () => {
    const f = mount(0, 10, 0.25, 5);
    f.type('2.5'); f.blur();
    expect(f.input.value).toBe('2.5');
    f.unmount();
  });
  it('parseDraft は範囲外・空欄・非数を null にする', () => {
    expect(parseDraft('', 0, 10, 1)).toBeNull();
    expect(parseDraft('-', 0, 10, 1)).toBeNull();
    expect(parseDraft('11', 0, 10, 1)).toBeNull();
    expect(parseDraft('2.6', 0, 10, 1)).toBe(3);
    expect(parseDraft('2.6', 0, 10, 0.1)).toBe(2.6);
  });
});
