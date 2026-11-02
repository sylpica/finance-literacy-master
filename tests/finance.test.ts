import { describe, it, expect } from 'vitest';
import * as F from '../src/finance/core';

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('時間価値', () => {
  it('複利: 100×1.05^10', () => close(F.futureValue(100, 0.05, 10), 162.8894626777442, 1e-9));
  it('金利0%では元本のまま', () => close(F.futureValue(100, 0, 10), 100));
  it('現在価値は将来価値の逆演算', () => close(F.presentValue(F.futureValue(100, 0.03, 7), 0.03, 7), 100, 1e-9));
  it('年金終価: 12×((1.05^10−1)/0.05)', () => close(F.futureValueAnnuity(12, 0.05, 10), 150.934687, 1e-4));
  it('金利0%の年金終価', () => close(F.futureValueAnnuity(10, 0, 5), 50));
  it('実質金利（厳密形）', () => close(F.realRate(0.05, 0.02), 0.0294117647, 1e-9));
  it('CAGR: 100→121（2年）=10%', () => close(F.cagr(100, 121, 2), 0.1, 1e-12));
  it('IRR: [-100,0,121] = 10%', () => close(F.irr([-100, 0, 121]), 0.1, 1e-8));
  it('負の割引率 -1 以下は拒否', () => expect(() => F.presentValue(100, -1, 1)).toThrow());
});
describe('積立・目標・税', () => {
  it('リターン0・手数料0では元本合計と一致', () => {
    const s = F.accumulationSeries({ initial: 100, monthly: 10, annualReturn: 0, years: 1 });
    close((s[1] as (typeof s)[number]).nominal, 220); close((s[1] as (typeof s)[number]).contributed, 220);
  });
  it('目標到達: 月10・金利0で100到達は10か月', () => expect(F.monthsToGoal(0, 10, 0, 100)).toBe(10));
  it('到達不能は Infinity', () => expect(F.monthsToGoal(0, 0, 0, 100)).toBe(Infinity));
  it('税は利益にのみ掛かる', () => close(F.afterTaxGain(100, 50, 0.2), 140));
  it('損失には課税しない（簡易モデル）', () => close(F.afterTaxGain(100, -50, 0.2), 50));
});
describe('株式評価', () => {
  it('PER/PBR/EV', () => { close(F.per(2000, 100), 20); close(F.pbr(1500, 1000), 1.5); close(F.enterpriseValue(1000, 200, 100), 1100); });
  it('分割で経済価値不変', () => { const s = F.afterSplit(2000, 100, 2); close(s.price * s.shares, 2000 * 100); });
  it('希薄化EPS', () => close(F.dilutedEps(100, 100, 100), 0.5));
  it('DCF: FCF100単年・WACC10%・g0 は 1000', () => close(F.dcfValue([100], 0.1, 0), 1000, 1e-6));
  it('DCF: WACC≦g は拒否', () => expect(() => F.dcfValue([100], 0.02, 0.03)).toThrow());
  it('配当割引モデル', () => close(F.dividendDiscountModel(5, 0.08, 0.03), 100));
  it('CAPM', () => close(F.capm(0.01, 1.2, 0.07), 0.082, 1e-12));
  it('FCF', () => close(F.freeCashFlow(120, 45), 75));
});
describe('債券', () => {
  it('クーポン=利回りなら価格は額面', () => close(F.bondPrice(100, 0.05, 0.05, 10), 100, 1e-9));
  it('利回り上昇で価格下落（手計算 92.6399）', () => close(F.bondPrice(100, 0.05, 0.06, 10), 92.6399, 1e-3));
  it('ゼロクーポンのデュレーションは残存期間と一致', () => close(F.macaulayDuration(100, 0, 0.05, 10), 10, 1e-9));
});
describe('統計・ポートフォリオ', () => {
  it('相関: 完全正相関は1', () => close(F.correlation([1, 2, 3, 4], [2, 4, 6, 8]), 1, 1e-12));
  it('対数リターン', () => close(F.logReturn(100, 110), Math.log(1.1), 1e-12));
  it('2資産ポートフォリオ', () => {
    const s = F.portfolioStats([0.5, 0.5], [0.1, 0.02], [[0.04, 0], [0, 0.01]]);
    close(s.expected, 0.06); close(s.variance, 0.0125); close(s.volatility, Math.sqrt(0.0125));
  });
  it('ウェイト合計≠1は拒否', () => expect(() => F.portfolioStats([0.5, 0.4], [0.1, 0.02], [[0.04, 0], [0, 0.01]])).toThrow());
  it('シャープレシオ', () => close(F.sharpeRatio([0.02, 0.04], 0), 0.03 / Math.sqrt(0.0002), 1e-9));
  it('最大ドローダウン', () => close(F.maxDrawdown([100, 120, 90, 110]), -0.25, 1e-12));
  it('VaR/CVaR: 20観測中1件の-10%損失', () => {
    const rets = [...Array(19).fill(0.01), -0.1];
    const v = F.valueAtRisk(rets, 0.95); close(v.var, 0.1); close(v.cvar, 0.1);
  });
  it('ベータ', () => close(F.betaOf([0.02, 0.04, 0.06], [0.01, 0.02, 0.03]), 2, 1e-9));
});
describe('モンテカルロ（再現性）', () => {
  it('σ=0・μ=0 では決定的に減少する', () => {
    const r = F.monteCarloWithdrawal({ initial: 1000, annualWithdrawal: 100, years: 5, mu: 0, sigma: 0, trials: 100, seed: 1 });
    close(r.p50, 500); close(r.ruinProbability, 0);
  });
  it('同一シードで同一結果', () => {
    const a = F.monteCarloWithdrawal({ initial: 1000, annualWithdrawal: 50, years: 10, mu: 0.05, sigma: 0.15, trials: 200, seed: 42 });
    const b = F.monteCarloWithdrawal({ initial: 1000, annualWithdrawal: 50, years: 10, mu: 0.05, sigma: 0.15, trials: 200, seed: 42 });
    expect(a.finals).toEqual(b.finals);
  });
  it('枯渇する条件では枯渇確率1', () => {
    const r = F.monteCarloWithdrawal({ initial: 100, annualWithdrawal: 60, years: 5, mu: 0, sigma: 0, trials: 100, seed: 3 });
    close(r.ruinProbability, 1);
  });
});
describe('オプション・レバレッジ', () => {
  it('BSコール（教科書値 S=K=100, r=5%, σ=20%, T=1 → 10.4506）', () => {
    const bs = F.blackScholes({ spot: 100, strike: 100, rate: 0.05, vol: 0.2, years: 1, type: 'call' });
    close(bs.price, 10.4506, 1e-3); close(bs.delta, 0.6368, 1e-3);
  });
  it('プット・コールパリティ', () => {
    const c = F.blackScholes({ spot: 100, strike: 100, rate: 0.05, vol: 0.2, years: 1, type: 'call' }).price;
    const p = F.blackScholes({ spot: 100, strike: 100, rate: 0.05, vol: 0.2, years: 1, type: 'put' }).price;
    close(c - p, 100 - 100 * Math.exp(-0.05), 1e-6);
  });
  it('満期損益', () => close(F.optionPayoff('call', 100, 10, 120, true), 10));
  it('清算価格（近似式）', () => close(F.liquidationPriceLong(100, 5, 0.005), 80.5));
  it('資金調達コスト', () => close(F.fundingCost(100000, 0.0001, 30), 300));
});
describe('暗号資産モデル', () => {
  it('時価総額とFDV', () => { close(F.marketCap(100, 1000), 100000); close(F.fdv(100, 2000), 200000); });
  it('供給インフレ率', () => close(F.supplyInflationRate(100, 105), 0.05));
  it('AMM: 手数料0なら 100/100 プールに10投入で 9.0909…', () => {
    const s = F.ammSwap(100, 100, 10, 0); close(s.amountOut, 9.090909, 1e-6); close(s.priceImpact, 0.090909, 1e-6);
  });
  it('インパーマネントロス: 4倍で -20%', () => close(F.impermanentLoss(4), -0.2, 1e-12));
  it('ヘルスファクター', () => close(F.healthFactor(100, 0.8, 50), 1.6));
  it('ステーキング: APR12%月次複利の実効利回り', () => close(F.stakingEffectiveAnnual(0.12, 12, 0, 0), Math.pow(1.01, 12) - 1, 1e-12));
});

describe('監査指摘の回帰（計算系）', () => {
  it('irr: 両端同符号でも内部の解を検出する（[-100, 230, -132] の解は10%と20%）', () => {
    const r = F.irr([-100, 230, -132]);
    expect(Math.abs(r - 0.1) < 1e-6 || Math.abs(r - 0.2) < 1e-6).toBe(true);
  });
  it('irr: 解がない場合は不存在と断定しない文言で例外にする', () => {
    expect(() => F.irr([100, 100, 100])).toThrow(/検出できません/);
  });
  it('timeWeightedReturn: 空配列は例外（他関数と一貫）', () => {
    expect(() => F.timeWeightedReturn([])).toThrow();
  });
});
