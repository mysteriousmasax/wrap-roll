import { Component } from 'react';
import Button from './ui/Button';

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
            <Button onClick={() => window.location.reload()}>Reload App</Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
