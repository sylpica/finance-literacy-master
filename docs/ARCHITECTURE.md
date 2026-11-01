# ARCHITECTURE.md

## 構成（責務分離、指示書 §10）
| 層 | 場所 | 役割 |
|----|------|------|
| UI・ルーティング | `src/App.tsx`, `src/pages/` | ハッシュルーティング、12画面（ホーム/教材/マップ/演習/ラボ/シミュレーション/仮想投資/分析/検索/制度/データ/設定） |
| 教材コンテンツ | `src/content/` | 教材・問題・ケース・制度データ（純データ、UI非依存） |
| 問題・採点エンジン | `src/pages/QuizPage.tsx` の selectQuestions、正答判定は選択ID集合の一致 | 正答ID保持型シャッフル（`shuffledOptions`） |
| 学習管理・間隔反復 | `src/learning/` | SM-2系の説明可能な復習間隔、難易度重みの習熟度推定、推薦 |
| 金融計算エンジン | `src/finance/core.ts` | UIから分離した純粋関数群。入力検証つき |
| 市場データ・CSV | `src/store/csv.ts` | 文字コード判定、列対応付け、型/欠損/重複/異常値検証、CSVインジェクション無害化 |
| ローカル保存 | `src/store/db.ts` | IndexedDB（attempts/schedule/bookmarks/notes/virtual）、JSONバックアップの検証つき復元 |
| 制度情報 | `src/content/regulations.ts` | 状態・適用期間・出典を持つ構造化データ |

## 配信
- Vite `base: './'`（GitHub Pagesサブパス対応）、vite-plugin-pwa（Workbox precache、navigateFallback、古いキャッシュの掃除）
- GitHub Actions: 型検査→単体/コンテンツ検証→ビルド→Pagesデプロイ（`.github/workflows/deploy.yml`）

## セキュリティ
- Reactのエスケープを前提に `dangerouslySetInnerHTML` は使用しない
- CSVは数式化しうるセルを無害化し、取込時は検証エラー行を拒否
- バックアップ復元は形式・バージョン検証を通したものだけを受け付ける
- APIキー・秘密情報を含まない。秘密鍵・シードフレーズの入力欄は存在しない
