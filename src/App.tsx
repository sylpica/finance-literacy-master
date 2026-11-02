import { useEffect, useMemo, useState } from 'react';
import { DOMAINS } from './content/domains';
import { LESSONS, QUESTIONS, lessonById, searchAll } from './content';
import { REGULATIONS } from './content/regulations';
import { AppProvider, useApp } from './state';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LessonPage } from './pages/LessonPage';
import { QuizPage, type QuizMode } from './pages/QuizPage';
import { SimulatorsPage } from './pages/SimulatorsPage';
import { LabsPage } from './pages/LabsPage';
import { VirtualPage } from './pages/VirtualPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { DataPage } from './pages/DataPage';

function useHashRoute(): [string, (p: string) => void] {
  const [route, setRoute] = useState(() => window.location.hash.replace(/^#\/?/, ''));
  useEffect(() => {
    const on = () => setRoute(window.location.hash.replace(/^#\/?/, ''));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (p: string) => { window.location.hash = `/${p}`; };
  return [route, go];
}

const NAV: { path: string; label: string }[] = [
  { path: '', label: 'ホーム（教材）' },
  { path: 'map', label: '学習マップ' },
  { path: 'quiz/random', label: '問題演習' },
  { path: 'labs', label: '分析ラボ' },
  { path: 'sim', label: 'シミュレーション' },
  { path: 'virtual', label: '仮想投資' },
  { path: 'analytics', label: '学習分析' },
  { path: 'search', label: '検索' },
  { path: 'regulations', label: '制度情報' },
  { path: 'data', label: 'データ管理' },
  { path: 'settings', label: '設定' },
];

function Home({ go }: { go: (p: string) => void }) {
  const { state } = useApp();
  const stats = useMemo(() => {
    const attemptedByLesson = new Map<string, Set<string>>();
    const firstByQuestion = new Map<string, boolean>();
    for (const a of [...(state?.attempts ?? [])].sort((x, y) => x.answeredAt - y.answeredAt)) {
      const q = QUESTIONS.find(x => x.id === a.questionId); if (!q) continue;
      const s = attemptedByLesson.get(q.lessonId) ?? new Set<string>(); s.add(q.id); attemptedByLesson.set(q.lessonId, s);
      if (!firstByQuestion.has(a.questionId)) firstByQuestion.set(a.questionId, a.correct);
    }
    const doneLessons = LESSONS.filter(l => (attemptedByLesson.get(l.id)?.size ?? 0) >= l.questionIds.length && l.questionIds.length > 0).length;
    const firstTotal = firstByQuestion.size;
    const firstCorrect = [...firstByQuestion.values()].filter(Boolean).length;
    const now = Date.now();
    const dueCount = (state?.schedule ?? []).filter(s => s.dueAt <= now).length;
    const nextLesson = LESSONS.find(l => (attemptedByLesson.get(l.id)?.size ?? 0) < l.questionIds.length) ?? LESSONS[0];
    return { attemptedByLesson, doneLessons, firstTotal, firstCorrect, dueCount, nextLesson };
  }, [state]);
  const nextLesson = stats.nextLesson;
  const domainProgress = (domainId: string) => {
    const qs = QUESTIONS.filter(q => q.lessonId.startsWith(`${domainId}-`));
    const done = qs.filter(q => (stats.attemptedByLesson.get(q.lessonId)?.has(q.id)) ?? false).length;
    return { done, total: qs.length };
  };
  return (
    <main>
      {(() => {
        const next = stats.dueCount > 0
          ? { title: `復習が${stats.dueCount}問たまっています`, body: '期限の来た問題から先に片付けると、記憶の定着効率が上がります。', label: '復習をはじめる', path: 'quiz/review' }
          : stats.doneLessons < LESSONS.length && nextLesson
            ? { title: '教材の続きを学びましょう', body: `${nextLesson.id} ${nextLesson.title} が次の教材です。教材で概念を押さえてから演習に進む流れが基本です。`, label: '教材を開く', path: `lesson/${nextLesson.id}` }
            : { title: '演習でアウトプットしましょう', body: '教材は一通り学習済みです。演習で初見正答率を測りましょう。', label: '演習をはじめる', path: 'quiz/random' };
        return (
          <section className="hero" aria-label="次にやること">
            <h2>次にやること：{next.title}</h2>
            <p>{next.body}</p>
            <button className="primary" onClick={() => go(next.path)}>{next.label}</button>
          </section>
        );
      })()}
      <section className="panel" aria-label="学習の流れ">
        <h3>学習の流れ</h3>
        <ol className="flow">
          <li><button onClick={() => nextLesson && go(`lesson/${nextLesson.id}`)}><b>教材</b><span>学習済み {stats.doneLessons}／{LESSONS.length}件</span></button></li>
          <li><button onClick={() => go('quiz/random')}><b>演習</b><span>累計 {stats.firstTotal}問に回答</span></button></li>
          <li><button onClick={() => go('quiz/review')}><b>復習</b><span>期限の来た問題 {stats.dueCount}問</span></button></li>
        </ol>
      </section>
      <section className="panel" aria-label="学習状況">
        <div className="stat-grid">
          <div className="stat"><div className="stat-value">{stats.doneLessons}<span className="meta"> / {LESSONS.length}</span></div><div className="stat-label">学習済みの教材</div></div>
          <div className="stat"><div className="stat-value">{stats.firstTotal}<span className="meta"> / {QUESTIONS.length}</span></div><div className="stat-label">回答した問題</div></div>
          <div className="stat"><div className="stat-value">{stats.firstTotal > 0 ? `${Math.round((stats.firstCorrect / stats.firstTotal) * 100)}%` : '—'}</div><div className="stat-label">初見正答率</div></div>
          <div className="stat"><div className="stat-value">{stats.dueCount}<span className="meta"> 問</span></div><div className="stat-label">復習期限が来た問題</div></div>
        </div>
        <div className="progress" role="progressbar" aria-label="全体の進捗" aria-valuemin={0} aria-valuemax={QUESTIONS.length} aria-valuenow={stats.firstTotal}>
          <div className="progress-fill" style={{ width: `${QUESTIONS.length ? (stats.firstTotal / QUESTIONS.length) * 100 : 0}%` }} />
        </div>
      </section>
      {DOMAINS.map(d => {
        const dp = domainProgress(d.id);
        return (
          <section key={d.id} className="domain-block">
            <div className="domain-head">
              <h3>{d.id}. {d.name}</h3>
              <div className="domain-progress">
                <span className="meta">{dp.done} / {dp.total} 問に回答</span>
                <div className="progress" role="progressbar" aria-label={`${d.name}の進捗`} aria-valuemin={0} aria-valuemax={dp.total} aria-valuenow={dp.done}>
                  <div className="progress-fill" style={{ width: `${dp.total ? (dp.done / dp.total) * 100 : 0}%` }} />
                </div>
              </div>
            </div>
            <p className="meta">{d.summary}</p>
            <div className="lesson-grid">
              {LESSONS.filter(l => l.domainId === d.id).map(l => {
                const done = stats.attemptedByLesson.get(l.id)?.size ?? 0;
                const total = l.questionIds.length;
                const status = total > 0 && done >= total ? 'done' : done > 0 ? 'doing' : 'todo';
                return (
                  <button key={l.id} className="lesson-card" onClick={() => go(`lesson/${l.id}`)}>
                    <span className="lesson-card-top">
                      <span className="lesson-id">{l.id}</span>
                      <span className={`status-chip ${status}`}>{status === 'done' ? '学習済み' : status === 'doing' ? '学習中' : '未学習'}</span>
                    </span>
                    <span className="lesson-title">{l.title}</span>
                    <span className="meta">難易度{l.level}／問題{total}問{l.reviewStatus === 'draft' ? '／要確認' : ''}</span>
                    <span className="progress" aria-hidden="true"><span className={`progress-fill${status === 'done' ? ' good' : ''}`} style={{ display: 'block', width: `${total ? (done / total) * 100 : 0}%` }} /></span>
                  </button>
                );
              })}
            </div>
            <button className="chip" onClick={() => go(`quiz/domain/${d.id}`)}>この分野の問題を解く</button>
          </section>
        );
      })}
      <section className="panel" aria-label="このアプリについて">
        <h3>このアプリについて</h3>
        <p className="meta">全{LESSONS.length}教材・{QUESTIONS.length}問。章の順番は強制しません。前提知識から自由に選べます。株式と暗号資産を最重要分野として厚く扱い、保険・相続は対象外です。教材から演習へ、間違えた問題は復習へ、という流れで学習がつながります。</p>
      </section>
    </main>
  );
}

function MapPage({ go }: { go: (p: string) => void }) {
  return (
    <main>
      <h2>学習マップ（前提知識のつながり）</h2>
      {DOMAINS.map(d => (
        <section key={d.id} className="panel">
          <h3>{d.id}. {d.name}</h3>
          <ul>
            {LESSONS.filter(l => l.domainId === d.id).map(l => (
              <li key={l.id}>
                <button className="linklike" onClick={() => go(`lesson/${l.id}`)}>{l.id} {l.title}</button>
                {l.prerequisites.length > 0 && <span className="meta"> ← 前提: {l.prerequisites.map(p => `${p} ${lessonById.get(p)?.title ?? ''}`).join('、')}</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}

function SearchPage({ go }: { go: (p: string) => void }) {
  const { state } = useApp();
  const [q, setQ] = useState('');
  const res = useMemo(() => searchAll(q), [q]);
  const noteHits = useMemo(() => (q ? (state?.notes ?? []).filter(n => n.text.includes(q)) : []), [q, state]);
  return (
    <main>
      <h2>検索</h2>
      <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="教材・用語・問題・メモを検索" aria-label="検索" className="search-input" />
      {q && (
        <div>
          <h3>教材 {res.lessons.length}件</h3>
          <ul>{res.lessons.map(l => <li key={l.id}><button className="linklike" onClick={() => go(`lesson/${l.id}`)}>{l.id} {l.title}</button></li>)}</ul>
          <h3>問題 {res.questions.length}件</h3>
          <ul>{res.questions.map(x => <li key={x.id}><button className="linklike" onClick={() => go(`quiz/lesson/${x.lessonId}`)}>{x.id}: {x.prompt.slice(0, 60)}…</button></li>)}</ul>
          <h3>メモ {noteHits.length}件</h3>
          <ul>{noteHits.map(n => <li key={n.id}><button className="linklike" onClick={() => go(`lesson/${n.lessonId}`)}>{n.lessonId} のメモ</button>: {n.text.slice(0, 80)}</li>)}</ul>
          {res.lessons.length + res.questions.length + noteHits.length === 0 && <p>「{q}」に一致する教材・問題・メモは見つかりませんでした。別の語句で試してください。</p>}
        </div>
      )}
    </main>
  );
}

function RegulationsPage() {
  const statusLabel = { 'in-force': '施行中', 'enacted-not-yet': '成立済み・未施行', proposal: '提案段階' } as const;
  return (
    <main>
      <h2>制度情報（構造化データ）</h2>
      {REGULATIONS.map(r => (
        <section key={r.id} className="domain-block">
          <h3>{r.name}（{r.jurisdiction}）</h3>
          <p><span className="badge">{statusLabel[r.status]}</span>{r.effectiveFrom ? ` ／ 適用開始: ${r.effectiveFrom}` : ''}{r.announcedAt ? ` ／ 公表日・節目: ${r.announcedAt}` : ''}{r.effectiveTo ? ` ／ 終了: ${r.effectiveTo}` : ''} ／ 対象: {r.appliesTo}</p>
          <div className="table-scroll"><table><tbody>
            {r.keyNumbers.map((k, i) => <tr key={i}><th>{k.label}</th><td>{k.value}</td></tr>)}
          </tbody></table></div>
          <p className="meta">出典: <a href={r.source.url} target="_blank" rel="noreferrer noopener">{r.source.title}</a>（{r.source.publisher}、確認日 {r.source.checkedAt}）／ データ v{r.version} ／ 履歴: {r.history}</p>
        </section>
      ))}
      <p className="meta">制度は本文の固定文章ではなく、適用期間・状態・出典を持つデータとして管理しています。将来の改正案を現行制度として扱いません。</p>
    </main>
  );
}

function SettingsPage({ go }: { go: (p: string) => void }) {
  const { density, setDensity, theme, setTheme } = useApp();
  return (
    <main>
      <h2>設定</h2>
      <section className="panel">
        <h3>表示</h3>
        <p>テーマ:
          <button className={theme === 'dark' ? 'chip active' : 'chip'} aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>ダーク</button>
          <button className={theme === 'light' ? 'chip active' : 'chip'} aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>ライト</button></p>
        <p>表示密度:
          <button className={density === 'normal' ? 'chip active' : 'chip'} aria-pressed={density === 'normal'} onClick={() => setDensity('normal')}>通常</button>
          <button className={density === 'dense' ? 'chip active' : 'chip'} aria-pressed={density === 'dense'} onClick={() => setDensity('dense')}>高密度</button></p>
      </section>
      <section className="panel">
        <h3>データとこのアプリについて</h3>
      <p>学習データは端末内（IndexedDB）に保存されます。ブラウザの保存領域は永久保持が保証されないため、<button className="linklike" onClick={() => go('data')}>データ管理</button>から定期的にバックアップしてください。</p>
      <p className="meta">このアプリは無料・ログイン不要で、実行時に外部AIや有料APIを使いません。実取引・口座連携・ウォレット接続の機能はなく、秘密鍵やシードフレーズの入力欄もありません。</p>
      </section>
    </main>
  );
}

function Shell() {
  const [route, go] = useHashRoute();
  const parts = route.split('/');
  let page: React.ReactNode;
  if (route === '') page = <Home go={go} />;
  else if (parts[0] === 'lesson') page = <LessonPage key={parts[1] ?? ''} lessonId={parts[1] ?? ''} go={go} />;
  else if (parts[0] === 'quiz') {
    const sub = parts[1] ?? 'random';
    const mode: QuizMode = sub === 'lesson' ? { kind: 'lesson', lessonId: parts[2] ?? '' }
      : sub === 'domain' ? { kind: 'domain', domainId: parts[2] ?? '' }
      : sub === 'review' ? { kind: 'review' } : sub === 'weak' ? { kind: 'weak' } : { kind: 'random' };
    page = <QuizPage key={route} mode={mode} go={go} />;
  }
  else if (parts[0] === 'sim') page = <SimulatorsPage key={route} initial={parts[1]} />;
  else if (parts[0] === 'labs') page = <LabsPage go={go} />;
  else if (parts[0] === 'virtual') page = <VirtualPage />;
  else if (parts[0] === 'analytics') page = <AnalyticsPage go={go} />;
  else if (parts[0] === 'map') page = <MapPage go={go} />;
  else if (parts[0] === 'search') page = <SearchPage go={go} />;
  else if (parts[0] === 'regulations') page = <RegulationsPage />;
  else if (parts[0] === 'data') page = <DataPage />;
  else if (parts[0] === 'settings') page = <SettingsPage go={go} />;
  else page = <Home go={go} />;
  return (
    <div className="app">
      <header>
        <div className="brand">
          <h1><button className="linklike title" onClick={() => go('')}>資産形成・金融教養マスター</button></h1>
        </div>
        <nav aria-label="主要画面">
          {NAV.map(n => <button key={n.path + n.label} className={route === n.path ? 'nav active' : 'nav'} aria-current={route === n.path ? 'page' : undefined} onClick={() => go(n.path)}>{n.label}</button>)}
        </nav>
      </header>
      <ErrorBoundary key={route}>{page}</ErrorBoundary>
      <footer><p className="meta">学習専用アプリです。投資助言ではなく、将来の価格・リターンを保証しません。制度情報は出典と確認日を確認してください。</p></footer>
    </div>
  );
}

export default function App() { return <AppProvider><Shell /></AppProvider>; }
