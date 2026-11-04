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

/** NISAと課税口座の比較（月次積立、年末に手数料控除）。NISAの年間枠・生涯枠を超える分は課税口座で運用し、
 *  最終時点で利益に一括課税する単純化（監査ラウンド2 P2-10: 枠超過でも全額非課税として計算していた）。 */
export function nisaComparison(inp: { monthly: number; annualReturn: number; years: number; annualFeeRate: number; taxRate: number; annualCap: number; lifetimeCap: number }) {
  req(inp.monthly >= 0 && inp.years > 0 && inp.years <= 100 && inp.annualReturn > -1, '入力範囲が不正です');
  req(inp.annualFeeRate >= 0 && inp.annualFeeRate < 1 && inp.taxRate >= 0 && inp.taxRate < 1, '率が不正です');
  const mr = Math.pow(1 + inp.annualReturn, 1 / 12) - 1;
  let nisa = 0, over = 0, overBasis = 0, all = 0, basis = 0, nisaContrib = 0;
  for (let y = 0; y < inp.years; y++) {
    let yearNisa = 0;
    for (let m = 0; m < 12; m++) {
      const toNisa = Math.max(0, Math.min(inp.monthly, inp.annualCap - yearNisa, inp.lifetimeCap - nisaContrib));
      const rest = inp.monthly - toNisa;
      nisa = nisa * (1 + mr) + toNisa; over = over * (1 + mr) + rest; all = all * (1 + mr) + inp.monthly;
      yearNisa += toNisa; nisaContrib += toNisa; overBasis += rest; basis += inp.monthly;
    }
    nisa *= 1 - inp.annualFeeRate; over *= 1 - inp.annualFeeRate; all *= 1 - inp.annualFeeRate;
  }
  const withNisa = nisa + afterTaxGain(overBasis, over - overBasis, inp.taxRate);
  const taxableOnly = afterTaxGain(basis, all - basis, inp.taxRate);
  return { contributed: basis, nisaContrib, overflowContrib: overBasis, withNisa, taxableOnly, diff: withNisa - taxableOnly };
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
/** 2資産の最小分散ポートフォリオの資産1ウェイト（空売りなし: 0〜1に制限） */
export function minVarianceWeight2(s1: number, s2: number, rho: number): number {
  req(s1 > 0 && s2 > 0 && rho >= -1 && rho <= 1, '入力が不正です');
  const den = s1 * s1 + s2 * s2 - 2 * rho * s1 * s2;
  if (den <= 0) return 0.5; // s1=s2 かつ ρ=1 のときは全配分で同じ分散
  return Math.min(1, Math.max(0, (s2 * s2 - rho * s1 * s2) / den));
}
export function sharpeRatio(returns: number[], riskFree = 0): number {
  const s = std(returns); req(s > 0, '標準偏差0'); return (mean(returns) - riskFree) / s;
}
/** ソルティノレシオ（標準定義）: 下方偏差 = sqrt( Σ min(0, r−MAR)² / 全期間数 )。
 *  監査ラウンド2（P3-17）で、下方リターンだけを分母にする変法から、全期間を分母にする標準定義へ改めた。 */
export function sortinoRatio(returns: number[], riskFree = 0): number {
  req(returns.length > 0, 'データが空です');
  const dd = Math.sqrt(returns.reduce((s, r) => s + Math.min(0, r - riskFree) ** 2, 0) / returns.length);
  req(dd > 0, '下方偏差が0のためソルティノレシオは定義できません');
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
  // (1−0.9)×100 が 9.999… となり床関数で1つずれる浮動小数点誤差を、1e-9 単位の丸めで補正する（監査ラウンド2 P3-6）
  const idx = Math.max(0, Math.floor(Math.round((1 - confidence) * sorted.length * 1e9) / 1e9) - 1);
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
export function ammSwap(reserveIn: number, reserveOut: number, amountIn: number, feeRate = 0.003): { amountOut: number; priceImpact: number; pureImpact: number; newPrice: number } {
  req(reserveIn > 0 && reserveOut > 0 && amountIn > 0, 'AMM入力は正'); req(feeRate >= 0 && feeRate < 1, '手数料率が不正です');
  const effIn = amountIn * (1 - feeRate);
  const amountOut = (reserveOut * effIn) / (reserveIn + effIn);
  const spotBefore = reserveOut / reserveIn;
  const execPrice = amountOut / amountIn;
  const newPrice = (reserveOut - amountOut) / (reserveIn + amountIn);
  // pureImpact: 手数料を除いた価格インパクト（= 投入量 ÷ (準備量＋投入量)）。priceImpact は手数料込みの実効的な不利幅（監査ラウンド2 P2-9）
  return { amountOut, priceImpact: 1 - execPrice / spotBefore, pureImpact: amountIn / (reserveIn + amountIn), newPrice };
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

// ---- バックテスト（監査ラウンド2 P1-4）----
// 先読み防止を構造で保証する: 戦略関数には各時点で「その時点までの価格」の配列だけを渡し、
// 時点 t の終値までの情報で決めた目標ウェイトは、翌日（t+1）の終値で約定する（同じ足での約定を避ける）。

/** シード固定の架空日次価格系列（幾何ブラウン運動＋任意のジャンプ・急落ショック）。実在データではない。 */
export interface SeriesSpec { days: number; annualDrift: number; annualVol: number; seed: number; start?: number; jumpProb?: number; jumpSize?: number; shockDay?: number; shockDrop?: number; haltDays?: number }
export function generatePriceSeries(spec: SeriesSpec): { prices: number[]; halted: boolean[] } {
  req(Number.isInteger(spec.days) && spec.days >= 10 && spec.days <= 20000, '日数は10〜20000の整数');
  req(spec.annualVol >= 0 && spec.annualVol <= 3, 'ボラティリティは0〜300%');
  const rng = mulberry32(spec.seed);
  const dt = 1 / 252;
  const mu = spec.annualDrift, sig = spec.annualVol;
  const prices = [spec.start ?? 100];
  const halted = [false];
  for (let t = 1; t < spec.days; t++) {
    let r = (mu - 0.5 * sig * sig) * dt + sig * Math.sqrt(dt) * normalRandom(rng);
    if (spec.jumpProb && rng() < spec.jumpProb) r += (rng() < 0.5 ? -1 : 1) * (spec.jumpSize ?? 0.1);
    let p = (prices[t - 1] as number) * Math.exp(r);
    if (spec.shockDay !== undefined && t === spec.shockDay) p *= 1 - (spec.shockDrop ?? 0.3);
    prices.push(p);
    halted.push(spec.shockDay !== undefined && t >= spec.shockDay && t < spec.shockDay + (spec.haltDays ?? 0));
  }
  return { prices, halted };
}

export function sma(xs: ArrayLike<number>, n: number): number {
  req(Number.isInteger(n) && n >= 1 && xs.length >= n, '移動平均の期間が不正です');
  let s = 0; for (let i = xs.length - n; i < xs.length; i++) s += xs[i] as number;
  return s / n;
}

/** 戦略: その時点までの価格履歴（末尾が当日終値）と現在の保有ウェイトから、目標ウェイト（0〜1）を返す。null は売買しない。 */
export type Strategy = (history: Float64Array, currentWeight: number) => number | null;
export const buyAndHold: Strategy = () => 1;
export function smaCross(short: number, long: number): Strategy {
  req(short >= 1 && long > short, '短期 < 長期 の期間が必要です');
  return h => (h.length < long ? 0 : sma(h, short) > sma(h, long) ? 1 : 0);
}
export function periodicRebalance(weight: number, every: number): Strategy {
  req(weight >= 0 && weight <= 1 && every >= 1, 'リバランス条件が不正です');
  return h => ((h.length - 1) % every === 0 ? weight : null);
}

/** 売買費用（約定代金に対する率）。fee: 手数料、spread: 売買の気配差（片道で半分を負担）、slippage: 発注による価格の不利な動き */
export interface TradingCosts { fee: number; spread: number; slippage: number }
export interface BacktestResult { equity: number[]; trades: number; totalCost: number; turnover: number }
export function runBacktest(prices: readonly number[], strategy: Strategy, costs: TradingCosts, initial = 1_000_000, halted?: readonly boolean[]): BacktestResult {
  req(prices.length >= 2 && prices.every(p => Number.isFinite(p) && p > 0), '価格系列は2点以上の正の数');
  req(costs.fee >= 0 && costs.spread >= 0 && costs.slippage >= 0 && costs.fee + costs.spread / 2 + costs.slippage < 0.5, '費用率が不正です');
  const unit = costs.fee + costs.spread / 2 + costs.slippage;
  let cash = initial, shares = 0, trades = 0, totalCost = 0, traded = 0;
  const equity = [initial];
  const all = Float64Array.from(prices);
  for (let t = 0; t < prices.length - 1; t++) {
    // 当日までの情報のみを渡す（構造的な先読み防止）。subarray はコピーせず長さ t+1 の窓を作るため、
    // 戦略側から t+1 以降の要素には添字でもアクセスできない（undefined になる）。
    const history = all.subarray(0, t + 1);
    const px = prices[t] as number;
    const w = (shares * px) / (cash + shares * px);
    const target = strategy(history, Number.isFinite(w) ? w : 0);
    const next = prices[t + 1] as number;
    if (target !== null && !(halted?.[t + 1] ?? false)) {
      const tw = Math.min(1, Math.max(0, target));
      const value = cash + shares * next;
      // 約定後のウェイトが目標どおりになる株数変化（費用は現金から支払う）。
      // 買い: Δ = (tw·V − 保有額) / (P·(1 + tw·u))、売り: Δ = (tw·V − 保有額) / (P·(1 − tw·u))
      const gap = tw * value - shares * next;
      const delta = gap / (next * (1 + (gap >= 0 ? 1 : -1) * tw * unit));
      const want = shares + delta;
      if (Math.abs(delta * next) > value * 1e-6) {
        const notional = Math.abs(delta) * next;
        const cost = notional * unit;
        cash -= delta * next + cost; shares = want;
        trades++; totalCost += cost; traded += notional;
      }
    }
    equity.push(cash + shares * next);
  }
  return { equity, trades, totalCost, turnover: traded / initial };
}

export interface PerfSummary { totalReturn: number; cagr: number; annualVol: number; sharpe: number; maxDrawdown: number }
export function summarizeEquity(equity: readonly number[], periodsPerYear = 252): PerfSummary {
  req(equity.length >= 2 && (equity[0] as number) > 0, '資産推移が不正です');
  const rets: number[] = [];
  for (let i = 1; i < equity.length; i++) rets.push((equity[i] as number) / (equity[i - 1] as number) - 1);
  const totalReturn = (equity[equity.length - 1] as number) / (equity[0] as number) - 1;
  const years = rets.length / periodsPerYear;
  const cagr = totalReturn <= -1 ? -1 : Math.pow(1 + totalReturn, 1 / years) - 1;
  const sd = rets.length > 1 ? std(rets) : 0;
  return { totalReturn, cagr, annualVol: sd * Math.sqrt(periodsPerYear), sharpe: sd > 0 ? (mean(rets) / sd) * Math.sqrt(periodsPerYear) : 0, maxDrawdown: maxDrawdown([...equity]) };
}

/** 過剰最適化の体験: 前半（in-sample）で SMA の期間を総当たりして最良を選び、同じ期間を後半（out-of-sample）に適用する。 */
export function smaGridSearch(prices: readonly number[], split: number, costs: TradingCosts, shorts: number[], longs: number[]) {
  req(split > 1 && split < prices.length - 1, '分割点が不正です');
  const trials: { short: number; long: number; inSample: number; outSample: number }[] = [];
  for (const s of shorts) for (const l of longs) {
    if (l <= s) continue;
    const r = runBacktest(prices, smaCross(s, l), costs);
    const eq = r.equity;
    trials.push({ short: s, long: l, inSample: (eq[split] as number) / (eq[0] as number) - 1, outSample: (eq[eq.length - 1] as number) / (eq[split] as number) - 1 });
  }
  req(trials.length > 0, '総当たりの組合せがありません');
  const best = trials.reduce((a, b) => (b.inSample > a.inSample ? b : a));
  const holdOut = (prices[prices.length - 1] as number) / (prices[split] as number) - 1;
  const holdIn = (prices[split] as number) / (prices[0] as number) - 1;
  const medianOut = [...trials.map(t => t.outSample)].sort((a, b) => a - b)[Math.floor(trials.length / 2)] as number;
  return { trials, best, holdIn, holdOut, medianOut };
}

/** サバイバーシップ・バイアスの体験: 架空の銘柄群のうち、途中で上場廃止（価格が開始時の delistAt 倍未満）になった銘柄を除くと平均成績がどう見えるか。
 *  廃止銘柄は廃止時点の価格で精算（残余価値 recovery 倍）したものとして全銘柄平均に含める。 */
export function survivorshipDemo(n: number, spec: Omit<SeriesSpec, 'seed'>, seed: number, delistAt = 0.3, recovery = 0) {
  req(Number.isInteger(n) && n >= 2 && n <= 500, '銘柄数は2〜500');
  const all: number[] = []; const survivors: number[] = []; let delisted = 0;
  for (let i = 0; i < n; i++) {
    const { prices } = generatePriceSeries({ ...spec, seed: seed * 1000 + i });
    const p0 = prices[0] as number;
    const k = prices.findIndex(p => p < p0 * delistAt);
    if (k >= 0) { delisted++; all.push(((prices[k] as number) * recovery) / p0 - 1); }
    else { const r = (prices[prices.length - 1] as number) / p0 - 1; all.push(r); survivors.push(r); }
  }
  return { meanAll: mean(all), meanSurvivors: survivors.length ? mean(survivors) : NaN, delisted, n };
}
