# 資産形成・金融教養マスター

株式・暗号資産を中心に、資産形成をほとんど知らない初心者から、大学レベルの金融・経済理論に基づいて投資判断ができる学習者まで対応する、日本語の総合金融教養アプリです。FP資格試験対策アプリではありません。

## 特徴
- 14分野・教材は4層構造（概要／詳細／専門理論／実践例）、前提知識と関連教材を明示
- 選択式問題（単一・複数正答）＋誤答ごとの理由、分野別・難易度別・ランダム・弱点・間隔反復の復習
- 金融計算エンジンによる15種のシミュレーター（複利、NISA比較、DCF、債券、ポートフォリオ、VaR、オプション、AMM、DeFi清算、モンテカルロ取り崩し等）
- 仮想投資：判断時点までの情報のみで判断し、価格的中ではなく根拠とリスク識別を評価
- 学習記録は端末内（IndexedDB）に保存、JSONバックアップ/復元、市場データCSV取込の検証
- 完全無料・ログイン不要・実行時AIなし・オフライン対応PWA

## 起動方法
```bash
npm install
npm run dev        # 開発サーバー
npm run check      # 型検査 + テスト + ビルド
npm run preview    # ビルドのプレビュー
```

## 注意
学習専用です。投資助言ではなく、将来の価格やリターンを保証しません。制度情報は出典・確認日とあわせて表示しています。ブラウザの保存領域は永久保持が保証されないため、学習データは定期的にバックアップしてください。

詳細: [ARCHITECTURE.md](docs/ARCHITECTURE.md) / [CURRICULUM.md](docs/CURRICULUM.md) / [COVERAGE.md](docs/COVERAGE.md) / [SOURCES.md](docs/SOURCES.md) / [FINANCIAL_MODELS.md](docs/FINANCIAL_MODELS.md) / [TESTING.md](docs/TESTING.md) / [DECISIONS.md](docs/DECISIONS.md)
