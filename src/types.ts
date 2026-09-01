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

export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  durationSeconds?: number;
  path?: string;
  youtubeId?: string;
  downloaded: boolean;
  isFavorite?: boolean;
  artworkUrl?: string;
  fileSize?: string;
  format?: string;
  addedAt?: number;
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

export type DownloadStatus = "pending" | "downloading" | "completed" | "error";

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
  error?: string;
  addedAt: number;
}

export interface Recommendation {
  id: string;
  title: string;
  artist: string;
  source: "local" | "internet";
  artworkUrl?: string;
  score: number;
  reason?: string;
  youtubeId?: string;
  genre?: string;
}

export interface AppSettings {
  theme: Theme;
  audioFormat: AudioFormat;
  musicDir: string;
  autoSync: boolean;
  browserAuth: boolean;
  selectedBrowser: string;
  lastFmKey?: string;
}

export type ToastType = "info" | "success" | "error" | "download";

export interface ToastNotification {
  id: string;
  title: string;
  message?: string;
  type: ToastType;
  duration?: number;
}