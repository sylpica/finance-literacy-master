import { DOMAINS } from '../content/domains';
import { LESSONS, QUESTIONS, lessonById } from '../content';
import { accuracyByDomain, masteryByLesson, recommendLessons } from '../learning/mastery';
import { useApp } from '../state';

export function AnalyticsPage({ go }: { go: (path: string) => void }) {
  const { state } = useApp();
  if (!state) return <main><p>読み込み中…</p></main>;
  const acc = accuracyByDomain(state.attempts, QUESTIONS);
  const mastery = masteryByLesson(state.attempts, QUESTIONS);
  const now = Date.now();
  const dueIds = new Set(state.schedule.filter(s => s.dueAt <= now).map(s => s.questionId));
  const recs = recommendLessons(state.attempts, QUESTIONS, dueIds);
  return (
    <main>
      <h2>学習分析</h2>
      <p>回答数 {state.attempts.length} ／ 復習期限の問題 {dueIds.size}問 ／ 仮想投資の実施 {state.virtual.length}件</p>
      <h3>分野別正答率</h3>
      <div className="table-scroll"><table>
        <thead><tr><th>分野</th><th>回答</th><th>正答</th><th>正答率</th></tr></thead>
        <tbody>
          {DOMAINS.map(d => { const a = acc.get(d.id); return (
            <tr key={d.id}><td>{d.id}. {d.name}</td><td>{a?.total ?? 0}</td><td>{a?.correct ?? 0}</td><td>{a && a.total > 0 ? `${Math.round((a.correct / a.total) * 100)}%` : '—'}</td></tr>); })}
        </tbody></table></div>
      <h3>教材別習熟度</h3>
      <p className="meta">習熟度は「難易度で重み付けし、初見正答を1、再挑戦での正答を0.5」とする説明可能な推定です。反復だけで高くならないよう設計しています。記憶の確率ではありません。</p>
      <div className="table-scroll"><table>
        <thead><tr><th>教材</th><th>習熟度</th></tr></thead>
        <tbody>
          {LESSONS.filter(l => mastery.has(l.id)).map(l => <tr key={l.id}><td>{l.id} {l.title}</td><td>{Math.round((mastery.get(l.id) ?? 0) * 100)}%</td></tr>)}
          {mastery.size === 0 && <tr><td colSpan={2}>まだ演習記録がありません</td></tr>}
        </tbody></table></div>
      <h3>おすすめの次の一歩</h3>
      {recs.length === 0 ? <p>推薦はありません。</p> : <ul>{recs.map(r => <li key={r.lessonId}><button className="linklike" onClick={() => go(`lesson/${r.lessonId}`)}>{r.lessonId} {lessonById.get(r.lessonId)?.title}</button> — {r.reason}</li>)}</ul>}
      <button className="primary" onClick={() => go('quiz/review')}>復習（期限・間違い問題）</button>{' '}
      <button onClick={() => go('quiz/weak')}>弱点復習</button>
    </main>
  );
}
