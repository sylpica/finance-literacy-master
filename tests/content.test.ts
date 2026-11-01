import { describe, it, expect } from 'vitest';
import { LESSONS, QUESTIONS, lessonById, questionById } from '../src/content';
import { DOMAINS } from '../src/content/domains';
import { SRC } from '../src/content/sources';
import { CASES } from '../src/content/cases';
import { REGULATIONS } from '../src/content/regulations';

const allowedUrls = new Set(Object.values(SRC).map(s => s.url));

describe('教材カバレッジ', () => {
  it('全14分野に各4教材 = 56教材', () => {
    expect(LESSONS.length).toBe(56);
    for (const d of DOMAINS) expect(LESSONS.filter(l => l.domainId === d.id).length, `分野${d.id}`).toBe(4);
  });
  it('教材IDが一意', () => { expect(new Set(LESSONS.map(l => l.id)).size).toBe(LESSONS.length); });
  it('各教材に2問 = 112問', () => {
    expect(QUESTIONS.length).toBe(112);
    for (const l of LESSONS) expect(l.questionIds.length, l.id).toBe(2);
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
  it('制度データは出典つきで、施行中データに適用開始日がある', () => {
    expect(REGULATIONS.length).toBeGreaterThanOrEqual(4);
    for (const r of REGULATIONS) {
      expect(allowedUrls.has(r.source.url), r.id).toBe(true);
      if (r.status === 'in-force') expect(r.effectiveFrom, r.id).toBeTruthy();
    }
    const nisa = REGULATIONS.find(r => r.id.toLowerCase().includes('nisa'));
    expect(nisa).toBeTruthy();
    const joined = nisa?.keyNumbers.map(k => `${k.label}:${k.value}`).join('|') ?? '';
    expect(joined).toContain('1,800'); // 生涯非課税保有限度額（金融庁確認値）
    expect(joined).toContain('360'); // 年間投資枠合計
  });
});
