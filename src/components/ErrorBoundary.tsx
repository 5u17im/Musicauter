import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportError } from "../services/diagnostics";
import { Icon } from "./ui/Icon";

interface Props {
  children: ReactNode;
  /** Nombre del area protegida, para el log y el mensaje. */
  scope: string;
  /**
   * `view`: solo se sustituye el area afectada (el reproductor sigue activo).
   * `root`: ultima barrera; ofrece recargar la interfaz.
   */
  level?: "view" | "root";
  /** Cambia para reiniciar el boundary (por ejemplo al cambiar de vista). */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/**
 * Evita la "pantalla en blanco": si un componente lanza durante el render, React
 * desmonta todo el arbol (el audio seguia sonando pero la interfaz desaparecia).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(
      `fallo de renderizado en "${this.props.scope}"`,
      new Error(`${error.message}\n${info.componentStack ?? ""}`),
    );
  }

  componentDidUpdate(previous: Props): void {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private retry = (): void => this.setState({ error: null });

  private reload = (): void => window.location.reload();

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isRoot = this.props.level === "root";

    return (
      <div
        role="alert"
        style={{
          height: isRoot ? "100vh" : "100%",
          display: "grid",
          placeItems: "center",
          padding: "var(--space-5, 24px)",
          background: isRoot ? "var(--bg, #101318)" : undefined,
          color: "var(--text, #e6e9ef)",
        }}
      >
        <div
          style={{
            maxWidth: "36rem",
            display: "grid",
            gap: "var(--space-3, 12px)",
            justifyItems: "center",
            textAlign: "center",
          }}
        >
          <Icon icon="solar:danger-circle-bold" size={40} color="var(--danger)" />
          <h2 style={{ fontSize: "var(--text-lg, 1.125rem)", fontWeight: 750 }}>
            Algo fallo en {this.props.scope}
          </h2>
          <p className="muted" style={{ fontSize: "var(--text-sm, 0.875rem)" }}>
            El error se ha registrado. La musica no se ha interrumpido. Puedes reintentar o
            consultar el detalle en Ajustes, apartado Registro de errores.
          </p>
          <pre
            style={{
              maxWidth: "100%",
              maxHeight: "8rem",
              overflow: "auto",
              textAlign: "left",
              whiteSpace: "pre-wrap",
              fontSize: "var(--text-xs, 0.75rem)",
              fontFamily: "var(--font-mono, monospace)",
              background: "var(--surface-solid, rgba(255,255,255,0.04))",
              border: "1px solid var(--line, transparent)",
              padding: "var(--space-3, 12px)",
              borderRadius: "var(--radius-sm, 8px)",
            }}
          >
            {error.message}
          </pre>
          <div style={{ display: "flex", gap: "var(--space-2, 8px)" }}>
            <button className="btn btn-sm" onClick={this.retry}>
              <Icon icon="solar:refresh-circle-bold" size={16} />
              <span>Reintentar</span>
            </button>
            {isRoot && (
              <button className="btn btn-ghost btn-sm" onClick={this.reload}>
                <span>Recargar interfaz</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}

