import { useEffect, useMemo, useState } from 'react';
import { QUESTIONS, lessonById, questionById, shuffledOptions } from '../content';
import { useApp } from '../state';
import type { Question } from '../types';

/** 問題の技能区分の表示名（内部識別子をそのまま利用者へ見せない）。 */
const SKILL_LABELS: Record<string, string> = { understand: '理解', calculate: '計算', compare: '比較', 'find-error': '誤り発見', apply: '応用' };
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export type QuizMode = { kind: 'lesson'; lessonId: string } | { kind: 'domain'; domainId: string } | { kind: 'review' } | { kind: 'random' } | { kind: 'weak' } | { kind: 'saved' } | { kind: 'single'; questionId: string };

export function selectQuestions(mode: QuizMode, state: { schedule: { questionId: string; dueAt: number }[]; attempts: { questionId: string; correct: boolean; answeredAt: number }[]; questionBookmarks?: { questionId: string; createdAt: number }[] } | null): Question[] {
  const now = Date.now();
  switch (mode.kind) {
    case 'lesson': return QUESTIONS.filter(q => q.lessonId === mode.lessonId);
    case 'domain': return QUESTIONS.filter(q => q.lessonId.startsWith(`${mode.domainId}-`));
    case 'saved': {
      const saved = [...(state?.questionBookmarks ?? [])].sort((a, b) => a.createdAt - b.createdAt);
      return saved.map(b => questionById.get(b.questionId)).filter((q): q is Question => !!q);
    }
    case 'single': { const q = questionById.get(mode.questionId); return q ? [q] : []; }
    case 'review': {
      // 対象は「期限到来の問題」と「直近の回答が誤答でまだ立て直せていない問題」。
      // 一度でも間違えた問題を永久に対象にすると、立て直し済みの問題が期限管理と矛盾して残り続ける（監査指摘）。
      // 並びは期限の古い順（スケジュールがない誤答問題は末尾）。
      const dueAt = new Map((state?.schedule ?? []).map(s => [s.questionId, s.dueAt]));
      const latest = new Map<string, boolean>();
      for (const a of [...(state?.attempts ?? [])].sort((x, y) => x.answeredAt - y.answeredAt)) latest.set(a.questionId, a.correct);
      const picked = QUESTIONS.filter(q => (dueAt.get(q.id) ?? Infinity) <= now || latest.get(q.id) === false);
      picked.sort((a, b) => (dueAt.get(a.id) ?? Infinity) - (dueAt.get(b.id) ?? Infinity));
      return picked;
    }
    case 'weak': {
      const wrong = new Map<string, number>();
      for (const a of state?.attempts ?? []) if (!a.correct) wrong.set(a.questionId, (wrong.get(a.questionId) ?? 0) + 1);
      return [...wrong.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => questionById.get(id)).filter((q): q is Question => !!q);
    }
    case 'random': return shuffledOptions(QUESTIONS, `random-${now}`).slice(0, 10);
  }
}

export type SavedFilter = { domainId: string; status: 'all' | 'unanswered' | 'wrong' | 'due' };

/** 保存した問題への絞り込み（指令書5.2: 分野・回答状態・復習期限と合理的に組み合わせる）。
 *  状態の定義は review モードと揃える: 誤答 = 直近の回答が誤答、期限 = スケジュールの dueAt が到来。 */
export function filterSavedQuestions(base: Question[], state: { schedule: { questionId: string; dueAt: number }[]; attempts: { questionId: string; correct: boolean; answeredAt: number }[] } | null, f: SavedFilter): Question[] {
  const now = Date.now();
  const latest = new Map<string, boolean>();
  for (const a of [...(state?.attempts ?? [])].sort((x, y) => x.answeredAt - y.answeredAt)) latest.set(a.questionId, a.correct);
  const dueAt = new Map((state?.schedule ?? []).map(s => [s.questionId, s.dueAt]));
  return base.filter(q => {
    if (f.domainId !== 'all' && lessonById.get(q.lessonId)?.domainId !== f.domainId) return false;
    if (f.status === 'unanswered') return !latest.has(q.id);
    if (f.status === 'wrong') return latest.get(q.id) === false;
    if (f.status === 'due') return (dueAt.get(q.id) ?? Infinity) <= now;
    return true;
  });
}

/** 選択肢の表示順のシード。再挑戦のたびに順序が変わるよう、その問題の過去の回答数を含める（監査 P3-5: 位置の記憶で正答できた）。 */
export function optionSeed(questionId: string, priorAttempts: number): string { return priorAttempts === 0 ? questionId : `${questionId}#${priorAttempts}`; }

export function QuizPage({ mode, go }: { mode: QuizMode; go: (path: string) => void }) {
  const { state, recordAttempt, toggleQuestionBookmark } = useApp();
  // 出題セットは学習データの読込完了後に一度だけ確定させる。
  // 回答のたびに state が更新されても、進行中のセッションの出題は変えない。
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [prior, setPrior] = useState<Map<string, number>>(new Map());
  // 開始前画面（監査ラウンド3）: 出題順シャッフルを選んでから開始する。単一問題モードは直接開始。
  const [started, setStarted] = useState(mode.kind === 'single');
  const [orderShuffle, setOrderShuffle] = useState(mode.kind === 'random');
  // 保存した問題モードの絞り込み（開始前に選ぶ。開始＝セッション確定で、途中では変えない）
  const [savedDomain, setSavedDomain] = useState('all');
  const [savedStatus, setSavedStatus] = useState<SavedFilter['status']>('all');
  useEffect(() => {
    if (state && questions === null && started) {
      const picked = selectQuestions(mode, state);
      setQuestions(orderShuffle && picked.length > 1 ? shuffledOptions(picked, `order-${mode.kind}-${Date.now()}`) : picked);
      const m = new Map<string, number>(); for (const a of state.attempts) m.set(a.questionId, (m.get(a.questionId) ?? 0) + 1); setPrior(m);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, questions, started]);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [answered, setAnswered] = useState<null | boolean>(null);
  const [score, setScore] = useState(0);
  const q = questions?.[idx];
  const options = useMemo(() => (q ? shuffledOptions(q.options, optionSeed(q.id, prior.get(q.id) ?? 0)) : []), [q?.id, prior]); // eslint-disable-line
  if (!state) return <main><h2>問題演習</h2><p>読み込み中…</p></main>;
  if (!started) {
    const savedBase = mode.kind === 'saved' ? selectQuestions(mode, state) : null;
    const savedFiltered = savedBase ? filterSavedQuestions(savedBase, state, { domainId: savedDomain, status: savedStatus }) : null;
    const count = savedFiltered ? savedFiltered.length : selectQuestions(mode, state).length;
    const title = mode.kind === 'lesson' ? '教材の演習' : mode.kind === 'domain' ? `分野 ${mode.domainId} の演習` : mode.kind === 'review' ? '復習' : mode.kind === 'weak' ? '弱点復習' : mode.kind === 'saved' ? '保存した問題' : 'ランダム演習';
    const begin = () => {
      if (savedFiltered) {
        setQuestions(orderShuffle && savedFiltered.length > 1 ? shuffledOptions(savedFiltered, `order-saved-${Date.now()}`) : savedFiltered);
        const m = new Map<string, number>(); for (const a of state.attempts) m.set(a.questionId, (m.get(a.questionId) ?? 0) + 1); setPrior(m);
      }
      setStarted(true);
    };
    const savedDomains = savedBase ? [...new Set(savedBase.map(q => lessonById.get(q.lessonId)?.domainId).filter((d): d is NonNullable<typeof d> => !!d))] : [];
    return (
      <main className="quiz">
        <h2>{title}</h2>
        {count === 0
          ? <p>{mode.kind === 'saved' && savedBase && savedBase.length > 0 ? '絞り込みに一致する保存した問題がありません。条件を変えてください。' : mode.kind === 'saved' ? '保存した問題がまだありません。演習中に問題の ☆ を押すと保存でき、ここでまとめて解けます。' : mode.kind === 'review' || mode.kind === 'weak' ? '対象の問題がありません。教材の問題を解くと、間違えた問題と復習期限の問題がここに出ます。' : '対象の問題がありません。'}</p>
          : <>
              <p>対象 {count}問</p>
              {mode.kind === 'saved' && (
                <div className="chip-row">
                  <label>分野
                    <select value={savedDomain} onChange={e => setSavedDomain(e.target.value)}>
                      <option value="all">全分野</option>
                      {savedDomains.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </label>
                  <label>状態
                    <select value={savedStatus} onChange={e => setSavedStatus(e.target.value as SavedFilter['status'])}>
                      <option value="all">すべて</option>
                      <option value="unanswered">未回答</option>
                      <option value="wrong">直近が誤答</option>
                      <option value="due">復習期限が到来</option>
                    </select>
                  </label>
                </div>
              )}
              <div className="chip-row">
                <button className="chip" aria-pressed={orderShuffle} onClick={() => setOrderShuffle(v => !v)}>出題順シャッフル: {orderShuffle ? 'ON' : 'OFF'}</button>
              </div>
              {mode.kind === 'review' && !orderShuffle && <p className="meta">復習は期限の古い順が基本です。シャッフルONにすると期限順を崩して出題します。</p>}
              <button className="primary" onClick={begin}>開始する</button>
            </>}
        <p><button onClick={() => go('')}>教材一覧へ</button></p>
      </main>
    );
  }
  if (questions === null) return <main><h2>問題演習</h2><p>読み込み中…</p></main>;
  if (questions.length === 0) return <main><h2>問題演習</h2><p>対象の問題がありません。</p><button onClick={() => go('')}>教材一覧へ</button></main>;
  if (!q) return (
    <main>
      <section className="hero score-hero" aria-label="演習結果">
        <h2>演習完了</h2>
        <p><span className="score-big">{score}</span> <span className="meta">/ {questions.length}問正解（正答率 {Math.round((score / questions.length) * 100)}%）</span></p>
        <div className="cta-row">
          {score < questions.length && <button className="primary" onClick={() => go('quiz/review')}>間違えた問題を復習する</button>}
          <button className={score < questions.length ? '' : 'primary'} onClick={() => go('analytics')}>学習分析を見る</button>
          <button onClick={() => go('')}>教材一覧へ</button>
        </div>
        <p className="meta">{score === questions.length ? '全問正解です。' : '間違えた問題は復習リストに入りました。'}</p>
      </section>
    </main>
  );
  const lesson = lessonById.get(q.lessonId);
  const modeTitle = mode.kind === 'lesson' ? '教材の演習' : mode.kind === 'domain' ? `分野 ${mode.domainId}` : mode.kind === 'review' ? '復習' : mode.kind === 'weak' ? '弱点復習' : mode.kind === 'saved' ? '保存した問題' : mode.kind === 'single' ? '検索した問題' : 'ランダム';
  const qBookmarked = state.questionBookmarks.some(b => b.questionId === q.id);
  // 再シャッフルは「未出題の残り」だけを並べ替える。現在の問題と回答済みの履歴は動かさない（集合も不変）。
  const reshuffleRemaining = () => {
    setQuestions(prev => {
      if (!prev || idx + 1 >= prev.length) return prev;
      return [...prev.slice(0, idx + 1), ...shuffledOptions(prev.slice(idx + 1), `reshuffle-${Date.now()}`)];
    });
  };
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
  const letterOf = new Map(options.map((o, i) => [o.id, LETTERS[i] ?? '?']));
  return (
    <main className="quiz">
      <div className="quiz-head">
        <div className="progress quiz-progress" role="progressbar" aria-label="演習の進み具合" aria-valuemin={1} aria-valuemax={questions.length} aria-valuenow={idx + 1}>
          <div className="progress-fill" style={{ width: `${((idx + 1) / questions.length) * 100}%` }} />
        </div>
        <p className="meta">{modeTitle} {idx + 1}/{questions.length}・正解 {score} ／ <button className="linklike" onClick={() => go(`lesson/${q.lessonId}`)}>{q.lessonId} {lesson?.title ?? ''}</button> ／ 難易度{q.difficulty}・{SKILL_LABELS[q.skill] ?? q.skill}
          {' '}<button className="chip" onClick={() => void toggleQuestionBookmark(q.id)} aria-pressed={qBookmarked} aria-label={qBookmarked ? 'この問題の保存を外す' : 'この問題を保存する'}>{qBookmarked ? '★ 保存済み' : '☆ 保存'}</button>
          {mode.kind !== 'single' && idx + 1 < questions.length && <button className="chip" onClick={reshuffleRemaining}>残りを再シャッフル</button>}
        </p>
      </div>
      <h2 className="question-prompt">{q.prompt}</h2>
      {q.type === 'multi' && <p className="multi-note">当てはまるものをすべて選ぶ</p>}
      <div className="options">
        {options.map(o => {
          const isSel = selected.includes(o.id);
          const isCorrect = answered !== null && q.correctIds.includes(o.id);
          const isWrongSel = answered !== null && isSel && !isCorrect;
          return (
            <button key={o.id} className={`option${isSel ? ' selected' : ''}${isCorrect ? ' correct' : ''}${isWrongSel ? ' wrong' : ''}`}
              aria-pressed={isSel} onClick={() => toggle(o.id)}><span>{o.text}{isCorrect ? ' ✓' : ''}{isWrongSel ? ' ✗' : ''}</span></button>
          );
        })}
      </div>
      {answered !== null && (
        <section className="explanation" aria-live="polite">
          <p><strong className={answered ? 'result-ok' : 'result-ng'}>{answered ? '正解' : '不正解'}</strong>（正答 {q.correctIds.map(id => letterOf.get(id)).sort().join('・')}） {q.explanation}</p>
          <ul className="wrong-list">
            {options.filter(o => !q.correctIds.includes(o.id)).map(o => (
              <li key={o.id}><b>{letterOf.get(o.id)}</b> {q.wrongExplanations[o.id] ?? '解説を参照してください'}</li>
            ))}
          </ul>
          {q.assumptions && <p className="meta">前提条件: {q.assumptions}</p>}
          <p className="meta">出典: {q.sources.map(s => s.title).join('、')}</p>
        </section>
      )}
      <div className="quiz-actions">
        {answered === null
          ? <button className="primary" disabled={selected.length === 0} onClick={() => void submit()}>回答する</button>
          : <>
              <button className="primary" onClick={next}>{idx + 1 < questions.length ? '次の問題へ' : '結果を見る'}</button>
              <button onClick={() => go(`lesson/${q.lessonId}`)}>教材で確認</button>
              <button onClick={() => go(`cards/lesson/${q.lessonId}`)}>単語帳で用語を確認</button>
            </>}
      </div>
    </main>
  );
}
