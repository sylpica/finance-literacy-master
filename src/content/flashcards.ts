import type { Flashcard } from '../types';
import { LESSONS } from './catalog';
import { CARD_DEFS } from './carddefs';

/** 単語帳カードの生成（監査ラウンド3で新設）。
 *  カードは各教材の terms から作る。cardId は教材IDと用語の順序から決まる永続IDで、
 *  問題ID（Q-…）とは空間を分ける。定義文・設問文は carddefs.ts に校正済みのものだけを置き、
 *  定義のない用語はカード化しない（自動抽出の貼り付けで水増ししない）。 */
export const FLASHCARDS: Flashcard[] = LESSONS.flatMap(lesson =>
  lesson.terms.flatMap((term, i) => {
    const def = CARD_DEFS[term];
    if (!def) return [];
    return [{
      cardId: `FC-${lesson.id}-${i + 1}`,
      lessonId: lesson.id,
      domainId: lesson.domainId,
      term,
      definition: def.d,
      cue: def.c,
      level: lesson.level,
      sources: lesson.sources,
    } satisfies Flashcard];
  }),
);
export const flashcardById = new Map(FLASHCARDS.map(c => [c.cardId, c]));

/** 決定的シャッフル（Fisher–Yates、シード文字列由来）。集合は変えず順序だけを変える。 */
export function shuffled<T>(items: readonly T[], seedText: string): T[] {
  let seed = 0; for (const ch of seedText) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [arr[i], arr[j]] = [arr[j] as T, arr[i] as T];
  }
  return arr;
}
