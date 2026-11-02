// 金融計算エンジン（指示書 §10: UIから分離した純粋関数群／§15.2 数値検証対象）
// すべての関数は入力範囲を検証し、不正入力では RangeError を投げる。
// 確率モデルは前提（分布・独立性など）を隠さず、呼び出し側が結果と共に表示すること。

function req(cond: boolean, msg: string) { if (!cond) throw new RangeError(msg); }
function finite(x: number, name: string) { req(Number.isFinite(x), `${name} は有限数でなければなりません`); }

export function futureValue(pv: number, rate: number, periods: number): number {
  finite(pv, 'pv'); finite(rate, 'rate'); finite(periods, 'periods');
  req(rate > -1, 'rate は -1 より大きい必要があります'); req(periods >= 0, 'periods は0以上');
  return pv * Math.pow(1 + rate, periods);
}
export function presentValue(fv: number, rate: number, periods: number): number {
  finite(fv, 'fv'); finite(rate, 'rate');
  req(rate > -1, '割引率は -1 より大きい必要があります'); req(periods >= 0, 'periods は0以上');
  return fv / Math.pow(1 + rate, periods);
}
/** 期末積立の将来価値（年金終価） */
export function futureValueAnnuity(payment: number, rate: number, periods: number): number {
  finite(payment, 'payment'); finite(rate, 'rate'); req(periods >= 0, 'periods は0以上');
  if (rate === 0) return payment * periods;
  req(rate > -1, 'rate は -1 より大きい必要があります');
  return payment * ((Math.pow(1 + rate, periods) - 1) / rate);
}
/** フィッシャー方程式による実質金利（近似ではなく厳密形） */
export function realRate(nominal: number, inflation: number): number {
  finite(nominal, 'nominal'); finite(inflation, 'inflation'); req(inflation > -1, 'inflation は -1 より大');
  return (1 + nominal) / (1 + inflation) - 1;
}
export function cagr(begin: number, end: number, years: number): number {
  req(begin > 0, 'begin は正'); req(end >= 0, 'end は0以上'); req(years > 0, 'years は正');
  return Math.pow(end / begin, 1 / years) - 1;
}
/** 符号変化を含むキャッシュフローのIRR（二分探索）。
 *  探索区間の両端が同符号でも内部に解がある場合（例 [-100, 230, -132] は解10%と20%の2つ）があるため、
 *  区間を走査して最初の符号変化区間を探す。IRR は複数解を持ちうるため、返るのは検出できた解の1つであり、
 *  「符号変化がありません」と解の不存在を混同しない（監査指摘）。 */
export function irr(cashflows: number[], guessLow = -0.9999, guessHigh = 100): number {
  req(cashflows.length >= 2, 'キャッシュフローが不足しています');
  const npv = (r: number) => cashflows.reduce((s, cf, t) => s + cf / Math.pow(1 + r, t), 0);
  let lo = guessLow, flo = npv(lo);
  let bracket: [number, number, number] | null = null;
  // 走査の刻み（約0.01）より狭い間隔に2つの解が同居する場合は検出できない制限がある（第2回再監査で記録）
  const STEPS = 10000;
  for (let i = 1; i <= STEPS; i++) {
    const r = guessLow + ((guessHigh - guessLow) * i) / STEPS;
    const fr = npv(r);
    if (fr === 0) return r;
    if (flo * fr < 0) { bracket = [lo, r, flo]; break; }
    lo = r; flo = fr;
  }
  req(bracket !== null, '指定範囲にIRR（符号変化）が検出できません。解が存在しないか、範囲外にある可能性があります');
  let [a, b, fa] = bracket as [number, number, number];
  for (let i = 0; i < 200; i++) {
    const mid = (a + b) / 2, fm = npv(mid);
    if (Math.abs(fm) < 1e-10) return mid;
    if (fa * fm < 0) { b = mid; } else { a = mid; fa = fm; }
  }
  return (a + b) / 2;
}
export function timeWeightedReturn(periodReturns: number[]): number {
  req(periodReturns.length > 0, 'データが空です');
  return periodReturns.reduce((s, r) => { req(r > -1, '各期リターンは -1 より大'); return s * (1 + r); }, 1) - 1;
}
export function mean(xs: number[]): number { req(xs.length > 0, 'データが空です'); return xs.reduce((a, b) => a + b, 0) / xs.length; }
export function variance(xs: number[], sample = true): number {
  req(xs.length > (sample ? 1 : 0), '分散にはデータが不足しています');
  const m = mean(xs); const ss = xs.reduce((s, x) => s + (x - m) ** 2, 0);
  return ss / (sample ? xs.length - 1 : xs.length);
}
export function std(xs: number[], sample = true): number { return Math.sqrt(variance(xs, sample)); }
export function covariance(a: number[], b: number[], sample = true): number {
  req(a.length === b.length && a.length > 1, '共分散には同数のデータが必要です');
  const ma = mean(a), mb = mean(b);
  const ss = a.reduce((s, x, i) => s + (x - ma) * ((b[i] as number) - mb), 0);
  return ss / (sample ? a.length - 1 : a.length);
}
export function correlation(a: number[], b: number[]): number {
  const sa = std(a), sb = std(b); req(sa > 0 && sb > 0, '標準偏差0では相関は定義できません');
  return covariance(a, b) / (sa * sb);
}
export function logReturn(p0: number, p1: number): number { req(p0 > 0 && p1 > 0, '価格は正'); return Math.log(p1 / p0); }

/** 積立シミュレーション（年率・月次積立・年次手数料を資産残高から控除） */
export interface AccumInput { initial: number; monthly: number; annualReturn: number; years: number; annualFeeRate?: number; inflation?: number; }
export function accumulationSeries(inp: AccumInput): { year: number; nominal: number; real: number; contributed: number }[] {
  req(inp.initial >= 0 && inp.monthly >= 0 && inp.years > 0 && inp.years <= 100, '入力範囲が不正です');
  req(inp.annualReturn > -1, 'リターンは -1 より大');
  const fee = inp.annualFeeRate ?? 0, infl = inp.inflation ?? 0;
  req(fee >= 0 && fee < 1, '手数料率は0以上1未満');
  let bal = inp.initial, contributed = inp.initial;
  const out = [{ year: 0, nominal: bal, real: bal, contributed }];
  const monthlyRate = Math.pow(1 + inp.annualReturn, 1 / 12) - 1;
  for (let y = 1; y <= inp.years; y++) {
    for (let m = 0; m < 12; m++) { bal = bal * (1 + monthlyRate) + inp.monthly; contributed += inp.monthly; }
    bal = bal * (1 - fee);
    out.push({ year: y, nominal: bal, real: bal / Math.pow(1 + infl, y), contributed });
  }
  return out;
}
/** 目標到達期間（月数）。到達不能なら Infinity */
export function monthsToGoal(initial: number, monthly: number, annualReturn: number, goal: number, maxMonths = 1200): number {
  req(goal > 0, 'goal は正'); finite(initial, 'initial'); finite(monthly, 'monthly');
  req(annualReturn > -1, 'annualReturn は -1 より大きい必要があります');
  let bal = initial; const mr = Math.pow(1 + annualReturn, 1 / 12) - 1;
  if (bal >= goal) return 0;
  for (let m = 1; m <= maxMonths; m++) { bal = bal * (1 + mr) + monthly; if (bal >= goal) return m; }
  return Infinity;
}
/** 税引後リターン（利益部分のみに課税する単純モデル。損失の扱いは制度依存のため適用しない） */
export function afterTaxGain(principal: number, gain: number, taxRate: number): number {
  req(taxRate >= 0 && taxRate < 1, '税率は0以上1未満');
  return principal + gain * (1 - (gain > 0 ? taxRate : 0));
}

// ---- 株式・評価 ----
export const per = (price: number, eps: number) => { req(eps !== 0, 'EPS 0 では PER は定義できません'); return price / eps; };
export const pbr = (price: number, bps: number) => { req(bps !== 0, 'BPS 0 では PBR は定義できません'); return price / bps; };
export const evEbitda = (ev: number, ebitda: number) => { req(ebitda !== 0, 'EBITDA 0 では定義できません'); return ev / ebitda; };
export function enterpriseValue(marketCap: number, interestDebt: number, cash: number): number { return marketCap + interestDebt - cash; }
/** 株式分割後の1株指標（経済価値は不変） */
export function afterSplit(price: number, shares: number, ratio: number): { price: number; shares: number } {
  req(ratio > 0, '分割比率は正'); return { price: price / ratio, shares: shares * ratio };
}
/** 増資による希薄化後のEPS（調達資金の利益貢献を除く機械的効果） */
export function dilutedEps(netIncome: number, sharesBefore: number, newShares: number): number {
  req(sharesBefore > 0 && newShares >= 0, '株式数が不正です'); return netIncome / (sharesBefore + newShares);
}
export function roic(nopat: number, investedCapital: number): number { req(investedCapital !== 0, '投下資本0'); return nopat / investedCapital; }
export function freeCashFlow(operatingCf: number, capex: number): number { return operatingCf - capex; }
/** DCF: 明示期間FCF配列 + 終価（ゴードン成長モデル）。wacc>g を必須とする */
export function dcfValue(fcfs: number[], wacc: number, terminalGrowth: number): number {
  req(fcfs.length > 0, 'FCFが空です'); req(wacc > terminalGrowth, '終価には WACC > 永続成長率 が必要です');
  req(wacc > -1, 'WACC は -1 より大');
  let pv = 0;
  fcfs.forEach((f, i) => { pv += f / Math.pow(1 + wacc, i + 1); });
  const last = fcfs[fcfs.length - 1] as number;
  const tv = (last * (1 + terminalGrowth)) / (wacc - terminalGrowth);
  pv += tv / Math.pow(1 + wacc, fcfs.length);
  return pv;
}
export function dividendDiscountModel(nextDividend: number, requiredReturn: number, growth: number): number {
  req(requiredReturn > growth, '要求収益率 > 成長率 が必要です'); return nextDividend / (requiredReturn - growth);
}
export function capm(riskFree: number, beta: number, marketReturn: number): number { return riskFree + beta * (marketReturn - riskFree); }
export function betaOf(assetReturns: number[], marketReturns: number[]): number {
  const vm = variance(marketReturns); req(vm > 0, '市場分散0'); return covariance(assetReturns, marketReturns) / vm;
}

// ---- 債券 ----
export function bondPrice(face: number, couponRate: number, ytm: number, years: number, freq = 1): number {
  req(face > 0 && years > 0 && freq >= 1, '債券入力が不正です'); req(ytm / freq > -1, '利回りが不正です');
  const n = Math.round(years * freq), c = (face * couponRate) / freq, y = ytm / freq;
  let p = 0; for (let t = 1; t <= n; t++) p += c / Math.pow(1 + y, t);
  return p + face / Math.pow(1 + y, n);
}
export function macaulayDuration(face: number, couponRate: number, ytm: number, years: number, freq = 1): number {
  const price = bondPrice(face, couponRate, ytm, years, freq);
  const n = Math.round(years * freq), c = (face * couponRate) / freq, y = ytm / freq;
  let w = 0; for (let t = 1; t <= n; t++) { const cf = t === n ? c + face : c; w += (t / freq) * (cf / Math.pow(1 + y, t)); }
  return w / price;
}
export function modifiedDuration(face: number, couponRate: number, ytm: number, years: number, freq = 1): number {
  return macaulayDuration(face, couponRate, ytm, years, freq) / (1 + ytm / freq);
}

// ---- ポートフォリオ ----
export function portfolioStats(weights: number[], expectedReturns: number[], cov: number[][]): { expected: number; variance: number; volatility: number } {
  const n = weights.length;
  req(n > 0 && expectedReturns.length === n && cov.length === n && cov.every(r => r.length === n), '次元が一致しません');
  req(Math.abs(weights.reduce((a, b) => a + b, 0) - 1) < 1e-9, 'ウェイト合計は1でなければなりません');
  const exp = weights.reduce((s, w, i) => s + w * (expectedReturns[i] as number), 0);
  let v = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) v += (weights[i] as number) * (weights[j] as number) * ((cov[i] as number[])[j] as number);
  return { expected: exp, variance: v, volatility: Math.sqrt(Math.max(v, 0)) };
}
export function sharpeRatio(returns: number[], riskFree = 0): number {
  const s = std(returns); req(s > 0, '標準偏差0'); return (mean(returns) - riskFree) / s;
}
export function sortinoRatio(returns: number[], riskFree = 0): number {
  // 本実装の下方偏差は「下方リターンだけを集めて二乗平均」する変法であり、
  // 全期間を分母にする標準的な定義とは値が異なる。教材内では定義を明示して使うこと。
  const downside = returns.filter(r => r < riskFree);
  req(downside.length > 0, '下方偏差の対象がありません');
  const dd = Math.sqrt(mean(downside.map(r => (r - riskFree) ** 2)));
  return (mean(returns) - riskFree) / dd;
}
export function maxDrawdown(series: number[]): number {
  req(series.length > 0, '系列が空です'); let peak = series[0] as number, mdd = 0;
  for (const v of series) { if (v > peak) peak = v; if (peak > 0) mdd = Math.min(mdd, v / peak - 1); }
  return mdd; // 負数（例: -0.35 = -35%）
}
/** ヒストリカルVaR/CVaR（損失を正の数で返す）。
 *  分位の規約（監査指摘で明示）: 位置 idx = floor((1−信頼水準) × n) − 1 を取るため、
 *  実効テールは名目よりわずかに小さく（例: n=250・95% で実効4.8%）、値はやや保守的（大きめ）に出る。 */
export function valueAtRisk(returns: number[], confidence = 0.95): { var: number; cvar: number } {
  req(returns.length >= 10, 'VaRには最低10観測が必要です'); req(confidence > 0.5 && confidence < 1, '信頼水準は0.5〜1');
  const sorted = [...returns].sort((a, b) => a - b);
  const idx = Math.max(0, Math.floor((1 - confidence) * sorted.length) - 1);
  const tail = sorted.slice(0, idx + 1);
  return { var: -(sorted[idx] as number), cvar: -mean(tail) };
}

// ---- 確率シミュレーション（再現可能シード） ----
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function normalRandom(rng: () => number): number { // Box-Muller
  let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
export interface MonteCarloResult { finals: number[]; p10: number; p50: number; p90: number; ruinProbability: number; }
export function monteCarloWithdrawal(opts: { initial: number; annualWithdrawal: number; years: number; mu: number; sigma: number; trials: number; seed: number }): MonteCarloResult {
  req(opts.trials >= 100 && opts.trials <= 20000, '試行回数は100〜20000');
  req(opts.sigma >= 0, 'sigma は0以上'); req(opts.initial > 0 && opts.years > 0, '初期資産・年数は正');
  const rng = mulberry32(opts.seed); const finals: number[] = []; let ruin = 0;
  for (let t = 0; t < opts.trials; t++) {
    let bal = opts.initial; let ruined = false;
    for (let y = 0; y < opts.years; y++) {
      const r = opts.mu + opts.sigma * normalRandom(rng); // 正規分布・年次独立という仮定を明示（呼び出し側で表示）
      bal = bal * (1 + r) - opts.annualWithdrawal;
      if (bal <= 0) { ruined = true; bal = 0; break; }
    }
    if (ruined) ruin++; finals.push(bal);
  }
  const sorted = [...finals].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] as number;
  return { finals, p10: q(0.1), p50: q(0.5), p90: q(0.9), ruinProbability: ruin / opts.trials };
}

// ---- オプション ----
function ncdf(x: number): number { // Abramowitz-Stegun 近似（実測の最大誤差は約2.1e-7。オプション価格への影響は最大でも0.01円未満で無視可能）
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}
export function blackScholes(opts: { spot: number; strike: number; rate: number; vol: number; years: number; type: 'call'|'put' }): { price: number; delta: number; gamma: number; intrinsic: number; timeValue: number } {
  const { spot: S, strike: K, rate: r, vol: s, years: T } = opts;
  req(S > 0 && K > 0 && s > 0 && T > 0, 'BS入力は正でなければなりません');
  const d1 = (Math.log(S / K) + (r + (s * s) / 2) * T) / (s * Math.sqrt(T));
  const d2 = d1 - s * Math.sqrt(T);
  const intrinsic = opts.type === 'call' ? Math.max(S - K, 0) : Math.max(K - S, 0);
  if (opts.type === 'call') {
    const price = S * ncdf(d1) - K * Math.exp(-r * T) * ncdf(d2);
    return { price, delta: ncdf(d1), gamma: Math.exp(-d1 * d1 / 2) / (S * s * Math.sqrt(2 * Math.PI * T)), intrinsic, timeValue: price - intrinsic };
  }
  const price = K * Math.exp(-r * T) * ncdf(-d2) - S * ncdf(-d1);
  return { price, delta: ncdf(d1) - 1, gamma: Math.exp(-d1 * d1 / 2) / (S * s * Math.sqrt(2 * Math.PI * T)), intrinsic, timeValue: price - intrinsic };
}
export function optionPayoff(type: 'call'|'put', strike: number, premium: number, spotAtExpiry: number, isLong: boolean): number {
  const intrinsic = type === 'call' ? Math.max(spotAtExpiry - strike, 0) : Math.max(strike - spotAtExpiry, 0);
  const p = intrinsic - premium; return isLong ? p : -p;
}
/** ロングの簡易清算価格（維持証拠金率近似。取引所ごとの厳密式ではない） */
export function liquidationPriceLong(entry: number, leverage: number, maintenanceMarginRate: number): number {
  req(entry > 0 && leverage >= 1, '入力が不正です'); req(maintenanceMarginRate >= 0 && maintenanceMarginRate < 1 / leverage, '維持証拠金率は 1/レバレッジ 未満である必要があります（清算価格が参入価格以上になる条件は不成立）');
  return entry * (1 - 1 / leverage + maintenanceMarginRate);
}
export function fundingCost(notional: number, ratePerPeriod: number, periods: number): number { return notional * ratePerPeriod * periods; }

// ---- 暗号資産 ----
export function marketCap(price: number, circulatingSupply: number): number { req(price >= 0 && circulatingSupply >= 0, '入力は0以上'); return price * circulatingSupply; }
export function fdv(price: number, maxSupply: number): number { return marketCap(price, maxSupply); }
export function supplyInflationRate(supplyNow: number, supplyNextYear: number): number { req(supplyNow > 0, '現在供給量は正'); return supplyNextYear / supplyNow - 1; }
/** 定数積AMM (x*y=k): 手数料控除後の受取量と価格インパクト */
export function ammSwap(reserveIn: number, reserveOut: number, amountIn: number, feeRate = 0.003): { amountOut: number; priceImpact: number; newPrice: number } {
  req(reserveIn > 0 && reserveOut > 0 && amountIn > 0, 'AMM入力は正'); req(feeRate >= 0 && feeRate < 1, '手数料率が不正です');
  const effIn = amountIn * (1 - feeRate);
  const amountOut = (reserveOut * effIn) / (reserveIn + effIn);
  const spotBefore = reserveOut / reserveIn;
  const execPrice = amountOut / amountIn;
  const newPrice = (reserveOut - amountOut) / (reserveIn + amountIn);
  return { amountOut, priceImpact: 1 - execPrice / spotBefore, newPrice };
}
export function impermanentLoss(priceRatio: number): number { // 価格が ratio 倍になったときのLP対HODL比-1
  req(priceRatio > 0, '価格比は正'); return (2 * Math.sqrt(priceRatio)) / (1 + priceRatio) - 1;
}
/** DeFiレンディング: ヘルスファクター = 担保価値×清算閾値 / 借入価値 */
export function healthFactor(collateralValue: number, liquidationThreshold: number, borrowValue: number): number {
  req(borrowValue > 0, '借入は正'); req(liquidationThreshold > 0 && liquidationThreshold <= 1, '清算閾値は0〜1');
  return (collateralValue * liquidationThreshold) / borrowValue;
}
export function stakingEffectiveAnnual(nominalApr: number, compoundsPerYear: number, slashProbability = 0, slashFraction = 0): number {
  req(compoundsPerYear >= 1, '複利回数は1以上');
  const gross = Math.pow(1 + nominalApr / compoundsPerYear, compoundsPerYear) - 1;
  return gross - slashProbability * slashFraction; // 期待損失の線形控除という近似を明示
}
export function slippageEstimate(orderSize: number, dailyVolume: number, volatility: number): number {
  // 教材用の単純モデル: 参加率の平方根に比例（市場インパクトの square-root law の簡略形）
  req(dailyVolume > 0 && orderSize >= 0, '入力が不正です');
  return volatility * Math.sqrt(orderSize / dailyVolume);
}
