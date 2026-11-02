// CSV取込（指示書 §12）: プレビュー、列対応付け、型・欠損・重複・異常値の検証を行う。
export interface CsvTable { headers: string[]; rows: string[][]; }
export interface MarketRow { date: string; symbol: string; close: number; }
export interface ImportResult { ok: MarketRow[]; errors: string[]; warnings: string[]; }

export function decodeCsvBuffer(buf: ArrayBuffer): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { return new TextDecoder('shift-jis').decode(buf); }
}

/** 文字コード判定のフォールバックが無音だと、文字化けしたまま取り込まれる（監査指摘）。
 *  置換文字（U+FFFD）が多発している場合は、呼び出し側が利用者へ警告するための目安を返す。 */
export function replacementCharCount(text: string): number {
  return (text.match(/�/g) ?? []).length;
}

export function parseCsv(text: string): CsvTable {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let inQ = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i] as string;
    if (inQ) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(field); field = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
    else field += c;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  if (rows.length === 0) throw new Error('CSVが空です');
  const headers = rows[0] as string[];
  return { headers, rows: rows.slice(1).filter(r => r.length === headers.length || r.some(v => v !== '')) };
}

/** CSVインジェクション対策: 数式として解釈されうる先頭文字を無害化する */
export function sanitizeCell(v: string): string {
  return /^[=+\-@]/.test(v.trim()) && Number.isNaN(Number(v)) ? `'${v}` : v;
}

export function validateMarketRows(table: CsvTable, mapping: { date: number; symbol: number; close: number }): ImportResult {
  const ok: MarketRow[] = []; const errors: string[] = []; const warnings: string[] = [];
  const seen = new Set<string>();
  table.rows.forEach((r, i) => {
    const line = i + 2;
    const date = (r[mapping.date] ?? '').trim();
    // 銘柄は将来の再出力（表計算ソフトで開く等）に備えてインジェクション無害化を通す
    const symbol = sanitizeCell((r[mapping.symbol] ?? '').trim());
    const closeRaw = (r[mapping.close] ?? '').trim();
    // 実在する日付か（Date.parse は 2月31日を3月へ繰り越して解釈するため、成分の往復で確認する）
    const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    const realDate = dm ? (() => { const d = new Date(Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]))); return d.getUTCFullYear() === Number(dm[1]) && d.getUTCMonth() === Number(dm[2]) - 1 && d.getUTCDate() === Number(dm[3]); })() : false;
    if (!realDate) { errors.push(`${line}行目: 日付が不正です (${date})`); return; }
    if (!symbol) { errors.push(`${line}行目: 銘柄が空です`); return; }
    const close = Number(closeRaw.replace(/,/g, ''));
    if (!Number.isFinite(close)) { errors.push(`${line}行目: 価格が数値ではありません (${closeRaw})`); return; }
    if (close <= 0) { errors.push(`${line}行目: 価格は正の数が必要です (${close})`); return; }
    const key = `${date}|${symbol}`;
    if (seen.has(key)) { errors.push(`${line}行目: 日付と銘柄の重複があります (${key})`); return; }
    seen.add(key);
    ok.push({ date, symbol, close });
  });
  // 異常値: 前日比 ±50% 超を警告（拒否はしない）
  const bySymbol = new Map<string, MarketRow[]>();
  for (const r of ok) { const a = bySymbol.get(r.symbol) ?? []; a.push(r); bySymbol.set(r.symbol, a); }
  for (const [sym, arr] of bySymbol) {
    const sorted = [...arr].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1] as MarketRow, cur = sorted[i] as MarketRow;
      const chg = cur.close / prev.close - 1;
      if (Math.abs(chg) > 0.5) warnings.push(`${sym} ${cur.date}: 前日比 ${Math.round(chg * 1000) / 10}% の大きな変動（分割・調整漏れの可能性）`);
    }
  }
  return { ok, errors, warnings };
}
