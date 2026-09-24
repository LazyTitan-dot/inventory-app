import { Component, type ErrorInfo, type ReactNode } from 'react';
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_error: Error, info: ErrorInfo) {
    console.error('No se pudo mostrar una pantalla.', info.componentStack);
  }
  render() {
    if (this.state.failed)
      return (
        <main className="center-screen">
          <section className="panel loading-panel">
            <h1>No pudimos mostrar esta pantalla</h1>
            <p>
              Recarga para volver a consultar tus datos. Si estabas guardando una operación, revisa
              el historial antes de repetirla.
            </p>
            <button className="button primary" onClick={() => window.location.reload()}>
              Recargar aplicación
            </button>
          </section>
        </main>
      );
    return this.props.children;
  }
}
