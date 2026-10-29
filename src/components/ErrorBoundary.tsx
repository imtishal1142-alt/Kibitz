import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Last line of defence: a crash in one screen never takes the saved data with it. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  override state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Screen crashed', error, info.componentStack);
  }
  override componentDidUpdate(prev: { resetKey?: string }): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }
  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="sheet pad stack" role="alert" style={{ maxWidth: 640, margin: '40px auto' }}>
        <h2>This screen hit a problem</h2>
        <p className="muted">Your games and training data are stored safely in this browser and were not affected. Reloading usually fixes it. If it keeps happening, export a backup from Settings before clearing anything.</p>
        <pre className="small" style={{ whiteSpace: 'pre-wrap', background: 'var(--paper-2)', padding: 10, borderRadius: 8, overflow: 'auto' }}>{this.state.error.message}</pre>
        <div className="row">
          <button className="btn btn-primary" onClick={() => location.reload()} type="button">
            Reload
          </button>
          <button className="btn" onClick={() => this.setState({ error: null })} type="button">
            Try again
          </button>
        </div>
      </div>
    );
  }
}
