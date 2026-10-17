import './assets/main.css'
import './assets/workspace-theme.css'
import './assets/experience-polish.css'
import './assets/studio-tools.css'

import { createRoot } from 'react-dom/client'
import App from './App'
import React, { ReactNode } from 'react'

document.documentElement.classList.toggle(
  'macos',
  navigator.platform.toLowerCase().startsWith('mac')
)

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }
  componentDidCatch(error: Error): void {
    console.error('Nexus renderer error:', error)
  }
  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="fatal-error" role="alert">
          <div>
            <span className="fatal-error-eyebrow">NEXUS · WORKSPACE</span>
            <h1>Something interrupted the workspace.</h1>
            <p>{this.state.error?.message || 'An unexpected error occurred.'}</p>
            <button onClick={() => window.location.reload()}>Reload workspace</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
