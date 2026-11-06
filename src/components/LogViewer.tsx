import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clearLogEntries, getLogDir, getLogEntries, openPath, type LogEntry } from "../api";
import { reportError } from "../services/diagnostics";
import { Icon } from "./ui/Icon";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type LevelFilter = "all" | "problems" | "error";
type SourceFilter = "all" | LogEntry["source"];

/** Entradas retenidas en el visor (el backend conserva las ultimas 1000). */
const MAX_ENTRIES = 1000;
const POLL_MS = 1500;

const LEVEL_LABEL: Record<LogEntry["level"], string> = {
  error: "ERROR",
  warn: "AVISO",
  info: "INFO",
  debug: "DEBUG",
  trace: "TRACE",
};

const SOURCE_LABEL: Record<LogEntry["source"], string> = {
  frontend: "Interfaz",
  rust: "Nucleo",
  "yt-dlp": "yt-dlp",
};

const timeFormat = new Intl.DateTimeFormat("es", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const dateTimeFormat = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "short",
  timeStyle: "medium",
});

function clock(timestamp: number): string {
  return `${timeFormat.format(timestamp)}.${String(timestamp % 1000).padStart(3, "0")}`;
}

function plain(entry: LogEntry): string {
  const stamp = `${dateTimeFormat.format(entry.timestamp)}.${String(entry.timestamp % 1000).padStart(3, "0")}`;
  return `[${stamp}] ${LEVEL_LABEL[entry.level]} ${entry.source}: ${entry.message}`;
}

/** Visor de registro: errores del nucleo, de la interfaz y de yt-dlp. */
export function LogViewer({ isOpen, onClose }: Props) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [level, setLevel] = useState<LevelFilter>("problems");
  const [source, setSource] = useState<SourceFilter>("all");
  const [query, setQuery] = useState("");
  const [follow, setFollow] = useState(true);
  const [copied, setCopied] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const lastIdRef = useRef(0);
  const failureLoggedRef = useRef(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const poll = useCallback(async () => {
    try {
      const fresh = await getLogEntries(lastIdRef.current);
      failureLoggedRef.current = false;
      setLoadFailed(false);
      if (fresh.length === 0) return;
      lastIdRef.current = fresh[fresh.length - 1].id;
      setEntries((previous) => [...previous, ...fresh].slice(-MAX_ENTRIES));
    } catch (error) {
      setLoadFailed(true);
      // Solo una vez: registrar cada fallo llenaria el propio registro.
      if (!failureLoggedRef.current) {
        failureLoggedRef.current = true;
        reportError("el visor no pudo leer el registro", error);
      }
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    lastIdRef.current = 0;
    setEntries([]);
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    dialogRef.current?.focus();
    return () => window.clearInterval(timer);
  }, [isOpen, poll]);

  const counts = useMemo(() => {
    let errors = 0;
    let warnings = 0;
    for (const entry of entries) {
      if (entry.level === "error") errors += 1;
      else if (entry.level === "warn") warnings += 1;
    }
    return { errors, warnings };
  }, [entries]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (level === "error" && entry.level !== "error") return false;
      if (level === "problems" && entry.level !== "error" && entry.level !== "warn") return false;
      if (source !== "all" && entry.source !== source) return false;
      return !needle || entry.message.toLowerCase().includes(needle);
    });
  }, [entries, level, source, query]);

  useEffect(() => {
    if (!follow) return;
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [visible, follow]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(visible.map(plain).join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      reportError("no se pudo copiar el registro", error);
    }
  };

  const handleClear = async () => {
    try {
      await clearLogEntries();
      lastIdRef.current = 0;
      setEntries([]);
    } catch (error) {
      reportError("no se pudo limpiar el registro", error);
    }
  };

  const handleOpenFolder = async () => {
    try {
      await openPath(await getLogDir());
    } catch (error) {
      reportError("no se pudo abrir la carpeta de logs", error);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="modal-content logviewer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="logviewer-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <div className="modal-head">
          <h2 id="logviewer-title" className="modal-title">
            Registro de errores
          </h2>
          <button className="icon-btn-sm" onClick={onClose} aria-label="Cerrar el registro">
            <Icon icon="solar:close-linear" size={18} />
          </button>
        </div>

        <div className="lv-toolbar">
          <div className="lv-chips" role="group" aria-label="Filtrar por gravedad">
            <button
              className="lv-chip"
              data-active={level === "problems"}
              onClick={() => setLevel("problems")}
            >
              Avisos y errores ({counts.errors + counts.warnings})
            </button>
            <button
              className="lv-chip"
              data-active={level === "error"}
              onClick={() => setLevel("error")}
            >
              Solo errores ({counts.errors})
            </button>
            <button className="lv-chip" data-active={level === "all"} onClick={() => setLevel("all")}>
              Todo ({entries.length})
            </button>
          </div>

          <select
            className="field lv-select"
            value={source}
            onChange={(event) => setSource(event.target.value as SourceFilter)}
            aria-label="Filtrar por origen"
          >
            <option value="all">Todos los origenes</option>
            <option value="frontend">Interfaz</option>
            <option value="rust">Nucleo</option>
            <option value="yt-dlp">yt-dlp</option>
          </select>

          <input
            className="field lv-search"
            type="search"
            placeholder="Buscar en el registro..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Buscar en el registro"
          />
        </div>

        <div
          ref={listRef}
          className="lv-list"
          role="log"
          aria-live="off"
          onScroll={(event) => {
            const list = event.currentTarget;
            const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 24;
            if (!atBottom && follow) setFollow(false);
          }}
        >
          {loadFailed && (
            <div className="lv-empty" style={{ color: "var(--danger)" }}>
              No se pudo leer el registro del nucleo. Reintentando...
            </div>
          )}
          {visible.length === 0 && !loadFailed && (
            <div className="lv-empty">
              <Icon icon="solar:shield-check-bold" size={32} color="var(--success)" />
              <div style={{ fontWeight: 650 }}>
                {entries.length === 0 ? "El registro esta vacio" : "Nada que mostrar con estos filtros"}
              </div>
              <div className="muted" style={{ fontSize: "var(--text-xs)" }}>
                {level === "all"
                  ? "Aun no hay entradas."
                  : "No hay avisos ni errores. Cambia el filtro para ver toda la actividad."}
              </div>
            </div>
          )}
          {visible.map((entry) => (
            <div key={entry.id} className="lv-row" data-level={entry.level}>
              <span className="lv-time">{clock(entry.timestamp)}</span>
              <span className="lv-level">{LEVEL_LABEL[entry.level]}</span>
              <span className="lv-source">{SOURCE_LABEL[entry.source]}</span>
              <span className="lv-message">{entry.message}</span>
            </div>
          ))}
        </div>

        <div className="modal-footer lv-footer">
          <label className="lv-follow">
            <input
              type="checkbox"
              checked={follow}
              onChange={(event) => setFollow(event.target.checked)}
              style={{ accentColor: "var(--accent)" }}
            />
            <span>Seguir en vivo</span>
          </label>
          <span className="muted lv-count">
            {visible.length} de {entries.length}
          </span>
          <div className="lv-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => void handleOpenFolder()}>
              <Icon icon="solar:folder-open-bold" size={16} />
              <span>Carpeta de logs</span>
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => void handleClear()}>
              <Icon icon="solar:trash-bin-trash-bold" size={16} />
              <span>Limpiar</span>
            </button>
            <button
              className="btn btn-sm"
              onClick={() => void handleCopy()}
              disabled={visible.length === 0}
            >
              <Icon icon={copied ? "solar:check-circle-bold" : "solar:copy-bold"} size={16} />
              <span>{copied ? "Copiado" : "Copiar para reporte"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

