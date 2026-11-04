import type { Lesson } from '../types';
import { LESSONS_1 } from './lessons-1';
import { LESSONS_2 } from './lessons-2';
import { LESSONS_3 } from './lessons-3';
import { LESSONS_4 } from './lessons-4';
import { DOMAINS } from './domains';

// 初期表示に必要な教材データ（監査ラウンド2 P2-17: 問題データ約29万字を初期バンドルから外すため、教材と問題のモジュールを分けた）
export const domainById = new Map(DOMAINS.map(d => [d.id, d]));
export const LESSONS: Lesson[] = [...LESSONS_1, ...LESSONS_2, ...LESSONS_3, ...LESSONS_4];
export const lessonById = new Map(LESSONS.map(l => [l.id, l]));
/** 問題IDから教材IDを得る（例: Q-A01-3 → A-01）。問題データを読み込まずに進捗を集計するために使う。
 *  全問題で lessonId と一致することを tests/content.test.ts で検査している。 */
export function lessonIdOfQuestion(questionId: string): string | undefined {
  const m = /^Q-([A-N])(\d{2})-\d+$/.exec(questionId);
  return m ? `${m[1]}-${m[2]}` : undefined;
}
export const TOTAL_QUESTIONS = LESSONS.reduce((s, l) => s + l.questionIds.length, 0);
