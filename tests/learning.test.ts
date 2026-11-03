import { describe, it, expect } from 'vitest';
import { applyReview, initSchedule } from '../src/learning/srs';
import { masteryByLesson } from '../src/learning/mastery';
import { parseCsv, validateMarketRows, sanitizeCell } from '../src/store/csv';
import { parseBackup } from '../src/store/db';
import type { Question } from '../src/types';

describe('間隔反復（SM-2系）', () => {
  it('正答で間隔が 1日→6日→伸びる', () => {
    let s = initSchedule('Q-X', 0);
    s = applyReview(s, true, 0); expect(s.intervalDays).toBe(1);
    s = applyReview(s, true, 86400000); expect(s.intervalDays).toBe(6);
    s = applyReview(s, true, 7 * 86400000); expect(s.intervalDays).toBeGreaterThan(6);
  });
  it('誤答で繰り返し回数がリセットされ1日後に戻る', () => {
    let s = initSchedule('Q-X', 0);
    s = applyReview(s, true, 0); s = applyReview(s, true, 86400000);
    s = applyReview(s, false, 2 * 86400000);
    expect(s.repetitions).toBe(0); expect(s.intervalDays).toBe(1);
  });
});
describe('習熟度（初見重視）', () => {
  const qs: Question[] = [{ id: 'Q-A01-1', lessonId: 'A-01', type: 'single', difficulty: 2, skill: 'understand', prompt: 'p', options: [{ id: 'a', text: 'x' }], correctIds: ['a'], explanation: 'e', wrongExplanations: {}, sources: [], reviewStatus: 'verified' }];
  it('初見正答は1、再挑戦正答は0.5', () => {
    const m1 = masteryByLesson([{ questionId: 'Q-A01-1', selectedIds: ['a'], correct: true, answeredAt: 1 }], qs);
    expect(m1.get('A-01')).toBe(1);
    const m2 = masteryByLesson([
      { questionId: 'Q-A01-1', selectedIds: [], correct: false, answeredAt: 1 },
      { questionId: 'Q-A01-1', selectedIds: ['a'], correct: true, answeredAt: 2 },
    ], qs);
    expect(m2.get('A-01')).toBe(0.5);
  });
  it('分母は教材の全問題: 一部だけ正答しても100%にならない（監査指摘の回帰）', () => {
    const two: Question[] = [qs[0] as Question, { ...(qs[0] as Question), id: 'Q-A01-2' }];
    const m = masteryByLesson([{ questionId: 'Q-A01-1', selectedIds: ['a'], correct: true, answeredAt: 1 }], two);
    expect(m.get('A-01')).toBe(0.5);
    const m0 = masteryByLesson([], two);
    expect(m0.get('A-01')).toBe(0);
  });
});
describe('CSV検証', () => {
  it('正常データを通し、重複・負値を弾く', () => {
    const t = parseCsv('date,symbol,close\n2026-01-05,AAA,100\n2026-01-06,AAA,101\n2026-01-06,AAA,101\n2026-01-07,AAA,-5\n');
    const r = validateMarketRows(t, { date: 0, symbol: 1, close: 2 });
    expect(r.ok.length).toBe(2); expect(r.errors.length).toBe(2);
  });
  it('クォート内カンマを処理する', () => {
    const t = parseCsv('date,symbol,close\n2026-01-05,"AA,A",100\n');
    expect(t.rows[0]?.[1]).toBe('AA,A');
  });
  it('CSVインジェクション無害化', () => { expect(sanitizeCell('=SUM(A1)')).toBe("'=SUM(A1)"); expect(sanitizeCell('-5')).toBe('-5'); });
});
describe('バックアップ検証', () => {
  const base = { format: 'finance-literacy-master-backup', version: 1, attempts: [], schedule: [], bookmarks: [], notes: [], virtual: [] };
  it('正しい形式を受け付け、異形式・異バージョンを拒否する', () => {
    expect(parseBackup(JSON.stringify(base)).attempts).toEqual([]);
    expect(() => parseBackup(JSON.stringify({ format: 'other', version: 1 }))).toThrow();
    expect(() => parseBackup(JSON.stringify({ ...base, version: 2 }))).toThrow();
  });
  it('壊れたJSON・null は日本語のエラーメッセージで拒否する（Claude Code監査 P3 の回帰）', () => {
    expect(() => parseBackup('{broken json')).toThrowError('ファイルがJSONとして読み取れませんでした');
    expect(() => parseBackup('null')).toThrowError('バックアップ形式が違います');
  });
  it('深い検証: 型・範囲・一意性の不正を拒否する（監査指摘の回帰）', () => {
    const bad = [
      { ...base, attempts: [{ questionId: 'Q', correct: true, answeredAt: 1, selectedIds: [1] }] },
      { ...base, schedule: [{ questionId: 'Q', ease: 9, intervalDays: 1, repetitions: 0, dueAt: 1 }] },
      { ...base, schedule: [{ questionId: 'Q', ease: 2.5, intervalDays: 1, repetitions: 0, dueAt: 1 }, { questionId: 'Q', ease: 2.5, intervalDays: 1, repetitions: 0, dueAt: 1 }] },
      { ...base, bookmarks: [{ lessonId: 'A-01' }] },
      { ...base, virtual: [{ caseId: 'C', score: 1, doneAt: 1, chosen: { k: 'not-array' } }] },
    ];
    for (const b of bad) expect(() => parseBackup(JSON.stringify(b))).toThrow();
    const good = { ...base, schedule: [{ questionId: 'Q', ease: 2.5, intervalDays: 1, repetitions: 0, dueAt: 1 }], bookmarks: [{ lessonId: 'A-01', createdAt: 1 }] };
    expect(parseBackup(JSON.stringify(good)).schedule.length).toBe(1);
  });
  it('銘柄へのサニタイズ適用: 数式風の銘柄は無害化される', () => {
    const t = parseCsv('date,symbol,close\n2026-01-05,=EVIL,100\n');
    const r = validateMarketRows(t, { date: 0, symbol: 1, close: 2 });
    expect(r.ok[0]?.symbol).toBe("'=EVIL");
  });
});
