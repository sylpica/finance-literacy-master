import { useMemo, useState } from 'react';
import { FLASHCARDS, shuffled } from '../content/flashcards';
import { DOMAINS } from '../content/domains';
import { LESSONS, lessonById } from '../content/catalog';
import { useApp } from '../state';
import type { CardSelfEval, Flashcard } from '../types';

export type CardsInit = { kind: 'all' } | { kind: 'lesson'; lessonId: string } | { kind: 'domain'; domainId: string } | { kind: 'saved' } | { kind: 'weak' };

type Direction = 'front' | 'back';
const EVAL_LABELS: Record<CardSelfEval, string> = { known: '覚えた', fuzzy: 'まだ曖昧', unknown: '覚えていない' };

function readDirection(): Direction {
  try { return localStorage.getItem('flm-card-direction') === 'back' ? 'back' : 'front'; } catch { return 'front'; }
}

interface Session {
  cards: Flashcard[];
  seed: number;
}

/** 単語帳（監査ラウンド3で新設、指令書4章）。
 *  表/裏の開始方向はセッション全体に適用され、開始前に毎回変更できる（設定は端末に保持）。
 *  自己評価は主観評価として cardStates に分離保存し、問題の正答率や復習スケジュールには混算しない。 */
export function FlashcardsPage({ init, go }: { init: CardsInit; go: (p: string) => void }) {
  const { state, setCardState } = useApp();
  const [direction, setDirection] = useState<Direction>(readDirection);
  const [domainId, setDomainId] = useState<string>(init.kind === 'domain' ? init.domainId : 'all');
  const [lessonId, setLessonId] = useState<string>(init.kind === 'lesson' ? init.lessonId : 'all');
  const [onlySaved, setOnlySaved] = useState(init.kind === 'saved');
  const [evalFilter, setEvalFilter] = useState<'all' | 'unseen' | 'weak'>(init.kind === 'weak' ? 'weak' : 'all');
  const [shuffleOn, setShuffleOn] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [finished, setFinished] = useState(false);
  const [sessionEvals, setSessionEvals] = useState<Record<string, CardSelfEval>>({});

  const stateByCard = useMemo(() => new Map((state?.cardStates ?? []).map(c => [c.cardId, c])), [state]);

  const candidates = useMemo(() => FLASHCARDS.filter(c => {
    if (domainId !== 'all' && c.domainId !== domainId) return false;
    if (lessonId !== 'all' && c.lessonId !== lessonId) return false;
    const cs = stateByCard.get(c.cardId);
    if (onlySaved && !cs?.bookmarked) return false;
    if (evalFilter === 'unseen' && cs?.selfEval) return false;
    if (evalFilter === 'weak' && !(cs?.selfEval === 'fuzzy' || cs?.selfEval === 'unknown')) return false;
    return true;
  }), [domainId, lessonId, onlySaved, evalFilter, stateByCard]);

  if (!state) return <main><h2>単語帳</h2><p>読み込み中…</p></main>;

  const start = () => {
    const seed = Date.now();
    const cards = shuffleOn ? shuffled(candidates, `cards-${seed}`) : [...candidates];
    setSession({ cards, seed });
    setIdx(0); setFlipped(false); setFinished(false); setSessionEvals({});
  };
  const endSession = () => { setSession(null); setFinished(false); };

  // ---- セッション画面 ----
  if (session) {
    const card = session.cards[idx];
    if (finished || !card) {
      const counts = { known: 0, fuzzy: 0, unknown: 0 } as Record<CardSelfEval, number>;
      for (const v of Object.values(sessionEvals)) counts[v]++;
      const weakCards = session.cards.filter(c => sessionEvals[c.cardId] === 'fuzzy' || sessionEvals[c.cardId] === 'unknown');
      return (
        <main className="cards">
          <h2>単語帳：完了</h2>
          <p>{session.cards.length}枚を学習しました。自己評価（主観）: 覚えた {counts.known}枚／まだ曖昧 {counts.fuzzy}枚／覚えていない {counts.unknown}枚</p>
          <div className="cta-row">
            <button className="primary" onClick={start}>もう一周する</button>
            {weakCards.length > 0 && <button onClick={() => { setSession({ cards: weakCards, seed: Date.now() }); setIdx(0); setFlipped(false); setFinished(false); setSessionEvals({}); }}>曖昧・覚えていないだけ再学習（{weakCards.length}枚）</button>}
            <button onClick={endSession}>条件を変える</button>
            <button onClick={() => go('')}>ホームへ</button>
          </div>
        </main>
      );
    }
    const cs = stateByCard.get(card.cardId);
    const bookmarked = cs?.bookmarked ?? false;
    // 表示面: direction='front' なら未反転=表、'back' なら未反転=裏。反転は面のトグル。
    const onBackFace = direction === 'front' ? flipped : !flipped;
    const lesson = lessonById.get(card.lessonId);
    const flip = () => setFlipped(f => !f);
    const move = (d: number) => {
      const n = idx + d;
      if (n < 0) return;
      if (n >= session.cards.length) { setFinished(true); return; }
      setIdx(n); setFlipped(false);
    };
    const reshuffle = () => {
      const seed = Date.now();
      const next = shuffled(session.cards, `cards-re-${seed}`);
      const newIdx = next.findIndex(c => c.cardId === card.cardId);
      setSession({ cards: next, seed });
      setIdx(newIdx >= 0 ? newIdx : 0);
      setFlipped(false);
    };
    const toggleSaved = () => {
      void setCardState({ cardId: card.cardId, bookmarked: !bookmarked, selfEval: cs?.selfEval, updatedAt: Date.now() });
    };
    const evaluate = (ev: CardSelfEval) => {
      void setCardState({ cardId: card.cardId, bookmarked, selfEval: ev, updatedAt: Date.now() });
      setSessionEvals(prev => ({ ...prev, [card.cardId]: ev }));
      move(1);
    };
    return (
      <main className="cards">
        <div className="quiz-head">
          <div className="progress quiz-progress" role="progressbar" aria-label="単語帳の進み具合" aria-valuemin={1} aria-valuemax={session.cards.length} aria-valuenow={idx + 1}>
            <div className="progress-fill" style={{ width: `${((idx + 1) / session.cards.length) * 100}%` }} />
          </div>
          <p className="meta">{idx + 1}/{session.cards.length}枚 ／ {card.lessonId} {lesson?.title ?? ''} ／ {direction === 'front' ? '表から開始' : '裏から開始'}
            {' '}<button className="chip" onClick={() => { const d = direction === 'front' ? 'back' : 'front'; setDirection(d); try { localStorage.setItem('flm-card-direction', d); } catch { /* 保持できない環境では今回のみ */ } setFlipped(false); }} aria-label="開始方向を切り替える（現在のカードのまま、次からではなく今のカードの表示面が変わります）">開始方向: {direction === 'front' ? '表' : '裏'}に切替</button>
          </p>
        </div>
        <div className="flashcard" role="button" tabIndex={0} aria-label={onBackFace ? `裏面を表示中。${card.cue}` : `表面を表示中。用語: ${card.term}。押すと反転します`}
          onClick={flip} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } }}>
          {!onBackFace ? (
            <div className="flashcard-face">
              <p className="flashcard-term">{card.term}</p>
              <p className="meta">{card.lessonId} ／ 難易度{card.level} ／ タップで裏面</p>
            </div>
          ) : (
            <div className="flashcard-face">
              <p className="flashcard-cue">{card.cue}</p>
              <p className="flashcard-def">{card.definition}</p>
              <p className="meta">タップで表面（用語）</p>
            </div>
          )}
        </div>
        <div className="quiz-actions">
          <button onClick={() => move(-1)} disabled={idx === 0}>← 前へ</button>
          <button className="chip" onClick={toggleSaved} aria-pressed={bookmarked} aria-label={bookmarked ? 'カードの保存を外す' : 'カードを保存する'}>{bookmarked ? '★ 保存済み' : '☆ 保存'}</button>
          <button onClick={() => move(1)}>{idx + 1 < session.cards.length ? '次へ →' : '完了する'}</button>
        </div>
        <div className="cta-row" role="group" aria-label="自己評価（主観評価です）">
          {(Object.keys(EVAL_LABELS) as CardSelfEval[]).map(ev => (
            <button key={ev} className={cs?.selfEval === ev ? 'primary' : ''} onClick={() => evaluate(ev)}>{EVAL_LABELS[ev]}</button>
          ))}
        </div>
        <div className="cta-row">
          <button onClick={reshuffle}>再シャッフル</button>
          <button onClick={() => { setIdx(0); setFlipped(false); }}>最初から</button>
          <button onClick={() => go(`lesson/${card.lessonId}`)}>教材を開く</button>
          <button onClick={() => go(`quiz/lesson/${card.lessonId}`)}>この教材の問題</button>
          <button onClick={endSession}>条件に戻る</button>
        </div>
        <p className="meta">出典: {card.sources.map(s => s.title).join('、')} ／ 自己評価は正答率とは別の主観記録で、復習スケジュールには混算しません。</p>
      </main>
    );
  }

  // ---- 設定画面 ----
  const lessonOptions = LESSONS.filter(l => domainId === 'all' || l.domainId === domainId);
  return (
    <main className="cards">
      <h2>単語帳</h2>
      <section className="panel">
        <h3>開始方向</h3>
        <div className="cta-row" role="group" aria-label="表から開始か裏から開始か">
          <button className={direction === 'front' ? 'primary' : ''} aria-pressed={direction === 'front'} onClick={() => { setDirection('front'); try { localStorage.setItem('flm-card-direction', 'front'); } catch { /* noop */ } }}>表から開始（用語→定義）</button>
          <button className={direction === 'back' ? 'primary' : ''} aria-pressed={direction === 'back'} onClick={() => { setDirection('back'); try { localStorage.setItem('flm-card-direction', 'back'); } catch { /* noop */ } }}>裏から開始（定義→用語）</button>
        </div>
        <h3>対象</h3>
        <div className="chip-row">
          <label>分野
            <select value={domainId} onChange={e => { setDomainId(e.target.value); setLessonId('all'); }}>
              <option value="all">全分野</option>
              {DOMAINS.map(d => <option key={d.id} value={d.id}>{d.id}. {d.name}</option>)}
            </select>
          </label>
          <label>教材
            <select value={lessonId} onChange={e => setLessonId(e.target.value)}>
              <option value="all">全教材</option>
              {lessonOptions.map(l => <option key={l.id} value={l.id}>{l.id} {l.title}</option>)}
            </select>
          </label>
        </div>
        <div className="chip-row">
          <button className="chip" aria-pressed={onlySaved} onClick={() => setOnlySaved(v => !v)}>{onlySaved ? '★ 保存したカードのみ' : '☆ 保存したカードのみ'}</button>
          <label>自己評価
            <select value={evalFilter} onChange={e => setEvalFilter(e.target.value as typeof evalFilter)}>
              <option value="all">すべて</option>
              <option value="unseen">未学習のみ</option>
              <option value="weak">曖昧・覚えていない</option>
            </select>
          </label>
          <button className="chip" aria-pressed={shuffleOn} onClick={() => setShuffleOn(v => !v)}>シャッフル: {shuffleOn ? 'ON' : 'OFF'}</button>
        </div>
        {candidates.length === 0
          ? <p className="warn-text">対象カードが0枚です。条件を変えてください（保存したカードや自己評価の絞り込みに一致するカードがありません）。</p>
          : <button className="primary" onClick={start}>{candidates.length}枚で開始する</button>}
      </section>
      <p className="meta">カードは各教材の重要用語から校正済みの定義で作られています。全{FLASHCARDS.length}枚。自己評価は主観の記録で、正答率には混算しません。</p>
    </main>
  );
}
