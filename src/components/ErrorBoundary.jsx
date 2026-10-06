import { Component } from 'react';
import { Link } from 'react-router-dom';

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-surface">
          <div className="max-w-md text-center">
            <h1 className="text-xl font-display font-bold mb-2">Something went wrong</h1>
            <p className="text-sm text-surface-on-variant mb-4">{this.state.error.message}</p>
            <Link to="/" className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-container">
              Return to home
            </Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
