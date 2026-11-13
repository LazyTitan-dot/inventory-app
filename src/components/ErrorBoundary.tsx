import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StartupScreen } from './StartupScreen';
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
        <StartupScreen
          title="No pudimos mostrar esta pantalla"
          message="Recarga para volver a consultar tus datos. Si estabas guardando una operación, revisa el historial antes de repetirla."
          failed
        >
          <button className="button primary" onClick={() => window.location.reload()}>
            Recargar aplicación
          </button>
        </StartupScreen>
      );
    return this.props.children;
  }
}
