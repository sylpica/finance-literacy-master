import { describe, it, expect } from 'vitest';
import { FLASHCARDS, shuffled } from '../src/content/flashcards';
import { LESSONS } from '../src/content/catalog';
import { splitParagraphs } from '../src/pages/LessonPage';
import { parseBackup } from '../src/store/db';
import { selectQuestions, filterSavedQuestions } from '../src/pages/QuizPage';

// 監査ラウンド3（徹底使用監査・学習体験改革）の受入テスト群

describe('単語帳カードの整合性', () => {
  it('全教材の全用語がカード化されている（定義のない用語はカードにしない方針のため、欠けは校正漏れとして検出する）', () => {
    const slots = LESSONS.reduce((s, l) => s + l.terms.length, 0);
    expect(FLASHCARDS.length).toBe(slots);
  });
  it('cardId は一意で、問題IDと空間が分かれている', () => {
    const ids = FLASHCARDS.map(c => c.cardId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith('FC-')).toBe(true);
  });
  it('全カードに定義と設問文があり、設問文に用語そのものが含まれない（裏スタートで答えが透けない）', () => {
    for (const c of FLASHCARDS) {
      expect(c.definition.length).toBeGreaterThanOrEqual(30);
      expect(c.cue.length).toBeGreaterThan(0);
      expect(c.cue.includes(c.term)).toBe(false);
    }
  });
  it('カードの lessonId・domainId・level が教材と一致する', () => {
    const byId = new Map(LESSONS.map(l => [l.id, l]));
    for (const c of FLASHCARDS) {
      const l = byId.get(c.lessonId);
      expect(l).toBeTruthy();
      expect(l!.domainId).toBe(c.domainId);
      expect(l!.terms).toContain(c.term);
      expect(c.sources.length).toBeGreaterThan(0);
    }
  });
});

describe('シャッフル（単語帳・演習共通の置換性）', () => {
  it('集合の要素と件数が不変（重複・欠落なし）', () => {
    const base = Array.from({ length: 50 }, (_, i) => i);
    for (const seed of ['a', 'seed-1', '再シャッフル', 'x'.repeat(40)]) {
      const out = shuffled(base, seed);
      expect(out).toHaveLength(base.length);
      expect(new Set(out).size).toBe(base.length);
      expect([...out].sort((x, y) => x - y)).toEqual(base);
    }
  });
  it('同じシードでは同じ順序（決定的）', () => {
    const base = Array.from({ length: 20 }, (_, i) => `c${i}`);
    expect(shuffled(base, 's1')).toEqual(shuffled(base, 's1'));
  });
});

describe('教材本文の段落分割は無損失', () => {
  it('全教材・全4層で join すると原文と一致する', () => {
    for (const l of LESSONS) {
      for (const layer of Object.values(l.layers)) {
        expect(splitParagraphs(layer).join('')).toBe(layer);
      }
    }
  });
});

describe('バックアップ v1→v2 移行（監査ラウンド3）', () => {
  const v1 = JSON.stringify({
    format: 'finance-literacy-master-backup', version: 1, exportedAt: '2026-11-02T00:00:00.000Z',
    attempts: [{ questionId: 'Q-A01-1', selectedIds: ['a'], correct: true, answeredAt: 1 }],
    schedule: [], bookmarks: [{ lessonId: 'A-01', createdAt: 1 }], notes: [], virtual: [],
  });
  it('v1 バックアップが読み込め、既存データを保持したまま新フィールドが空で補われる', () => {
    const s = parseBackup(v1);
    expect(s.attempts).toHaveLength(1);
    expect(s.bookmarks).toHaveLength(1);
    expect(s.questionBookmarks).toEqual([]);
    expect(s.cardStates).toEqual([]);
  });
  it('v2 の問題ブックマークとカード状態を往復できる', () => {
    const v2 = JSON.stringify({
      format: 'finance-literacy-master-backup', version: 2, exportedAt: '2026-11-11T00:00:00.000Z',
      attempts: [], schedule: [], bookmarks: [],
      questionBookmarks: [{ questionId: 'Q-A01-1', createdAt: 5 }],
      cardStates: [{ cardId: 'FC-A-01-1', bookmarked: true, selfEval: 'fuzzy', updatedAt: 6 }],
      notes: [], virtual: [],
    });
    const s = parseBackup(v2);
    expect(s.questionBookmarks).toHaveLength(1);
    expect(s.cardStates[0]?.selfEval).toBe('fuzzy');
  });
  it('不正な selfEval や重複 cardId を拒否する', () => {
    const bad = (patch: Record<string, unknown>) => JSON.stringify({
      format: 'finance-literacy-master-backup', version: 2, exportedAt: 'x',
      attempts: [], schedule: [], bookmarks: [], questionBookmarks: [], cardStates: [], notes: [], virtual: [], ...patch,
    });
    expect(() => parseBackup(bad({ cardStates: [{ cardId: 'FC-A-01-1', bookmarked: true, selfEval: 'perfect', updatedAt: 1 }] }))).toThrow();
    expect(() => parseBackup(bad({
      cardStates: [
        { cardId: 'FC-A-01-1', bookmarked: true, updatedAt: 1 },
        { cardId: 'FC-A-01-1', bookmarked: false, updatedAt: 2 },
      ],
    }))).toThrow();
  });
});

describe('保存した問題モードの選題', () => {
  it('ブックマーク順（保存した順）に保存問題だけが返る', () => {
    const state = {
      schedule: [], attempts: [],
      questionBookmarks: [
        { questionId: 'Q-B01-2', createdAt: 200 },
        { questionId: 'Q-A01-1', createdAt: 100 },
      ],
    };
    const qs = selectQuestions({ kind: 'saved' }, state);
    expect(qs.map(q => q.id)).toEqual(['Q-A01-1', 'Q-B01-2']);
  });
  it('保存がなければ空（NaNや化けた集計にならない前提）', () => {
    expect(selectQuestions({ kind: 'saved' }, { schedule: [], attempts: [], questionBookmarks: [] })).toEqual([]);
    expect(selectQuestions({ kind: 'saved' }, null)).toEqual([]);
  });
});

describe('保存した問題の絞り込み（指令書5.2）', () => {
  const base = selectQuestions({ kind: 'saved' }, {
    schedule: [{ questionId: 'Q-B01-2', dueAt: 1 }],
    attempts: [
      { questionId: 'Q-A01-1', correct: false, answeredAt: 10 },
      { questionId: 'Q-A01-1', correct: true, answeredAt: 20 },
      { questionId: 'Q-B01-2', correct: false, answeredAt: 15 },
    ],
    questionBookmarks: [
      { questionId: 'Q-A01-1', createdAt: 100 },
      { questionId: 'Q-B01-2', createdAt: 200 },
      { questionId: 'Q-C01-1', createdAt: 300 },
    ],
  });
  const state = {
    schedule: [{ questionId: 'Q-B01-2', dueAt: 1 }],
    attempts: [
      { questionId: 'Q-A01-1', correct: false, answeredAt: 10 },
      { questionId: 'Q-A01-1', correct: true, answeredAt: 20 },
      { questionId: 'Q-B01-2', correct: false, answeredAt: 15 },
    ],
  };
  it('分野で絞れる', () => {
    expect(filterSavedQuestions(base, state, { domainId: 'A', status: 'all' }).map(q => q.id)).toEqual(['Q-A01-1']);
  });
  it('未回答は回答履歴のない問題だけ', () => {
    expect(filterSavedQuestions(base, state, { domainId: 'all', status: 'unanswered' }).map(q => q.id)).toEqual(['Q-C01-1']);
  });
  it('誤答は直近の回答が誤答の問題だけ（立て直し済みは含まない）', () => {
    expect(filterSavedQuestions(base, state, { domainId: 'all', status: 'wrong' }).map(q => q.id)).toEqual(['Q-B01-2']);
  });
  it('期限は dueAt が到来した問題だけ', () => {
    expect(filterSavedQuestions(base, state, { domainId: 'all', status: 'due' }).map(q => q.id)).toEqual(['Q-B01-2']);
  });
});
