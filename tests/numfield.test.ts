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
