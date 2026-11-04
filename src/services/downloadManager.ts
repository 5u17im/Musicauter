/**
 * Cola de descargas con progreso real.
 *
 * Cambios respecto a la version anterior:
 *  * El progreso viene de eventos del backend (yt-dlp), no de Math.random().
 *  * No hay un tiempo de espera de 45 s que abortaba cualquier descarga real.
 *  * Al arrancar, lo que quedo "downloading" se devuelve a la cola: antes esos
 *    elementos se quedaban colgados para siempre.
 *  * Las descargas se pueden cancelar y la ruta final la entrega yt-dlp.
 */

import {
  cancelDownload,
  downloadTrack,
  onDownloadProgress,
} from "../api";
import type { DownloadItem, DownloadProgressEvent, Track } from "../types";
import { StorageService } from "./storage";

/** Descargas simultaneas. */
const MAX_CONCURRENT = 3;

let activeSlots = 0;
let started = false;
let flushScheduled = false;

/** Ids con una invocacion en curso. */
const inflight = new Set<string>();

function youtubeUrlFor(track: Track): string {
  if (track.youtubeId) return `https://www.youtube.com/watch?v=${track.youtubeId}`;
  return "";
}

export const DownloadManager = {
  async init(): Promise<void> {
    if (started) return;
    started = true;

    // Recuperacion: nada puede quedarse permanentemente en "downloading".
    const recovered = StorageService.getDownloads().map((item) =>
      item.status === "downloading"
        ? {
            ...item,
            status: "pending" as const,
            progress: 0,
            speed: undefined,
            eta: undefined,
            stage: undefined,
          }
        : item,
    );
    StorageService.replaceDownloads(recovered);

    await onDownloadProgress((progress) => {
      this.applyProgress(progress);
    });

    this.scheduleFlush();
  },

  applyProgress(progress: DownloadProgressEvent): void {
    const item = StorageService.getDownloads().find((d) => d.id === progress.id);
    if (!item) return;
    // Los estados terminales los fija el resultado de la invocacion.
    if (progress.stage === "error" || progress.stage === "cancelled") return;

    StorageService.updateDownload(progress.id, {
      status: progress.stage === "finished" ? "completed" : "downloading",
      progress: Math.round(progress.percent * 10) / 10,
      speed: progress.speed,
      eta: progress.eta,
      stage: progress.stage,
    });
  },

  enqueueTrack(track: Track, customUrl?: string): void {
    const url = customUrl ?? youtubeUrlFor(track);
    if (!url) return;

    const existing = StorageService.getDownloads();
    const alreadyQueued = existing.some(
      (item) =>
        item.url === url &&
        (item.status === "pending" || item.status === "downloading"),
    );
    if (alreadyQueued) return;

    const item: DownloadItem = {
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

    StorageService.replaceDownloads([item, ...existing]);
    this.scheduleFlush();
  },

  enqueueTracks(tracks: Track[]): void {
    const existing = StorageService.getDownloads();
    const activeUrls = new Set(
      existing
        .filter((d) => d.status === "pending" || d.status === "downloading")
        .map((d) => d.url),
    );

    const created: DownloadItem[] = [];
    tracks.forEach((track, index) => {
      if (track.downloaded) return;
      const url = youtubeUrlFor(track);
      if (!url || activeUrls.has(url)) return;
      activeUrls.add(url);
      created.push({
        id: `dl-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
        trackId: track.id,
        title: track.title,
        artist: track.artist,
        youtubeId: track.youtubeId,
        url,
        progress: 0,
        status: "pending",
        addedAt: Date.now(),
      });
    });

    if (created.length === 0) return;
    StorageService.replaceDownloads([...created, ...existing]);
    this.scheduleFlush();
  },

  scheduleFlush(): void {
    if (flushScheduled) return;
    flushScheduled = true;
    setTimeout(() => {
      flushScheduled = false;
      this.fillSlots();
    }, 50);
  },

  fillSlots(): void {
    const pending = StorageService.getDownloads().filter(
      (item) => item.status === "pending",
    );

    for (const item of pending) {
      if (activeSlots >= MAX_CONCURRENT) break;
      if (inflight.has(item.id)) continue;
      activeSlots++;
      void this.processItem(item);
    }
  },

  async processItem(item: DownloadItem): Promise<void> {
    inflight.add(item.id);
    const settings = StorageService.getSettings();

    StorageService.updateDownload(
      item.id,
      {
        status: "downloading",
        progress: 0,
        speed: undefined,
        eta: undefined,
        stage: "starting",
        error: undefined,
      },
      true,
    );

    try {
      const outcome = await downloadTrack({
        id: item.id,
        url: item.url,
        outputDir: settings.musicDir,
        format: settings.audioFormat,
        auth: settings.browserAuth ? "browser" : "none",
        browser: settings.selectedBrowser,
      });

      if (outcome.cancelled) {
        StorageService.updateDownload(
          item.id,
          {
            status: "cancelled",
            progress: 0,
            speed: undefined,
            eta: undefined,
            stage: undefined,
          },
          true,
        );
      } else if (outcome.ok) {
        StorageService.updateDownload(
          item.id,
          {
            status: "completed",
            progress: 100,
            speed: undefined,
            eta: undefined,
            stage: "finished",
            filePath: outcome.filePath,
            error: undefined,
          },
          true,
        );

        if (outcome.filePath) {
          StorageService.updateTrack(item.trackId, {
            downloaded: true,
            path: outcome.filePath,
            format: settings.audioFormat.toUpperCase(),
          });
        }
      } else {
        StorageService.updateDownload(
          item.id,
          {
            status: "error",
            progress: 0,
            speed: undefined,
            eta: undefined,
            stage: undefined,
            error: outcome.error ?? "La descarga fallo sin detalle",
          },
          true,
        );
      }
    } catch (error) {
      StorageService.updateDownload(
        item.id,
        {
          status: "error",
          progress: 0,
          speed: undefined,
          eta: undefined,
          stage: undefined,
          error: error instanceof Error ? error.message : String(error),
        },
        true,
      );
    } finally {
      inflight.delete(item.id);
      activeSlots = Math.max(0, activeSlots - 1);
      this.scheduleFlush();
    }
  },

  async cancel(id: string): Promise<void> {
    const item = StorageService.getDownloads().find((d) => d.id === id);
    if (!item) return;

    if (item.status === "pending") {
      StorageService.updateDownload(
        id,
        { status: "cancelled", progress: 0, stage: undefined },
        true,
      );
      return;
    }
    if (item.status === "downloading") {
      await cancelDownload(id);
    }
  },

  async cancelAllPending(): Promise<void> {
    const items = StorageService.getDownloads().map((item) =>
      item.status === "pending"
        ? { ...item, status: "cancelled" as const, progress: 0 }
        : item,
    );
    StorageService.replaceDownloads(items);
  },

  retryDownload(id: string): void {
    StorageService.updateDownload(
      id,
      {
        status: "pending",
        progress: 0,
        error: undefined,
        speed: undefined,
        eta: undefined,
        stage: undefined,
      },
      true,
    );
    this.scheduleFlush();
  },

  removeDownload(id: string): void {
    StorageService.removeDownload(id);
  },

  clearCompleted(): void {
    StorageService.replaceDownloads(
      StorageService.getDownloads().filter((item) => item.status !== "completed"),
    );
  },

  clearFinished(): void {
    // Conserva solo lo que sigue vivo: pendiente o descargando.
    StorageService.replaceDownloads(
      StorageService.getDownloads().filter(
        (item) => item.status === "pending" || item.status === "downloading",
      ),
    );
  },

  clearAll(): void {
    StorageService.replaceDownloads([]);
  },

  get activeCount(): number {
    return StorageService.getDownloads().filter(
      (item) => item.status === "pending" || item.status === "downloading",
    ).length;
  },
};
