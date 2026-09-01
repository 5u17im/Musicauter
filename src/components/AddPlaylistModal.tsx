import { useState } from "react";
import {
  IconAlertCircle,
  IconCheck,
  IconDownload,
  IconLoader2,
  IconMusic,
  IconPlaylist,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { scanPlaylist } from "../api";
import { DownloadManager } from "../services/downloadManager";
import { StorageService } from "../services/storage";
import type { Playlist, Track } from "../types";
import { formatDur } from "./TrackList";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAdded?: (info: { title: string; count: number; isSingle: boolean }) => void;
}

export function AddPlaylistModal({ isOpen, onClose, onAdded }: Props) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<any | null>(null);

  if (!isOpen) return null;

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setScanResult(null);

    try {
      const res = await scanPlaylist(url.trim());
      if (res.error) {
        setError("No se pudo inspeccionar el enlace. Verifica la URL de YouTube.");
      } else {
        // Asegurar que entries tenga al menos el video individual si no vino como lista
        if (!res.entries || res.entries.length === 0) {
          if (res.id || res.title) {
            res.entries = [
              {
                id: res.id,
                title: res.title,
                uploader: res.uploader || res.channel || res.artist || "Artista",
                duration: res.duration || 0,
                thumbnail: res.thumbnail,
              },
            ];
          }
        }
        setScanResult(res);
      }
    } catch {
      setError("Ocurrió un error al contactar el servicio de extracción.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = (downloadNow: boolean) => {
    if (!scanResult) return;

    const rawEntries = scanResult.entries || (scanResult.id ? [scanResult] : []);
    const tracks: Track[] = rawEntries.map((item: any, idx: number) => ({
      id: `yt-${item.id || idx}-${Date.now()}`,
      title: item.title || "Sin título",
      artist: item.uploader || scanResult.uploader || "Artista desconocido",
      durationSeconds: item.duration || 0,
      downloaded: false,
      youtubeId: item.id,
      artworkUrl: item.thumbnail || scanResult.thumbnail,
      addedAt: Date.now(),
    }));

    if (tracks.length === 0) {
      setError("No se detectaron pistas válidas en la URL proporcionada.");
      return;
    }

    // Guardar pistas en biblioteca
    tracks.forEach((t) => StorageService.addTrack(t));

    const isSingle = tracks.length === 1;

    // Si es una playlist (más de 1 pista o explícitamente lista), guardarla en Playlists
    if (!isSingle || url.includes("playlist")) {
      const newPlaylist: Playlist = {
        id: `pl-${Date.now()}`,
        url: url.trim(),
        name: scanResult.title || "Nueva Playlist",
        description: `Canal: ${scanResult.uploader || "YouTube"}`,
        artworkUrl: scanResult.thumbnail || tracks[0]?.artworkUrl,
        totalTracks: tracks.length,
        downloadedCount: 0,
        newTracks: tracks.length,
        tracks,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      StorageService.addPlaylist(newPlaylist);
    }

    if (downloadNow) {
      DownloadManager.enqueueTracks(tracks);
    }

    if (onAdded) {
      onAdded({
        title: tracks[0]?.title || scanResult.title || "Canción",
        count: tracks.length,
        isSingle,
      });
    }

    setUrl("");
    setScanResult(null);
    onClose();
  };

  const entriesCount = scanResult?.entries?.length || (scanResult?.id ? 1 : 0);

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <IconPlaylist size={22} stroke={1.75} color="var(--accent)" />
            <h2 className="modal-title">Añadir Canción o Playlist por URL</h2>
          </div>
          <button className="icon-btn-sm" onClick={onClose} aria-label="Cerrar ventana modal">
            <IconX size={18} stroke={1.75} />
          </button>
        </div>

        <div className="modal-body">
          <form onSubmit={handleScan} style={{ display: "flex", gap: "var(--space-2)" }}>
            <input
              className="field"
              type="url"
              placeholder="https://www.youtube.com/watch?v=... o playlist"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              aria-label="URL de YouTube"
            />
            <button className="btn" type="submit" disabled={loading}>
              {loading ? (
                <IconLoader2 size={18} stroke={2} className="anim-pulse" />
              ) : (
                <IconSearch size={18} stroke={2} />
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
              <IconAlertCircle size={18} stroke={2} />
              <span>{error}</span>
            </div>
          )}

          {scanResult && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <div
                className="glass-card"
                style={{
                  display: "flex",
                  gap: "var(--space-4)",
                  alignItems: "center",
                  padding: "var(--space-3) var(--space-4)",
                }}
              >
                {scanResult.thumbnail ? (
                  <img
                    src={scanResult.thumbnail}
                    alt={scanResult.title}
                    style={{
                      width: "4.5rem",
                      height: "4.5rem",
                      borderRadius: "var(--radius-xs)",
                      objectFit: "cover",
                    }}
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
                    <IconMusic size={24} stroke={1.5} />
                  </div>
                )}
                <div>
                  <div style={{ fontWeight: 700, fontSize: "var(--text-base)" }}>
                    {scanResult.title}
                  </div>
                  <div className="muted" style={{ fontSize: "var(--text-xs)" }}>
                    {scanResult.uploader} · {entriesCount} {entriesCount === 1 ? "canción detectada" : "canciones detectadas"}
                  </div>
                </div>
              </div>

              <div style={{ fontWeight: 600, fontSize: "var(--text-xs)", textTransform: "uppercase", color: "var(--text-faint)" }}>
                Pistas detectadas ({entriesCount})
              </div>

              <div
                style={{
                  maxHeight: "12rem",
                  overflowY: "auto",
                  border: "1px solid var(--line)",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                {(scanResult.entries || (scanResult.id ? [scanResult] : [])).map((t: any, idx: number) => (
                  <div
                    key={idx}
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
                        {t.title}
                      </div>
                      <div className="muted" style={{ fontSize: "var(--text-xs)" }}>
                        {t.uploader || scanResult.uploader}
                      </div>
                    </div>
                    <span className="muted" style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-mono)" }}>
                      {t.duration ? formatDur(t.duration) : "–:–"}
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
                <IconCheck size={18} stroke={2} />
                <span>{entriesCount === 1 ? "Añadir a Biblioteca" : "Importar lista"}</span>
              </button>
              <button className="btn" onClick={() => handleSave(true)}>
                <IconDownload size={18} stroke={2} />
                <span>{entriesCount === 1 ? "Bajar canción" : "Importar y Bajar"}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
