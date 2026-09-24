import React from 'react';

interface Props {
  tabName: string;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class TabErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠️</div>
          <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
            {this.props.tabName} encountered an error
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
            Other tabs still work. Try refreshing if this persists.
          </div>
          <button
            onClick={() => this.setState({ hasError: false })}
            style={{
              marginTop: '1rem', padding: '6px 16px', borderRadius: '6px',
              border: '1px solid var(--border)', background: 'var(--bg-card)',
              color: 'var(--text-primary)', cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
