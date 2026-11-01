import type { SourceReference } from '../types';
// 出典は実際に検索・確認した一次資料のみ（指示書 §4）。架空URL禁止。
// checkedAt は確認日 2026-11-02。
const d = '2026-11-02';
export const SRC = {
  fsaTop: { title: '金融庁ウェブサイト', publisher: '金融庁', url: 'https://www.fsa.go.jp/', checkedAt: d },
  fsaNisa: { title: 'NISAを知る：NISA特設ウェブサイト', publisher: '金融庁', url: 'https://www.fsa.go.jp/policy/nisa2/know/index.html', checkedAt: d },
  fsaInvest: { title: '資産形成の基本：NISA特設ウェブサイト', publisher: '金融庁', url: 'https://www.fsa.go.jp/policy/nisa2/invest/', checkedAt: d },
  fsaCrypto: { title: '暗号資産の利用者のみなさまへ', publisher: '金融庁', url: 'https://www.fsa.go.jp/policy/virtual_currency/', checkedAt: d },
  ntaTop: { title: '国税庁ウェブサイト', publisher: '国税庁', url: 'https://www.nta.go.jp/', checkedAt: d },
  ntaCrypto: { title: 'No.1524 暗号資産を使用することにより利益が生じた場合の課税関係', publisher: '国税庁', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1524.htm', checkedAt: d },
  ntaCryptoCalc: { title: '暗号資産等に関する税務上の取扱い及び計算書について', publisher: '国税庁', url: 'https://www.nta.go.jp/publication/pamph/shotoku/kakuteishinkokukankei/kasoutuka/index.htm', checkedAt: d },
  ntaStockTax: { title: '株式・配当・利子と税（暮らしの税情報）', publisher: '国税庁', url: 'https://www.nta.go.jp/publication/pamph/koho/kurashi/pdf/13.pdf', checkedAt: d },
  idecoOfficial: { title: 'iDeCo公式サイト', publisher: '国民年金基金連合会', url: 'https://www.ideco-koushiki.jp/', checkedAt: d },
  bojTop: { title: '日本銀行ウェブサイト', publisher: '日本銀行', url: 'https://www.boj.or.jp/', checkedAt: d },
  bojPolicy: { title: '金融政策の概要', publisher: '日本銀行', url: 'https://www.boj.or.jp/mopo/outline/index.htm', checkedAt: d },
  edinet: { title: 'EDINET（金融商品取引法に基づく有価証券報告書等の開示書類に関する電子開示システム）', publisher: '金融庁', url: 'https://disclosure2.edinet-fsa.go.jp/', checkedAt: d },
  secEdgar: { title: 'EDGAR Application Programming Interfaces', publisher: 'U.S. Securities and Exchange Commission', url: 'https://www.sec.gov/search-filings/edgar-application-programming-interfaces', checkedAt: d },
  bitcoinPaper: { title: 'Bitcoin: A Peer-to-Peer Electronic Cash System', publisher: 'Satoshi Nakamoto (bitcoin.org)', url: 'https://bitcoin.org/bitcoin.pdf', checkedAt: d },
  ethereumDocs: { title: 'Ethereum development documentation', publisher: 'ethereum.org', url: 'https://ethereum.org/developers/docs/', checkedAt: d },
} satisfies Record<string, SourceReference>;
export type SrcKey = keyof typeof SRC;
