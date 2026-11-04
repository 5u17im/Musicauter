import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/ui/Icon";
import { openPath } from "../api";
import { DownloadManager } from "../services/downloadManager";
import { StorageService } from "../services/storage";
import type { DownloadItem } from "../types";

export function DownloadsView() {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [filter, setFilter] = useState<"all" | "active" | "completed" | "error">("all");

  useEffect(() => {
    // StorageService notifica tanto los cambios de estado como el progreso.
    const load = () => setDownloads([...StorageService.getDownloads()]);
    load();
    return StorageService.subscribe(load);
  }, []);

  const filteredDownloads = useMemo(() => {
    if (filter === "active") {
      return downloads.filter((d) => d.status === "pending" || d.status === "downloading");
    }
    if (filter === "completed") {
      return downloads.filter((d) => d.status === "completed");
    }
    if (filter === "error") {
      return downloads.filter(
        (d) => d.status === "error" || d.status === "cancelled",
      );
    }
    return downloads;
  }, [downloads, filter]);

  const downloadingCount = useMemo(
    () => downloads.filter((d) => d.status === "downloading").length,
    [downloads],
  );

  const pendingCount = useMemo(
    () => downloads.filter((d) => d.status === "pending").length,
    [downloads],
  );

  const activeCount = downloadingCount + pendingCount;

  const completedCount = useMemo(
    () => downloads.filter((d) => d.status === "completed").length,
    [downloads],
  );

  const errorCount = useMemo(
    () =>
      downloads.filter((d) => d.status === "error" || d.status === "cancelled")
        .length,
    [downloads],
  );

  const handleOpenFolder = () => {
    const settings = StorageService.getSettings();
    void openPath(settings.musicDir);
  };

  const handleClearCompleted = () => {
    DownloadManager.clearCompleted();
  };

  const handleCancelPending = () => {
    void DownloadManager.cancelAllPending();
  };

  const handleClearAll = () => {
    DownloadManager.clearAll();
  };

  // Calcular posición en cola para items pendientes
  const pendingPositions = useMemo(() => {
    const map = new Map<string, number>();
    let pos = 1;
    for (const d of downloads) {
      if (d.status === "pending") {
        map.set(d.id, pos++);
      }
    }
    return map;
  }, [downloads]);

  return (
    <section>
      <div className="section-head">
        <div>
          <div className="section-kicker">Gestor de descargas</div>
          <h1 className="section-title">Descargas en Segundo Plano</h1>
        </div>

        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <button className="btn btn-ghost btn-sm" onClick={handleOpenFolder}>
            <Icon icon="solar:folder-2-bold" size={16} />
            <span>Abrir carpeta</span>
          </button>

          {pendingCount > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={handleCancelPending} title="Cancelar las descargas que aun no han empezado">
              <Icon icon="solar:forbidden-circle-bold" size={16} />
              <span>Cancelar en espera ({pendingCount})</span>
            </button>
          )}

          {completedCount > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={handleClearCompleted}>
              <Icon icon="solar:check-circle-bold" size={16} />
              <span>Limpiar completadas</span>
            </button>
          )}

          {downloads.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={handleClearAll} title="Limpiar todo el historial">
              <Icon icon="solar:trash-bin-trash-bold" size={16} />
              <span>Limpiar todo</span>
            </button>
          )}
        </div>
      </div>

      {/* Resumen de actividad */}
      {downloadingCount > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            padding: "var(--space-3) var(--space-4)",
            background: "var(--accent-soft)",
            borderRadius: "var(--radius-sm)",
            marginBottom: "var(--space-4)",
            fontSize: "var(--text-sm)",
            color: "var(--accent)",
            fontWeight: 600,
          }}
        >
          <Icon icon="solar:restart-bold" size={18} className="anim-spin" />
          <span>
            Descargando {downloadingCount} de {activeCount} pista{activeCount !== 1 ? "s" : ""}
            {pendingCount > 0 && ` · ${pendingCount} en cola`}
          </span>
        </div>
      )}

      {/* Pestañas de Filtro */}
      <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-5)" }}>
        <button
          className={`btn btn-ghost btn-sm ${filter === "all" ? "badge-accent" : ""}`}
          onClick={() => setFilter("all")}
        >
          Todas ({downloads.length})
        </button>
        <button
          className={`btn btn-ghost btn-sm ${filter === "active" ? "badge-accent" : ""}`}
          onClick={() => setFilter("active")}
        >
          <Icon icon="solar:download-square-bold" size={14} />
          <span>En progreso ({activeCount})</span>
        </button>
        <button
          className={`btn btn-ghost btn-sm ${filter === "completed" ? "badge-accent" : ""}`}
          onClick={() => setFilter("completed")}
        >
          <Icon icon="solar:check-circle-bold" size={14} />
          <span>Completadas ({completedCount})</span>
        </button>
        <button
          className={`btn btn-ghost btn-sm ${filter === "error" ? "badge-accent" : ""}`}
          onClick={() => setFilter("error")}
        >
          <Icon icon="solar:danger-circle-bold" size={14} />
          <span>Con problemas ({errorCount})</span>
        </button>
      </div>

      {/* Lista de Descargas */}
      {filteredDownloads.length === 0 ? (
        <div className="empty-state">
          <Icon icon="solar:download-square-bold" size={44} className="empty-icon" />
          <div style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>
            Sin descargas {filter !== "all" ? `en esta categoría` : `activas`}
          </div>
          <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
            Haz clic en el botón de descarga de cualquier canción o playlist para extraerla.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {filteredDownloads.map((item) => (
            <DownloadRow
              key={item.id}
              item={item}
              queuePosition={pendingPositions.get(item.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function DownloadRow({ item, queuePosition }: { item: DownloadItem; queuePosition?: number }) {
  const isDownloading = item.status === "downloading";
  const isPending = item.status === "pending";
  const isCompleted = item.status === "completed";
  const isError = item.status === "error";
  const isCancelled = item.status === "cancelled";

  return (
    <div
      className="glass-card"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        padding: "var(--space-3) var(--space-4)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)" }}>
        {/* Info de la pista */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", minWidth: 0, flex: 1 }}>
          {/* Icono de estado */}
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "var(--radius-sm)",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              background: isDownloading
                ? "var(--accent-soft)"
                : isPending
                  ? "var(--surface-solid)"
                  : isCancelled
                    ? "var(--surface-solid)"
                    : isCompleted
                      ? "var(--success-soft)"
                      : "var(--danger-soft)",
            }}
          >
            {isDownloading && <Icon icon="solar:restart-bold" size={16} color="var(--accent)" className="anim-spin" />}
            {isPending && <Icon icon="solar:clock-circle-bold" size={16} color="var(--text-faint)" />}
            {isCompleted && <Icon icon="solar:check-circle-bold" size={16} color="var(--success)" />}
            {isError && <Icon icon="solar:danger-circle-bold" size={16} color="var(--danger)" />}
            {isCancelled && <Icon icon="solar:forbidden-circle-bold" size={16} color="var(--text-faint)" />}
          </div>

          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontWeight: 600,
                fontSize: "var(--text-sm)",
                color: "var(--text)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {item.title}
            </div>
            <div className="muted" style={{ fontSize: "var(--text-xs)" }}>
              {item.artist}
            </div>
          </div>
        </div>

        {/* Estado y acciones */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0 }}>
          {isDownloading && (
            <>
              <span className="muted" style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-mono)" }}>
                {item.stage === "converting"
                  ? "Convirtiendo..."
                  : item.stage === "starting"
                    ? "Conectando..."
                    : item.speed || "Descargando..."}
              </span>
              {item.eta && (
                <span className="muted" style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-mono)" }}>
                  ETA {item.eta}
                </span>
              )}
              <span
                className="badge badge-accent"
                style={{ fontFamily: "var(--font-mono)", minWidth: "3rem", justifyContent: "center" }}
              >
                {Math.floor(item.progress)}%
              </span>
              <button
                className="icon-btn-sm"
                onClick={() => void DownloadManager.cancel(item.id)}
                aria-label="Cancelar descarga"
                title="Cancelar"
              >
                <Icon icon="solar:forbidden-circle-bold" size={16} />
              </button>
            </>
          )}

          {isCancelled && (
            <>
              <span className="badge" style={{ fontSize: "var(--text-xs)" }}>
                <Icon icon="solar:info-circle-bold" size={12} />
                <span>Cancelada</span>
              </span>
              <button
                className="icon-btn-sm"
                onClick={() => DownloadManager.retryDownload(item.id)}
                aria-label="Reanudar descarga cancelada"
                title="Reintentar"
              >
                <Icon icon="solar:refresh-circle-bold" size={16} />
              </button>
            </>
          )}

          {isPending && queuePosition != null && (
            <span className="badge" style={{ fontSize: "var(--text-xs)" }}>
              <Icon icon="solar:clock-circle-bold" size={12} />
              <span>#{queuePosition} en cola</span>
            </span>
          )}

          {isCompleted && (
            <span className="badge badge-success">
              <Icon icon="solar:check-circle-bold" size={14} />
              <span>Listo</span>
            </span>
          )}

          {isError && (
            <>
              <span className="badge badge-danger">
                <Icon icon="solar:danger-circle-bold" size={14} />
                <span>Error</span>
              </span>
              <button
                className="icon-btn-sm"
                onClick={() => DownloadManager.retryDownload(item.id)}
                aria-label="Reintentar descarga"
                title="Reintentar"
              >
                <Icon icon="solar:refresh-circle-bold" size={16} />
              </button>
            </>
          )}

          <button
            className="icon-btn-sm"
            onClick={() => DownloadManager.removeDownload(item.id)}
            aria-label="Eliminar registro"
            title="Eliminar"
          >
            <Icon icon="solar:close-linear" size={14} />
          </button>
        </div>
      </div>

      {/* Barra de progreso para descargas activas */}
      {isDownloading && (
        <div className="progress-bar progress-active">
          <div className="progress-fill" style={{ width: `${item.progress}%` }} />
        </div>
      )}

      {/* Mensaje de error detallado */}
      {item.error && (
        <div style={{ fontSize: "var(--text-xs)", color: "var(--danger)", paddingLeft: 44 }}>
          {item.error}
        </div>
      )}
    </div>
  );
}
