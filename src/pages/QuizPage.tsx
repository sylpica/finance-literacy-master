import { useEffect, useMemo, useState } from 'react';
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
    case 'random': return shuffledOptions(QUESTIONS, `random-${now}`).slice(0, 10);
  }
}

export function QuizPage({ mode, go }: { mode: QuizMode; go: (path: string) => void }) {
  const { state, recordAttempt } = useApp();
  // 出題セットは学習データの読込完了後に一度だけ確定させる。
  // 回答のたびに state が更新されても、進行中のセッションの出題は変えない。
  const [questions, setQuestions] = useState<Question[] | null>(null);
  useEffect(() => {
    if (state && questions === null) setQuestions(selectQuestions(mode, state));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, questions]);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [answered, setAnswered] = useState<null | boolean>(null);
  const [score, setScore] = useState(0);
  const q = questions?.[idx];
  const options = useMemo(() => (q ? shuffledOptions(q.options, q.id) : []), [q?.id]); // eslint-disable-line
  if (!state || questions === null) return <main><h2>問題演習</h2><p>読み込み中…</p></main>;
  if (questions.length === 0) return <main><h2>問題演習</h2><p>対象の問題がありません。教材の問題を解くと、間違えた問題と復習期限の問題がここに出ます。</p><button onClick={() => go('')}>教材一覧へ</button></main>;
  if (!q) return (
    <main>
      <section className="hero score-hero" aria-label="演習結果">
        <h2>演習完了</h2>
        <p><span className="score-big">{score}</span> <span className="meta">/ {questions.length}問正解（正答率 {questions.length ? Math.round((score / questions.length) * 100) : 0}%）</span></p>
        <p className="meta">{score === questions.length ? '全問正解です。次の教材に進みましょう。' : '間違えた問題は復習リストに入りました。教材で確認してから復習すると定着します。'}</p>
        <div className="cta-row">
          <button className="primary" onClick={() => go('analytics')}>学習分析を見る</button>
          {score < questions.length && <button onClick={() => go('quiz/review')}>間違えた問題を復習する</button>}
          <button onClick={() => go('')}>教材一覧へ</button>
        </div>
      </section>
    </main>
  );
  const modeTitle = mode.kind === 'lesson' ? `教材 ${mode.lessonId} ${lessonById.get(mode.lessonId)?.title ?? ''} の演習`
    : mode.kind === 'domain' ? `分野 ${mode.domainId} の演習`
    : mode.kind === 'review' ? '復習（期限・間違い問題）'
    : mode.kind === 'weak' ? '弱点復習' : 'ランダム演習';
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
      <div className="quiz-head">
        <p className="meta">{modeTitle}</p>
        <div className="progress quiz-progress" role="progressbar" aria-label="演習の進み具合" aria-valuemin={1} aria-valuemax={questions.length} aria-valuenow={idx + 1}>
          <div className="progress-fill" style={{ width: `${((idx + 1) / questions.length) * 100}%` }} />
        </div>
        <p className="meta">{idx + 1} / {questions.length}問 ／ これまで {score}問正解 ／ {q.id} ／ 教材 {q.lessonId} {lessonById.get(q.lessonId)?.title ?? ''} ／ 難易度 {q.difficulty} ／ {q.skill}</p>
      </div>
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
            <p><strong className={answered ? 'result-ok' : 'result-ng'}>{answered ? '正解です。' : '不正解です。'}</strong> {q.explanation}</p>
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
