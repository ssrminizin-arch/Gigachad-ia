import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
          <div className="text-4xl mb-4">🗿</div>
          <h1 className="text-xl font-bold text-zinc-100 mb-2">Ops! Algo deu errado.</h1>
          <p className="text-sm text-zinc-500 mb-6">O Chad encontrou um erro inesperado.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-zinc-100 text-black rounded-xl font-bold hover:bg-white transition-all"
          >
            Recarregar Página
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
