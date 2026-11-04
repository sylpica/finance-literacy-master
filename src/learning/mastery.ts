import type { Question, StudyAttempt } from '../types';

// 習熟度（指示書 §6）: 単なる反復回数ではなく、初見問題の正答と難易度で重み付けする。
// mastery = Σ(難易度 × 初見正答なら1, 再挑戦正答なら0.5, 未回答なら0) / Σ難易度（教材の全問題）
// 分母は教材の全問題（監査指摘: 回答済みだけを分母にすると、1問正答しただけで100%と過大表示される）。
export function masteryByLesson(attempts: StudyAttempt[], questions: Question[]): Map<string, number> {
  const byQ = new Map<string, StudyAttempt[]>();
  for (const a of attempts) { const arr = byQ.get(a.questionId) ?? []; arr.push(a); byQ.set(a.questionId, arr); }
  const score = new Map<string, { num: number; den: number }>();
  for (const q of questions) {
    const arr = (byQ.get(q.id) ?? []).sort((x, y) => x.answeredAt - y.answeredAt);
    const first = arr[0] as StudyAttempt | undefined;
    const everCorrect = arr.some(a => a.correct);
    const value = first === undefined ? 0 : first.correct ? 1 : everCorrect ? 0.5 : 0;
    const cur = score.get(q.lessonId) ?? { num: 0, den: 0 };
    cur.num += q.difficulty * value; cur.den += q.difficulty;
    score.set(q.lessonId, cur);
  }
  const out = new Map<string, number>();
  for (const [k, v] of score) out.set(k, v.den > 0 ? v.num / v.den : 0);
  return out;
}

/** 分野別の正答率。問題ごとに「初回の回答」だけを数える（監査ラウンド2 P2-13: 全回答を数えると、
 *  同じ問題を繰り返して覚えただけで正答率が上がり、分野全体の理解度を過大評価していた）。
 *  total は回答した問題数、correct は初回で正答した問題数。 */
export function accuracyByDomain(attempts: StudyAttempt[], questions: Question[]): Map<string, { total: number; correct: number }> {
  return firstAttemptAccuracy(attempts, questions, q => q.lessonId.split('-')[0] as string);
}
/** 難易度別（1 基礎／2 中級／3 上級）の初回正答率（監査ラウンド2 P2-14） */
export function accuracyByDifficulty(attempts: StudyAttempt[], questions: Question[]): Map<string, { total: number; correct: number }> {
  return firstAttemptAccuracy(attempts, questions, q => String(q.difficulty));
}
function firstAttemptAccuracy(attempts: StudyAttempt[], questions: Question[], key: (q: Question) => string): Map<string, { total: number; correct: number }> {
  const byId = new Map(questions.map(q => [q.id, q]));
  const first = new Map<string, StudyAttempt>();
  for (const a of attempts) { const f = first.get(a.questionId); if (!f || a.answeredAt < f.answeredAt) first.set(a.questionId, a); }
  const out = new Map<string, { total: number; correct: number }>();
  for (const [qid, a] of first) {
    const q = byId.get(qid); if (!q) continue;
    const k = key(q); const cur = out.get(k) ?? { total: 0, correct: 0 };
    cur.total += 1; if (a.correct) cur.correct += 1; out.set(k, cur);
  }
  return out;
}
/** 学習履歴（日別の回答数と正答数）。日付は端末のローカル時刻で区切る。直近 days 日を古い順に返す。 */
export function dailyActivity(attempts: StudyAttempt[], now: number, days = 14): { date: string; answered: number; correct: number }[] {
  const key = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const out: { date: string; answered: number; correct: number }[] = [];
  const idx = new Map<string, number>();
  const base = new Date(now); base.setHours(12, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) { const k = key(base.getTime() - i * 86400000); idx.set(k, out.length); out.push({ date: k, answered: 0, correct: 0 }); }
  for (const a of attempts) { const i = idx.get(key(a.answeredAt)); if (i === undefined) continue; const r = out[i]!; r.answered++; if (a.correct) r.correct++; }
  return out;
}

/** 苦手分野の優先推薦: 正答率が低く、かつ未復習の到期問題が多い教材を優先する（説明可能な規則） */
export function recommendLessons(
  attempts: StudyAttempt[], questions: Question[], dueQuestionIds: Set<string>, limit = 5,
): { lessonId: string; reason: string }[] {
  const mastery = masteryByLesson(attempts, questions);
  const attemptedLessons = new Set(attempts.map(a => questions.find(q => q.id === a.questionId)?.lessonId).filter((v): v is string => v !== undefined));
  const dueByLesson = new Map<string, number>();
  for (const q of questions) if (dueQuestionIds.has(q.id)) dueByLesson.set(q.lessonId, (dueByLesson.get(q.lessonId) ?? 0) + 1);
  const candidates = new Map<string, { score: number; reason: string }>();
  for (const q of questions) {
    const m = mastery.get(q.lessonId);
    const due = dueByLesson.get(q.lessonId) ?? 0;
    if (!attemptedLessons.has(q.lessonId) && due === 0) { if (!candidates.has(q.lessonId)) candidates.set(q.lessonId, { score: 1, reason: '未学習の教材' }); continue; }
    if (due > 0) candidates.set(q.lessonId, { score: 3 + due, reason: `復習期限の問題が${due}問あります` });
    else if (m !== undefined && m < 0.7) candidates.set(q.lessonId, { score: 2 + (0.7 - m), reason: `習熟度が${Math.round(m * 100)}%です` });
  }
  return [...candidates.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, limit)
    .map(([lessonId, v]) => ({ lessonId, reason: v.reason }));
}
