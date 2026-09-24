/**
 * ErrorBoundary — catches render/runtime errors in the view tree and shows a
 * graceful fallback instead of white-screening the entire app.
 *
 * React error boundaries must be class components. This one resets its error
 * state whenever `resetKey` changes (wire it to the router pathname) so
 * navigating to another route recovers automatically.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Icon } from './govern/icons';

interface Props {
  children: ReactNode;
  /** Change this (e.g. to the current pathname) to auto-reset the boundary on navigation. */
  resetKey?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface for diagnosis; the fallback UI replaces the crashed subtree.
    console.error('Unhandled view error:', error, info.componentStack);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  private handleReset = () => this.setState({ hasError: false, error: null });

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
              <Icon name="exclamation-triangle" className="w-6 h-6 text-amber-500" />
            </div>
            <h2 className="text-base font-semibold text-slate-900 mb-1">This view hit an error</h2>
            <p className="text-sm text-slate-500 mb-4">
              The rest of the app is still working. Try again, or navigate to another page.
            </p>
            {this.state.error?.message && (
              <pre className="text-[11px] text-left text-rose-600 bg-rose-50/60 rounded-lg p-3 mb-4 overflow-auto max-h-32 whitespace-pre-wrap">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={this.handleReset}
              className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
