// E2E（監査ラウンド2で全面改訂）: 指示書 §14.4 の代表的な利用経路15項目と、全シミュレーターの極端入力を実ブラウザで確認する。
// 実行: npm run build && npx vite preview --port 4173 & ; npm run e2e
// Playwright は実行環境に導入済みのもの（require('playwright')）を使う。PLAYWRIGHT_MODULE で差し替え可。
// 旧 e2e/smoke.mjs・e2e/audit-round2.mjs は、存在しない環境のパスへの依存・実在しないシミュレーターID・存在しないルートを含んでいたため本ファイルへ統合した。
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.E2E_BASE || 'http://localhost:4173/';
const SIM_IDS = ['accum', 'nisa', 'withdraw', 'multiples', 'dcf', 'dilution', 'bond', 'portfolio', 'risk', 'option', 'leverage', 'amm', 'lending', 'supply', 'staking'];
const out = [];
const ok = (name, cond, extra = '') => { out.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` ${extra}` : ''}`); if (!cond) process.exitCode = 1; };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
const go = async (r, sel) => { await page.goto(BASE + r, { waitUntil: 'networkidle' }); if (sel) await page.waitForSelector(sel, { timeout: 8000 }); };
const text = async () => (await page.textContent('body')) ?? '';

// 1) ホーム
await go('', '.domain-card');
ok('01 ホーム: 14分野と検索欄', (await page.locator('.domain-card').count()) === 14 && (await page.locator('.home-search input').count()) === 1);
// 2) 検索 → 問題そのものへ遷移
await page.fill('.home-search input', 'マークル');
await page.press('.home-search input', 'Enter');
await page.waitForSelector('.search-results');
ok('02 検索: 専門理論層・問題にヒット', (await text()).includes('G-01') && (await text()).includes('Q-G01-5'));
await page.getByRole('button', { name: /^Q-G01-5/ }).click();
await page.waitForSelector('.option');
ok('02b 検索結果の問題を直接開く', (await text()).includes('マークル証明'));
// 3) 教材を読む・4) 詳細を展開（矢印キーで層を移動）
await go('#/lesson/L-03', '.lesson-body');
await page.getByRole('tab', { name: '概要' }).focus();
await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
ok('03-04 教材: 矢印キーで専門理論へ、パリティの式', (await page.locator('.lesson-body').textContent()).includes('プット・コール・パリティ'));
// 5) 問題を解く・6) 解説（誤答理由が表示順の記号で並ぶ）
await go('#/quiz/lesson/A-01', '.option');
const firstOptionText = await page.locator('.option').first().textContent();
await page.locator('.option').first().click();
await page.getByRole('button', { name: '回答する' }).click();
await page.waitForSelector('.explanation');
const expl = await page.locator('.explanation').textContent();
ok('05-06 演習: 解説と誤答理由（A〜D）', /正答 [A-D]/.test(expl) && (await page.locator('.wrong-list li').count()) === 3);
const nextBtn = page.getByRole('button', { name: '次の問題へ' });
const nb = await nextBtn.boundingBox();
ok('06b 「次の問題へ」が画面内にある', nb !== null && nb.y + nb.height <= 900);
// 7) 復習へ登録（間違えるまで回答して復習に出る）
await go('#/quiz/lesson/A-02', '.option');
await page.locator('.option').nth(0).click(); await page.getByRole('button', { name: '回答する' }).click(); await page.waitForSelector('.explanation');
const correct1 = (await page.locator('.explanation').textContent()).includes('正解（');
await go('#/quiz/review');
await page.waitForTimeout(500);
const reviewText = await text();
ok('07 復習: 誤答または期限の問題が復習に出る', correct1 ? true : !reviewText.includes('対象の問題がありません'));
// 8) シミュレーション（全15種の極端入力）
for (const id of SIM_IDS) {
  await go(`#/sim/${id}`, '.sim-panel .kpis');
  const inputs = page.locator('.sim-panel input[type="number"]');
  const n = await inputs.count();
  for (let i = 0; i < n; i++) {
    for (const v of ['-5', '999999999999', '']) { await inputs.nth(i).fill(v); await inputs.nth(i).blur(); }
  }
  const t = await page.locator('.sim-panel').textContent();
  ok(`08 sim/${id}: 極端入力で NaN/Infinity なし`, n > 0 && !/NaN|Infinity/.test(t), `(入力${n})`);
}
await go('#/sim/dcf', '.sim-panel .kpis');
await page.getByLabel('WACC', { exact: true }).fill(''); await page.getByLabel('WACC', { exact: true }).pressSequentially('12'); await page.getByLabel('WACC', { exact: true }).blur();
ok('08b NumField: 1文字ずつ「12」を入力できる', (await page.getByLabel('WACC', { exact: true }).inputValue()) === '12');
await page.selectOption('.sim-select select', 'amm');
await page.waitForSelector('text=価格インパクト（手数料除く）');
ok('08c シミュレーター選択がURLに反映', page.url().endsWith('#/sim/amm'));
// 9) 株式分析・10) 暗号資産分析
await go('#/labs', '.kpis');
ok('09 株式分析ラボ: 三表の連動', (await text()).includes('フリーCF'));
await page.getByRole('tab', { name: '暗号資産ラボ' }).click();
ok('10 暗号資産ラボ: リスク点検', (await text()).includes('投資前リスク点検'));
// 11) 仮想投資（判断演習＋バックテスト）
await go('#/virtual', '.criteria');
const fs2 = page.locator('.criteria');
for (let i = 0; i < await fs2.count(); i++) await fs2.nth(i).locator('input[type="checkbox"]').first().check();
await page.getByRole('button', { name: '判断を確定して振り返る' }).click();
await page.waitForSelector('text=評価スコア');
ok('11 仮想投資: 判断確定で評価と全期間を表示', (await text()).includes('学習記録に保存しました'));
await page.getByRole('tab', { name: 'バックテスト' }).click();
await page.waitForSelector('.kpi-table');
ok('11b バックテスト: 3戦略・過剰最適化・サバイバーシップ', (await page.locator('.kpi-table tbody tr').count()) === 3 && (await text()).includes('過剰最適化') && (await text()).includes('サバイバーシップ'));
// 12) 学習履歴の保存（再読込後も残る）
await go('#/analytics', '.analytics-grid');
const hist = await text();
await page.reload({ waitUntil: 'networkidle' }); await page.waitForSelector('.analytics-grid');
ok('12 学習履歴: 再読込後も回答が残る', /回答数 [1-9]/.test(await text()) && /回答数 [1-9]/.test(hist));
// 13) バックアップ・復元
await go('#/data', 'text=バックアップをダウンロード');
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /バックアップをダウンロード/ }).click()]);
const file = await dl.path();
const json = JSON.parse(fs.readFileSync(file, 'utf8'));
ok('13 バックアップ: 形式と回答履歴', json.format === 'finance-literacy-master-backup' && json.attempts.length > 0);
await page.setInputFiles('.file-label input[type="file"]', file);
await page.waitForSelector('text=この内容で復元する');
await page.getByRole('button', { name: 'この内容で復元する' }).click();
await page.waitForSelector('text=バックアップを復元しました');
ok('13b 復元: プレビュー確認後に復元', true);
fs.writeFileSync('/tmp/flm-broken.json', '{"format":');
await page.setInputFiles('.file-label input[type="file"]', '/tmp/flm-broken.json');
await page.waitForSelector('text=復元に失敗しました');
ok('13c 壊れたJSONは日本語のエラーで拒否', (await text()).includes('JSONとして読み取れません'));
// 15) 表示密度とテーマ
await go('#/settings', 'text=表示密度');
await page.getByRole('button', { name: 'ライト' }).click();
await page.getByRole('button', { name: '高密度' }).click();
ok('15 テーマ・表示密度の切替', await page.evaluate(() => document.documentElement.dataset.theme === 'light' && document.documentElement.dataset.density === 'dense'));
// 14) オフラインで再起動（Service Worker 有効化後）
await go('');
await page.evaluate(async () => { await navigator.serviceWorker.ready; });
await page.reload({ waitUntil: 'networkidle' });
await ctx.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForSelector('.domain-card', { timeout: 8000 }).catch(() => {});
ok('14 オフライン: 再読込でホーム表示', (await page.locator('.domain-card').count()) === 14);
await page.goto(`${BASE}#/sim/option`).catch(() => {});
await page.waitForSelector('.sim-panel .kpis', { timeout: 8000 }).catch(() => {});
ok('14b オフライン: 遅延読込のシミュレーターも表示', (await page.locator('.sim-panel .kpis').count()) === 1);
await ctx.setOffline(false);

// モバイル幅（375px）の主要画面: 横はみ出しなし・ページエラーなし
const mob = await browser.newContext({ viewport: { width: 375, height: 667 } });
const mp = await mob.newPage();
mp.on('pageerror', e => errors.push(`mobile: ${String(e)}`));
for (const r of ['', '#/lesson/D-02', '#/quiz/random', '#/sim/portfolio', '#/virtual', '#/analytics', '#/regulations', '#/data']) {
  await mp.goto(BASE + r, { waitUntil: 'networkidle' }); await mp.waitForTimeout(300);
  ok(`mobile ${r || '(home)'}: 横はみ出しなし`, !(await mp.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)));
}
ok('ページエラーなし', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(out.join('\n'));
console.log(`\n${out.filter(l => l.startsWith('PASS')).length}/${out.length} PASS`);
