import { describe, it, expect } from 'vitest';
import * as F from '../src/finance/core';

const close = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
const noCost = { fee: 0, spread: 0, slippage: 0 };

describe('バックテスト（監査ラウンド2 P1-4）', () => {
  it('買い持ち・費用なし: 翌日終値で約定するため最終資産 = 初期資金 × 最終価格 ÷ 2日目価格', () => {
    const p = [100, 110, 99, 121];
    const r = F.runBacktest(p, F.buyAndHold, noCost, 1000);
    close(r.equity.at(-1)!, 1000 * 121 / 110);
    expect(r.trades).toBe(1);
  });
  it('買い持ち・片道費用 u: 最終資産 = 初期資金 × 最終価格 ÷ (2日目価格 × (1+u))', () => {
    const p = [100, 110, 99, 121];
    const costs = { fee: 0.001, spread: 0.002, slippage: 0.0005 }; // u = 0.001 + 0.001 + 0.0005 = 0.0025
    const r = F.runBacktest(p, F.buyAndHold, costs, 1000);
    close(r.equity.at(-1)!, 1000 * 121 / (110 * 1.0025), 1e-9);
    close(r.totalCost, (1000 / (110 * 1.0025)) * 110 * 0.0025, 1e-9);
  });
  it('費用ありでも約定直後のウェイトは目標どおり（買い・売りの両方向）', () => {
    const costs = { fee: 0.002, spread: 0.004, slippage: 0.001 };
    let step = 0;
    const strat: F.Strategy = () => [0.5, 0.8, 0.2][step++] ?? null;
    const p = [100, 100, 100, 100, 100];
    const weights: number[] = [];
    const seen = F.runBacktest(p, (h, w) => { if (h.length > 1) weights.push(w); return strat(h, w); }, costs, 1000);
    close(weights[0]!, 0.5, 1e-12); close(weights[1]!, 0.8, 1e-12); close(weights[2]!, 0.2, 1e-12);
    expect(seen.trades).toBe(3);
  });
  it('構造的な先読み防止: 時点kより後の価格を書き換えても、kまでの資産推移は変わらない', () => {
    const { prices } = F.generatePriceSeries({ days: 300, annualDrift: 0.05, annualVol: 0.3, seed: 3 });
    const k = 150;
    const altered = prices.map((x, i) => (i > k ? x * (i % 2 ? 3 : 0.2) : x));
    const strat = F.smaCross(5, 20);
    const a = F.runBacktest(prices, strat, noCost).equity.slice(0, k + 1);
    const b = F.runBacktest(altered, strat, noCost).equity.slice(0, k + 1);
    expect(b).toEqual(a);
  });
  it('戦略に渡される履歴は常に当日までで、未来の点を含まない', () => {
    const p = [1, 2, 3, 4, 5, 6];
    const seen: number[] = [];
    F.runBacktest(p, h => { seen.push(h.length); expect(h.at(-1)).toBe(p[h.length - 1]); return 1; }, noCost);
    expect(seen).toEqual([1, 2, 3, 4, 5]);
  });
  it('SMAクロス（手計算）: 短期2・長期3。t=2で SMA2=2.5 > SMA3=2 → 翌日から保有', () => {
    const p = [1, 2, 3, 6, 6];
    const r = F.runBacktest(p, F.smaCross(2, 3), noCost, 100);
    // t=0,1: 履歴不足でウェイト0。t=2 の判断で t=3 の価格6で全額購入 → t=4 も6 → 最終100
    close(r.equity.at(-1)!, 100);
    expect(r.trades).toBe(1);
  });
  it('取引停止日には約定しない', () => {
    const p = [100, 50, 50, 100];
    const halted = [false, true, false, false];
    const r = F.runBacktest(p, F.buyAndHold, noCost, 1000, halted);
    // t=0 の判断は停止中の t=1 で約定できず、t=1 の判断を t=2（50）で約定 → 最終 2000
    close(r.equity.at(-1)!, 2000);
  });
  it('summarizeEquity: 総リターン・最大ドローダウン', () => {
    const s = F.summarizeEquity([100, 120, 90, 108], 3);
    close(s.totalReturn, 0.08);
    close(s.maxDrawdown, 90 / 120 - 1);
    close(s.cagr, 0.08); // 3期間＝1年
  });
  it('generatePriceSeries は同一シードで同一、ドリフト0・ボラ0なら一定', () => {
    expect(F.generatePriceSeries({ days: 50, annualDrift: 0.1, annualVol: 0.2, seed: 9 }).prices)
      .toEqual(F.generatePriceSeries({ days: 50, annualDrift: 0.1, annualVol: 0.2, seed: 9 }).prices);
    const flat = F.generatePriceSeries({ days: 20, annualDrift: 0, annualVol: 0, seed: 1 }).prices;
    for (const x of flat) close(x, 100);
  });
  it('過剰最適化の総当たり: 前半最良の組合せが選ばれ、後半成績も返る', () => {
    const { prices } = F.generatePriceSeries({ days: 1000, annualDrift: 0.05, annualVol: 0.25, seed: 11 });
    const g = F.smaGridSearch(prices, 600, noCost, [5, 10, 20], [50, 100]);
    expect(g.trials.length).toBe(6);
    expect(g.trials.every(t => t.inSample <= g.best.inSample)).toBe(true);
    close(g.holdOut, prices.at(-1)! / prices[600]! - 1);
  });
  it('サバイバーシップ: 生存銘柄だけの平均は全銘柄平均以上になる（廃止銘柄の損失を除外するため）', () => {
    const d = F.survivorshipDemo(30, { days: 500, annualDrift: 0.03, annualVol: 0.5 }, 5);
    expect(d.delisted).toBeGreaterThan(0);
    expect(d.meanSurvivors).toBeGreaterThan(d.meanAll);
  });
});

describe('ソルティノレシオ（標準定義）・VaR分位（監査ラウンド2 P3）', () => {
  it('下方偏差は全期間数で割る: [0.02,−0.01,0.03,−0.02] → 0.005 / √(0.0005/4)', () => {
    close(F.sortinoRatio([0.02, -0.01, 0.03, -0.02]), 0.005 / Math.sqrt(0.0005 / 4), 1e-12);
  });
  it('信頼水準90%・100観測で分位位置は10番目（浮動小数点誤差で9番目にならない）', () => {
    const rets = Array.from({ length: 100 }, (_, i) => -(100 - i) / 1000); // -0.100, -0.099, ... -0.001
    const v = F.valueAtRisk(rets, 0.9);
    close(v.var, 0.091);
  });
});

describe('シミュレーター補助関数（監査ラウンド2）', () => {
  it('NISA比較: 枠内なら NISA 側は非課税の積立残高と一致し、差は利益×税率', () => {
    const r = F.nisaComparison({ monthly: 50000, annualReturn: 0.05, years: 20, annualFeeRate: 0.001, taxRate: 0.20315, annualCap: 3_600_000, lifetimeCap: 18_000_000 });
    const acc = F.accumulationSeries({ initial: 0, monthly: 50000, annualReturn: 0.05, years: 20, annualFeeRate: 0.001 }).at(-1)!;
    close(r.withNisa, acc.nominal, 1e-6);
    close(r.diff, (acc.nominal - acc.contributed) * 0.20315, 1e-6);
    expect(r.overflowContrib).toBe(0);
  });
  it('NISA比較: 月30万円×40年では生涯枠1,800万円を超えた分が課税口座へ回る', () => {
    const r = F.nisaComparison({ monthly: 300000, annualReturn: 0.05, years: 40, annualFeeRate: 0, taxRate: 0.20315, annualCap: 3_600_000, lifetimeCap: 18_000_000 });
    expect(r.nisaContrib).toBe(18_000_000);
    expect(r.overflowContrib).toBe(300000 * 480 - 18_000_000);
  });
  it('NISA比較: 年間枠（月30万円相当）を超える月額は超過分が課税口座へ', () => {
    const r = F.nisaComparison({ monthly: 400000, annualReturn: 0, years: 1, annualFeeRate: 0, taxRate: 0.2, annualCap: 3_600_000, lifetimeCap: 18_000_000 });
    expect(r.nisaContrib).toBe(3_600_000);
    expect(r.overflowContrib).toBe(1_200_000);
  });
  it('2資産の最小分散ウェイト（σ1=18%, σ2=5%, ρ=0.2）', () => {
    const w = F.minVarianceWeight2(0.18, 0.05, 0.2);
    close(w, (0.0025 - 0.2 * 0.18 * 0.05) / (0.0324 + 0.0025 - 2 * 0.2 * 0.18 * 0.05), 1e-12);
  });
  it('AMM: 手数料を除く価格インパクトは 投入量÷(準備量＋投入量)', () => {
    const r = F.ammSwap(100, 100, 10, 0.003);
    close(r.pureImpact, 10 / 110, 1e-12);
    expect(r.priceImpact).toBeGreaterThan(r.pureImpact);
  });
});
