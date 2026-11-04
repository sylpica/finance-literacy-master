import { REGULATIONS } from '../content/regulations';

const statusLabel = { 'in-force': '施行中', 'enacted-not-yet': '成立済み・未施行', proposal: '提案段階' } as const;

export function RegulationsPage() {
  const order = { 'in-force': 0, 'enacted-not-yet': 1, proposal: 2 } as const;
  const regs = [...REGULATIONS].sort((a, b) => order[a.status] - order[b.status]);
  return (
    <main>
      <h2>制度情報</h2>
      <div className="reg-grid">
        {regs.map(r => (
          <section key={r.id} className={`panel tight reg ${r.status}`}>
            <h3>{r.name}</h3>
            <p className="reg-meta"><span className={`badge ${r.status}`}>{statusLabel[r.status]}</span>
              {' '}{r.effectiveFrom ? `適用開始 ${r.effectiveFrom}` : r.status === 'enacted-not-yet' ? '適用開始日 未確定' : ''}
              {r.announcedAt ? ` ／ 公表日・節目 ${r.announcedAt}` : ''}{r.effectiveTo ? ` ／ 終了 ${r.effectiveTo}` : ''}</p>
            <p className="meta">対象: {r.appliesTo}</p>
            <div className="table-scroll"><table className="compact"><tbody>
              {r.keyNumbers.map((k, i) => <tr key={i}><th>{k.label}</th><td>{k.value}</td></tr>)}
            </tbody></table></div>
            <details><summary>出典・履歴</summary>
              <p className="meta">出典: <a href={r.source.url} target="_blank" rel="noreferrer noopener">{r.source.title}</a>（{r.source.publisher}、確認日 {r.source.checkedAt}）／ データ v{r.version}（{r.jurisdiction}）</p>
              <p className="meta">{r.history}</p>
            </details>
          </section>
        ))}
      </div>
      <p className="meta page-foot">制度は適用期間・状態・出典を持つデータとして管理しています。成立済み・未施行の制度は適用開始まで現行制度として扱わず、提案段階の議論は登録しません。</p>
    </main>
  );
}
