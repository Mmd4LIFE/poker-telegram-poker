"use client";

import React from "react";

/* A render crash anywhere below this used to take the whole Mini App down to
   Telegram's blank "This page couldn't load". Now it shows a recoverable card AND
   the actual error, so a bug is diagnosable instead of invisible. */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("Poker CM crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="text-lg font-extrabold text-gold">Something broke</div>
        <p className="max-w-xs text-sm text-muted-foreground">
          The screen hit an error. It&apos;s been logged — reloading usually clears it.
        </p>
        <pre className="max-h-40 max-w-full overflow-auto rounded-lg bg-black/40 p-3 text-left text-[10px] text-lose">
          {this.state.error.message}
        </pre>
        <button
          onClick={() => {
            this.setState({ error: null });
            location.reload();
          }}
          className="rounded-full bg-gold px-6 py-2 text-sm font-bold text-black active:scale-95"
        >
          Reload
        </button>
      </div>
    );
  }
}
