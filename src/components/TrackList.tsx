import { Icon } from "./ui/Icon";
import { usePlayer } from "../context/PlayerContext";
import { DownloadManager } from "../services/downloadManager";
import { StorageService } from "../services/storage";
import type { Track } from "../types";

interface Props {
  tracks: Track[];
  onDownload?: (track: Track) => void;
  onLike?: (track: Track) => void;
  emptyTitle?: string;
  emptyMessage?: string;
}

export function TrackList({
  tracks,
  onDownload,
  onLike,
  emptyTitle = "Sin pistas disponibles",
  emptyMessage = "Añade una playlist o busca canciones en la pestaña Descubrir.",
}: Props) {
  const { state, dispatch, togglePlay } = usePlayer();
  const currentTrack = state.queue[state.currentIndex];

  if (tracks.length === 0) {
    return (
      <div className="empty-state">
        <Icon icon="solar:music-note-bold" size={44} className="empty-icon" />
        <div style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>{emptyTitle}</div>
        <p className="muted" style={{ maxWidth: "24rem", fontSize: "var(--text-sm)" }}>
          {emptyMessage}
        </p>
      </div>
    );
  }

  const playTrack = (track: Track, idx: number) => {
    if (currentTrack?.id === track.id) {
      togglePlay();
    } else {
      dispatch({ type: "SET_QUEUE", tracks, startIndex: idx });
    }
  };

  const queueTrack = (track: Track, e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch({ type: "ADD_TO_QUEUE", tracks: [track] });
  };

  const handleToggleFavorite = (track: Track, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onLike) {
      onLike(track);
    } else {
      StorageService.toggleFavorite(track.id);
    }
  };

  const handleDownload = (track: Track, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDownload) {
      onDownload(track);
    } else {
      DownloadManager.enqueueTrack(track);
    }
  };

  return (
    <div className="track-table" role="table" aria-label="Lista de canciones">
      <div className="track-table-head" role="row">
        <span role="columnheader">#</span>
        <span role="columnheader">Título</span>
        <span role="columnheader" className="track-album">Álbum</span>
        <span role="columnheader" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <Icon icon="solar:clock-circle-bold" size={14} />
          <span>Duración</span>
        </span>
        <span role="columnheader" style={{ textAlign: "right" }}>Acciones</span>
      </div>

      {tracks.map((track, idx) => {
        const isPlayingThis = currentTrack?.id === track.id && state.status === "playing";
        const isSelected = currentTrack?.id === track.id;

        return (
          <div
            key={track.id}
            className="track-row"
            data-active={isSelected}
            style={{ "--row-index": Math.min(idx, 24) } as React.CSSProperties}
            role="row"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter") playTrack(track, idx);
            }}
          >
            {/* Portada / Número / Play */}
            <div
              className="track-art-mini"
              onClick={() => playTrack(track, idx)}
              role="button"
              tabIndex={-1}
              style={{
                backgroundImage: track.artworkUrl ? `url(${track.artworkUrl})` : undefined,
                background: !track.artworkUrl
                  ? "linear-gradient(135deg, oklch(0.55 0.16 265 / 0.8), oklch(0.42 0.12 200 / 0.8))"
                  : undefined,
              }}
            >
              <div className="track-art-play">
                {isPlayingThis ? (
                  <Icon icon="solar:pause-bold" size={16} color="white" />
                ) : (
                  <Icon icon="solar:play-bold" size={16} color="white" />
                )}
              </div>
              {isPlayingThis && (
                <div className="eq-container">
                  <div className="eq-bar" />
                  <div className="eq-bar" />
                  <div className="eq-bar" />
                </div>
              )}
            </div>

            {/* Título y Artista */}
            <div style={{ minWidth: 0 }}>
              <div className="track-title" title={track.title}>
                {track.title}
              </div>
              <div className="track-artist" title={track.artist}>
                {track.artist}
              </div>
            </div>

            {/* Álbum */}
            <div className="track-album" title={track.album || "Sencillo"}>
              {track.album || "–"}
            </div>

            {/* Duración */}
            <div className="track-dur">
              {track.durationSeconds ? formatDur(track.durationSeconds) : "–:–"}
            </div>

            {/* Acciones */}
            <div className="track-actions">
              <button
                className={`icon-btn-sm ${track.isFavorite ? "fav-active" : ""}`}
                onClick={(e) => handleToggleFavorite(track, e)}
                aria-label={track.isFavorite ? "Quitar de favoritos" : "Marcar como favorito"}
                title="Favorito"
              >
                <Icon icon={track.isFavorite ? "solar:heart-bold" : "solar:heart-linear"} size={16} />
              </button>

              <button
                className="icon-btn-sm"
                onClick={(e) => handleDownload(track, e)}
                disabled={track.downloaded}
                aria-label={track.downloaded ? "Canción ya descargada" : "Descargar canción"}
                title={track.downloaded ? "Descargada" : "Descargar"}
              >
                {track.downloaded ? (
                  <Icon icon="solar:check-circle-bold" size={16} color="var(--success)" />
                ) : (
                  <Icon icon="solar:download-square-bold" size={16} />
                )}
              </button>

              <button
                className="icon-btn-sm"
                onClick={(e) => queueTrack(track, e)}
                aria-label="Añadir a la cola de reproducción"
                title="Añadir a la cola"
              >
                <Icon icon="solar:add-circle-bold" size={16} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function formatDur(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}