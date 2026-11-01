import type { Lesson, Question } from '../types';
import { LESSONS_1 } from './lessons-1';
import { LESSONS_2 } from './lessons-2';
import { LESSONS_3 } from './lessons-3';
import { LESSONS_4 } from './lessons-4';
import { QUESTIONS_1 } from './questions-1';
import { QUESTIONS_2 } from './questions-2';
import { QUESTIONS_3 } from './questions-3';
import { QUESTIONS_4 } from './questions-4';

export const LESSONS: Lesson[] = [...LESSONS_1, ...LESSONS_2, ...LESSONS_3, ...LESSONS_4];
export const QUESTIONS: Question[] = [...QUESTIONS_1, ...QUESTIONS_2, ...QUESTIONS_3, ...QUESTIONS_4];
export const lessonById = new Map(LESSONS.map(l => [l.id, l]));
export const questionById = new Map(QUESTIONS.map(q => [q.id, q]));

export function searchAll(query: string): { lessons: Lesson[]; questions: Question[] } {
  const q = query.trim().toLowerCase();
  if (!q) return { lessons: [], questions: [] };
  const hit = (s: string) => s.toLowerCase().includes(q);
  return {
    lessons: LESSONS.filter(l => hit(l.title) || l.terms.some(hit) || hit(l.layers.overview) || hit(l.layers.detail)),
    questions: QUESTIONS.filter(x => hit(x.prompt)),
  };
}

/** 選択肢の並べ替え（正答IDを保持する決定的シャッフル: 問題IDからシード生成） */
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
