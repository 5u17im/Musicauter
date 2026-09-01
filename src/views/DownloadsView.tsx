import { useEffect, useMemo, useState } from "react";
import {
  IconAlertCircle,
  IconCheck,
  IconClock,
  IconDownload,
  IconFolder,
  IconLoader2,
  IconRefresh,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { openFolder } from "../api";
import { DownloadManager } from "../services/downloadManager";
import { StorageService } from "../services/storage";
import type { DownloadItem } from "../types";

export function DownloadsView() {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [filter, setFilter] = useState<"all" | "active" | "completed" | "error">("all");

  useEffect(() => {
    const load = () => setDownloads(StorageService.getDownloads());
    load();
    const unsubStorage = StorageService.subscribe(load);
    const unsubManager = DownloadManager.subscribe(load);
    return () => {
      unsubStorage();
      unsubManager();
    };
  }, []);

  const filteredDownloads = useMemo(() => {
    if (filter === "active") {
      return downloads.filter((d) => d.status === "pending" || d.status === "downloading");
    }
    if (filter === "completed") {
      return downloads.filter((d) => d.status === "completed");
    }
    if (filter === "error") {
      return downloads.filter((d) => d.status === "error");
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
    () => downloads.filter((d) => d.status === "error").length,
    [downloads],
  );

  const handleOpenFolder = () => {
    const settings = StorageService.getSettings();
    openFolder(settings.musicDir);
  };

  const handleClearCompleted = () => {
    DownloadManager.clearCompleted();
  };

  const handleClearPending = () => {
    DownloadManager.clearPending();
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
            <IconFolder size={16} stroke={1.75} />
            <span>Abrir carpeta</span>
          </button>

          {pendingCount > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={handleClearPending} title="Cancelar descargas en espera">
              <IconX size={16} stroke={1.75} />
              <span>Cancelar en espera ({pendingCount})</span>
            </button>
          )}

          {completedCount > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={handleClearCompleted}>
              <IconCheck size={16} stroke={2} />
              <span>Limpiar completadas</span>
            </button>
          )}

          {downloads.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={handleClearAll} title="Limpiar todo el historial">
              <IconTrash size={16} stroke={1.75} />
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
          <IconLoader2 size={18} stroke={2} className="anim-spin" />
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
          <IconDownload size={14} stroke={1.75} />
          <span>En progreso ({activeCount})</span>
        </button>
        <button
          className={`btn btn-ghost btn-sm ${filter === "completed" ? "badge-accent" : ""}`}
          onClick={() => setFilter("completed")}
        >
          <IconCheck size={14} stroke={2} />
          <span>Completadas ({completedCount})</span>
        </button>
        <button
          className={`btn btn-ghost btn-sm ${filter === "error" ? "badge-accent" : ""}`}
          onClick={() => setFilter("error")}
        >
          <IconAlertCircle size={14} stroke={1.75} />
          <span>Fallidas ({errorCount})</span>
        </button>
      </div>

      {/* Lista de Descargas */}
      {filteredDownloads.length === 0 ? (
        <div className="empty-state">
          <IconDownload className="empty-icon" stroke={1.5} />
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
                  : isCompleted
                    ? "var(--success-soft)"
                    : "var(--danger-soft)",
            }}
          >
            {isDownloading && <IconLoader2 size={16} stroke={2} color="var(--accent)" className="anim-spin" />}
            {isPending && <IconClock size={16} stroke={1.75} color="var(--text-faint)" />}
            {isCompleted && <IconCheck size={16} stroke={2} color="var(--success)" />}
            {isError && <IconAlertCircle size={16} stroke={2} color="var(--danger)" />}
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
                {item.speed || "Descargando..."}
              </span>
              <span
                className="badge badge-accent"
                style={{ fontFamily: "var(--font-mono)", minWidth: "3rem", justifyContent: "center" }}
              >
                {item.progress}%
              </span>
            </>
          )}

          {isPending && queuePosition != null && (
            <span className="badge" style={{ fontSize: "var(--text-xs)" }}>
              <IconClock size={12} stroke={2} />
              <span>#{queuePosition} en cola</span>
            </span>
          )}

          {isCompleted && (
            <span className="badge badge-success">
              <IconCheck size={14} stroke={2} />
              <span>Listo</span>
            </span>
          )}

          {isError && (
            <>
              <span className="badge badge-danger">
                <IconAlertCircle size={14} stroke={2} />
                <span>Error</span>
              </span>
              <button
                className="icon-btn-sm"
                onClick={() => DownloadManager.retryDownload(item.id)}
                aria-label="Reintentar descarga"
                title="Reintentar"
              >
                <IconRefresh size={16} stroke={1.75} />
              </button>
            </>
          )}

          <button
            className="icon-btn-sm"
            onClick={() => DownloadManager.removeDownload(item.id)}
            aria-label="Eliminar registro"
            title="Eliminar"
          >
            <IconX size={14} stroke={1.75} />
          </button>
        </div>
      </div>

      {/* Barra de progreso para descargas activas */}
      {isDownloading && (
        <div
          style={{
            width: "100%",
            height: 4,
            background: "var(--line)",
            borderRadius: "var(--radius-full)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${item.progress}%`,
              background: "var(--accent)",
              borderRadius: "var(--radius-full)",
              transition: "width 0.4s ease",
            }}
          />
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
