import { Component } from 'react';
import type { ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center min-h-screen p-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-strong mb-2">Something went wrong</h1>
            <p className="text-muted text-sm">{this.state.error.message}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
