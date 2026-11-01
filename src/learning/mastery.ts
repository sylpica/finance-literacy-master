import type { Question, StudyAttempt } from '../types';

// 習熟度（指示書 §6）: 単なる反復回数ではなく、初見問題の正答と難易度で重み付けする。
// mastery = Σ(難易度 × 初見正答なら1, 再挑戦正答なら0.5) / Σ難易度（当該分野で回答済みの問題について）
export function masteryByLesson(attempts: StudyAttempt[], questions: Question[]): Map<string, number> {
  const byQ = new Map<string, StudyAttempt[]>();
  for (const a of attempts) { const arr = byQ.get(a.questionId) ?? []; arr.push(a); byQ.set(a.questionId, arr); }
  const score = new Map<string, { num: number; den: number }>();
  for (const q of questions) {
    const arr = (byQ.get(q.id) ?? []).sort((x, y) => x.answeredAt - y.answeredAt);
    if (arr.length === 0) continue;
    const first = arr[0] as StudyAttempt;
    const everCorrect = arr.some(a => a.correct);
    const value = first.correct ? 1 : everCorrect ? 0.5 : 0;
    const cur = score.get(q.lessonId) ?? { num: 0, den: 0 };
    cur.num += q.difficulty * value; cur.den += q.difficulty;
    score.set(q.lessonId, cur);
  }
  const out = new Map<string, number>();
  for (const [k, v] of score) out.set(k, v.den > 0 ? v.num / v.den : 0);
  return out;
}

export function accuracyByDomain(attempts: StudyAttempt[], questions: Question[]): Map<string, { total: number; correct: number }> {
  const lessonDomain = new Map(questions.map(q => [q.id, q.lessonId.split('-')[0] as string]));
  const out = new Map<string, { total: number; correct: number }>();
  for (const a of attempts) {
    const d = lessonDomain.get(a.questionId); if (!d) continue;
    const cur = out.get(d) ?? { total: 0, correct: 0 };
    cur.total += 1; if (a.correct) cur.correct += 1;
    out.set(d, cur);
  }
  return out;
}

/** 苦手分野の優先推薦: 正答率が低く、かつ未復習の到期問題が多い教材を優先する（説明可能な規則） */
export function recommendLessons(
  attempts: StudyAttempt[], questions: Question[], dueQuestionIds: Set<string>, limit = 5,
): { lessonId: string; reason: string }[] {
  const mastery = masteryByLesson(attempts, questions);
  const dueByLesson = new Map<string, number>();
  for (const q of questions) if (dueQuestionIds.has(q.id)) dueByLesson.set(q.lessonId, (dueByLesson.get(q.lessonId) ?? 0) + 1);
  const candidates = new Map<string, { score: number; reason: string }>();
  for (const q of questions) {
    const m = mastery.get(q.lessonId);
    const due = dueByLesson.get(q.lessonId) ?? 0;
    if (m === undefined && due === 0) { if (!candidates.has(q.lessonId)) candidates.set(q.lessonId, { score: 1, reason: '未学習の教材' }); continue; }
    if (due > 0) candidates.set(q.lessonId, { score: 3 + due, reason: `復習期限の問題が${due}問あります` });
    else if (m !== undefined && m < 0.7) candidates.set(q.lessonId, { score: 2 + (0.7 - m), reason: `習熟度が${Math.round(m * 100)}%です` });
  }
  return [...candidates.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, limit)
    .map(([lessonId, v]) => ({ lessonId, reason: v.reason }));
}
