import { useCallback, useState } from "react";
import { repairHealth, runHealthCheck, type HealthCheck } from "../api";
import { reportError } from "../services/diagnostics";
import { StorageService } from "../services/storage";
import { Icon } from "./ui/Icon";

const STATUS_ICON: Record<HealthCheck["status"], string> = {
  ok: "solar:check-circle-bold",
  warn: "solar:danger-triangle-bold",
  error: "solar:close-circle-bold",
};

const STATUS_COLOR: Record<HealthCheck["status"], string> = {
  ok: "var(--success)",
  warn: "var(--warning)",
  error: "var(--danger)",
};

const STATUS_TEXT: Record<HealthCheck["status"], string> = {
  ok: "Correcto",
  warn: "Aviso",
  error: "Error",
};

/** Chequeo de integridad: ejecuta las comprobaciones y ofrece reparaciones. */
export function HealthPanel() {
  const [checks, setChecks] = useState<HealthCheck[] | null>(null);
  const [running, setRunning] = useState(false);
  const [repairing, setRepairing] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const run = useCallback(async () => {
    setRunning(true);
    try {
      setChecks(await runHealthCheck());
    } catch (error) {
      reportError("el chequeo de integridad fallo", error);
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "No se pudo ejecutar el chequeo",
      });
    } finally {
      setRunning(false);
    }
  }, []);

  const repair = async (id: string) => {
    setRepairing(id);
    setNotice(null);
    try {
      const summary = await repairHealth(id);
      // Las reparaciones pueden cambiar la biblioteca: se vuelve a leer.
      await StorageService.reload();
      setNotice({ kind: "ok", text: summary });
      await run();
    } catch (error) {
      reportError(`la reparacion '${id}' fallo`, error);
      setNotice({
        kind: "error",
        text: typeof error === "string" ? error : error instanceof Error ? error.message : "La reparacion fallo",
      });
    } finally {
      setRepairing(null);
    }
  };

  const problems = checks?.filter((item) => item.status !== "ok").length ?? 0;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <button className="btn btn-sm" onClick={() => void run()} disabled={running}>
          <Icon
            icon="solar:heart-pulse-bold"
            size={16}
            className={running ? "anim-pulse" : ""}
          />
          <span>{running ? "Comprobando..." : checks ? "Repetir chequeo" : "Ejecutar chequeo"}</span>
        </button>
        {checks && (
          <span
            role="status"
            style={{
              fontSize: "var(--text-sm)",
              fontWeight: 650,
              color: problems === 0 ? "var(--success)" : "var(--warning)",
            }}
          >
            {problems === 0
              ? "Todo en orden"
              : `${problems} ${problems === 1 ? "punto requiere" : "puntos requieren"} atencion`}
          </span>
        )}
      </div>

      {notice && (
        <p
          role="status"
          style={{
            marginTop: "var(--space-3)",
            fontSize: "var(--text-sm)",
            color: notice.kind === "ok" ? "var(--success)" : "var(--danger)",
          }}
        >
          {notice.text}
        </p>
      )}

      {checks && (
        <ul className="health-list">
          {checks.map((item) => (
            <li key={item.id} className="health-row" data-status={item.status}>
              <Icon
                icon={STATUS_ICON[item.status]}
                size={20}
                color={STATUS_COLOR[item.status]}
                aria-hidden="true"
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="health-title">
                  {item.label}
                  <span className="health-state" style={{ color: STATUS_COLOR[item.status] }}>
                    {STATUS_TEXT[item.status]}
                  </span>
                </div>
                <div className="muted health-detail">{item.detail}</div>
              </div>
              {item.repair && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => void repair(item.id)}
                  disabled={repairing !== null}
                >
                  <Icon
                    icon="solar:tuning-2-bold"
                    size={16}
                    className={repairing === item.id ? "anim-pulse" : ""}
                  />
                  <span>{repairing === item.id ? "Reparando..." : item.repair}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

