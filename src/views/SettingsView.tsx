import { useEffect, useState } from "react";
import { HealthPanel } from "../components/HealthPanel";
import { LogViewer } from "../components/LogViewer";
import { Icon } from "../components/ui/Icon";
import {
  defaultMusicDir,
  getStatus,
  onScanProgress,
  openPath,
  pickFolder,
  scanMusicDir,
  setMusicDir,
  updateYtdlp,
} from "../api";
import { StorageService } from "../services/storage";
import type { AppSettings, AudioFormat, BackendStatus, Theme } from "../types";

const FORMAT_OPTIONS: Array<{ id: AudioFormat; label: string; desc: string }> = [
  { id: "mp3", label: "MP3 · 320 kbps", desc: "Maxima compatibilidad con cualquier reproductor." },
  { id: "opus", label: "Opus · 160 kbps", desc: "Mejor relacion tamano/calidad de la compresion moderna." },
  { id: "flac", label: "FLAC · Sin perdida", desc: "Calidad de estudio para audiófilos. Archivos grandes." },
  { id: "m4a", label: "AAC/M4A · 256 kbps", desc: "Formato optimizado para el ecosistema Apple y movil." },
];

const BROWSERS = [
  { id: "chrome", label: "Google Chrome" },
  { id: "edge", label: "Microsoft Edge" },
  { id: "firefox", label: "Mozilla Firefox" },
  { id: "brave", label: "Brave Browser" },
  { id: "opera", label: "Opera" },
  { id: "vivaldi", label: "Vivaldi" },
];

interface Props {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}

type Busy = null | "status" | "scan" | "ytdlp";

export function SettingsView({ theme, onThemeChange }: Props) {
  const [settings, setSettings] = useState<AppSettings>(StorageService.getSettings());
  const [status, setStatus] = useState<BackendStatus | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0 });
  const [logOpen, setLogOpen] = useState(false);

  const refreshStatus = async () => {
    setBusy("status");
    try {
      setStatus(await getStatus());
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Fallo el diagnostico" });
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    void refreshStatus();
  }, []);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const updated = StorageService.updateSettings({ [key]: value });
    setSettings(updated);
    if (key === "theme") onThemeChange(value as Theme);
  };

  const handlePickFolder = async () => {
    try {
      const chosen = await pickFolder(settings.musicDir);
      if (!chosen) return;
      const updated = await setMusicDir(chosen);
      StorageService.updateSettings(updated);
      setSettings(StorageService.getSettings());
      setMessage({ kind: "ok", text: `Carpeta de musica: ${updated.musicDir}` });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "No se pudo cambiar la carpeta" });
    }
  };

  const handleResetFolder = async () => {
    try {
      const updated = await setMusicDir(await defaultMusicDir());
      StorageService.updateSettings(updated);
      setSettings(StorageService.getSettings());
      setMessage({ kind: "ok", text: `Carpeta restaurada a ${updated.musicDir}` });
    } catch (error) {
      setMessage({ kind: "error", text: String(error) });
    }
  };

  const handleScan = async () => {
    setBusy("scan");
    setMessage(null);
    setScanProgress({ done: 0, total: 0 });
    let unlisten: (() => void) | undefined;
    try {
      unlisten = await onScanProgress(setScanProgress);
      const summary = await scanMusicDir(settings.musicDir, true);
      setMessage({
        kind: summary.scanned > 0 ? "ok" : "info",
        text:
          summary.scanned > 0
            ? `Se indexaron ${summary.scanned} archivo(s) desde ${summary.dir}`
            : `No se encontraron archivos de audio en ${summary.dir}`,
      });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Fallo el escaneo" });
    } finally {
      unlisten?.();
      setScanProgress({ done: 0, total: 0 });
      setBusy(null);
    }
  };

  const handleUpdateYtdlp = async () => {
    setBusy("ytdlp");
    setMessage({ kind: "info", text: "Comprobando actualizaciones de yt-dlp..." });
    try {
      const output = await updateYtdlp();
      setMessage({ kind: "ok", text: output.split("\n").slice(-3).join(" ") });
      await refreshStatus();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : "Fallo la actualizacion" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section style={{ maxWidth: "46rem" }}>
      <div className="section-head">
        <div>
          <div className="section-kicker">Preferencias</div>
          <h1 className="section-title">Ajustes y diagnostico</h1>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={refreshStatus} disabled={busy === "status"}>
          <Icon icon="solar:refresh-circle-bold" size={16} className={busy === "status" ? "anim-pulse" : ""} />
          <span>Diagnostico</span>
        </button>
      </div>

      {message && (
        <div
          className="glass-card"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            padding: "var(--space-3) var(--space-4)",
            marginBottom: "var(--space-5)",
            fontSize: "var(--text-sm)",
            color:
              message.kind === "error"
                ? "var(--danger)"
                : message.kind === "ok"
                  ? "var(--success)"
                  : "var(--text-dim)",
          }}
        >
          {message.kind === "error" ? (
            <Icon icon="solar:danger-circle-bold" size={18} />
          ) : message.kind === "ok" ? (
            <Icon icon="solar:check-circle-bold" size={18} />
          ) : (
            <Icon icon="solar:restart-bold" size={18} />
          )}
          <span style={{ minWidth: 0 }}>{message.text}</span>
        </div>
      )}

      {/* Motor de audio */}
      <SettingCard
        title="Motor de audio"
        description="yt-dlp extrae y descarga el audio; ffmpeg lo convierte y lee los metadatos de tus archivos."
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
          <StatusTile
            icon={<Icon icon="solar:cpu-bolt-bold" size={20} color="var(--accent)" />}
            title="Extractor (yt-dlp)"
            detail={status?.hasYtdlp ? `Version ${status.ytdlpVersion ?? "desconocida"}` : "No disponible"}
            ok={Boolean(status?.hasYtdlp)}
          />
          <StatusTile
            icon={<Icon icon="solar:cpu-bolt-bold" size={20} color="var(--accent)" />}
            title="Conversor (ffmpeg)"
            detail={status?.hasFfmpeg ? "Integrado" : "No disponible"}
            ok={Boolean(status?.hasFfmpeg)}
          />
        </div>

        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <button className="btn btn-ghost btn-sm" onClick={handleUpdateYtdlp} disabled={busy === "ytdlp"}>
            <Icon icon="solar:refresh-circle-bold" size={16} className={busy === "ytdlp" ? "anim-pulse" : ""} />
            <span>Actualizar yt-dlp</span>
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => status && openPath(status.dataDir)}
            disabled={!status}
          >
            <Icon icon="solar:database-bold" size={16} />
            <span>Abrir carpeta de datos</span>
          </button>
        </div>

        <p className="muted" style={{ fontSize: "var(--text-xs)", marginTop: "var(--space-3)" }}>
          YouTube cambia a menudo. Actualizar yt-dlp es lo que mantiene la app funcionando cuando
          las descargas empiezan a fallar.
        </p>
      </SettingCard>

      {/* Biblioteca */}
      <SettingCard
        title="Carpeta de musica"
        description="Aqui se guardan las descargas y desde aqui se indexa tu biblioteca existente."
      >
        <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
          <input
            className="field"
            value={settings.musicDir}
            onChange={(event) => updateSetting("musicDir", event.target.value)}
            onBlur={async () => {
              try {
                const updated = await setMusicDir(settings.musicDir);
                StorageService.updateSettings(updated);
                setSettings(StorageService.getSettings());
              } catch (error) {
                setMessage({ kind: "error", text: String(error) });
              }
            }}
            aria-label="Ruta de la carpeta de musica"
          />
          <button className="btn btn-ghost" onClick={handlePickFolder} title="Elegir carpeta">
            <Icon icon="solar:folder-2-bold" size={18} />
            <span>Examinar</span>
          </button>
        </div>

        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <button className="btn btn-ghost btn-sm" onClick={handleScan} disabled={busy === "scan"}>
            <Icon icon="solar:folder-with-files-bold" size={16} className={busy === "scan" ? "anim-pulse" : ""} />
            <span>{busy === "scan" ? "Indexando..." : "Escanear carpeta"}</span>
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => openPath(settings.musicDir)}>
            <Icon icon="solar:folder-2-bold" size={16} />
            <span>Abrir</span>
          </button>
          <button className="btn btn-ghost btn-sm" onClick={handleResetFolder}>
            <span>Restaurar predeterminada</span>
          </button>
        </div>

        {scanProgress.total > 0 && (
          <p className="muted" style={{ fontSize: "var(--text-xs)", marginTop: "var(--space-3)" }}>
            Analizando {scanProgress.done} de {scanProgress.total} archivos...
          </p>
        )}
      </SettingCard>

      {/* Formato de descarga */}
      <SettingCard
        title="Formato de descarga"
        description="El audio extraido de YouTube se convierte a este formato al guardarlo."
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
          {FORMAT_OPTIONS.map((option) => {
            const selected = settings.audioFormat === option.id;
            return (
              <button
                key={option.id}
                className="btn btn-ghost"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  padding: "var(--space-3)",
                  height: "auto",
                  textAlign: "left",
                  borderColor: selected ? "var(--accent)" : undefined,
                  background: selected ? "var(--accent-soft)" : undefined,
                }}
                onClick={() => updateSetting("audioFormat", option.id)}
              >
                <div style={{ display: "flex", width: "100%", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 700, fontSize: "var(--text-sm)" }}>{option.label}</span>
                  {selected && <Icon icon="solar:check-circle-bold" size={16} color="var(--accent)" />}
                </div>
                <span className="muted" style={{ fontSize: "var(--text-xs)", marginTop: "2px" }}>
                  {option.desc}
                </span>
              </button>
            );
          })}
        </div>
      </SettingCard>

      {/* Apariencia */}
      <SettingCard title="Apariencia" description="Tema visual de la interfaz.">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
          <button
            className="btn btn-ghost"
            style={{
              justifyContent: "flex-start",
              borderColor: theme === "dark" ? "var(--accent)" : undefined,
              background: theme === "dark" ? "var(--accent-soft)" : undefined,
            }}
            onClick={() => updateSetting("theme", "dark")}
          >
            <Icon icon="solar:moon-bold" size={18} />
            <span>Tema oscuro</span>
            {theme === "dark" && <Icon icon="solar:check-circle-bold" size={16} style={{ marginLeft: "auto" }} />}
          </button>
          <button
            className="btn btn-ghost"
            style={{
              justifyContent: "flex-start",
              borderColor: theme === "light" ? "var(--accent)" : undefined,
              background: theme === "light" ? "var(--accent-soft)" : undefined,
            }}
            onClick={() => updateSetting("theme", "light")}
          >
            <Icon icon="solar:sun-bold" size={18} />
            <span>Tema claro</span>
            {theme === "light" && <Icon icon="solar:check-circle-bold" size={16} style={{ marginLeft: "auto" }} />}
          </button>
        </div>
      </SettingCard>

      {/* Escritorio */}
      <SettingCard
        title="Escritorio"
        description="Comportamiento de la aplicacion en Windows."
      >
        <label style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={settings.minimizeToTray ?? true}
            onChange={(event) => updateSetting("minimizeToTray", event.target.checked)}
            style={{ width: "18px", height: "18px", accentColor: "var(--accent)" }}
          />
          <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>
            Al cerrar la ventana, seguir en la bandeja del sistema
          </span>
        </label>
        <p className="muted" style={{ fontSize: "var(--text-xs)", marginTop: "var(--space-2)" }}>
          Con esto activado, cerrar la ventana no detiene las descargas en curso. Usa
          &quot;Salir&quot; en el menu de la bandeja para cerrar del todo.
        </p>
      </SettingCard>

      {/* Autenticacion */}
      <SettingCard
        title="Autenticacion de YouTube (opcional)"
        description="Permite a yt-dlp leer las cookies de tu navegador para playlists privadas o con restriccion de edad."
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={settings.browserAuth}
              onChange={(event) => updateSetting("browserAuth", event.target.checked)}
              style={{ width: "18px", height: "18px", accentColor: "var(--accent)" }}
            />
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>
              Usar cookies del navegador
            </span>
          </label>

          {settings.browserAuth && (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <span className="muted" style={{ fontSize: "var(--text-xs)" }}>Navegador:</span>
              <select
                className="field"
                value={settings.selectedBrowser}
                onChange={(event) => updateSetting("selectedBrowser", event.target.value)}
                style={{ width: "auto" }}
              >
                {BROWSERS.map((browser) => (
                  <option key={browser.id} value={browser.id}>
                    {browser.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <p className="muted" style={{ fontSize: "var(--text-xs)" }}>
            Cierra el navegador elegido mientras descargas: si esta abierto, Windows bloquea el
            acceso a su base de cookies y yt-dlp reintentara automaticamente sin ellas.
          </p>
        </div>
      </SettingCard>

      {/* Diagnostico */}
      <SettingCard
        title="Diagnostico y registro"
        description="Comprueba la integridad de Audionave y consulta los errores registrados. Util para detectar por que algo falla."
      >
        <div style={{ marginBottom: "var(--space-4)" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setLogOpen(true)}>
            <Icon icon="solar:bug-bold" size={16} />
            <span>Abrir registro de errores</span>
          </button>
        </div>
        <HealthPanel />
      </SettingCard>

      <LogViewer isOpen={logOpen} onClose={() => setLogOpen(false)} />
    </section>
  );
}

function StatusTile({
  icon,
  title,
  detail,
  ok,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  ok: boolean;
}) {
  return (
    <div
      style={{
        padding: "var(--space-3)",
        background: "var(--surface-solid)",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--line)",
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
      }}
    >
      {icon}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{title}</div>
        <div style={{ fontSize: "var(--text-xs)", color: ok ? "var(--success)" : "var(--danger)" }}>
          {detail}
        </div>
      </div>
    </div>
  );
}

function SettingCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-card" style={{ padding: "var(--space-5)", marginBottom: "var(--space-5)" }}>
      <h3 style={{ fontSize: "var(--text-base)", fontWeight: 750, marginBottom: "var(--space-1)" }}>
        {title}
      </h3>
      {description && (
        <p className="muted" style={{ fontSize: "var(--text-xs)", marginBottom: "var(--space-4)" }}>
          {description}
        </p>
      )}
      {children}
    </div>
  );
}
