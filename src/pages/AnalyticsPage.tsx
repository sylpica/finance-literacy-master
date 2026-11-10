import { DOMAINS } from '../content/domains';
import { LESSONS, QUESTIONS, lessonById } from '../content';
import { accuracyByDifficulty, accuracyByDomain, dailyActivity, masteryByLesson, recommendLessons } from '../learning/mastery';
import { useApp } from '../state';

const pct = (a?: { total: number; correct: number }) => (a && a.total > 0 ? `${Math.round((a.correct / a.total) * 100)}%` : '—');

export function AnalyticsPage({ go }: { go: (path: string) => void }) {
  const { state } = useApp();
  if (!state) return <main><p>読み込み中…</p></main>;
  const acc = accuracyByDomain(state.attempts, QUESTIONS);
  const byLevel = accuracyByDifficulty(state.attempts, QUESTIONS);
  const mastery = masteryByLesson(state.attempts, QUESTIONS);
  const attemptedCount = new Map<string, number>();
  for (const qid of new Set(state.attempts.map(a => a.questionId))) {
    const q = QUESTIONS.find(x => x.id === qid); if (q) attemptedCount.set(q.lessonId, (attemptedCount.get(q.lessonId) ?? 0) + 1);
  }
  const now = Date.now();
  const dueIds = new Set(state.schedule.filter(s => s.dueAt <= now).map(s => s.questionId));
  const recs = recommendLessons(state.attempts, QUESTIONS, dueIds);
  const history = dailyActivity(state.attempts, now, 14);
  const maxDay = Math.max(1, ...history.map(h => h.answered));
  const levelTotals = [1, 2, 3].map(l => QUESTIONS.filter(q => q.difficulty === l).length);
  return (
    <main>
      <div className="page-head">
        <h2>学習分析</h2>
        <div className="cta-row">
          <button className="primary" onClick={() => go('quiz/review')}>復習をはじめる（期限到来 {dueIds.size}問と直近の誤答が対象）</button>
          <button onClick={() => go('quiz/weak')}>弱点復習</button>
        </div>
      </div>
      <div className="analytics-grid">
        <section className="panel tight">
          <h3>おすすめの次の一歩</h3>
          {recs.length === 0 ? <p>推薦はありません。</p> : <ul className="map-list">{recs.map(r => <li key={r.lessonId}><button className="linklike" onClick={() => go(`lesson/${r.lessonId}`)}>{r.lessonId} {lessonById.get(r.lessonId)?.title}</button> <span className="meta">{r.reason}</span></li>)}</ul>}
          <h3>難易度別の初回正答率</h3>
          <div className="table-scroll"><table className="compact">
            <thead><tr><th>難易度</th><th>回答</th><th>初回正答</th><th>正答率</th></tr></thead>
            <tbody>{[1, 2, 3].map((l, i) => { const a = byLevel.get(String(l)); return <tr key={l}><th>{['1 基礎', '2 中級', '3 上級'][i]}</th><td>{a?.total ?? 0}/{levelTotals[i]}</td><td>{a?.correct ?? 0}</td><td>{pct(a)}</td></tr>; })}</tbody>
          </table></div>
          <h3>直近14日の回答数</h3>
          <div className="bars" role="img" aria-label={`直近14日の回答数: ${history.map(h => `${h.date.slice(5)} ${h.answered}問`).join('、')}`}>
            {history.map(h => <div key={h.date} className="bar" title={`${h.date}: ${h.answered}問（正答${h.correct}）`}><span style={{ height: `${(h.answered / maxDay) * 100}%` }} /><small>{Number(h.date.slice(8))}</small></div>)}
          </div>
        </section>
        <section className="panel tight">
          <h3>分野別の初回正答率</h3>
          <div className="table-scroll"><table className="compact">
            <thead><tr><th>分野</th><th>回答</th><th>初回正答</th><th>正答率</th></tr></thead>
            <tbody>
              {DOMAINS.map(d => { const a = acc.get(d.id); const denom = LESSONS.filter(l => l.domainId === d.id).reduce((s, l) => s + l.questionIds.length, 0); return (
                <tr key={d.id}><th>{d.id}. {d.name}</th><td>{a?.total ?? 0}/{denom}</td><td>{a?.correct ?? 0}</td><td>{pct(a)}</td></tr>); })}
            </tbody></table></div>
        </section>
        <section className="panel tight wide">
          <h3>教材別習熟度</h3>
          <div className="table-scroll"><table className="compact">
            <thead><tr><th>教材</th><th>習熟度</th><th>回答済み</th></tr></thead>
            <tbody>
              {LESSONS.filter(l => attemptedCount.has(l.id)).map(l => <tr key={l.id}><th><button className="linklike" onClick={() => go(`lesson/${l.id}`)}>{l.id} {l.title}</button></th><td>{Math.round((mastery.get(l.id) ?? 0) * 100)}%</td><td>{attemptedCount.get(l.id)}/{l.questionIds.length}問</td></tr>)}
              {attemptedCount.size === 0 && <tr><td colSpan={3}>まだ演習記録がありません</td></tr>}
            </tbody></table></div>
        </section>
      </div>
      <p className="meta page-foot">回答数 {state.attempts.length}件・仮想投資 {state.virtual.length}件。正答率は各問題の初回の回答だけで集計し、同じ問題の繰り返しで上がらないようにしています。習熟度は教材の全問題を分母に、難易度で重み付けし、初見正答を1、再挑戦での正答を0.5、未回答を0とする説明可能な推定で、記憶の確率ではありません。</p>
    </main>
  );
}
