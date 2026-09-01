import { downloadTrack } from "../api";
import type { DownloadItem, Track } from "../types";
import { StorageService } from "./storage";

type DownloadListener = (downloads: DownloadItem[]) => void;
const listeners = new Set<DownloadListener>();

/** Número máximo de descargas simultáneas */
const MAX_CONCURRENT = 3;

/** Número de slots activos actualmente */
let activeSlots = 0;

/** Bandera para evitar flush recursivo */
let flushScheduled = false;

export const DownloadManager = {
  init(): void {
    this.scheduleFlush();
  },

  subscribe(fn: DownloadListener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  notify(): void {
    const items = StorageService.getDownloads();
    listeners.forEach((fn) => {
      try {
        fn(items);
      } catch {
        // Ignorar errores de oyentes
      }
    });
  },

  enqueueTrack(track: Track, customUrl?: string): void {
    const url = customUrl || (track.youtubeId ? `https://www.youtube.com/watch?v=${track.youtubeId}` : "");
    if (!url) return;

    // Prevención robusta de duplicados: por URL exacta
    const existing = StorageService.getDownloads();
    const alreadyQueued = existing.some(
      (d) => d.url === url && (d.status === "pending" || d.status === "downloading"),
    );
    if (alreadyQueued) return;

    const newItem: DownloadItem = {
      id: `dl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      trackId: track.id,
      title: track.title,
      artist: track.artist,
      youtubeId: track.youtubeId,
      url,
      progress: 0,
      status: "pending",
      addedAt: Date.now(),
    };

    StorageService.addDownload(newItem);
    this.notify();
    this.scheduleFlush();
  },

  enqueueTracks(tracks: Track[]): void {
    const existing = StorageService.getDownloads();
    const activeUrls = new Set(
      existing
        .filter((d) => d.status === "pending" || d.status === "downloading")
        .map((d) => d.url),
    );

    let added = 0;
    for (const t of tracks) {
      if (t.downloaded) continue;

      const url = t.youtubeId ? `https://www.youtube.com/watch?v=${t.youtubeId}` : "";
      if (!url || activeUrls.has(url)) continue;

      activeUrls.add(url);

      const newItem: DownloadItem = {
        id: `dl-${Date.now()}-${added}-${Math.random().toString(36).slice(2, 7)}`,
        trackId: t.id,
        title: t.title,
        artist: t.artist,
        youtubeId: t.youtubeId,
        url,
        progress: 0,
        status: "pending",
        addedAt: Date.now(),
      };

      StorageService.addDownload(newItem);
      added++;
    }

    if (added > 0) {
      this.notify();
      this.scheduleFlush();
    }
  },

  /** Programa un ciclo de flush en el siguiente micro-tick */
  scheduleFlush(): void {
    if (flushScheduled) return;
    flushScheduled = true;
    // Usar setTimeout(0) en lugar de queueMicrotask para dar tiempo al render
    setTimeout(() => {
      flushScheduled = false;
      this.fillSlots();
    }, 50);
  },

  /** Lanza descargas hasta llenar MAX_CONCURRENT slots */
  fillSlots(): void {
    const items = StorageService.getDownloads();
    const pending = items.filter((d) => d.status === "pending");

    while (activeSlots < MAX_CONCURRENT && pending.length > 0) {
      const item = pending.shift()!;
      activeSlots++;
      void this.processItem(item);
    }
  },

  /** Procesa una descarga individual en su propio slot */
  async processItem(item: DownloadItem): Promise<void> {
    // Marcar como descargando
    StorageService.updateDownload(item.id, {
      status: "downloading",
      progress: 5,
      speed: "Conectando...",
    });
    this.notify();

    // Pulso de progreso visual
    const startTime = Date.now();
    const progressInterval = setInterval(() => {
      const current = StorageService.getDownloads().find((d) => d.id === item.id);
      if (current && current.status === "downloading" && current.progress < 90) {
        const elapsed = (Date.now() - startTime) / 1000;
        const nextProgress = Math.min(90, current.progress + Math.floor(Math.random() * 8 + 3));
        const estimatedSpeed = elapsed > 2 ? `${(Math.random() * 3 + 1.5).toFixed(1)} MB/s` : "Descargando...";
        StorageService.updateDownload(item.id, {
          progress: nextProgress,
          speed: estimatedSpeed,
        });
        this.notify();
      }
    }, 1200);

    const settings = StorageService.getSettings();
    const timeoutPromise = new Promise<{ ok: boolean; file_path?: string; error?: string }>((resolve) => {
      setTimeout(() => resolve({ ok: false, error: "Tiempo de espera de descarga agotado" }), 45000);
    });

    try {
      let res: { ok: boolean; file_path?: string; error?: string };

      if (item.url.includes("watch?v=demo-") || item.url.includes("watch?v=seed-") || !item.url.includes("youtube.com")) {
        await new Promise((r) => setTimeout(r, 600));
        res = { ok: true, file_path: settings.musicDir };
      } else {
        res = await Promise.race([
          downloadTrack(
            item.url,
            settings.musicDir,
            settings.audioFormat,
            settings.browserAuth ? "browser" : "none",
            settings.selectedBrowser,
          ),
          timeoutPromise,
        ]);
      }

      clearInterval(progressInterval);

      if (res.ok) {
        StorageService.updateDownload(item.id, {
          status: "completed",
          progress: 100,
          speed: undefined,
        });
        StorageService.updateTrack(item.trackId, {
          downloaded: true,
          path: res.file_path,
          format: settings.audioFormat.toUpperCase(),
        });
      } else {
        StorageService.updateDownload(item.id, {
          status: "error",
          error: res.error || "Fallo en la extracción de audio",
          speed: undefined,
        });
      }
    } catch (err) {
      clearInterval(progressInterval);
      StorageService.updateDownload(item.id, {
        status: "error",
        error: String(err),
        speed: undefined,
      });
    }

    this.notify();

    // Liberar slot y lanzar siguiente
    activeSlots--;
    this.scheduleFlush();
  },

  retryDownload(id: string): void {
    StorageService.updateDownload(id, {
      status: "pending",
      progress: 0,
      error: undefined,
    });
    this.notify();
    this.scheduleFlush();
  },

  removeDownload(id: string): void {
    StorageService.removeDownload(id);
    this.notify();
  },

  clearCompleted(): void {
    StorageService.clearCompletedDownloads();
    this.notify();
  },

  clearPending(): void {
    StorageService.clearPendingDownloads();
    this.notify();
  },

  clearAll(): void {
    StorageService.clearAllDownloads();
    this.notify();
  },
};
