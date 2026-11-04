import type { Lesson, Question } from '../types';
import { QUESTIONS_1 } from './questions-1';
import { QUESTIONS_2 } from './questions-2';
import { QUESTIONS_3 } from './questions-3';
import { QUESTIONS_4 } from './questions-4';
import { QUESTIONS_5 } from './questions-5';
import { LESSONS, lessonById, domainById, lessonIdOfQuestion, TOTAL_QUESTIONS } from './catalog';

export { LESSONS, lessonById, domainById, lessonIdOfQuestion, TOTAL_QUESTIONS };
export const QUESTIONS: Question[] = [...QUESTIONS_1, ...QUESTIONS_2, ...QUESTIONS_3, ...QUESTIONS_4, ...QUESTIONS_5];
export const questionById = new Map(QUESTIONS.map(q => [q.id, q]));

/** 横断検索（監査ラウンド2 P2-15: 専門理論・実践例・用語・誤解、問題の選択肢・解説も対象にする。大文字小文字を区別しない） */
export function searchAll(query: string): { lessons: Lesson[]; questions: Question[] } {
  const q = query.trim().toLowerCase();
  if (!q) return { lessons: [], questions: [] };
  const hit = (s: string) => s.toLowerCase().includes(q);
  return {
    lessons: LESSONS.filter(l => hit(`${l.id} ${l.title}`) || l.terms.some(hit) || Object.values(l.layers).some(hit) || l.misconceptions.some(hit) || l.objectives.some(hit)),
    questions: QUESTIONS.filter(x => hit(x.id) || hit(x.prompt) || x.options.some(o => hit(o.text)) || hit(x.explanation)),
  };
}

/** 選択肢の並べ替え（正答IDを保持する決定的シャッフル: シード文字列から生成） */
export function shuffledOptions<T extends { id: string }>(options: T[], seedText: string): T[] {
  let seed = 0; for (const ch of seedText) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const arr = [...options];
  for (let i = arr.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [arr[i], arr[j]] = [arr[j] as T, arr[i] as T];
  }
  return arr;
}
