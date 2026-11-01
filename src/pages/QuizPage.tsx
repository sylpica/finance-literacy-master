import { useMemo, useState } from 'react';
import { QUESTIONS, lessonById, questionById, shuffledOptions } from '../content';
import { isDue } from '../learning/srs';
import { useApp } from '../state';
import type { Question } from '../types';

export type QuizMode = { kind: 'lesson'; lessonId: string } | { kind: 'domain'; domainId: string } | { kind: 'review' } | { kind: 'random' } | { kind: 'weak' };

export function selectQuestions(mode: QuizMode, state: { schedule: { questionId: string; dueAt: number }[]; attempts: { questionId: string; correct: boolean }[] } | null): Question[] {
  const now = Date.now();
  switch (mode.kind) {
    case 'lesson': return QUESTIONS.filter(q => q.lessonId === mode.lessonId);
    case 'domain': return QUESTIONS.filter(q => q.lessonId.startsWith(`${mode.domainId}-`));
    case 'review': {
      const due = new Set((state?.schedule ?? []).filter(s => isDue(s, now)).map(s => s.questionId));
      const wrongIds = new Set((state?.attempts ?? []).filter(a => !a.correct).map(a => a.questionId));
      return QUESTIONS.filter(q => due.has(q.id) || wrongIds.has(q.id));
    }
    case 'weak': {
      const wrong = new Map<string, number>();
      for (const a of state?.attempts ?? []) if (!a.correct) wrong.set(a.questionId, (wrong.get(a.questionId) ?? 0) + 1);
      return [...wrong.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => questionById.get(id)).filter((q): q is Question => !!q);
    }
    case 'random': return [...QUESTIONS].sort(() => 0.5 - Math.sin(now % 3600)).slice(0, 10);
  }
}

export function QuizPage({ mode, go }: { mode: QuizMode; go: (path: string) => void }) {
  const { state, recordAttempt } = useApp();
  const questions = useMemo(() => selectQuestions(mode, state ? { schedule: state.schedule, attempts: state.attempts } : null), [mode.kind, mode.kind === 'lesson' ? mode.lessonId : mode.kind === 'domain' ? mode.domainId : '']); // eslint-disable-line
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [answered, setAnswered] = useState<null | boolean>(null);
  const [score, setScore] = useState(0);
  const q = questions[idx];
  const options = useMemo(() => (q ? shuffledOptions(q.options, q.id) : []), [q?.id]); // eslint-disable-line
  if (questions.length === 0) return <main><h2>問題演習</h2><p>対象の問題がありません。教材の問題を解くと、間違えた問題と復習期限の問題がここに出ます。</p><button onClick={() => go('')}>教材一覧へ</button></main>;
  if (!q) return (
    <main><h2>演習完了</h2><p>{questions.length}問中 {score}問正解でした。</p>
      <button className="primary" onClick={() => go('analytics')}>学習分析を見る</button>{' '}
      <button onClick={() => go('')}>教材一覧へ</button></main>
  );
  const toggle = (id: string) => {
    if (answered !== null) return;
    setSelected(prev => q.type === 'single' ? [id] : prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const submit = async () => {
    const correct = selected.length === q.correctIds.length && selected.every(id => q.correctIds.includes(id));
    setAnswered(correct); if (correct) setScore(s => s + 1);
    await recordAttempt({ questionId: q.id, selectedIds: selected, correct, answeredAt: Date.now() });
  };
  const next = () => { setIdx(i => i + 1); setSelected([]); setAnswered(null); };
  return (
    <main>
      <p className="meta">{idx + 1} / {questions.length}問 ／ {q.id} ／ 教材 {q.lessonId} {lessonById.get(q.lessonId)?.title ?? ''} ／ 難易度 {q.difficulty} ／ {q.skill}</p>
      <h2 className="question-prompt">{q.prompt}</h2>
      {q.type === 'multi' && <p className="meta">複数選択：当てはまるものをすべて選んでください</p>}
      <div className="options">
        {options.map(o => {
          const isSel = selected.includes(o.id);
          const isCorrect = answered !== null && q.correctIds.includes(o.id);
          const isWrongSel = answered !== null && isSel && !isCorrect;
          return (
            <button key={o.id} className={`option${isSel ? ' selected' : ''}${isCorrect ? ' correct' : ''}${isWrongSel ? ' wrong' : ''}`}
              aria-pressed={isSel} onClick={() => toggle(o.id)}>{o.text}{isCorrect ? ' ✓' : ''}{isWrongSel ? ' ✗' : ''}</button>
          );
        })}
      </div>
      {answered === null
        ? <button className="primary" disabled={selected.length === 0} onClick={() => void submit()}>回答する</button>
        : (
          <section className="explanation" aria-live="polite">
            <p><strong>{answered ? '正解です。' : '不正解です。'}</strong> {q.explanation}</p>
            <ul>
              {q.options.filter(o => !q.correctIds.includes(o.id)).map(o => (
                <li key={o.id}>「{o.text}」が誤りの理由: {q.wrongExplanations[o.id] ?? '解説を参照してください'}</li>
              ))}
            </ul>
            {q.assumptions && <p className="meta">前提条件: {q.assumptions}</p>}
            <p className="meta">出典: {q.sources.map(s => s.title).join('、')}</p>
            <button className="primary" onClick={next}>{idx + 1 < questions.length ? '次の問題へ' : '結果を見る'}</button>{' '}
            <button onClick={() => go(`lesson/${q.lessonId}`)}>教材で復習する</button>
          </section>
        )}
    </main>
  );
}
