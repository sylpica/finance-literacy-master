import { useMemo, useState } from 'react';
import { searchAll } from '../content';
import { FLASHCARDS } from '../content/flashcards';
import { useApp } from '../state';

export function SearchPage({ initial, go }: { initial: string; go: (p: string) => void }) {
  const { state } = useApp();
  const [q, setQ] = useState(initial);
  const res = useMemo(() => searchAll(q), [q]);
  const needle = q.trim().toLowerCase();
  // メモ検索も大文字小文字を区別しない（監査 P2-15）
  const noteHits = useMemo(() => (needle ? (state?.notes ?? []).filter(n => n.text.toLowerCase().includes(needle)) : []), [needle, state]);
  // 単語帳カードの表裏も検索対象（監査ラウンド3、指令書7.1）
  const cardHits = useMemo(() => (needle ? FLASHCARDS.filter(c => c.term.toLowerCase().includes(needle) || c.definition.toLowerCase().includes(needle) || c.cue.toLowerCase().includes(needle)) : []), [needle]);
  const total = res.lessons.length + res.questions.length + noteHits.length + cardHits.length;
  return (
    <main>
      <h2 className="visually-hidden">検索</h2>
      <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="教材・用語・問題・メモを検索" aria-label="検索" className="search-input" autoFocus={!initial} />
      {needle && (
        <div className="search-results">
          <section>
            <h3>教材 {res.lessons.length}件</h3>
            <ul>{res.lessons.map(l => <li key={l.id}><button className="linklike" onClick={() => go(`lesson/${l.id}`)}>{l.id} {l.title}</button></li>)}</ul>
          </section>
          {cardHits.length > 0 && (
            <section>
              <h3>単語帳の用語 {cardHits.length}件</h3>
              <ul>{cardHits.map(c => <li key={c.cardId}><button className="linklike" onClick={() => go(`cards/lesson/${c.lessonId}`)}>{c.term}</button> <span className="meta">（{c.lessonId} の単語帳）</span></li>)}</ul>
            </section>
          )}
          <section>
            <h3>問題 {res.questions.length}件</h3>
            {/* ヒットした問題そのものを開く（監査 P2-15: 従来は教材の演習の先頭へ遷移していた） */}
            <ul>{res.questions.map(x => <li key={x.id}><button className="linklike" onClick={() => go(`quiz/q/${x.id}`)}>{x.id}: {x.prompt}</button></li>)}</ul>
          </section>
          {noteHits.length > 0 && (
            <section>
              <h3>メモ {noteHits.length}件</h3>
              <ul>{noteHits.map(n => <li key={n.id}><button className="linklike" onClick={() => go(`lesson/${n.lessonId}`)}>{n.lessonId} のメモ</button>: {n.text}</li>)}</ul>
            </section>
          )}
          {total === 0 && <p>「{q}」に一致する教材・問題・メモは見つかりませんでした。</p>}
        </div>
      )}
      <p className="meta page-foot">教材の全4層・用語・誤解、問題文・選択肢・解説、学習メモを対象に、大文字小文字を区別せず検索します。</p>
    </main>
  );
}
