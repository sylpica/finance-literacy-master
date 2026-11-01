// 間隔反復（説明可能なアルゴリズム: SM-2 系の簡略版。指示書 §6）
// 記憶定着「確率」は表示しない。ここで管理するのは復習間隔と易しさ係数のみで、
// 根拠は「正答で間隔を伸ばし、誤答で初期化する」という公開された単純規則である。
import type { ReviewScheduleItem } from '../types';

export function initSchedule(questionId: string, now: number): ReviewScheduleItem {
  return { questionId, ease: 2.5, intervalDays: 0, repetitions: 0, dueAt: now, lastReviewedAt: 0 };
}

/** 正答なら quality=5、不正解なら quality=1 として SM-2 の易しさ係数を更新する（中間評価は持たない）。
 *  本アプリの上限: ease は 2.8、間隔は 365 日まで（際限のない伸びを防ぐための明示的な仕様）。 */
export function applyReview(item: ReviewScheduleItem, correct: boolean, now: number): ReviewScheduleItem {
  const quality = correct ? 5 : 1;
  let { ease, intervalDays, repetitions } = item;
  if (quality < 3) { repetitions = 0; intervalDays = 1; }
  else {
    repetitions += 1;
    intervalDays = repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.min(365, Math.round(intervalDays * ease));
  }
  ease = Math.min(2.8, Math.max(1.3, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))));
  return { questionId: item.questionId, ease, intervalDays, repetitions, dueAt: now + intervalDays * 86400000, lastReviewedAt: now };
}

export function isDue(item: { dueAt: number }, now: number): boolean { return item.dueAt <= now; }
