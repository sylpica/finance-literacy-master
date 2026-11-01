import { useMemo, useState } from 'react';
import { CASES } from '../content/cases';
import { LineChart, formatNum } from '../components/Chart';
import { useApp } from '../state';

// 仮想投資（指示書 §8）: 判断時点までの情報だけを先に表示し、
// 採点は価格的中ではなく「根拠・リスク・不確実性・情報の信頼性」の選択で評価する。
export function VirtualPage() {
  const [caseId, setCaseId] = useState(CASES[0]?.id ?? '');
  const [chosen, setChosen] = useState<Record<string, string[]>>({});
  const [revealed, setRevealed] = useState(false);
  const [savedScore, setSavedScore] = useState<number | null>(null);
  const { addVirtual } = useApp();
  const cs = CASES.find(c => c.id === caseId) ?? CASES[0];
  const visibleSeries = useMemo(() => (cs ? cs.series.filter(p => p.date <= cs.decisionDate) : []), [cs]);
  const allChosen = cs ? cs.criteria.every(c => (chosen[c.id]?.length ?? 0) > 0) : false;
  if (!cs) return <main><p>ケースがありません。</p></main>;
  const score = cs.criteria.reduce((sum, c) => {
    const sel = chosen[c.id] ?? [];
    const hits = sel.filter(id => c.goodIds.includes(id)).length;
    const bad = sel.filter(id => !c.goodIds.includes(id)).length;
    return sum + Math.max(0, hits - bad) / c.goodIds.length;
  }, 0) / cs.criteria.length;
  const toggle = (critId: string, optId: string) =>
    setChosen(prev => ({ ...prev, [critId]: prev[critId]?.includes(optId) ? prev[critId].filter(x => x !== optId) : [...(prev[critId] ?? []), optId] }));
  const finish = async () => { setRevealed(true); setSavedScore(score); await addVirtual({ caseId: cs.id, chosen, score, doneAt: Date.now() }); };
  return (
    <main>
      <h2>仮想投資・市場分析</h2>
      <p className="meta">現実の資金は使いません。将来の価格を当てる演習ではなく、判断時点の情報で根拠とリスクを評価する演習です。</p>
      <div className="sim-list">{CASES.map(c => <button key={c.id} className={c.id === cs.id ? 'chip active' : 'chip'} onClick={() => { setCaseId(c.id); setChosen({}); setRevealed(false); setSavedScore(null); }}>{c.title}</button>)}</div>
      <h3>{cs.title}（{cs.kind === 'historical' ? '過去事例型' : '架空ケース'}）</h3>
      <p><strong>判断日: {cs.decisionDate}</strong>。この日付より後の情報は、判断を終えるまで表示しません。</p>
      <p>{cs.briefing}</p>
      <LineChart label={`${cs.seriesLabel}（判断日まで）`} points={visibleSeries.map(p => ({ x: p.date, y: p.value }))} />
      {cs.criteria.map(c => (
        <fieldset key={c.id} className="criteria">
          <legend>{c.prompt}</legend>
          {c.options.map(o => (
            <label key={o.id} className="check-row">
              <input type="checkbox" disabled={revealed} checked={(chosen[c.id] ?? []).includes(o.id)} onChange={() => toggle(c.id, o.id)} /> {o.text}
              {revealed && <span>{c.goodIds.includes(o.id) ? '（妥当な根拠）' : '（要再考）'}</span>}
            </label>
          ))}
          {revealed && <p className="meta">評価の考え方: {c.rationale}</p>}
        </fieldset>
      ))}
      {!revealed
        ? <button className="primary" disabled={!allChosen} onClick={() => void finish()}>判断を確定し、振り返りを見る</button>
        : (
          <section>
            <p><strong>評価スコア: {formatNum(score * 100)} / 100</strong>（価格の的中ではなく、根拠・リスク識別の質で評価しています）</p>
            <h3>判断日以降の推移（振り返り用）</h3>
            <LineChart label={`${cs.seriesLabel}（全期間）`} points={cs.series.map(p => ({ x: p.date, y: p.value }))} color="#fbbf24" />
            <p>{cs.postNote}</p>
            {savedScore !== null && <p className="meta">結果は学習記録に保存されました。</p>}
          </section>
        )}
    </main>
  );
}
