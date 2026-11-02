import { useState } from 'react';
import { LESSONS, domainById, lessonById } from '../content';
import { useApp } from '../state';

export function LessonPage({ lessonId, go }: { lessonId: string; go: (path: string) => void }) {
  const lesson = lessonById.get(lessonId);
  const { state, toggleBookmark, saveNote } = useApp();
  const [layer, setLayer] = useState<'overview' | 'detail' | 'theory' | 'practice'>('overview');
  // null = 未編集（保存済みメモを表示）。編集を始めたら下書きが正となり、空文字への削除も可能にする。
  const [noteText, setNoteText] = useState<string | null>(null);
  if (!lesson) return <main><p>教材が見つかりません。</p></main>;
  const bookmarked = state?.bookmarks.some(b => b.lessonId === lesson.id) ?? false;
  const myNote = state?.notes.find(n => n.lessonId === lesson.id);
  const layerLabels = { overview: '概要', detail: '詳細', theory: '専門理論', practice: '実践例' } as const;
  const domain = domainById.get(lesson.domainId);
  const idx = LESSONS.findIndex(l => l.id === lesson.id);
  const prev = LESSONS[idx - 1];
  const next = LESSONS[idx + 1];
  const attempted = new Set((state?.attempts ?? []).filter(a => lesson.questionIds.includes(a.questionId)).map(a => a.questionId));
  return (
    <main>
      <p className="breadcrumb">
        <button onClick={() => go('')}>← 教材一覧へ</button>
        {' '}<span className="meta">{domain ? `${domain.id}. ${domain.name}` : lesson.domainId}</span>
      </p>
      <h2>{lesson.id} {lesson.title}</h2>
      <div className="chip-row" aria-label="教材の情報">
        <span className="info-chip">難易度 {lesson.level}</span>
        <span className="info-chip">問題 {lesson.questionIds.length}問（回答済み {attempted.size}問）</span>
        <span className="info-chip">{lesson.reviewStatus === 'verified' ? '検証済み' : '要確認（ドラフト）'}</span>
        <span className="info-chip">教材 v{lesson.version}</span>
        <button className="chip" onClick={() => void toggleBookmark(lesson.id)} aria-pressed={bookmarked}>{bookmarked ? '★ ブックマーク済み' : '☆ ブックマーク'}</button>
      </div>
      <div className="tabs" role="tablist" aria-label="解説の層">
        {(Object.keys(layerLabels) as (keyof typeof layerLabels)[]).map(k => (
          <button key={k} role="tab" aria-selected={layer === k} className={layer === k ? 'tab active' : 'tab'} onClick={() => setLayer(k)}>{layerLabels[k]}</button>
        ))}
      </div>
      <article className="lesson-body" role="tabpanel" aria-label={layerLabels[layer]}><p>{lesson.layers[layer]}</p></article>
      <section className="panel">
        <h3>到達目標</h3>
        <ul>{lesson.objectives.map((o, i) => <li key={i}>{o}</li>)}</ul>
        <h3>重要用語</h3>
        <div className="chip-row">{lesson.terms.map(t => <span key={t} className="info-chip">{t}</span>)}</div>
        {lesson.prerequisites.length > 0 && (
          <>
            <h3>前提知識</h3>
            <div className="chip-row">{lesson.prerequisites.map(p => (
              <button key={p} className="chip" onClick={() => go(`lesson/${p}`)}>{p} {lessonById.get(p)?.title ?? ''}</button>))}</div>
          </>
        )}
      </section>
      <section className="notice" aria-label="よくある誤解・注意点">
        <h3>よくある誤解・注意点</h3>
        <ul>{lesson.misconceptions.map((m, i) => <li key={i}>{m}</li>)}</ul>
      </section>
      <section className="panel">
        <h3>演習問題</h3>
        <p className="meta">この教材の問題を解いて、理解を確認します。間違えた問題は復習リストに入ります。</p>
        <button className="primary" onClick={() => go(`quiz/lesson/${lesson.id}`)}>この教材の問題を解く（{lesson.questionIds.length}問）</button>
        {lesson.related.length > 0 && (
          <>
            <h3>関連教材</h3>
            <div className="chip-row">{lesson.related.map(r => (
              <button key={r} className="chip" onClick={() => go(`lesson/${r}`)}>{r} {lessonById.get(r)?.title ?? ''}</button>))}</div>
          </>
        )}
      </section>
      <section>
        <h3>出典</h3>
        <ul>{lesson.sources.map((s, i) => <li key={i}><a href={s.url} target="_blank" rel="noreferrer noopener">{s.title}</a>（{s.publisher}、確認日 {s.checkedAt}）</li>)}</ul>
      </section>
      <section>
        <h3>学習メモ</h3>
        <textarea value={noteText ?? myNote?.text ?? ''} onChange={e => setNoteText(e.target.value)} rows={3} aria-label="学習メモ" placeholder="個人的なメモ（採点対象ではありません）" />
        <button onClick={() => void saveNote({ id: `note-${lesson.id}`, lessonId: lesson.id, text: noteText ?? myNote?.text ?? '', updatedAt: Date.now() })}>メモを保存</button>
      </section>
      <nav className="pager" aria-label="前後の教材">
        {prev ? <button onClick={() => go(`lesson/${prev.id}`)}>← {prev.id} {prev.title}</button> : <span />}
        {next ? <button onClick={() => go(`lesson/${next.id}`)}>{next.id} {next.title} →</button> : <span />}
      </nav>
    </main>
  );
}
