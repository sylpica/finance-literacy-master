import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { DOMAINS } from './content/domains';
import { LESSONS, TOTAL_QUESTIONS, lessonById, lessonIdOfQuestion } from './content/catalog';
import { AppProvider, useApp } from './state';
import { openSummaryPdf } from './pdf';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LessonPage } from './pages/LessonPage';
import type { QuizMode } from './pages/QuizPage';

// 問題データ・シミュレーター・ケースを使う画面は遅延読み込みにする（監査ラウンド2 P2-17）。
// PWA の precache に全チャンクが含まれるため、オフラインでも読み込める。
const QuizPage = lazy(() => import('./pages/QuizPage').then(m => ({ default: m.QuizPage })));
const SimulatorsPage = lazy(() => import('./pages/SimulatorsPage').then(m => ({ default: m.SimulatorsPage })));
const LabsPage = lazy(() => import('./pages/LabsPage').then(m => ({ default: m.LabsPage })));
const VirtualPage = lazy(() => import('./pages/VirtualPage').then(m => ({ default: m.VirtualPage })));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then(m => ({ default: m.AnalyticsPage })));
const DataPage = lazy(() => import('./pages/DataPage').then(m => ({ default: m.DataPage })));
const SearchPage = lazy(() => import('./pages/SearchPage').then(m => ({ default: m.SearchPage })));
const RegulationsPage = lazy(() => import('./pages/RegulationsPage').then(m => ({ default: m.RegulationsPage })));
const FlashcardsPage = lazy(() => import('./pages/FlashcardsPage').then(m => ({ default: m.FlashcardsPage })));
import type { CardsInit } from './pages/FlashcardsPage';

function useHashRoute(): [string, (p: string) => void] {
  const [route, setRoute] = useState(() => window.location.hash.replace(/^#\/?/, ''));
  useEffect(() => {
    const on = () => { setRoute(window.location.hash.replace(/^#\/?/, '')); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (p: string) => { window.location.hash = `/${p}`; };
  return [route, go];
}

// 現在地の判定は先頭のパス区分で行う（監査 P3-2: quiz/review・sim/dcf・lesson/… でも該当項目を強調する）
const NAV: { path: string; label: string; match: string[] }[] = [
  { path: '', label: 'ホーム', match: ['', 'lesson'] },
  { path: 'quiz/random', label: '演習', match: ['quiz'] },
  { path: 'cards', label: '単語帳', match: ['cards'] },
  { path: 'sim', label: 'シミュレーション', match: ['sim'] },
  { path: 'labs', label: '分析ラボ', match: ['labs'] },
  { path: 'virtual', label: '仮想投資', match: ['virtual'] },
  { path: 'analytics', label: '学習分析', match: ['analytics'] },
  { path: 'map', label: '学習マップ', match: ['map'] },
  { path: 'search', label: '検索', match: ['search'] },
  { path: 'regulations', label: '制度情報', match: ['regulations'] },
  { path: 'data', label: 'データ管理', match: ['data'] },
  { path: 'settings', label: '設定', match: ['settings'] },
];

function useProgress() {
  const { state } = useApp();
  return useMemo(() => {
    const attemptedByLesson = new Map<string, Set<string>>();
    const firstByQuestion = new Map<string, boolean>();
    for (const a of [...(state?.attempts ?? [])].sort((x, y) => x.answeredAt - y.answeredAt)) {
      const lid = lessonIdOfQuestion(a.questionId); if (!lid || !lessonById.has(lid)) continue;
      const s = attemptedByLesson.get(lid) ?? new Set<string>(); s.add(a.questionId); attemptedByLesson.set(lid, s);
      if (!firstByQuestion.has(a.questionId)) firstByQuestion.set(a.questionId, a.correct);
    }
    const doneLessons = LESSONS.filter(l => l.questionIds.length > 0 && (attemptedByLesson.get(l.id)?.size ?? 0) >= l.questionIds.length).length;
    const firstTotal = firstByQuestion.size;
    const firstCorrect = [...firstByQuestion.values()].filter(Boolean).length;
    const now = Date.now();
    const dueCount = (state?.schedule ?? []).filter(s => s.dueAt <= now).length;
    const nextLesson = LESSONS.find(l => (attemptedByLesson.get(l.id)?.size ?? 0) < l.questionIds.length) ?? LESSONS[0];
    return { attemptedByLesson, doneLessons, firstTotal, firstCorrect, dueCount, nextLesson };
  }, [state]);
}

// ホーム（監査ラウンド2 P2-1）: 検索・次の一歩・分野別教材一覧を上部に置き、重複していた3つの集計パネルを1行に統合した。
function Home({ go }: { go: (p: string) => void }) {
  const p = useProgress();
  const [q, setQ] = useState('');
  const wide = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 761px)').matches : true;
  const next = p.dueCount > 0
    ? { label: '今日の復習', path: 'quiz/review' }
    : p.nextLesson && p.doneLessons < LESSONS.length
      ? { label: `続き: ${p.nextLesson.id} ${p.nextLesson.title}`, path: `lesson/${p.nextLesson.id}` }
      : { label: 'ランダム演習', path: 'quiz/random' };
  return (
    <main className="home">
      <h2 className="visually-hidden">教材一覧</h2>
      <div className="home-top">
        <form className="home-search" role="search" onSubmit={e => { e.preventDefault(); go(`search/${encodeURIComponent(q.trim())}`); }}>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="教材・用語・問題を検索" aria-label="教材・用語・問題を検索" />
          <button type="submit">検索</button>
        </form>
        <button className="primary next-step" onClick={() => go(next.path)}>{next.label}</button>
      </div>
      <dl className="home-stats" aria-label="学習状況">
        <div><dt>学習済み教材</dt><dd>{p.doneLessons}<small>/{LESSONS.length}</small></dd></div>
        <div><dt>回答した問題</dt><dd>{p.firstTotal}<small>/{TOTAL_QUESTIONS}</small></dd></div>
        <div><dt>初見正答率</dt><dd>{p.firstTotal > 0 ? `${Math.round((p.firstCorrect / p.firstTotal) * 100)}%` : '—'}</dd></div>
        <div><dt>復習期限</dt><dd>{p.dueCount}<small>問</small></dd></div>
      </dl>
      <div className="cta-row home-quick" aria-label="学習の入口">
        <button onClick={() => go('quiz/review')}>今日の復習</button>
        <button onClick={() => go('cards')}>単語帳</button>
        <button onClick={() => go('quiz/saved')}>保存した問題</button>
        <button onClick={() => go('quiz/weak')}>弱点復習</button>
        <button onClick={() => go('map')}>学習マップ</button>
        <button onClick={() => { void openSummaryPdf(); }}>要点まとめPDF</button>
      </div>
      <div className="domain-grid">
        {DOMAINS.map(d => {
          const lessons = LESSONS.filter(l => l.domainId === d.id);
          const total = lessons.reduce((s, l) => s + l.questionIds.length, 0);
          const done = lessons.reduce((s, l) => s + (p.attemptedByLesson.get(l.id)?.size ?? 0), 0);
          return (
            <details key={d.id} className="domain-card" open={wide}>
              <summary>
                <span className="domain-name"><b>{d.id}</b> {d.name}</span>
                <span className="domain-count" aria-label={`${total}問中${done}問に回答`}>{done}/{total}</span>
                <span className="progress" aria-hidden="true"><span className="progress-fill" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></span>
              </summary>
              <ul className="lesson-list">
                {lessons.map(l => {
                  const n = p.attemptedByLesson.get(l.id)?.size ?? 0;
                  const status = l.questionIds.length > 0 && n >= l.questionIds.length ? 'done' : n > 0 ? 'doing' : 'todo';
                  return (
                    <li key={l.id}>
                      <button className="lesson-row" onClick={() => go(`lesson/${l.id}`)}>
                        <span className={`dot ${status}`} aria-label={status === 'done' ? '学習済み' : status === 'doing' ? '学習中' : '未学習'} />
                        <span className="lesson-id">{l.id}</span>
                        <span className="lesson-title">{l.title}</span>
                        <span className="lesson-level" aria-label={`難易度${l.level}`}>{'●'.repeat(l.level)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button className="chip small" onClick={() => go(`quiz/domain/${d.id}`)}>{d.id}分野の演習</button>
            </details>
          );
        })}
      </div>
      <p className="meta page-foot">全{LESSONS.length}教材・{TOTAL_QUESTIONS}問。章の順番は強制せず、前提知識から自由に選べます。株式と暗号資産を重点分野とし、保険・相続は対象外です。●の数は難易度（1 基礎〜3 大学レベル）。</p>
    </main>
  );
}

function MapPage({ go }: { go: (p: string) => void }) {
  const { state } = useApp();
  const [onlyBookmarked, setOnlyBookmarked] = useState(false);
  const bookmarked = new Set((state?.bookmarks ?? []).map(b => b.lessonId));
  const visible = (domainId: string) => LESSONS.filter(l => l.domainId === domainId && (!onlyBookmarked || bookmarked.has(l.id)));
  return (
    <main>
      <div className="page-head">
        <h2>学習マップ</h2>
        <button className={onlyBookmarked ? 'chip active' : 'chip'} aria-pressed={onlyBookmarked} onClick={() => setOnlyBookmarked(v => !v)}>★ ブックマーク（{bookmarked.size}）</button>
      </div>
      <div className="map-grid">
        {DOMAINS.map(d => visible(d.id).length > 0 && (
          <section key={d.id} className="panel tight">
            <h3>{d.id}. {d.name}</h3>
            <ul className="map-list">
              {visible(d.id).map(l => (
                <li key={l.id}>
                  <button className="linklike" onClick={() => go(`lesson/${l.id}`)}>{l.id} {l.title}</button>
                  {bookmarked.has(l.id) && <span className="badge" aria-label="ブックマーク済み">★</span>}
                  {l.prerequisites.length > 0 && <span className="meta prereq">← {l.prerequisites.map(p => `${p} ${lessonById.get(p)?.title ?? ''}`).join('、')}</span>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {onlyBookmarked && bookmarked.size === 0 && <p>ブックマークした教材はまだありません。</p>}
      <p className="meta page-foot">「←」の後は前提知識の教材です。ブックマークは各教材ページの ☆ で付け外しできます。</p>
    </main>
  );
}

function SettingsPage({ go }: { go: (p: string) => void }) {
  const { density, setDensity, theme, setTheme } = useApp();
  return (
    <main>
      <h2>設定</h2>
      <section className="panel">
        <div className="setting-row"><span>テーマ</span>
          <button className={theme === 'dark' ? 'chip active' : 'chip'} aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>ダーク</button>
          <button className={theme === 'light' ? 'chip active' : 'chip'} aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>ライト</button></div>
        <div className="setting-row"><span>表示密度</span>
          <button className={density === 'normal' ? 'chip active' : 'chip'} aria-pressed={density === 'normal'} onClick={() => setDensity('normal')}>通常</button>
          <button className={density === 'dense' ? 'chip active' : 'chip'} aria-pressed={density === 'dense'} onClick={() => setDensity('dense')}>高密度</button></div>
      </section>
      <p className="meta page-foot">学習データは端末内（IndexedDB）に保存され、ブラウザの判断で削除されることがあります。<button className="linklike" onClick={() => go('data')}>データ管理</button>から定期的にバックアップしてください。テーマと表示密度はこの端末のブラウザ設定として保存され、バックアップには含まれません。このアプリは無料・ログイン不要で、実行時に外部AIや有料APIを使いません。実取引・口座連携・ウォレット接続の機能はなく、秘密鍵やシードフレーズの入力欄もありません。</p>
    </main>
  );
}

function Shell() {
  const [route, go] = useHashRoute();
  const { storageWarning } = useApp();
  const header = useRef<HTMLElement>(null);
  // 追従表示する要素（シミュレーター結果等）がヘッダーの下に収まるよう、ヘッダーの実高さをCSS変数へ渡す
  useEffect(() => {
    const el = header.current; if (!el) return;
    const set = () => document.documentElement.style.setProperty('--hdr', `${getComputedStyle(el).position === 'sticky' ? Math.round(el.getBoundingClientRect().height) : 0}px`);
    set();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(set); ro.observe(el); window.addEventListener('resize', set);
    return () => { ro.disconnect(); window.removeEventListener('resize', set); };
  }, []);
  const parts = route.split('/');
  const head = parts[0] ?? '';
  let page: React.ReactNode;
  if (route === '') page = <Home go={go} />;
  else if (head === 'lesson') page = <LessonPage key={parts[1] ?? ''} lessonId={parts[1] ?? ''} go={go} />;
  else if (head === 'quiz') {
    const sub = parts[1] ?? 'random';
    const mode: QuizMode = sub === 'lesson' ? { kind: 'lesson', lessonId: parts[2] ?? '' }
      : sub === 'domain' ? { kind: 'domain', domainId: parts[2] ?? '' }
      : sub === 'q' ? { kind: 'single', questionId: parts[2] ?? '' }
      : sub === 'review' ? { kind: 'review' } : sub === 'weak' ? { kind: 'weak' } : sub === 'saved' ? { kind: 'saved' } : { kind: 'random' };
    page = <QuizPage key={route} mode={mode} go={go} />;
  }
  else if (head === 'cards') {
    const sub = parts[1] ?? '';
    const init: CardsInit = sub === 'lesson' ? { kind: 'lesson', lessonId: parts[2] ?? '' }
      : sub === 'domain' ? { kind: 'domain', domainId: parts[2] ?? '' }
      : sub === 'saved' ? { kind: 'saved' } : sub === 'weak' ? { kind: 'weak' } : { kind: 'all' };
    page = <FlashcardsPage key={route} init={init} go={go} />;
  }
  else if (head === 'sim') page = <SimulatorsPage key={route} initial={parts[1]} go={go} />;
  else if (head === 'labs') page = <LabsPage go={go} />;
  else if (head === 'virtual') page = <VirtualPage go={go} />;
  else if (head === 'analytics') page = <AnalyticsPage go={go} />;
  else if (head === 'map') page = <MapPage go={go} />;
  else if (head === 'search') page = <SearchPage key={route} initial={decodeURIComponent(parts.slice(1).join('/'))} go={go} />;
  else if (head === 'regulations') page = <RegulationsPage />;
  else if (head === 'data') page = <DataPage />;
  else if (head === 'settings') page = <SettingsPage go={go} />;
  else page = <Home go={go} />;
  const activeNav = NAV.find(n => n.match.includes(head)) ?? NAV[0];
  return (
    <div className="app">
      <header ref={header}>
        <h1><button className="linklike title" onClick={() => go('')}>資産形成・金融教養マスター</button></h1>
        <nav aria-label="主要画面">
          {NAV.map(n => <button key={n.path} className={n === activeNav ? 'nav active' : 'nav'} aria-current={n === activeNav ? 'page' : undefined} onClick={() => go(n.path)}>{n.label}</button>)}
        </nav>
      </header>
      {storageWarning && <p className="warn" role="alert">{storageWarning === 'blocked'
        ? 'このアプリを開いている別のタブが古い版の保存領域を使っているため、更新を待っています。他のタブを閉じてから再読み込みしてください。'
        : '保存先（IndexedDB）への読み書きに失敗したため、学習データはこのタブを開いている間のみ保持されます。データ管理からバックアップを保存してください。'}</p>}
      <ErrorBoundary key={route}><Suspense fallback={<main><p>読み込み中…</p></main>}>{page}</Suspense></ErrorBoundary>
      <footer><p className="meta">学習専用アプリです。投資助言ではなく、将来の価格・リターンを保証しません。制度情報は出典と確認日を確認してください。</p></footer>
    </div>
  );
}

export default function App() { return <AppProvider><Shell /></AppProvider>; }
