import { Component } from 'react'

/** Shows what went wrong instead of a blank page if any screen crashes. */
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('FinPilot crashed:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--bg)', color: 'var(--ink)' }}>
        <div className="card" style={{ maxWidth: 520 }}>
          <h2 style={{ margin: '0 0 6px', fontFamily: 'var(--f-display)' }}>This screen hit an error</h2>
          <p className="muted" style={{ margin: '0 0 12px' }}>Your data is safe. Reload to try again; if it keeps happening, sign out and back in.</p>
          <pre className="mono" style={{ whiteSpace: 'pre-wrap', background: 'var(--sunken)', padding: 12, borderRadius: 10, maxHeight: 180, overflow: 'auto' }}>
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
            <button className="btn" onClick={() => { try { localStorage.removeItem('fp-token') } catch { /* ignore */ } window.location.href = '/login' }}>Sign out</button>
          </div>
        </div>
      </div>
    )
  }
}
