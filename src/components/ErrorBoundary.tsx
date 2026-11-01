import { Component, type ReactNode } from 'react';

// 描画中の例外でアプリ全体が白画面になることを防ぐ境界。
// 1画面の計算エラーはその画面内の案内に留め、再読込なしで復帰できるようにする。
interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <main>
          <h2>表示中に問題が発生しました</h2>
          <p>入力値が計算可能な範囲を超えた可能性があります。ページを再読み込みするか、別の画面へ移動してください。学習データは消えていません。</p>
          <p className="meta">詳細: {this.state.error.message}</p>
          <button className="primary" onClick={() => window.location.reload()}>再読み込みする</button>
        </main>
      );
    }
    return this.props.children;
  }
}
