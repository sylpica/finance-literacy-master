// UI実測（監査ラウンド2）: スクロール量・ファーストビュー・文字切れ・横はみ出しを数値で記録する。
// 実行: npm run build && npx vite preview --port 4173 & ; node e2e/measure.mjs
// Playwright は実行環境に導入済みのものを使う（PLAYWRIGHT_MODULE で差し替え可）。
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.E2E_BASE || 'http://localhost:4173/';

const browser = await chromium.launch();
const result = {};
async function at(w, h, fn) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  try { return await fn(page); } finally { await ctx.close(); }
}
const top = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top + scrollY) : null; }, sel);
const docH = page => page.evaluate(() => document.documentElement.scrollHeight);
const ready = (page, sel) => page.waitForSelector(sel, { timeout: 8000 });

for (const [w, h] of [[375, 667], [1280, 800]]) {
  const k = `${w}x${h}`;
  result[k] = await at(w, h, async page => {
    const r = {};
    await page.goto(BASE, { waitUntil: 'networkidle' });
    r.headerH = await page.evaluate(() => Math.round(document.querySelector('header').getBoundingClientRect().height));
    r.homeFirstLessonY = await top(page, '.lesson-card, .lesson-row');
    r.homeFirstDomainY = await top(page, '.domain-block, .domain-card');
    r.homeSearchY = await top(page, 'main input[type="search"]');
    r.homeDocH = await docH(page);
    await page.goto(`${BASE}#/sim/dcf`, { waitUntil: 'networkidle' }); await ready(page, '.sim-panel .kpis');
    r.simFirstInputY = await top(page, '.sim-panel input[type="number"]');
    r.simResultY = await top(page, '.sim-panel .kpis, .sim-panel p');
    await page.goto(`${BASE}#/sim/accum`, { waitUntil: 'networkidle' }); await ready(page, '.sim-panel svg');
    r.simAccumChartY = await top(page, '.sim-panel svg');
    r.simAccumDocH = await docH(page);
    r.chartFontPx = await page.evaluate(() => { const t = document.querySelector('.sim-panel svg text'); return t ? Math.round(t.getBoundingClientRect().height * 10) / 10 : null; });
    await page.goto(`${BASE}#/quiz/lesson/A-01`, { waitUntil: 'networkidle' }); await ready(page, '.option');
    await page.locator('.option').first().click();
    await page.getByRole('button', { name: '回答する' }).click();
    await page.waitForTimeout(200);
    r.quizNextY = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /次の問題へ|結果を見る/.test(x.textContent)); return b ? Math.round(b.getBoundingClientRect().top + scrollY) : null; });
    await page.goto(`${BASE}#/virtual`, { waitUntil: 'networkidle' }); await ready(page, '.criteria');
    r.virtualFirstCriterionY = await top(page, '.criteria');
    return r;
  });
}

// NumField のキー入力（1文字ずつ）
result.numfield = await at(1280, 800, async page => {
  const r = {};
  await page.goto(`${BASE}#/sim/dcf`, { waitUntil: 'networkidle' }); await ready(page, '.sim-panel .kpis');
  const wacc = page.getByLabel('WACC', { exact: true });
  await wacc.fill(''); await wacc.pressSequentially('12'); await wacc.blur();
  r.waccTyped12 = await wacc.inputValue();
  await page.goto(`${BASE}#/sim/leverage`, { waitUntil: 'networkidle' }); await ready(page, '.sim-panel .kpis');
  const entry = page.getByLabel('参入価格', { exact: true });
  await entry.fill(''); await entry.pressSequentially('50000'); await entry.blur();
  r.entryTyped50000 = await entry.inputValue();
  return r;
});

// 横はみ出し・文字切れ（8幅 × 主要ルート）
const routes = ['', '#/map', '#/quiz/random', '#/quiz/review', '#/labs', '#/sim', '#/sim/dcf', '#/sim/portfolio', '#/sim/option', '#/virtual', '#/analytics', '#/search', '#/regulations', '#/data', '#/settings', '#/lesson/D-02', '#/lesson/G-02'];
const widths = [320, 375, 390, 430, 768, 1024, 1280, 1440];
const issues = [];
for (const w of widths) {
  await at(w, 800, async page => {
    for (const r of routes) {
      await page.goto(BASE + r, { waitUntil: 'networkidle' }); await page.waitForTimeout(250);
      const res = await page.evaluate(() => {
        const out = [];
        const vw = document.documentElement.clientWidth;
        if (document.documentElement.scrollWidth > vw + 1) out.push(`page-overflow ${document.documentElement.scrollWidth}>${vw}`);
        for (const el of document.querySelectorAll('body *')) {
          const cs = getComputedStyle(el);
          if (el.closest('.table-scroll, nav, .sim-list, .scroll-x, .visually-hidden')) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          if (rect.right > vw + 1 && cs.position !== 'fixed') out.push(`beyond-viewport ${el.tagName}.${el.className} r=${Math.round(rect.right)}`);
          const clip = (cs.overflowX === 'hidden' || cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis');
          if (clip && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) && !el.classList.contains('progress')) out.push(`clipped ${el.tagName}.${el.className} "${(el.textContent || '').slice(0, 20)}"`);
        }
        return out.slice(0, 5);
      });
      for (const x of res) issues.push(`${w} ${r || '(home)'} ${x}`);
    }
  });
}
result.overflowIssues = issues;
await browser.close();
console.log(JSON.stringify(result, null, 2));
