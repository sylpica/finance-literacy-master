import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// 同梱PDF（pdf64方式）は Google Drive「会計」フォルダ保存分と同一バイト列でなければならない。
// PDFを差し替えたら、Drive側の保存と合わせてここの期待値も更新すること。
const EXPECTED_BYTES = 1731955;
const EXPECTED_MD5 = 'cfa14aabaa093b2aef0189c151bf863d';

describe('要点まとめPDFの同梱', () => {
  it('Base64を復元するとDrive保存分とバイト数・MD5が一致する', () => {
    const b64 = readFileSync('public/pdf64/finance-summary.b64', 'utf8').replace(/\s+/g, '');
    const bytes = Buffer.from(b64, 'base64');
    expect(bytes.length).toBe(EXPECTED_BYTES);
    expect(createHash('md5').update(bytes).digest('hex')).toBe(EXPECTED_MD5);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
