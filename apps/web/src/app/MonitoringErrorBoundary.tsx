import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '../lib/monitoring';

type Props = { children: ReactNode };
type State = { failed: boolean };

export class MonitoringErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, {
      source: 'react.error-boundary',
      componentStack: info.componentStack ?? undefined,
    });
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="loading-screen">
          <div className="brand-mark">t2g</div>
          <h1>Something went wrong</h1>
          <p>Reload the page to try again. If the problem continues, contact support.</p>
          <button className="primary-action" type="button" onClick={() => window.location.reload()}>
            Reload page
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}