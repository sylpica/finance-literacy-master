// 間隔反復（説明可能なアルゴリズム: SM-2 系の簡略版。指示書 §6）
// 記憶定着「確率」は表示しない。ここで管理するのは復習間隔と易しさ係数のみで、
// 根拠は「正答で間隔を伸ばし、誤答で初期化する」という公開された単純規則である。
import type { ReviewScheduleItem } from '../types';

export function initSchedule(questionId: string, now: number): ReviewScheduleItem {
  return { questionId, ease: 2.5, intervalDays: 0, repetitions: 0, dueAt: now, lastReviewedAt: 0 };
}

/** quality: 正答=5, 正答だが迷った等の中間は呼び出し側で 3、不正解=1 として渡す */
export function applyReview(item: ReviewScheduleItem, correct: boolean, now: number): ReviewScheduleItem {
  const quality = correct ? 5 : 1;
  let { ease, intervalDays, repetitions } = item;
  if (quality < 3) { repetitions = 0; intervalDays = 1; }
  else {
    repetitions += 1;
    intervalDays = repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.round(intervalDays * ease);
  }
  ease = Math.max(1.3, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  return { questionId: item.questionId, ease, intervalDays, repetitions, dueAt: now + intervalDays * 86400000, lastReviewedAt: now };
}

export function isDue(item: { dueAt: number }, now: number): boolean { return item.dueAt <= now; }
