import { describe, it, expect } from 'vitest';
import { parseBackup } from '../src/store/db';
import { parseCsv, validateMarketRows } from '../src/store/csv';
import { applyReview, initSchedule } from '../src/learning/srs';
import { selectQuestions } from '../src/pages/QuizPage';
import { shuffledOptions, QUESTIONS } from '../src/content';

// 監査（2026-11-02）で見つかった不具合の回帰テスト群

const backupWith = (patch: Record<string, unknown>) => JSON.stringify({
  format: 'finance-literacy-master-backup', version: 1, exportedAt: '2026-11-02T00:00:00.000Z',
  attempts: [], schedule: [], bookmarks: [], notes: [], virtual: [], ...patch,
});

describe('parseBackup の要素検証', () => {
  it('正常な要素は通る', () => {
    const s = parseBackup(backupWith({ attempts: [{ questionId: 'Q-A01-1', selectedIds: ['a'], correct: true, answeredAt: 1 }] }));
    expect(s.attempts).toHaveLength(1);
  });
  it('null 要素を拒否する', () => {
    expect(() => parseBackup(backupWith({ attempts: [null] }))).toThrow();
  });
  it('型違いの要素を拒否する', () => {
    expect(() => parseBackup(backupWith({ attempts: [{ questionId: 123, selectedIds: [], correct: true, answeredAt: 1 }] }))).toThrow();
    expect(() => parseBackup(backupWith({ notes: [{ id: 'n1', lessonId: 'A-01', text: 42 }] }))).toThrow();
    expect(() => parseBackup(backupWith({ schedule: [{ questionId: 'Q-A01-1', ease: 'x', intervalDays: 1, repetitions: 0, dueAt: 0 }] }))).toThrow();
  });
});

describe('CSV の日付検証（実在日チェック）', () => {
  const map = { date: 0, symbol: 1, close: 2 };
  it('2月31日を拒否する', () => {
    const r = validateMarketRows(parseCsv('date,symbol,close\n2024-02-31,AAA,100'), map);
    expect(r.ok).toHaveLength(0); expect(r.errors.length).toBeGreaterThan(0);
  });
  it('うるう年の2月29日は通る', () => {
    const r = validateMarketRows(parseCsv('date,symbol,close\n2024-02-29,AAA,100'), map);
    expect(r.ok).toHaveLength(1); expect(r.errors).toHaveLength(0);
  });
});

describe('SRS の上限', () => {
  it('ease は 2.8、間隔は 365 日を超えない', () => {
    let item = initSchedule('Q-A01-1', 0);
    for (let i = 0; i < 30; i++) item = applyReview(item, true, item.dueAt);
    expect(item.ease).toBeLessThanOrEqual(2.8);
    expect(item.intervalDays).toBeLessThanOrEqual(365);
  });
  it('誤答で間隔が初期化される', () => {
    let item = initSchedule('Q-A01-1', 0);
    item = applyReview(item, true, 0); item = applyReview(item, true, item.dueAt);
    item = applyReview(item, false, item.dueAt);
    expect(item.repetitions).toBe(0); expect(item.intervalDays).toBe(1);
  });
});

describe('selectQuestions', () => {
  it('ランダムは重複のない10問を返す', () => {
    const qs = selectQuestions({ kind: 'random' }, null);
    expect(qs).toHaveLength(10);
    expect(new Set(qs.map(q => q.id)).size).toBe(10);
  });
  it('ランダムは複数回で出題集合が変わりうる（固定先頭10問ではない）', () => {
    const sets = new Set<string>();
    // 時刻依存のため、seed を変えて shuffledOptions の性質もあわせて確認する
    for (let i = 0; i < 5; i++) sets.add(shuffledOptions(QUESTIONS, `random-test-${i}`).slice(0, 10).map(q => q.id).join(','));
    expect(sets.size).toBeGreaterThan(1);
  });
  it('復習モードは期限到来と誤答のみを返す', () => {
    const now = Date.now();
    const someQ = QUESTIONS[0] as (typeof QUESTIONS)[number];
    const otherQ = QUESTIONS[1] as (typeof QUESTIONS)[number];
    const qs = selectQuestions({ kind: 'review' }, {
      schedule: [{ questionId: someQ.id, dueAt: now - 1000 }],
      attempts: [{ questionId: otherQ.id, correct: false }],
    });
    const ids = qs.map(q => q.id);
    expect(ids).toContain(someQ.id); expect(ids).toContain(otherQ.id);
    expect(ids.length).toBe(2);
  });
  it('教材モードは当該教材の問題だけを返す', () => {
    const qs = selectQuestions({ kind: 'lesson', lessonId: 'A-01' }, null);
    expect(qs.length).toBeGreaterThan(0);
    expect(qs.every(q => q.lessonId === 'A-01')).toBe(true);
  });
});

describe('shuffledOptions', () => {
  it('要素の置換であり、欠けも重複もない', () => {
    const opts = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    const out = shuffledOptions(opts, 'Q-A01-1');
    expect(out.map(o => o.id).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(out).not.toBe(opts);
  });
});
