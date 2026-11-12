/**
 * 要点まとめPDFの同梱と表示。
 * PDFは配信経路の制約（バイナリをそのまま置けない経路がある）ため Base64 テキストとして
 * public/pdf64/ に同梱し、開くときに復元して表示する。内容は教材データから機械抽出した
 * 「金融教養 要点まとめ」（全56教材の要点・注意点・重要用語）で、Google Drive の
 * 「会計」フォルダに保存した同一ファイル（バイト数・MD5が一致することをテストで固定）。
 */
export const SUMMARY_PDF_PATH = `${import.meta.env.BASE_URL}pdf64/finance-summary.b64`;
export const SUMMARY_PDF_FILENAME = '【資料】金融教養 要点まとめ.pdf';

async function summaryPdfBlobUrl(): Promise<string> {
  const text = await (await fetch(SUMMARY_PDF_PATH)).text();
  const bin = atob(text.replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
}

/** 新しいタブでPDFを開く（AI総合マスターで採用した方式） */
export async function openSummaryPdf(): Promise<boolean> {
  // ポップアップブロック回避のため、先に空タブを開いてから遷移させる
  const w = window.open('', '_blank');
  try {
    const url = await summaryPdfBlobUrl();
    if (w) w.location.href = url;
    else window.location.href = url;
    return true;
  } catch {
    if (w) w.close();
    return false;
  }
}

/** PDFをファイルとして保存する（タブで開けない環境向けの確実な取得経路） */
export async function downloadSummaryPdf(): Promise<boolean> {
  try {
    const url = await summaryPdfBlobUrl();
    const a = document.createElement('a');
    a.href = url;
    a.download = SUMMARY_PDF_FILENAME;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  } catch {
    return false;
  }
}
