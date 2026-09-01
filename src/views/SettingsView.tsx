import { useEffect, useState } from "react";
import {
  IconCheck,
  IconCpu,
  IconFolder,
  IconMoon,
  IconRefresh,
  IconSun,
} from "@tabler/icons-react";
import { checkBackendStatus, openFolder } from "../api";
import { StorageService } from "../services/storage";
import type { AppSettings, AudioFormat, Theme } from "../types";

const FORMAT_OPTIONS: Array<{ id: AudioFormat; label: string; desc: string }> = [
  { id: "mp3", label: "MP3 · 320 kbps", desc: "Máxima compatibilidad con todos los reproductores." },
  { id: "opus", label: "Opus · 160 kbps", desc: "Mejor relación tamaño/calidad de compresión moderna." },
  { id: "flac", label: "FLAC · Sin pérdida", desc: "Calidad de estudio bit-perfect para audiófilos." },
  { id: "m4a", label: "AAC/M4A · 256 kbps", desc: "Formato optimizado para ecosistema Apple y móvil." },
];

const BROWSERS = [
  { id: "chrome", label: "Google Chrome" },
  { id: "edge", label: "Microsoft Edge" },
  { id: "firefox", label: "Mozilla Firefox" },
  { id: "brave", label: "Brave Browser" },
  { id: "opera", label: "Opera" },
];

interface Props {
  theme: Theme;
  onThemeChange: (t: Theme) => void;
}

export function SettingsView({ theme, onThemeChange }: Props) {
  const [settings, setSettings] = useState<AppSettings>(StorageService.getSettings());
  const [backendStatus, setBackendStatus] = useState<any>(null);
  const [checking, setChecking] = useState(false);

  const refreshStatus = async () => {
    setChecking(true);
    const s = await checkBackendStatus();
    setBackendStatus(s);
    setChecking(false);
  };

  useEffect(() => {
    void refreshStatus();
  }, []);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const updated = StorageService.saveSettings({ [key]: value });
    setSettings(updated);
    if (key === "theme") {
      onThemeChange(value as Theme);
    }
  };

  const handleOpenFolder = () => {
    openFolder(settings.musicDir);
  };

  return (
    <section style={{ maxWidth: "46rem" }}>
      <div className="section-head">
        <div>
          <div className="section-kicker">Preferencias</div>
          <h1 className="section-title">Ajustes y Configuración</h1>
        </div>

        <button className="btn btn-ghost btn-sm" onClick={refreshStatus} disabled={checking}>
          <IconRefresh size={16} stroke={1.75} className={checking ? "anim-pulse" : ""} />
          <span>Diagnóstico</span>
        </button>
      </div>

      {/* Estado del Backend */}
      <SettingCard
        title="Motor de Audio Integrado"
        description="Componentes nativos de extracción y conversión de audio empaquetados dentro de la aplicación."
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
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
            <IconCpu size={20} stroke={1.75} color="var(--accent)" />
            <div>
              <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>Extractor de Audio</div>
              <div
                style={{
                  fontSize: "var(--text-xs)",
                  color: backendStatus?.has_ytdlp ? "var(--success)" : "var(--danger)",
                }}
              >
                {backendStatus?.has_ytdlp ? "Integrado ✓" : "No disponible"}
              </div>
            </div>
          </div>

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
            <IconCpu size={20} stroke={1.75} color="var(--accent)" />
            <div>
              <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>Códec de Conversión</div>
              <div
                style={{
                  fontSize: "var(--text-xs)",
                  color: backendStatus?.has_ffmpeg ? "var(--success)" : "var(--danger)",
                }}
              >
                {backendStatus?.has_ffmpeg ? "Integrado ✓" : "No disponible"}
              </div>
            </div>
          </div>
        </div>
      </SettingCard>

      {/* Tema y Apariencia */}
      <SettingCard
        title="Apariencia Visual"
        description="Selecciona el tema de la aplicación (ambos cumplen con contraste WCAG AA)."
      >
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
            <IconMoon size={18} stroke={1.75} />
            <span>Tema Oscuro (Impeccable Dark)</span>
            {theme === "dark" && <IconCheck size={16} stroke={2} style={{ marginLeft: "auto" }} />}
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
            <IconSun size={18} stroke={1.75} />
            <span>Tema Claro (Clean Light)</span>
            {theme === "light" && <IconCheck size={16} stroke={2} style={{ marginLeft: "auto" }} />}
          </button>
        </div>
      </SettingCard>

      {/* Calidad de Descarga */}
      <SettingCard
        title="Formato y Calidad de Descarga"
        description="El audio extraído de YouTube se convertirá automáticamente a este formato."
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
          {FORMAT_OPTIONS.map((f) => {
            const isSelected = settings.audioFormat === f.id;
            return (
              <button
                key={f.id}
                className="btn btn-ghost"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  padding: "var(--space-3)",
                  height: "auto",
                  textAlign: "left",
                  borderColor: isSelected ? "var(--accent)" : undefined,
                  background: isSelected ? "var(--accent-soft)" : undefined,
                }}
                onClick={() => updateSetting("audioFormat", f.id)}
              >
                <div style={{ display: "flex", width: "100%", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 700, fontSize: "var(--text-sm)" }}>{f.label}</span>
                  {isSelected && <IconCheck size={16} stroke={2} color="var(--accent)" />}
                </div>
                <span className="muted" style={{ fontSize: "var(--text-xs)", marginTop: "2px" }}>
                  {f.desc}
                </span>
              </button>
            );
          })}
        </div>
      </SettingCard>

      {/* Directorio de Guardado */}
      <SettingCard
        title="Carpeta de Descarga y Biblioteca"
        description="Ubicación en disco donde se guardan los archivos de audio e imágenes incrustadas."
      >
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <input
            className="field"
            value={settings.musicDir}
            onChange={(e) => updateSetting("musicDir", e.target.value)}
            aria-label="Ruta de carpeta de música"
          />
          <button className="btn btn-ghost" onClick={handleOpenFolder}>
            <IconFolder size={18} stroke={1.75} />
            <span>Abrir</span>
          </button>
        </div>
      </SettingCard>

      {/* Autenticación de Cookies de Navegador */}
      <SettingCard
        title="Autenticación de YouTube (Opcional)"
        description="Permite a yt-dlp leer cookies de tu navegador para acceder a tus playlists privadas o con límite de edad."
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={settings.browserAuth}
              onChange={(e) => updateSetting("browserAuth", e.target.checked)}
              style={{ width: "18px", height: "18px", accentColor: "var(--accent)" }}
            />
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>
              Usar cookies del navegador para descargas privadas
            </span>
          </label>

          {settings.browserAuth && (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                Navegador:
              </span>
              <select
                className="field"
                value={settings.selectedBrowser}
                onChange={(e) => updateSetting("selectedBrowser", e.target.value)}
                style={{ width: "auto" }}
              >
                {BROWSERS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </SettingCard>
    </section>
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
    <div
      className="glass-card"
      style={{
        padding: "var(--space-5)",
        marginBottom: "var(--space-5)",
      }}
    >
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