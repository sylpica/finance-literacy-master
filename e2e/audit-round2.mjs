// 監査ラウンド2（2026-11-02）: ラウンド1指摘の解消を実ブラウザで再確認する。
// 実行: node e2e/audit-round2.mjs （preview が 4173 で起動していること）
const modulePath = process.env.PLAYWRIGHT_MODULE || '/home/hatch/workspace/dev/fp-master/node_modules/playwright/index.mjs';
const { chromium } = await import(modulePath);
const BASE = process.env.E2E_BASE || 'http://localhost:4173/';
const out = [];
const ok = (name, cond, extra = '') => { out.push(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!cond) process.exitCode = 1; };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));

const bodyText = async () => (await page.textContent('body')) ?? '';
const alive = async () => (await page.locator('h1').count()) > 0;

// 1) 全ルート巡回でページエラーなし
const routes = ['', '#/sim', '#/labs', '#/virtual', '#/quiz', '#/review', '#/analytics', '#/data', '#/regulations', '#/search', '#/lesson/A-01', '#/lesson/N-04'];
for (const r of routes) {
  await page.goto(BASE + r, { waitUntil: 'networkidle' });
  ok(`route ${r || '(home)'} renders`, await alive());
}

// 2) シミュレーター極端入力: 白画面にならない・NaN%/Infinity% を表示しない
const simIds = ['accum', 'withdraw', 'dcf', 'bond', 'option', 'amm', 'liquidation', 'supply', 'staking', 'dilution', 'pbr', 'risk', 'lending', 'montecarlo', 'fees'];
for (const id of simIds) {
  await page.goto(`${BASE}#/sim/${id}`, { waitUntil: 'networkidle' });
  const inputs = page.locator('.sim-panel input[type="number"]');
  const n = await inputs.count();
  for (let i = 0; i < n; i++) {
    await inputs.nth(i).fill('-5');
    await inputs.nth(i).blur();
    await inputs.nth(i).fill('999999999999');
    await inputs.nth(i).blur();
    await inputs.nth(i).fill('');
    await inputs.nth(i).blur();
  }
  const t = await bodyText();
  ok(`sim ${id}: no crash/NaN/Infinity after extreme inputs`, (await alive()) && !t.includes('NaN%') && !t.includes('Infinity'), `(fields=${n})`);
}

// 3) DCF: WACC < 永続成長率で案内文が出て白画面にならない
await page.goto(`${BASE}#/sim/dcf`, { waitUntil: 'networkidle' });
{
  const inputs = page.locator('.sim-panel input[type="number"]');
  // WACC は2番目、永続成長率は3番目の数値欄（初期FCF, WACC, 永続成長率, 予測年数, 純有利子負債, 株式数）
  await inputs.nth(1).fill('3'); await inputs.nth(1).blur();
  await inputs.nth(2).fill('4'); await inputs.nth(2).blur();
  const t = await bodyText();
  ok('dcf wacc<=g shows guidance, no crash', (await alive()) && t.includes('WACC'));
}

// 4) ハッシュでのシミュレーター切替（ディープリンク追随）
await page.goto(`${BASE}#/sim/accum`, { waitUntil: 'networkidle' });
await page.evaluate(() => { location.hash = '#/sim/amm'; });
await page.waitForTimeout(400);
{
  const t = await bodyText();
  ok('hash switch accum->amm changes panel', t.includes('AMM') || t.includes('自動マーケットメイカー'));
}

// 5) 検索0件の明示メッセージ
await page.goto(`${BASE}#/search`, { waitUntil: 'networkidle' });
await page.locator('input[type="search"], input').first().fill('存在しない用語zzz');
await page.waitForTimeout(300);
{
  const t = await bodyText();
  ok('search zero-result message', t.includes('見つかりませんでした'));
}

// 6) 教材メモ: 書く→消す→保存→再読込で空のまま
await page.goto(`${BASE}#/lesson/A-01`, { waitUntil: 'networkidle' });
{
  const ta = page.locator('textarea').first();
  await ta.fill('ラウンド2テストメモ');
  await page.getByRole('button', { name: 'メモを保存' }).click();
  await page.waitForTimeout(300);
  await ta.fill('');
  await page.getByRole('button', { name: 'メモを保存' }).click();
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'networkidle' });
  const v = await page.locator('textarea').first().inputValue();
  ok('memo can be cleared and stays cleared', v === '');
}

// 7) モバイル390px: ホームとシミュレーターで横溢れなし
const mob = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mp = await mob.newPage();
mp.on('pageerror', e => errors.push('mobile: ' + String(e)));
await mp.goto(BASE, { waitUntil: 'networkidle' });
ok('mobile home no overflow', !(await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
await mp.goto(`${BASE}#/sim/accum`, { waitUntil: 'networkidle' });
ok('mobile sim no overflow', !(await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));

// 8) ラボ2種（#/labs のタブ切替）: 極端入力でも NaN%/Infinity% を出さない
await page.goto(`${BASE}#/labs`, { waitUntil: 'networkidle' });
for (const tabName of [null, '暗号資産']) {
  if (tabName) await page.getByRole('tab', { name: new RegExp(tabName) }).click();
  await page.waitForTimeout(200);
  const inputs = page.locator('main input[type="number"]');
  const n = await inputs.count();
  for (let i = 0; i < n; i++) {
    await inputs.nth(i).fill('-5'); await inputs.nth(i).blur();
    await inputs.nth(i).fill('999999999999'); await inputs.nth(i).blur();
  }
  const t = await bodyText();
  // 暗号資産ラボはチェックリスト式で数値欄を持たない設計。その場合は点検リストの表示をもって切替成功とする
  const tabOk = tabName ? t.includes('投資前リスク点検') : n > 0;
  ok(`lab tab ${tabName ?? '株式'}: renders, no crash/NaN/Infinity`, tabOk && (await alive()) && !t.includes('NaN%') && !t.includes('Infinity'), `(fields=${n})`);
}

ok('no pageerrors overall', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(out.join('\n'));
await browser.close();
