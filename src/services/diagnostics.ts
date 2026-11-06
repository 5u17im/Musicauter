/**
 * Captura centralizada de errores del frontend.
 *
 * Todo error no controlado (render, promesas rechazadas, errores globales)
 * acaba en el log de Rust, y por tanto en el visor de errores de Ajustes.
 */

import { frontendLog } from "../api";

function describe(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ""}`;
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/** Registra un error con su contexto en consola y en el log nativo. */
export function reportError(context: string, error: unknown): void {
  const detail = describe(error);
  console.error(`[Audionave] ${context}`, error);
  void frontendLog(`${context}: ${detail}`, "error");
}

export function reportWarning(context: string, detail?: unknown): void {
  const text = detail === undefined ? context : `${context}: ${describe(detail)}`;
  console.warn(`[Audionave] ${text}`);
  void frontendLog(text, "warn");
}

let installed = false;

/** Engancha los manejadores globales una sola vez. */
export function installGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;

  window.addEventListener("error", (event) => {
    reportError(
      `error no controlado en ${event.filename || "desconocido"}:${event.lineno}`,
      event.error ?? event.message,
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportError("promesa rechazada sin capturar", event.reason);
  });
}

