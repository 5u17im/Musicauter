import { useState } from "react";
import { Icon } from "./ui/Icon";
import { scanPlaylist, type ScannedPlaylist, type YtDlpEntry } from "../api";
import { DownloadManager } from "../services/downloadManager";
import { StorageService } from "../services/storage";
import type { Playlist, Track } from "../types";
import { formatDur } from "./TrackList";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAdded?: (info: { title: string; count: number; isSingle: boolean }) => void;
}

function entryToTrack(
  entry: YtDlpEntry,
  index: number,
  playlistUrl: string,
  fallbackThumbnail?: string,
  fallbackUploader?: string,
): Track | null {
  const youtubeId = typeof entry.id === "string" ? entry.id : "";
  if (!youtubeId) return null;

  return {
    id: `yt-${youtubeId}`,
    title: entry.title ?? `Pista ${index + 1}`,
    artist: entry.uploader ?? entry.channel ?? fallbackUploader ?? "Artista desconocido",
    album: undefined,
    durationSeconds: entry.duration ?? 0,
    downloaded: false,
    artworkUrl: entry.thumbnail ?? entry.thumbnails?.[0]?.url ?? fallbackThumbnail,
    youtubeId,
    addedAt: Date.now(),
    playlistUrl,
  };
}

export function AddPlaylistModal({ isOpen, onClose, onAdded }: Props) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScannedPlaylist | null>(null);

  if (!isOpen) return null;

  const reset = () => {
    setUrl("");
    setScanResult(null);
    setError(null);
  };

  const handleScan = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setScanResult(null);

    const settings = StorageService.getSettings();
    try {
      const result = await scanPlaylist(
        url.trim(),
        settings.browserAuth ? "browser" : "none",
        settings.selectedBrowser,
      );
      if (result.entries.length === 0) {
        setError("No se detectaron pistas en ese enlace. Comprueba que la URL sea publica y valida.");
      } else {
        setScanResult(result);
      }
    } catch (scanError) {
      const raw = scanError instanceof Error ? scanError.message : String(scanError);
      setError(
        `No se pudo inspeccionar el enlace: ${raw.slice(0, 300)}`,
      );
    } finally {
      setLoading(false);
    }
  };

  const buildTracks = (): Track[] => {
    if (!scanResult) return [];
    return scanResult.entries
      .map((entry, index) =>
        entryToTrack(
          entry,
          index,
          url.trim(),
          scanResult.thumbnail,
          scanResult.uploader ?? scanResult.channel ?? scanResult.artist,
        ),
      )
      .filter((track): track is Track => track !== null);
  };

  const handleSave = (downloadNow: boolean) => {
    const tracks = buildTracks();
    if (tracks.length === 0) {
      setError("No se detectaron pistas validas en la URL proporcionada.");
      return;
    }

    StorageService.addTracks(tracks);

    const isSingle = tracks.length === 1 && !url.includes("playlist");

    if (!isSingle) {
      const playlist: Playlist = {
        id: `pl-${scanResult?.id ?? Date.now()}`,
        url: url.trim(),
        name: scanResult?.title ?? "Nueva playlist",
        description: scanResult?.uploader
          ? `Canal: ${scanResult.uploader}`
          : undefined,
        artworkUrl: scanResult?.thumbnail ?? tracks[0]?.artworkUrl,
        totalTracks: tracks.length,
        downloadedCount: 0,
        newTracks: tracks.length,
        tracks,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      StorageService.addPlaylist(playlist);
    }

    if (downloadNow) DownloadManager.enqueueTracks(tracks);

    onAdded?.({
      title: scanResult?.title ?? tracks[0]?.title ?? "Cancion",
      count: tracks.length,
      isSingle,
    });

    reset();
    onClose();
  };

  const entriesCount = scanResult?.entries.length ?? 0;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-content" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <Icon icon="solar:playlist-bold" size={22} color="var(--accent)" />
            <h2 className="modal-title">Añadir cancion o playlist por URL</h2>
          </div>
          <button className="icon-btn-sm" onClick={onClose} aria-label="Cerrar">
            <Icon icon="solar:close-linear" size={18} />
          </button>
        </div>

        <div className="modal-body">
          <form onSubmit={handleScan} style={{ display: "flex", gap: "var(--space-2)" }}>
            <input
              className="field"
              type="url"
              placeholder="https://www.youtube.com/watch?v=... o .../playlist?list=..."
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              required
              aria-label="URL de YouTube"
            />
            <button className="btn" type="submit" disabled={loading}>
              {loading ? (
                <Icon icon="solar:restart-bold" size={18} className="anim-pulse" />
              ) : (
                <Icon icon="solar:magnifier-linear" size={18} />
              )}
              <span>{loading ? "Explorando..." : "Explorar"}</span>
            </button>
          </form>

          {error && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                padding: "var(--space-3)",
                background: "var(--danger-soft)",
                color: "var(--danger)",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--text-sm)",
              }}
            >
              <Icon icon="solar:danger-circle-bold" size={18} />
              <span>{error}</span>
            </div>
          )}

          {scanResult && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <div
                className="glass-card"
                style={{ display: "flex", gap: "var(--space-4)", alignItems: "center", padding: "var(--space-3) var(--space-4)" }}
              >
                {scanResult.thumbnail ? (
                  <img
                    src={scanResult.thumbnail}
                    alt={scanResult.title ?? "Portada"}
                    style={{ width: "4.5rem", height: "4.5rem", borderRadius: "var(--radius-xs)", objectFit: "cover" }}
                  />
                ) : (
                  <div
                    style={{
                      width: "4.5rem",
                      height: "4.5rem",
                      borderRadius: "var(--radius-xs)",
                      background: "var(--surface-solid)",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <Icon icon="solar:music-note-bold" size={24} />
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "var(--text-base)" }}>
                    {scanResult.title ?? "Sin titulo"}
                  </div>
                  <div className="muted" style={{ fontSize: "var(--text-xs)" }}>
                    {scanResult.uploader ?? scanResult.channel ?? "YouTube"} · {entriesCount}{" "}
                    {entriesCount === 1 ? "cancion detectada" : "canciones detectadas"}
                  </div>
                </div>
              </div>

              <div style={{ fontWeight: 600, fontSize: "var(--text-xs)", textTransform: "uppercase", color: "var(--text-faint)" }}>
                Pistas detectadas
              </div>

              <div
                style={{
                  maxHeight: "12rem",
                  overflowY: "auto",
                  border: "1px solid var(--line)",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                {scanResult.entries.map((entry, index) => (
                  <div
                    key={`${entry.id ?? index}-${index}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.45rem 0.8rem",
                      borderBottom: "1px solid var(--line)",
                      fontSize: "var(--text-sm)",
                    }}
                  >
                    <div style={{ minWidth: 0, paddingRight: "var(--space-2)" }}>
                      <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: 600 }}>
                        {entry.title ?? "Sin titulo"}
                      </div>
                      <div className="muted" style={{ fontSize: "var(--text-xs)" }}>
                        {entry.uploader ?? scanResult.uploader ?? ""}
                      </div>
                    </div>
                    <span className="muted" style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-mono)" }}>
                      {entry.duration ? formatDur(entry.duration) : "–:–"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          {scanResult && (
            <>
              <button className="btn btn-ghost" onClick={() => handleSave(false)}>
                <Icon icon="solar:check-circle-bold" size={18} />
                <span>{entriesCount === 1 ? "Añadir a la biblioteca" : "Importar lista"}</span>
              </button>
              <button className="btn" onClick={() => handleSave(true)}>
                <Icon icon="solar:download-square-bold" size={18} />
                <span>{entriesCount === 1 ? "Bajar cancion" : "Importar y bajar"}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
