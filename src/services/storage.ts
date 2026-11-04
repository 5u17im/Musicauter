/**
 * Fachada sincrona sobre la biblioteca persistida por Rust en %APPDATA%.
 *
 * Los componentes siguen leyendo de forma sincrona (getTracks, getPlaylists...)
 * porque el estado vive en memoria; cada mutacion se refleja en el almacen
 * nativo de forma asincrona.
 *
 * No hay ningun dato precargado: la biblioteca empieza vacia y se llena con lo
 * que el usuario descarga o indexa desde su disco.
 */

import {
  defaultMusicDir,
  deletePlaylist as apiDeletePlaylist,
  deleteTrack as apiDeleteTrack,
  getSnapshot,
  mediaUrl,
  saveSettings as apiSaveSettings,
  setDownloads as apiSetDownloads,
  setMusicDir as apiSetMusicDir,
  toggleFavorite as apiToggleFavorite,
  updateTrack as apiUpdateTrack,
  upsertPlaylist as apiUpsertPlaylist,
  upsertTracks as apiUpsertTracks,
} from "../api";
import type {
  AppSettings,
  DownloadItem,
  Playlist,
  Track,
} from "../types";

const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  audioFormat: "mp3",
  musicDir: "",
  autoSync: true,
  browserAuth: false,
  selectedBrowser: "chrome",
  minimizeToTray: true,
  globalMediaKeys: true,
};

type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* ignorar oyentes rotos */
    }
  });
}

/** Rellena artworkUrl a partir de coverPath usando el servidor local. */
function decorate(track: Track): Track {
  if (track.coverPath && !track.artworkUrl) {
    return { ...track, artworkUrl: mediaUrl(track.coverPath) };
  }
  return track;
}

let tracks: Track[] = [];
let playlists: Playlist[] = [];
let downloads: DownloadItem[] = [];
let settings: AppSettings = { ...DEFAULT_SETTINGS };
let initialized = false;

function reportError(context: string, error: unknown): void {
  console.error(`[Audionave] ${context}`, error);
}

export const StorageService = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Hidrata el estado desde %APPDATA%. */
  async init(): Promise<void> {
    if (initialized) return;
    initialized = true;

    const snapshot = await getSnapshot();

    tracks = snapshot.tracks.map(decorate);
    playlists = snapshot.playlists;
    downloads = snapshot.downloads;
    settings = { ...DEFAULT_SETTINGS, ...snapshot.settings };

    // Primera ejecucion: fijar la carpeta de musica real del usuario.
    if (!settings.musicDir || settings.musicDir.includes("~")) {
      try {
        const fallback = await defaultMusicDir();
        await apiSetMusicDir(fallback);
        settings = { ...settings, musicDir: fallback };
      } catch (error) {
        reportError("no se pudo fijar la carpeta de musica", error);
      }
    }

    notify();
  },

  // -----------------------------------------------------------------
  // Pistas
  // -----------------------------------------------------------------
  getTracks(): Track[] {
    return tracks;
  },

  getTrack(id: string): Track | undefined {
    return tracks.find((track) => track.id === id);
  },

  addTracks(incoming: Track[]): void {
    if (incoming.length === 0) return;
    const byId = new Map(tracks.map((track) => [track.id, track]));
    incoming.forEach((track) => byId.set(track.id, { ...byId.get(track.id), ...track }));
    tracks = Array.from(byId.values());
    notify();
    apiUpsertTracks(incoming).catch((error) =>
      reportError("no se pudieron guardar las pistas", error),
    );
  },

  updateTrack(id: string, patch: Partial<Track>): void {
    const index = tracks.findIndex((track) => track.id === id);
    if (index === -1) return;
    tracks = tracks.map((track, i) => (i === index ? { ...track, ...patch } : track));
    notify();
    apiUpdateTrack(id, patch).catch((error) =>
      reportError("no se pudo actualizar la pista", error),
    );
  },

  toggleFavorite(id: string): boolean {
    const track = tracks.find((item) => item.id === id);
    if (!track) return false;
    const next = !track.isFavorite;
    tracks = tracks.map((item) =>
      item.id === id ? { ...item, isFavorite: next } : item,
    );
    notify();
    apiToggleFavorite(id).catch((error) =>
      reportError("no se pudo cambiar el favorito", error),
    );
    return next;
  },

  deleteTrack(id: string): void {
    tracks = tracks.filter((track) => track.id !== id);
    notify();
    apiDeleteTrack(id).catch((error) =>
      reportError("no se pudo borrar la pista", error),
    );
  },

  // -----------------------------------------------------------------
  // Playlists
  // -----------------------------------------------------------------
  getPlaylists(): Playlist[] {
    return playlists;
  },

  addPlaylist(playlist: Playlist): void {
    const index = playlists.findIndex(
      (item) => item.id === playlist.id || item.url === playlist.url,
    );
    if (index !== -1) {
      playlists = playlists.map((item, i) =>
        i === index ? { ...item, ...playlist } : item,
      );
    } else {
      playlists = [playlist, ...playlists];
    }
    notify();
    apiUpsertPlaylist(playlist).catch((error) =>
      reportError("no se pudo guardar la playlist", error),
    );
  },

  deletePlaylist(id: string): void {
    playlists = playlists.filter((playlist) => playlist.id !== id);
    notify();
    apiDeletePlaylist(id).catch((error) =>
      reportError("no se pudo borrar la playlist", error),
    );
  },

  // -----------------------------------------------------------------
  // Descargas
  // -----------------------------------------------------------------
  getDownloads(): DownloadItem[] {
    return downloads;
  },

  /** Reemplaza la lista en memoria. `persist` controla la escritura en disco. */
  replaceDownloads(items: DownloadItem[], persist = true): void {
    downloads = items;
    notify();
    if (persist) {
      apiSetDownloads(items).catch((error) =>
        reportError("no se pudo guardar la cola de descargas", error),
      );
    }
  },

  updateDownload(id: string, patch: Partial<DownloadItem>, persist = false): void {
    const index = downloads.findIndex((item) => item.id === id);
    if (index === -1) return;
    downloads = downloads.map((item, i) =>
      i === index ? { ...item, ...patch } : item,
    );
    notify();
    if (persist) {
      apiSetDownloads(downloads).catch((error) =>
        reportError("no se pudo guardar la cola de descargas", error),
      );
    }
  },

  removeDownload(id: string): void {
    downloads = downloads.filter((item) => item.id !== id);
    notify();
    apiSetDownloads(downloads).catch((error) =>
      reportError("no se pudo guardar la cola de descargas", error),
    );
  },

  // -----------------------------------------------------------------
  // Ajustes
  // -----------------------------------------------------------------
  getSettings(): AppSettings {
    return settings;
  },

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    settings = { ...settings, ...patch };
    notify();
    apiSaveSettings(patch).catch((error) =>
      reportError("no se pudieron guardar los ajustes", error),
    );
    return settings;
  },
};
