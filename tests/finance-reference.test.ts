import { describe, it, expect } from 'vitest';
import * as F from '../src/finance/core';

const close = (a: number, b: number, tol = 1e-4) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe('独立参照値との照合（Pythonで別途計算）', () => {
  it('債券価格とデュレーション', () => {
    close(F.bondPrice(100, 0.02, 0.01, 5), 104.853431);
    close(F.macaulayDuration(100, 0.02, 0.01, 5), 4.813007);
    close(F.modifiedDuration(100, 0.02, 0.01, 5), 4.765353);
  });
  it('DCF', () => { close(F.dcfValue([100, 110, 121], 0.10, 0.03), 1610.38961, 1e-3); });
  it('Black-Scholes', () => {
    const c = F.blackScholes({ spot: 100, strike: 100, rate: 0.01, vol: 0.2, years: 1, type: 'call' });
    close(c.price, 8.433319, 1e-3); close(c.delta, 0.559618, 1e-3); close(c.gamma, 0.01972397, 1e-5);
    const p = F.blackScholes({ spot: 100, strike: 100, rate: 0.01, vol: 0.2, years: 1, type: 'put' });
    close(p.price, 7.438302, 1e-3);
    // プット・コール・パリティ
    close(c.price - p.price, 100 - 100 * Math.exp(-0.01), 1e-6);
  });
  it('AMM', () => {
    const r = F.ammSwap(100, 100, 10, 0.003);
    close(r.amountOut, 9.066109); close(r.priceImpact, 0.093389); close(r.newPrice, 0.826672);
  });
  it('積立系列', () => {
    const s1 = F.accumulationSeries({ initial: 0, monthly: 10000, annualReturn: 0.05, years: 1 });
    close(s1[1]!.nominal, 122725.7753, 0.01);
    const s2 = F.accumulationSeries({ initial: 100000, monthly: 5000, annualReturn: 0.06, years: 2, annualFeeRate: 0.01, inflation: 0.02 });
    close(s2[2]!.nominal, 235170.8726, 0.01); close(s2[2]!.real, 226038.901, 0.01);
  });
  it('その他', () => {
    close(F.impermanentLoss(4), -0.2);
    expect(F.monthsToGoal(0, 10000, 0.05, 1000000)).toBe(85);
    close(F.liquidationPriceLong(100, 10, 0.005), 90.5);
    close(F.stakingEffectiveAnnual(0.05, 12, 0.01, 0.5), 0.046162, 1e-5);
    close(F.irr([-1000, 300, 400, 500]), 0.08896339, 1e-6);
  });
  it('VaR/CVaR（規約の確認）', () => {
    const rets = [-0.09, -0.07, -0.05, -0.04, -0.03, -0.02, -0.01, 0, 0.005, 0.01, 0.015, 0.02, 0.025, 0.03, 0.035, 0.04, 0.045, 0.05, 0.06, 0.08];
    const v = F.valueAtRisk(rets, 0.95);
    close(v.var, 0.09); close(v.cvar, 0.09);
  });
  it('モンテカルロ: sigma=0 では決定論と一致', () => {
    const r = F.monteCarloWithdrawal({ initial: 1000, annualWithdrawal: 50, years: 10, mu: 0.05, sigma: 0, trials: 200, seed: 42 });
    let bal = 1000; for (let y = 0; y < 10; y++) bal = bal * 1.05 - 50;
    close(r.p50, bal, 1e-6); expect(r.ruinProbability).toBe(0);
  });
  it('モンテカルロ: 再現性（同シード同結果）', () => {
    const a = F.monteCarloWithdrawal({ initial: 1000, annualWithdrawal: 60, years: 20, mu: 0.05, sigma: 0.18, trials: 500, seed: 7 });
    const b = F.monteCarloWithdrawal({ initial: 1000, annualWithdrawal: 60, years: 20, mu: 0.05, sigma: 0.18, trials: 500, seed: 7 });
    expect(a.p50).toBe(b.p50); expect(a.ruinProbability).toBe(b.ruinProbability);
    expect(a.p10).toBeLessThanOrEqual(a.p50); expect(a.p50).toBeLessThanOrEqual(a.p90);
  });
});
