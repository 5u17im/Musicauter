/**
 * Puente IPC entre el frontend React y el backend Rust (Tauri 2).
 *
 * Ya no existe el "modo navegador con datos simulados": las descargas, la
 * biblioteca y las busquedas son reales o fallan con un error visible.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AppSettings,
  BackendStatus,
  DownloadItem,
  DownloadOutcome,
  DownloadProgressEvent,
  Playlist,
  ScanSummary,
  Snapshot,
  Track,
  YouTubeSearchResult,
} from "../types";

export const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let mediaInfo: { base: string; token: string } | null = null;

/** Configura la base del servidor de medios local (se llama en el arranque). */
export function setMediaInfo(base: string, token: string): void {
  mediaInfo = base && token ? { base, token } : null;
}

/**
 * URL reproducible de un archivo local, servida por el servidor HTTP interno
 * con soporte de Range (permite hacer seek sin cargar el archivo en memoria).
 */
export function mediaUrl(filePath: string): string {
  if (!mediaInfo) return filePath;
  return `${mediaInfo.base}/${mediaInfo.token}/${encodeURIComponent(filePath)}`;
}

function requireTauri(): void {
  if (!IS_TAURI) {
    throw new Error(
      "Esta accion requiere la aplicacion de escritorio Audionave (no funciona en el navegador).",
    );
  }
}

// ---------------------------------------------------------------------------
// Estado y ajustes
// ---------------------------------------------------------------------------

export async function getSnapshot(): Promise<Snapshot> {
  requireTauri();
  return invoke<Snapshot>("get_snapshot");
}

export async function getStatus(): Promise<BackendStatus> {
  requireTauri();
  return invoke<BackendStatus>("get_status");
}

/** Escribe en el mismo archivo de log que Rust (diagnostico del arranque). */
export async function frontendLog(message: string): Promise<void> {
  try {
    await invoke("frontend_log", { message });
  } catch {
    /* el log es best-effort */
  }
}

export async function saveSettings(
  patch: Partial<AppSettings>,
): Promise<AppSettings> {
  return invoke<AppSettings>("save_settings", { patch });
}

export async function setMusicDir(path: string): Promise<AppSettings> {
  return invoke<AppSettings>("set_music_dir", { path });
}

export async function defaultMusicDir(): Promise<string> {
  return invoke<string>("default_music_dir");
}

export async function pickFolder(current?: string): Promise<string | null> {
  return invoke<string | null>("pick_folder", { current: current ?? null });
}

export async function openMusicFolder(): Promise<boolean> {
  return invoke<boolean>("open_music_folder");
}

export async function openPath(path?: string): Promise<boolean> {
  return invoke<boolean>("open_path", { path: path ?? null });
}

export async function revealFile(path: string): Promise<boolean> {
  return invoke<boolean>("reveal_file", { path });
}

export async function openExternal(url: string): Promise<boolean> {
  return invoke<boolean>("open_external", { url });
}

// ---------------------------------------------------------------------------
// Biblioteca
// ---------------------------------------------------------------------------

export async function upsertTracks(tracks: Track[]): Promise<void> {
  if (tracks.length === 0) return;
  return invoke("upsert_tracks", { tracks });
}

export async function updateTrack(
  id: string,
  patch: Partial<Track>,
): Promise<void> {
  return invoke("update_track", { id, patch });
}

export async function toggleFavorite(id: string): Promise<boolean> {
  return invoke<boolean>("toggle_favorite", { id });
}

export async function deleteTrack(id: string): Promise<void> {
  return invoke("delete_track", { id });
}

export async function upsertPlaylist(playlist: Playlist): Promise<void> {
  return invoke("upsert_playlist", { playlist });
}

export async function deletePlaylist(id: string): Promise<void> {
  return invoke("delete_playlist", { id });
}

export async function setDownloads(items: DownloadItem[]): Promise<void> {
  return invoke("set_downloads", { items });
}

// ---------------------------------------------------------------------------
// Indexado del disco
// ---------------------------------------------------------------------------

export async function scanMusicDir(
  dir?: string,
  recursive = true,
): Promise<ScanSummary> {
  return invoke<ScanSummary>("scan_music_dir", {
    dir: dir ?? null,
    recursive,
  });
}

export function onScanProgress(
  handler: (progress: { done: number; total: number }) => void,
): Promise<UnlistenFn> {
  return listen<{ done: number; total: number }>("scan://progress", (event) =>
    handler(event.payload),
  );
}

// ---------------------------------------------------------------------------
// yt-dlp
// ---------------------------------------------------------------------------

export async function getStreamUrl(youtubeIdOrUrl: string): Promise<string> {
  const target = youtubeIdOrUrl.startsWith("http")
    ? youtubeIdOrUrl
    : `https://www.youtube.com/watch?v=${youtubeIdOrUrl}`;
  return invoke<string>("get_stream_url", { url: target });
}

/** Respuesta cruda de yt-dlp (--dump-single-json). */
export interface YtDlpInfo {
  id?: string;
  title?: string;
  uploader?: string;
  channel?: string;
  artist?: string;
  duration?: number;
  thumbnail?: string;
  entries?: YtDlpEntry[];
  [key: string]: unknown;
}

export interface YtDlpEntry {
  id?: string;
  title?: string;
  uploader?: string;
  channel?: string;
  duration?: number;
  thumbnail?: string;
  thumbnails?: { url?: string }[];
  [key: string]: unknown;
}

export interface ScannedPlaylist extends YtDlpInfo {
  entries: YtDlpEntry[];
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Inspecciona una playlist o un video. Normaliza el video suelto a entries. */
export async function scanPlaylist(
  url: string,
  auth = "none",
  browser = "",
): Promise<ScannedPlaylist> {
  const raw = await invoke<string>("scan_playlist", { url, auth, browser });
  const parsed = parseJson<ScannedPlaylist>(raw, { entries: [] });

  if (!parsed.entries || parsed.entries.length === 0) {
    if (parsed.id || parsed.title) {
      parsed.entries = [
        {
          id: parsed.id,
          title: parsed.title,
          uploader: parsed.uploader ?? parsed.channel ?? parsed.artist,
          duration: parsed.duration,
          thumbnail: parsed.thumbnail,
        },
      ];
    } else {
      parsed.entries = [];
    }
  }
  return parsed;
}

function normalizeEntry(entry: YtDlpEntry): YouTubeSearchResult | null {
  const id = typeof entry.id === "string" ? entry.id : "";
  if (!id) return null;
  return {
    id,
    title: entry.title ?? "Sin titulo",
    uploader: entry.uploader ?? entry.channel ?? "Artista desconocido",
    duration: entry.duration ?? 0,
    thumbnail: entry.thumbnail ?? entry.thumbnails?.[0]?.url,
    url: `https://www.youtube.com/watch?v=${id}`,
  };
}

export async function searchYouTube(
  query: string,
): Promise<YouTubeSearchResult[]> {
  if (!query.trim()) return [];
  const raw = await invoke<string>("search_youtube", { query: query.trim() });
  const parsed = parseJson<{ entries?: YtDlpEntry[] }>(raw, { entries: [] });
  return (parsed.entries ?? [])
    .map(normalizeEntry)
    .filter((item): item is YouTubeSearchResult => item !== null);
}

/**
 * Mezcla automatica de YouTube ("mix") basada en un video concreto.
 * Es la recomendacion real de YouTube, no una lista inventada.
 */
export async function getMix(videoId: string): Promise<YouTubeSearchResult[]> {
  const raw = await invoke<string>("get_mix", { videoId });
  const parsed = parseJson<{ entries?: YtDlpEntry[] }>(raw, { entries: [] });
  return (parsed.entries ?? [])
    .map(normalizeEntry)
    .filter(
      (item): item is YouTubeSearchResult =>
        item !== null && item.id !== videoId,
    );
}

export async function updateYtdlp(): Promise<string> {
  return invoke<string>("update_ytdlp_command");
}

// ---------------------------------------------------------------------------
// Descargas
// ---------------------------------------------------------------------------

export interface DownloadRequest {
  id: string;
  url: string;
  outputDir?: string;
  format?: string;
  auth?: string;
  browser?: string;
}

export async function downloadTrack(
  request: DownloadRequest,
): Promise<DownloadOutcome> {
  return invoke<DownloadOutcome>("download_track", { request });
}

export function onDownloadProgress(
  handler: (progress: DownloadProgressEvent) => void,
): Promise<UnlistenFn> {
  return listen<DownloadProgressEvent>("download://progress", (event) =>
    handler(event.payload),
  );
}

export async function cancelDownload(id: string): Promise<boolean> {
  return invoke<boolean>("cancel_download", { id });
}

export async function cancelAllDownloads(): Promise<boolean> {
  return invoke<boolean>("cancel_all_downloads");
}

// ---------------------------------------------------------------------------
// Ventana y bandeja
// ---------------------------------------------------------------------------

export async function hideToTray(): Promise<void> {
  return invoke("hide_to_tray");
}

export async function showMainWindow(): Promise<void> {
  return invoke("show_main_window");
}

export async function quitApp(): Promise<void> {
  return invoke("quit_app");
}

/** Abre o cierra la ventana del mini reproductor. Devuelve si quedo abierta. */
export async function toggleMiniPlayer(): Promise<boolean> {
  return invoke<boolean>("toggle_mini_player");
}

/**
 * Refleja la reproduccion en la barra de miniaturas de la barra de tareas
 * (el boton central muestra reproducir o pausar).
 */
export async function setTaskbarPlaybackState(
  playing: boolean,
  title?: string,
): Promise<void> {
  return invoke("set_taskbar_playback_state", {
    playing,
    title: title ?? null,
  });
}
