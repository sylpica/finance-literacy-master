import { useState } from 'react';
import { decodeCsvBuffer, parseCsv, replacementCharCount, validateMarketRows, type CsvTable } from '../store/csv';
import { exportBackup, parseBackup, summarizeBackup, type AppState } from '../store/db';
import { useApp } from '../state';
import { LineChart } from '../components/Chart';

// データ管理（指示書 §9.2-11, §11, §12）: CSV取込プレビューと検証、バックアップ/復元
export function DataPage() {
  const { state, importState, wipe } = useApp();
  const [table, setTable] = useState<CsvTable | null>(null);
  const [mapping, setMapping] = useState({ date: 0, symbol: 1, close: 2 });
  const [message, setMessage] = useState('');
  const [csvMessage, setCsvMessage] = useState('');
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<AppState | null>(null);
  if (!state) return <main><p>読み込み中…</p></main>;

  const onCsv = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) { setCsvMessage('ファイルが大きすぎます（上限5MB）'); return; }
    const text = decodeCsvBuffer(await file.arrayBuffer());
    const mojibake = replacementCharCount(text) > 0 ? ' 文字化けの疑いがある文字が含まれています（対応形式は UTF-8 / Shift_JIS です。元のファイルの文字コードを確認してください）。' : '';
    try { const t = parseCsv(text); setTable(t); setCsvMessage(`読み込みました: ${t.rows.length}行。${mojibake}`); }
    catch (e) { setCsvMessage(e instanceof Error ? e.message : 'CSV解析に失敗しました'); }
  };
  const result = table ? validateMarketRows(table, mapping) : null;
  const series = result && result.errors.length === 0 && result.ok.length > 0
    ? (() => { const sym = result.ok[0]?.symbol; return result.ok.filter(r => r.symbol === sym).sort((a, b) => a.date.localeCompare(b.date)); })()
    : [];

  const downloadBackup = () => {
    const blob = new Blob([JSON.stringify(exportBackup(state), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'finance-literacy-master-backup.json'; a.click();
    URL.revokeObjectURL(url);
  };
  // 復元は2段階にする（監査指摘 P1: ファイルを選んだ瞬間の無確認・全件上書きは、誤ったファイルで現在の履歴を不可逆に失わせる）。
  // まず検証と件数プレビューだけを行い、利用者が内容を確認してから置換する。
  const onRestore = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) { setMessage('復元に失敗しました: ファイルが大きすぎます（上限5MB）'); return; }
    try { const s = parseBackup(await file.text()); setPendingRestore(s); setMessage(''); }
    catch (e) { setPendingRestore(null); setMessage(`復元に失敗しました: ${e instanceof Error ? e.message : '不明なエラー'}`); }
  };
  const confirmRestore = async () => {
    if (!pendingRestore) return;
    try { await importState(pendingRestore); setMessage('バックアップを復元しました'); }
    catch { setMessage('復元に失敗しました。もう一度お試しください'); }
    setPendingRestore(null);
  };

  return (
    <main>
      <h2>データ管理</h2>
      <section className="panel">
        <h3>市場データCSVの取込</h3>
        <p className="meta">対応形式: 日付列（YYYY-MM-DD）・銘柄列・価格（終値）列を含むCSV。UTF-8 / Shift_JIS に対応します。取り込んだデータは検証プレビュー用で、端末外に送信されません。調整前/調整後の株価の区別は元のデータ提供元の定義に従ってください。</p>
        <input type="file" accept=".csv,text/csv" onChange={e => { const f = e.target.files?.[0]; if (f) void onCsv(f); e.target.value = ''; }} aria-label="CSVファイルを選択" />
        {csvMessage && <p aria-live="polite">{csvMessage}</p>}
        {table && (
          <div>
            <p>列の対応付け:</p>
            {(['date', 'symbol', 'close'] as const).map(k => (
              <label key={k} className="inline-label">{k === 'date' ? '日付' : k === 'symbol' ? '銘柄' : '価格'}列
                <select value={mapping[k]} onChange={e => setMapping({ ...mapping, [k]: Number(e.target.value) })}>
                  {table.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select></label>
            ))}
            <div className="table-scroll"><table>
              <thead><tr>{table.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
              <tbody>{table.rows.slice(0, 5).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
            </table></div>
            {result && (
              <div aria-live="polite">
                <p>有効 {result.ok.length}行 ／ エラー {result.errors.length}件 ／ 警告 {result.warnings.length}件</p>
                {result.errors.slice(0, 10).map((e, i) => <p key={i} className="error-text">{e}</p>)}
                {result.warnings.slice(0, 5).map((w, i) => <p key={i} className="warn-text">{w}</p>)}
                {result.errors.length === 0 && series.length > 1 && <LineChart label="取込データのプレビュー" points={series.map(r => ({ x: r.date, y: r.close }))} />}
              </div>
            )}
          </div>
        )}
      </section>
      <section className="panel">
        <h3>学習データのバックアップと復元</h3>
        <p className="meta">ブラウザの保存領域は、ブラウザの判断で削除されることがあり永久保持は保証されません。大切な学習記録は定期的にバックアップしてください。</p>
        <button className="primary" onClick={downloadBackup}>バックアップをダウンロード（JSON）</button>{' '}
        <label className="file-label">復元するファイルを選ぶ
          <input type="file" accept=".json,application/json" onChange={e => { const f = e.target.files?.[0]; if (f) void onRestore(f); e.target.value = ''; }} />
        </label>
        {pendingRestore && (
          <div aria-live="polite">
            <p className="warn-text">復元すると現在の学習データはすべて置き換わります。ファイルの内容: {summarizeBackup(pendingRestore)}（現在: {summarizeBackup(state)}）</p>
            <button className="danger" onClick={() => void confirmRestore()}>この内容で復元する</button>{' '}
            <button onClick={() => setPendingRestore(null)}>キャンセル</button>
          </div>
        )}
        {message && <p aria-live="polite">{message}</p>}
      </section>
      <section className="panel">
        <h3>学習データの消去</h3>
        {!confirmWipe
          ? <button onClick={() => setConfirmWipe(true)}>すべての学習データを消去…</button>
          : <span><button className="danger" onClick={() => { void (async () => { try { await wipe(); setMessage('学習データを消去しました'); } catch { setMessage('消去に失敗しました。もう一度お試しください'); } setConfirmWipe(false); })(); }}>本当に消去する</button>{' '}
            <button onClick={() => setConfirmWipe(false)}>キャンセル</button></span>}
      </section>
    </main>
  );
}
