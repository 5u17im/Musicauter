import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { IS_TAURI } from "../api";
import { reportError } from "../services/diagnostics";
import { Icon } from "./ui/Icon";

/**
 * Minimizar / maximizar / cerrar de la barra de titulo propia.
 *
 * Cerrar no destruye la ventana directamente: pide el cierre y el backend
 * decide (minimizar a la bandeja o salir), igual que con la barra nativa.
 */
export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  const refreshMaximized = useCallback(async () => {
    try {
      setMaximized(await getCurrentWindow().isMaximized());
    } catch (error) {
      reportError("no se pudo leer el estado maximizado", error);
    }
  }, []);

  useEffect(() => {
    if (!IS_TAURI) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void refreshMaximized();
    void getCurrentWindow()
      .onResized(() => void refreshMaximized())
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch((error) => reportError("no se pudo escuchar el cambio de tamano", error));

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [refreshMaximized]);

  if (!IS_TAURI) return null;

  const run = (label: string, action: () => Promise<void>) => () => {
    action().catch((error) => reportError(`no se pudo ${label} la ventana`, error));
  };

  const appWindow = getCurrentWindow();

  return (
    <div className="window-controls" role="group" aria-label="Controles de ventana">
      <button
        className="wc-btn"
        onClick={run("minimizar", () => appWindow.minimize())}
        aria-label="Minimizar"
        title="Minimizar"
      >
        <Icon icon="solar:minus-linear" size={18} />
      </button>
      <button
        className="wc-btn"
        onClick={run(maximized ? "restaurar" : "maximizar", () => appWindow.toggleMaximize())}
        aria-label={maximized ? "Restaurar" : "Maximizar"}
        title={maximized ? "Restaurar" : "Maximizar"}
      >
        <Icon
          icon={
            maximized
              ? "solar:minimize-square-minimalistic-linear"
              : "solar:maximize-square-minimalistic-linear"
          }
          size={16}
        />
      </button>
      <button
        className="wc-btn wc-close"
        onClick={run("cerrar", () => appWindow.close())}
        aria-label="Cerrar"
        title="Cerrar"
      >
        <Icon icon="solar:close-linear" size={18} />
      </button>
    </div>
  );
}

