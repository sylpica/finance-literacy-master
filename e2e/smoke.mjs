// E2Eスモーク（ローカル実行用）: 主要フローとレスポンシブ、オフラインを実ブラウザで確認する。
// 実行: node e2e/smoke.mjs  （要: 同階層アプリ fp-master 等の Playwright か、PLAYWRIGHT_MODULE でモジュールを指定）
import { createRequire } from 'module';
import fs from 'fs';
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
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(BASE, { waitUntil: 'networkidle' });
ok('home shows domains', await page.getByText('金融・資産形成の基礎').first().isVisible());
ok('home shows lesson count', (await page.textContent('main'))?.includes('56教材') ?? false);
const overflowDesktop = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
ok('no horizontal overflow (desktop)', !overflowDesktop);

// 教材詳細: 4層切替
await page.goto(`${BASE}#/lesson/A-02`, { waitUntil: 'networkidle' });
ok('lesson page', await page.getByText('複利').first().isVisible());
await page.getByRole('tab', { name: '専門理論' }).click();
ok('theory layer visible', (await page.locator('.lesson-body').textContent())?.includes('式') ?? false);
await page.getByRole('tab', { name: '実践例' }).click();
ok('practice layer visible', ((await page.locator('.lesson-body').textContent()) ?? '').length > 20);

// 演習: 回答→解説
await page.goto(`${BASE}#/quiz/lesson/A-02`, { waitUntil: 'networkidle' });
await page.locator('.option').first().click();
await page.getByRole('button', { name: '回答する' }).click();
await page.waitForSelector('.explanation');
ok('explanation shown', await page.locator('.explanation').isVisible());
ok('wrong-option reasons listed', ((await page.locator('.explanation').textContent()) ?? '').includes('誤りの理由'));

// シミュレーター: 条件変更で結果が変わる
await page.goto(`${BASE}#/sim`, { waitUntil: 'networkidle' });
const before = await page.locator('.sim-panel').textContent();
await page.locator('.num-field input[type="number"]').first().fill('500');
await page.waitForTimeout(300);
const after = await page.locator('.sim-panel').textContent();
ok('simulator reacts to input', before !== after);

// 仮想投資: 判断日以降が最初は見えない
await page.goto(`${BASE}#/virtual`, { waitUntil: 'networkidle' });
ok('virtual page', await page.getByText('判断を確定し').isDisabled());
const checks = page.locator('.criteria input[type="checkbox"]');
const n = await checks.count();
for (let i = 0; i < n; i++) { /* 各criteriaの先頭を選ぶ */ }
const fieldsets = page.locator('.criteria');
const fc = await fieldsets.count();
for (let i = 0; i < fc; i++) await fieldsets.nth(i).locator('input[type="checkbox"]').first().check();
await page.getByText('判断を確定し').click();
await page.waitForSelector('text=評価スコア');
ok('virtual scoring shown', await page.getByText('評価スコア').isVisible());

// データ管理・設定
await page.goto(`${BASE}#/data`, { waitUntil: 'networkidle' });
ok('data page', await page.getByText('バックアップ').first().isVisible());
await page.goto(`${BASE}#/settings`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'ライト' }).click();
ok('theme switch', await page.evaluate(() => document.documentElement.dataset.theme === 'light'));

// モバイル幅: 横溢れチェックとスクリーンショット
const mob = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mp = await mob.newPage();
await mp.goto(BASE, { waitUntil: 'networkidle' });
const overflowMobile = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
ok('no horizontal overflow (mobile 390px)', !overflowMobile);
await mp.goto(`${BASE}#/lesson/C-01`, { waitUntil: 'networkidle' });
const overflowLesson = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
ok('no horizontal overflow (lesson, mobile)', !overflowLesson);
fs.mkdirSync('e2e/screenshots', { recursive: true });
await mp.screenshot({ path: 'e2e/screenshots/mobile-lesson.png' });
await page.screenshot({ path: 'e2e/screenshots/desktop-home.png' });

// オフライン: SW有効化後にオフラインで再読込
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return r; });
await page.waitForTimeout(1000);
await ctx.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(500);
const offlineText = await page.textContent('body').catch(() => '');
ok('offline reload shows app', (offlineText ?? '').includes('資産形成・金融教養マスター'));
await ctx.setOffline(false);

ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(out.join('\n'));
