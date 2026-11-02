import { DOMAINS } from '../content/domains';
import { LESSONS, QUESTIONS, lessonById } from '../content';
import { accuracyByDomain, masteryByLesson, recommendLessons } from '../learning/mastery';
import { useApp } from '../state';

export function AnalyticsPage({ go }: { go: (path: string) => void }) {
  const { state } = useApp();
  if (!state) return <main><p>読み込み中…</p></main>;
  const acc = accuracyByDomain(state.attempts, QUESTIONS);
  const mastery = masteryByLesson(state.attempts, QUESTIONS);
  const attemptedCount = new Map<string, number>();
  for (const qid of new Set(state.attempts.map(a => a.questionId))) {
    const q = QUESTIONS.find(x => x.id === qid); if (q) attemptedCount.set(q.lessonId, (attemptedCount.get(q.lessonId) ?? 0) + 1);
  }
  const now = Date.now();
  const dueIds = new Set(state.schedule.filter(s => s.dueAt <= now).map(s => s.questionId));
  const recs = recommendLessons(state.attempts, QUESTIONS, dueIds);
  return (
    <main>
      <h2>学習分析</h2>
      <div className="stat-grid">
        <div className="stat"><div className="stat-value">{state.attempts.length}</div><div className="stat-label">回答数</div></div>
        <div className="stat"><div className="stat-value">{dueIds.size}<span className="meta"> 問</span></div><div className="stat-label">復習期限の問題</div></div>
        <div className="stat"><div className="stat-value">{state.virtual.length}<span className="meta"> 件</span></div><div className="stat-label">仮想投資の実施</div></div>
      </div>
      <section className="panel">
      <h3>分野別正答率</h3>
      <div className="table-scroll"><table>
        <thead><tr><th>分野</th><th>回答</th><th>正答</th><th>正答率</th></tr></thead>
        <tbody>
          {DOMAINS.map(d => { const a = acc.get(d.id); return (
            <tr key={d.id}><td>{d.id}. {d.name}</td><td>{a?.total ?? 0}</td><td>{a?.correct ?? 0}</td><td>{a && a.total > 0 ? `${Math.round((a.correct / a.total) * 100)}%` : '—'}</td></tr>); })}
        </tbody></table></div>
      </section>
      <section className="panel">
      <h3>教材別習熟度</h3>
      <div className="table-scroll"><table>
        <thead><tr><th>教材</th><th>習熟度</th><th>回答済み</th></tr></thead>
        <tbody>
          {LESSONS.filter(l => attemptedCount.has(l.id)).map(l => <tr key={l.id}><td>{l.id} {l.title}</td><td>{Math.round((mastery.get(l.id) ?? 0) * 100)}%</td><td>{attemptedCount.get(l.id)}/{QUESTIONS.filter(q => q.lessonId === l.id).length}問</td></tr>)}
          {attemptedCount.size === 0 && <tr><td colSpan={3}>まだ演習記録がありません</td></tr>}
        </tbody></table></div>
      <p className="meta">習熟度は「教材の全問題を分母に、難易度で重み付けし、初見正答を1、再挑戦での正答を0.5、未回答を0」とする説明可能な推定です。1問だけ正答しても100%にはなりません。記憶の確率ではありません。</p>
      </section>
      <section className="panel">
      <h3>おすすめの次の一歩</h3>
      {recs.length === 0 ? <p>推薦はありません。</p> : <ul>{recs.map(r => <li key={r.lessonId}><button className="linklike" onClick={() => go(`lesson/${r.lessonId}`)}>{r.lessonId} {lessonById.get(r.lessonId)?.title}</button> — {r.reason}</li>)}</ul>}
      <div className="cta-row">
        <button className="primary" onClick={() => go('quiz/review')}>復習（期限・間違い問題）</button>
        <button onClick={() => go('quiz/weak')}>弱点復習</button>
      </div>
      </section>
    </main>
  );
}
