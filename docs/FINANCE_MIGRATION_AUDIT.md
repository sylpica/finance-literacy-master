# FINANCE_MIGRATION_AUDIT.md — データ移行監査（監査ラウンド3）

対象: IndexedDB スキーマとバックアップ形式の版上げに伴う非破壊性・冪等性・復旧方法。
基準コミット bf1d6a0（0.6.0）→ 完了コミット fc454f0（0.7.0）。

## 1. 旧スキーマ（v1）

IndexedDB（DB名 `finance-literacy-master`、DB_VERSION=1）に5ストア:

| ストア | keyPath | 内容 |
|---|---|---|
| attempts | autoIncrement | 回答履歴 |
| schedule | questionId | SRSスケジュール |
| bookmarks | lessonId | 教材ブックマーク |
| notes | id | 学習メモ |
| virtual | autoIncrement | 仮想投資の記録 |

バックアップ形式: `finance-literacy-master-backup`、BACKUP_VERSION=1、上記5配列のみ。移行関数の枠（BACKUP_MIGRATIONS）はあったが中身は空だった。

## 2. 新スキーマ（v2）と移行方式

- DB_VERSION=2。新ストア2つを **存在チェック式** で追加する（既に存在すれば何もしない）:
  - `qbookmarks`（keyPath questionId）: 問題ブックマーク {questionId, createdAt}
  - `cardStates`（keyPath cardId）: 単語帳の状態 {cardId, bookmarked, selfEval?, updatedAt}
- 旧ストア・旧レコードには一切触れない。削除・キー変更・値の書き換えを伴わないため、移行は非破壊。
- 存在チェック式のため、移行処理は **冪等**（v2 DB に対して再実行しても変化なし）。途中失敗時は従来どおりメモリ内状態へフォールバックする既存の仕組みが働く。
- 設計判断: 単語帳の保存状態を既存 `bookmarks` ストアへ拡張する案は不採用。キー空間（lessonId と cardId）が混同し、将来の削除・復元で相互に壊し合うため、新ストアに分離した（コード監査での結論）。

## 3. バックアップ形式 v2 と移行

- BACKUP_VERSION=2。配列 `questionBookmarks` と `cardStates` を追加。
- 移行関数 1→2 が必須の補完を行う: v1 バックアップには新2配列がないため、`questionBookmarks: []` と `cardStates: []` を補ってから検証する。これを欠くと v1 ファイルの復元が全件失敗する設計上の要点であり、単体テストで固定した。
- parseBackup の検証（v2）: 件数上限（新2配列は各20,000件）、型・範囲チェック、questionBookmarks の questionId 重複拒否、cardStates の cardId 重複拒否、selfEval は known/fuzzy/unknown/未設定のみ許可。
- 復元は従来どおり件数プレビュー付きの全置換で原子的。プレビュー文（summarizeBackup）に「問題ブックマーク N件・単語帳の状態 N件」を追加した。
- 復旧方法: 旧版でエクスポートした v1 JSON は新版でそのまま復元できる（移行経路）。新版の v2 JSON を旧版で開くことは想定しない（旧版は未知フィールドを検証で拒否するため、誤って読み込む事故はない）。

## 4. 実証結果（全て実測）

| 検証 | 方法 | 結果 |
|---|---|---|
| IDB v1→v2 移行 | Playwright: アプリのDBを削除し、v1スキーマ（5ストア）＋教材ブックマーク1件を生の IndexedDB API で仕込み、アプリを再読込 | DB版数が2になり新ストア2つが追加され、v1のブックマーク {lessonId: A-01} が保持された（r3-e2e.mjs） |
| v1バックアップ復元 | 単体テスト: v1形式JSON（attempts・bookmarks入り）を parseBackup | 既存データを保持したまま新2配列が空で補われる |
| v2往復 | 単体テスト: questionBookmarks と cardStates（selfEval=fuzzy）を含むv2 JSON を parseBackup | 件数・値がそのまま復元される |
| 不正データ拒否 | 単体テスト: selfEval='perfect'、cardId重複 | いずれも例外で拒否 |
| v2書き出し | Playwright: 単語帳で保存＋自己評価した後にバックアップをダウンロード | version=2、cardStates に実レコード {FC-A-01-1, bookmarked, known}、questionBookmarks 配列あり（r3-export.mjs） |
| リポジトリE2Eでの復元 | e2e項目13/13a/13b/13c | v2形式の確認、プレビュー付き復元、破損JSONの日本語エラー拒否、いずれも PASS |

## 5. 未検証・残件

- 実機（iPhone Safari）の IndexedDB での移行は未検証（実機環境なし。Chromium での実証に限る）。
- 大量データ（上限近傍の件数）での移行所要時間は未測定。追加型移行のため既存レコード数に比例する処理は発生しない設計。
