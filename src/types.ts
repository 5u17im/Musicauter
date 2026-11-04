export type AppView =
  | "now-playing"
  | "library"
  | "playlists"
  | "downloads"
  | "favorites"
  | "discover"
  | "settings";

export type Theme = "light" | "dark";

export type AudioFormat = "mp3" | "opus" | "flac" | "m4a";

export type RepeatMode = "off" | "all" | "one";

export type PlayerStatus = "idle" | "playing" | "paused" | "loading" | "error";

/**
 * Estado del reproductor que la ventana principal difunde para que el mini
 * reproductor (una ventana aparte, sin acceso al elemento <audio>) lo refleje.
 */
export interface PlayerBroadcast {
  status: PlayerStatus;
  /** Tema activo, para que el mini reproductor lo siga. */
  theme: Theme;
  title: string;
  artist: string;
  artworkUrl: string | null;
  progress: number;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  hasTrack: boolean;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  durationSeconds?: number;
  /** Ruta absoluta del archivo en disco. */
  path?: string;
  youtubeId?: string;
  downloaded: boolean;
  isFavorite?: boolean;
  /** URL reproducible: caratula remota o servida por el servidor local. */
  artworkUrl?: string;
  /** Ruta local de la caratula extraida del archivo. */
  coverPath?: string;
  fileSizeBytes?: number;
  format?: string;
  addedAt?: number;
  playlistUrl?: string;
}

export interface Playlist {
  id: string;
  url: string;
  name: string;
  description?: string;
  artworkUrl?: string;
  totalTracks: number;
  downloadedCount: number;
  newTracks: number;
  tracks: Track[];
  createdAt?: number;
  updatedAt?: number;
}

export type DownloadStatus = "pending" | "downloading" | "completed" | "error" | "cancelled";

export interface DownloadItem {
  id: string;
  trackId: string;
  title: string;
  artist: string;
  youtubeId?: string;
  url: string;
  progress: number; // 0 - 100
  status: DownloadStatus;
  speed?: string;
  eta?: string;
  stage?: string;
  error?: string;
  filePath?: string;
  addedAt: number;
}

export interface AppSettings {
  theme: Theme;
  audioFormat: AudioFormat;
  musicDir: string;
  autoSync: boolean;
  browserAuth: boolean;
  selectedBrowser: string;
  lastFmKey?: string;
  /** Al cerrar la ventana, seguir en la bandeja del sistema. */
  minimizeToTray?: boolean;
  /** Registrar atajos multimedia globales. */
  globalMediaKeys?: boolean;
}

export interface BackendStatus {
  ok: boolean;
  message: string;
  hasYtdlp: boolean;
  hasFfmpeg: boolean;
  ytdlpVersion?: string;
  musicDir: string;
  dataDir: string;
  tracksCount: number;
  mediaBase: string;
  mediaToken: string;
}

export interface Snapshot {
  tracks: Track[];
  playlists: Playlist[];
  downloads: DownloadItem[];
  settings: AppSettings;
}

export interface ScanSummary {
  scanned: number;
  total: number;
  dir: string;
}

export interface DownloadProgressEvent {
  id: string;
  stage: string;
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
  speed?: string;
  eta?: string;
  message?: string;
}

export interface DownloadOutcome {
  id: string;
  ok: boolean;
  cancelled: boolean;
  filePath?: string;
  error?: string;
}

export type ToastType = "info" | "success" | "error" | "download";

export interface ToastNotification {
  id: string;
  title: string;
  message?: string;
  type: ToastType;
  duration?: number;
}

export interface YouTubeSearchResult {
  id: string;
  title: string;
  uploader?: string;
  duration?: number;
  thumbnail?: string;
  url?: string;
}
