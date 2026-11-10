import { useRef, useState } from 'react';
import { LESSONS, domainById, lessonById } from '../content/catalog';
import { LessonFigure } from '../components/LessonFigure';
import { useApp } from '../state';

/** 長い1段落の教材本文を、文単位で2〜3文ずつの段落に分けて描画する（監査ラウンド3）。
 *  内容は一切変えない: splitParagraphs(t).join('') === t をテストで保証する。 */
export function splitParagraphs(text: string): string[] {
  const sentences = text.match(/[^。]*。|[^。]+$/g) ?? [text];
  const paras: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && (cur.length + s.length > 190 || (cur.match(/。/g) ?? []).length >= 3)) { paras.push(cur); cur = ''; }
    cur += s;
  }
  if (cur) paras.push(cur);
  return paras;
}

const LAYERS = ['overview', 'detail', 'theory', 'practice'] as const;
type Layer = (typeof LAYERS)[number];
const layerLabels: Record<Layer, string> = { overview: '概要', detail: '詳細', theory: '専門理論', practice: '実践例' };

export function LessonPage({ lessonId, go }: { lessonId: string; go: (path: string) => void }) {
  const lesson = lessonById.get(lessonId);
  const { state, toggleBookmark, saveNote } = useApp();
  const [layer, setLayer] = useState<Layer>('overview');
  // null = 未編集（保存済みメモを表示）。編集を始めたら下書きが正となり、空文字への削除も可能にする。
  const [noteText, setNoteText] = useState<string | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  if (!lesson) return <main><p>教材が見つかりません。</p><button onClick={() => go('')}>教材一覧へ</button></main>;
  const bookmarked = state?.bookmarks.some(b => b.lessonId === lesson.id) ?? false;
  const myNote = state?.notes.find(n => n.lessonId === lesson.id);
  const domain = domainById.get(lesson.domainId);
  const idx = LESSONS.findIndex(l => l.id === lesson.id);
  const prev = LESSONS[idx - 1];
  const next = LESSONS[idx + 1];
  const attempted = new Set((state?.attempts ?? []).filter(a => lesson.questionIds.includes(a.questionId)).map(a => a.questionId));
  // タブの矢印キー操作（WAI-ARIA タブパターン、監査 P3-14）
  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? LAYERS.length - 1 : null;
    if (n === null) return;
    e.preventDefault();
    const k = (n + LAYERS.length) % LAYERS.length;
    setLayer(LAYERS[k] as Layer); tabRefs.current[k]?.focus();
  };
  const noteValue = noteText ?? myNote?.text ?? '';
  return (
    <main className="lesson">
      <p className="breadcrumb"><button className="linklike" onClick={() => go('')}>教材一覧</button> ／ {domain ? `${domain.id}. ${domain.name}` : lesson.domainId}</p>
      <div className="lesson-head">
        <h2>{lesson.id} {lesson.title}</h2>
        <div className="lesson-actions">
          <span className="info-chip" aria-label={`難易度${lesson.level}`}>難易度{lesson.level}</span>
          {lesson.reviewStatus === 'draft' && <span className="info-chip warn-text">要確認</span>}
          <button className="chip" onClick={() => void toggleBookmark(lesson.id)} aria-pressed={bookmarked} aria-label={bookmarked ? 'ブックマークを外す' : 'ブックマークする'}>{bookmarked ? '★' : '☆'}</button>
          <button className="primary" onClick={() => go(`quiz/lesson/${lesson.id}`)}>演習 {attempted.size}/{lesson.questionIds.length}問</button>
          <button onClick={() => go(`cards/lesson/${lesson.id}`)}>単語帳で用語を覚える</button>
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="解説の層">
        {LAYERS.map((k, i) => (
          <button key={k} ref={el => { tabRefs.current[i] = el; }} id={`tab-${k}`} role="tab" aria-selected={layer === k} aria-controls="lesson-layer-panel"
            tabIndex={layer === k ? 0 : -1} className={layer === k ? 'tab active' : 'tab'} onClick={() => setLayer(k)} onKeyDown={e => onTabKey(e, i)}>{layerLabels[k]}</button>
        ))}
      </div>
      <article className="lesson-body" id="lesson-layer-panel" role="tabpanel" aria-labelledby={`tab-${layer}`} tabIndex={0}>
        {splitParagraphs(lesson.layers[layer]).map((p, i) => <p key={i}>{p}</p>)}
      </article>
      {layer === 'overview' && <LessonFigure lessonId={lesson.id} />}
      <section className="notice" aria-label="よくある誤解・注意点">
        <h3>よくある誤解</h3>
        <ul>{lesson.misconceptions.map((m, i) => <li key={i}>{m}</li>)}</ul>
      </section>
      <div className="lesson-meta-grid">
        <section className="panel tight">
          <h3>到達目標</h3>
          <ul>{lesson.objectives.map((o, i) => <li key={i}>{o}</li>)}</ul>
          <div className="chip-row" aria-label="重要用語（押すと単語帳で開く）">{lesson.terms.map(t => <button key={t} className="chip" onClick={() => go(`cards/lesson/${lesson.id}`)}>{t}</button>)}</div>
        </section>
        <section className="panel tight">
          {lesson.prerequisites.length > 0 && (<>
            <h3>前提知識</h3>
            <div className="chip-row">{lesson.prerequisites.map(p => <button key={p} className="chip" onClick={() => go(`lesson/${p}`)}>{p} {lessonById.get(p)?.title ?? ''}</button>)}</div>
          </>)}
          {lesson.related.length > 0 && (<>
            <h3>関連教材</h3>
            <div className="chip-row">{lesson.related.map(r => <button key={r} className="chip" onClick={() => go(`lesson/${r}`)}>{r} {lessonById.get(r)?.title ?? ''}</button>)}</div>
          </>)}
        </section>
      </div>
      <section className="note-box">
        <label htmlFor="lesson-note"><h3>学習メモ</h3></label>
        <textarea id="lesson-note" value={noteValue} onChange={e => setNoteText(e.target.value)} rows={2} placeholder="個人的なメモ（採点対象ではありません）" />
        <button onClick={() => void saveNote({ id: `note-${lesson.id}`, lessonId: lesson.id, text: noteValue, updatedAt: Date.now() })} disabled={noteText === null || noteText === (myNote?.text ?? '')}>メモを保存</button>
      </section>
      <nav className="pager" aria-label="前後の教材">
        {prev ? <button onClick={() => go(`lesson/${prev.id}`)}>← {prev.id} {prev.title}</button> : <span />}
        {next ? <button onClick={() => go(`lesson/${next.id}`)}>{next.id} {next.title} →</button> : <span />}
      </nav>
      <section className="page-foot">
        <h3>出典</h3>
        <ul className="meta">{lesson.sources.map((s, i) => <li key={i}><a href={s.url} target="_blank" rel="noreferrer noopener">{s.title}</a>（{s.publisher}、確認日 {s.checkedAt}）</li>)}</ul>
      </section>
    </main>
  );
}
