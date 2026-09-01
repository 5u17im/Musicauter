import type { AppSettings, DownloadItem, Playlist, Track } from "../types";

const TRACKS_KEY = "audionave_tracks_v1";
const PLAYLISTS_KEY = "audionave_playlists_v1";
const DOWNLOADS_KEY = "audionave_downloads_v1";
const SETTINGS_KEY = "audionave_settings_v1";

const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  audioFormat: "mp3",
  musicDir: "~/Música/Audionave",
  autoSync: true,
  browserAuth: false,
  selectedBrowser: "chrome",
};

const SEED_TRACKS: Track[] = [
  {
    id: "trk-1",
    title: "Midnight City Lights",
    artist: "Kessler & The Echoes",
    album: "Neon Horizon",
    durationSeconds: 245,
    downloaded: true,
    isFavorite: true,
    artworkUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&q=80",
    youtubeId: "MwpMEbgC7DA",
    format: "MP3 320k",
    fileSize: "9.4 MB",
    addedAt: Date.now() - 86400000 * 3,
  },
  {
    id: "trk-2",
    title: "Solar Flare Echoes",
    artist: "Marea Sonora",
    album: "Deep Waves",
    durationSeconds: 214,
    downloaded: true,
    isFavorite: false,
    artworkUrl: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&q=80",
    youtubeId: "5qap5aO4i9A",
    format: "FLAC",
    fileSize: "24.1 MB",
    addedAt: Date.now() - 86400000 * 2,
  },
  {
    id: "trk-3",
    title: "Luna y Salitre",
    artist: "Nalini Bloom",
    album: "Costas",
    durationSeconds: 188,
    downloaded: false,
    isFavorite: true,
    artworkUrl: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=400&q=80",
    youtubeId: "kJQP7kiw5Fk",
    format: "Opus",
    fileSize: "4.8 MB",
    addedAt: Date.now() - 86400000 * 1,
  },
  {
    id: "trk-4",
    title: "Horizonte Carmesí",
    artist: "Veltre Project",
    album: "Analog Feelings",
    durationSeconds: 232,
    downloaded: true,
    isFavorite: true,
    artworkUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80",
    youtubeId: "fJ9rUzIMcZQ",
    format: "MP3 320k",
    fileSize: "8.8 MB",
    addedAt: Date.now() - 86400000 * 5,
  },
  {
    id: "trk-5",
    title: "Cenizas en el Viento",
    artist: "Amara Rey",
    album: "Acústica Silente",
    durationSeconds: 301,
    downloaded: true,
    isFavorite: false,
    artworkUrl: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80",
    youtubeId: "L_LUpnjgPso",
    format: "MP3 320k",
    fileSize: "11.5 MB",
    addedAt: Date.now() - 86400000 * 7,
  },
  {
    id: "trk-6",
    title: "Ondas del Ocaso",
    artist: "Mildé Trio",
    album: "Sintetizadores & Niebla",
    durationSeconds: 260,
    downloaded: false,
    isFavorite: false,
    artworkUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=80",
    youtubeId: "RgKAFK5djSk",
    format: "Opus",
    fileSize: "6.1 MB",
    addedAt: Date.now() - 86400000 * 1,
  },
];

const SEED_PLAYLISTS: Playlist[] = [
  {
    id: "pl-lofi",
    url: "https://www.youtube.com/playlist?list=PL_LofiStudyVibes",
    name: "Lo-Fi Beats para Concentración",
    description: "Ritmos downtempo, melodías cálidas y texturas de vinilo para sesiones de estudio y programación.",
    artworkUrl: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&q=80",
    totalTracks: 24,
    downloadedCount: 18,
    newTracks: 6,
    tracks: SEED_TRACKS.slice(0, 4),
    createdAt: Date.now() - 86400000 * 14,
    updatedAt: Date.now() - 86400000 * 1,
  },
  {
    id: "pl-synth",
    url: "https://www.youtube.com/playlist?list=PL_SynthwaveNightRide",
    name: "Synthwave & Retrowave Drives",
    description: "Sintetizadores analógicos, líneas de bajo arpegiadas y estética ochentera nocturna.",
    artworkUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&q=80",
    totalTracks: 16,
    downloadedCount: 16,
    newTracks: 0,
    tracks: [SEED_TRACKS[0], SEED_TRACKS[3], SEED_TRACKS[5]],
    createdAt: Date.now() - 86400000 * 20,
    updatedAt: Date.now() - 86400000 * 4,
  },
  {
    id: "pl-indie",
    url: "https://www.youtube.com/playlist?list=PL_IndieAcousticMornings",
    name: "Indie & Acústico Matinal",
    description: "Guitarras acústicas suaves, voces íntimas y arreglos minimalistas para empezar el día.",
    artworkUrl: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80",
    totalTracks: 19,
    downloadedCount: 12,
    newTracks: 7,
    tracks: [SEED_TRACKS[1], SEED_TRACKS[2], SEED_TRACKS[4]],
    createdAt: Date.now() - 86400000 * 30,
    updatedAt: Date.now() - 86400000 * 2,
  },
];

type StorageListener = () => void;
const listeners = new Set<StorageListener>();

function notifyChange() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // Ignorar fallos de oyentes desuscriptos
    }
  });
}

export const StorageService = {
  subscribe(fn: StorageListener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  // ----------------------------------------------------
  // TRACKS
  // ----------------------------------------------------
  getTracks(): Track[] {
    try {
      const raw = localStorage.getItem(TRACKS_KEY);
      if (!raw) {
        localStorage.setItem(TRACKS_KEY, JSON.stringify(SEED_TRACKS));
        return SEED_TRACKS;
      }
      return JSON.parse(raw);
    } catch {
      return SEED_TRACKS;
    }
  },

  saveTracks(tracks: Track[]): void {
    localStorage.setItem(TRACKS_KEY, JSON.stringify(tracks));
    notifyChange();
  },

  addTrack(track: Track): void {
    const tracks = this.getTracks();
    if (!tracks.some((t) => t.id === track.id)) {
      tracks.unshift(track);
      this.saveTracks(tracks);
    }
  },

  updateTrack(id: string, patch: Partial<Track>): void {
    const tracks = this.getTracks();
    const idx = tracks.findIndex((t) => t.id === id);
    if (idx !== -1) {
      tracks[idx] = { ...tracks[idx], ...patch };
      this.saveTracks(tracks);
    }
  },

  toggleFavorite(id: string): boolean {
    const tracks = this.getTracks();
    const idx = tracks.findIndex((t) => t.id === id);
    if (idx !== -1) {
      const nextFav = !tracks[idx].isFavorite;
      tracks[idx].isFavorite = nextFav;
      this.saveTracks(tracks);
      return nextFav;
    }
    return false;
  },

  deleteTrack(id: string): void {
    const tracks = this.getTracks().filter((t) => t.id !== id);
    this.saveTracks(tracks);
  },

  // ----------------------------------------------------
  // PLAYLISTS
  // ----------------------------------------------------
  getPlaylists(): Playlist[] {
    try {
      const raw = localStorage.getItem(PLAYLISTS_KEY);
      if (!raw) {
        localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(SEED_PLAYLISTS));
        return SEED_PLAYLISTS;
      }
      return JSON.parse(raw);
    } catch {
      return SEED_PLAYLISTS;
    }
  },

  savePlaylists(playlists: Playlist[]): void {
    localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists));
    notifyChange();
  },

  addPlaylist(playlist: Playlist): void {
    const playlists = this.getPlaylists();
    const existingIdx = playlists.findIndex((p) => p.id === playlist.id || p.url === playlist.url);
    if (existingIdx !== -1) {
      playlists[existingIdx] = { ...playlists[existingIdx], ...playlist };
    } else {
      playlists.unshift(playlist);
    }
    this.savePlaylists(playlists);
  },

  deletePlaylist(id: string): void {
    const playlists = this.getPlaylists().filter((p) => p.id !== id);
    this.savePlaylists(playlists);
  },

  // ----------------------------------------------------
  // DOWNLOADS
  // ----------------------------------------------------
  getDownloads(): DownloadItem[] {
    try {
      const raw = localStorage.getItem(DOWNLOADS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  saveDownloads(downloads: DownloadItem[]): void {
    localStorage.setItem(DOWNLOADS_KEY, JSON.stringify(downloads));
    notifyChange();
  },

  addDownload(item: DownloadItem): void {
    const items = this.getDownloads();
    const existingIdx = items.findIndex((d) => d.id === item.id);
    if (existingIdx !== -1) {
      items[existingIdx] = item;
    } else {
      items.unshift(item);
    }
    this.saveDownloads(items);
  },

  updateDownload(id: string, patch: Partial<DownloadItem>): void {
    const items = this.getDownloads();
    const idx = items.findIndex((d) => d.id === id);
    if (idx !== -1) {
      items[idx] = { ...items[idx], ...patch };
      this.saveDownloads(items);
    }
  },

  removeDownload(id: string): void {
    const items = this.getDownloads().filter((d) => d.id !== id);
    this.saveDownloads(items);
  },

  clearCompletedDownloads(): void {
    const items = this.getDownloads().filter((d) => d.status !== "completed");
    this.saveDownloads(items);
  },

  clearPendingDownloads(): void {
    const items = this.getDownloads().filter((d) => d.status !== "pending");
    this.saveDownloads(items);
  },

  clearAllDownloads(): void {
    this.saveDownloads([]);
  },

  // ----------------------------------------------------
  // SETTINGS
  // ----------------------------------------------------
  getSettings(): AppSettings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  },

  saveSettings(settings: Partial<AppSettings>): AppSettings {
    const current = this.getSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    notifyChange();
    return updated;
  },
};
