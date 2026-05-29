"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to the browser console; Promtail tails the web container's
    // stdout into Loki, so production crashes become searchable instead
    // of silently swallowing into the fallback UI.
    console.error("[ErrorBoundary]", {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-6">
            <p className="text-red-400 font-semibold text-lg mb-2">Something went wrong</p>
            <p className="text-gray-500 text-sm">{this.state.error?.message}</p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="mt-4 px-4 py-2 text-sm border border-gray-700 rounded-lg hover:border-white transition"
            >
              Try again
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
