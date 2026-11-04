import { describe, it, expect } from 'vitest';
import { LESSONS, QUESTIONS, lessonById, questionById, lessonIdOfQuestion, TOTAL_QUESTIONS } from '../src/content';
import { DOMAINS } from '../src/content/domains';
import { SRC } from '../src/content/sources';
import { CASES } from '../src/content/cases';
import { REGULATIONS, CALC_RULES } from '../src/content/regulations';

const allowedUrls = new Set(Object.values(SRC).map(s => s.url));

describe('教材カバレッジ', () => {
  it('全14分野に各4教材 = 56教材', () => {
    expect(LESSONS.length).toBe(56);
    for (const d of DOMAINS) expect(LESSONS.filter(l => l.domainId === d.id).length, `分野${d.id}`).toBe(4);
  });
  it('教材IDが一意', () => { expect(new Set(LESSONS.map(l => l.id)).size).toBe(LESSONS.length); });
  it('各教材に4問以上 = 232問（資料読解C-04・企業比較D-01に各1問、監査ラウンド2で専門理論の確認問題6問を追加）', () => {
    expect(QUESTIONS.length).toBe(232);
    for (const l of LESSONS) expect(l.questionIds.length, l.id).toBeGreaterThanOrEqual(4);
  });
});
describe('教材の整合性', () => {
  it('前提・関連が実在し、自己参照と循環がない', () => {
    for (const l of LESSONS) {
      for (const p of [...l.prerequisites, ...l.related]) {
        expect(lessonById.has(p), `${l.id} -> ${p}`).toBe(true);
        expect(p).not.toBe(l.id);
      }
    }
    // 循環検出 (DFS)
    const visited = new Set<string>(); const stack = new Set<string>();
    const dfs = (id: string): boolean => {
      if (stack.has(id)) return true;
      if (visited.has(id)) return false;
      visited.add(id); stack.add(id);
      for (const p of lessonById.get(id)?.prerequisites ?? []) if (dfs(p)) return true;
      stack.delete(id); return false;
    };
    for (const l of LESSONS) expect(dfs(l.id), `循環: ${l.id}`).toBe(false);
  });
  it('questionIds と問題の lessonId が相互一致', () => {
    for (const l of LESSONS) for (const qid of l.questionIds) expect(questionById.get(qid)?.lessonId, qid).toBe(l.id);
    for (const q of QUESTIONS) expect(lessonById.get(q.lessonId)?.questionIds, q.id).toContain(q.id);
  });
  it('全教材に出典があり、URLは登録済み一次資料のみ', () => {
    for (const l of LESSONS) {
      expect(l.sources.length, l.id).toBeGreaterThan(0);
      for (const s of l.sources) expect(allowedUrls.has(s.url), `${l.id}: ${s.url}`).toBe(true);
    }
  });
  it('4層がすべて空でない', () => {
    for (const l of LESSONS) {
      expect(l.layers.overview.length, l.id).toBeGreaterThan(20);
      expect(l.layers.detail.length, l.id).toBeGreaterThan(50);
      expect(l.layers.theory.length, l.id).toBeGreaterThan(20);
      expect(l.layers.practice.length, l.id).toBeGreaterThan(20);
      expect(l.objectives.length).toBeGreaterThan(0);
      expect(l.terms.length).toBeGreaterThan(0);
      expect(l.misconceptions.length).toBeGreaterThan(0);
    }
  });
});
describe('問題の整合性', () => {
  it('問題IDから教材IDを導出でき、全問で lessonId と一致する（初期バンドルの分割の前提）', () => {
    for (const q of QUESTIONS) expect(lessonIdOfQuestion(q.id), q.id).toBe(q.lessonId);
    expect(TOTAL_QUESTIONS).toBe(QUESTIONS.length);
  });
  it('問題IDが一意', () => { expect(new Set(QUESTIONS.map(q => q.id)).size).toBe(QUESTIONS.length); });
  it('正答が選択肢に含まれ、誤答すべてに理由がある', () => {
    for (const q of QUESTIONS) {
      const ids = new Set(q.options.map(o => o.id));
      expect(q.options.length, q.id).toBe(4);
      expect(q.correctIds.length, q.id).toBeGreaterThan(0);
      for (const c of q.correctIds) expect(ids.has(c), `${q.id}:${c}`).toBe(true);
      if (q.type === 'single') expect(q.correctIds.length, q.id).toBe(1);
      for (const o of q.options) if (!q.correctIds.includes(o.id)) {
        expect((q.wrongExplanations[o.id] ?? '').length, `${q.id} の誤答 ${o.id} の理由`).toBeGreaterThan(4);
      }
      expect(q.explanation.length, q.id).toBeGreaterThan(10);
      expect(q.sources.length, q.id).toBeGreaterThan(0);
      for (const s of q.sources) expect(allowedUrls.has(s.url), `${q.id}: ${s.url}`).toBe(true);
    }
  });
  it('正答が最長の選択肢である単一正答問題は40%以下（監査ラウンド2 P1-6: 長さが正答の手がかりにならない）', () => {
    const single = QUESTIONS.filter(q => q.type === 'single');
    const longest = single.filter(q => {
      const len = (t: string) => [...t].length;
      const c = q.options.find(o => o.id === q.correctIds[0])!;
      return q.options.every(o => o.id === c.id || len(o.text) < len(c.text));
    }).length;
    expect(longest / single.length).toBeLessThanOrEqual(0.4);
  });
  it('スキルと難易度が多様である', () => {
    const skills = new Set(QUESTIONS.map(q => q.skill));
    expect(skills.size).toBeGreaterThanOrEqual(4);
    expect(new Set(QUESTIONS.map(q => q.difficulty)).size).toBeGreaterThanOrEqual(2);
  });
});
describe('ケースと制度データ', () => {
  it('ケースは判断日以降の情報を briefing に含めず、系列が判断日をまたぐ', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(4);
    for (const c of CASES) {
      expect(c.series.some(p => p.date <= c.decisionDate)).toBe(true);
      expect(c.series.some(p => p.date > c.decisionDate), c.id).toBe(true);
      expect(c.criteria.length).toBeGreaterThanOrEqual(3);
      for (const cr of c.criteria) {
        expect(cr.options.length).toBe(4);
        for (const g of cr.goodIds) expect(cr.options.some(o => o.id === g)).toBe(true);
      }
    }
  });
  it('制度データは出典つきで、施行中データに検証可能な日付（適用開始日または公表日）がある', () => {
    expect(REGULATIONS.length).toBeGreaterThanOrEqual(4);
    for (const r of REGULATIONS) {
      expect(allowedUrls.has(r.source.url), r.id).toBe(true);
      // effectiveFrom は「適用開始」と言える日付に限る。公表日・節目の日は announcedAt に分ける（監査 C-F07）
      if (r.status === 'in-force') expect(r.effectiveFrom ?? r.announcedAt, r.id).toBeTruthy();
    }
    const nisa = REGULATIONS.find(r => r.id.toLowerCase().includes('nisa'));
    expect(nisa).toBeTruthy();
    const joined = nisa?.keyNumbers.map(k => `${k.label}:${k.value}`).join('|') ?? '';
    expect(joined).toContain('1,800'); // 生涯非課税保有限度額（金融庁確認値）
    expect(joined).toContain('360'); // 年間投資枠合計
  });
});

describe('計算用の制度数値と制度データの一致（監査ラウンド2 P2-10）', () => {
  const kv = (id: string) => new Map(REGULATIONS.find(r => r.id === id)!.keyNumbers.map(k => [k.label, k.value]));
  const yen = (man: number) => `${(man / 10000).toLocaleString('ja-JP')}万円`;
  it('NISA の枠', () => {
    const m = kv('REG-NISA-2024');
    expect(m.get('年間投資枠（合計）')).toBe(yen(CALC_RULES.nisa.annualTotal));
    expect(m.get('つみたて投資枠（年間）')).toBe(yen(CALC_RULES.nisa.tsumitateAnnual));
    expect(m.get('成長投資枠（年間）')).toBe(yen(CALC_RULES.nisa.growthAnnual));
    expect(m.get('生涯非課税保有限度額（総枠）')).toBe(yen(CALC_RULES.nisa.lifetime));
    expect(m.get('成長投資枠の上限（生涯限度額の内数）')).toBe(yen(CALC_RULES.nisa.growthLifetime));
  });
  it('上場株式等の税率', () => {
    expect(kv('REG-STOCK-TAX').get('税率（合計）')).toBe(`${(CALC_RULES.listedStockTaxRate * 100).toFixed(3)}%`);
  });
  it('成立済み・未施行の制度は施行中データと区別され、適用開始日が未確定なら日付を置かない', () => {
    const pending = REGULATIONS.filter(r => r.status === 'enacted-not-yet');
    expect(pending.map(r => r.id).sort()).toEqual(['REG-CRYPTO-TAX-SEPARATE', 'REG-NISA-2027-MINOR', 'REG-STOCK-TAX-2027']);
    expect(REGULATIONS.find(r => r.id === 'REG-CRYPTO-TAX-SEPARATE')!.effectiveFrom).toBeUndefined();
  });
});
