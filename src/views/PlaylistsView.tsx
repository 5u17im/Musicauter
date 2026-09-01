import { useEffect, useState } from "react";
import {
  IconCheck,
  IconDownload,
  IconMusic,
  IconPlayerPlay,
  IconPlaylist,
  IconPlus,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";
import { TrackList } from "../components/TrackList";
import { usePlayer } from "../context/PlayerContext";
import { DownloadManager } from "../services/downloadManager";
import { StorageService } from "../services/storage";
import type { Playlist } from "../types";

interface Props {
  onOpenAddModal: () => void;
}

export function PlaylistsView({ onOpenAddModal }: Props) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { dispatch } = usePlayer();

  useEffect(() => {
    const load = () => {
      const items = StorageService.getPlaylists();
      setPlaylists(items);
      if (items.length > 0 && !selectedId) {
        setSelectedId(items[0].id);
      }
    };
    load();
    const unsub = StorageService.subscribe(load);
    return unsub;
  }, [selectedId]);

  const selectedPlaylist = playlists.find((p) => p.id === selectedId);

  const handleSync = (playlist: Playlist) => {
    DownloadManager.enqueueTracks(playlist.tracks);
    StorageService.addPlaylist({
      ...playlist,
      downloadedCount: playlist.totalTracks,
      newTracks: 0,
      updatedAt: Date.now(),
    });
  };

  const handlePlayPlaylist = (playlist: Playlist) => {
    if (playlist.tracks.length > 0) {
      dispatch({ type: "SET_QUEUE", tracks: playlist.tracks, startIndex: 0 });
    }
  };

  const handleDeletePlaylist = (playlist: Playlist) => {
    if (confirm(`¿Eliminar la playlist "${playlist.name}"?`)) {
      StorageService.deletePlaylist(playlist.id);
      setSelectedId(null);
    }
  };

  return (
    <section>
      <div className="section-head">
        <div>
          <div className="section-kicker">Colección</div>
          <h1 className="section-title">Listas de Reproducción</h1>
        </div>

        <button className="btn btn-sm" onClick={onOpenAddModal}>
          <IconPlus size={16} stroke={2} />
          <span>Añadir playlist</span>
        </button>
      </div>

      {/* Grid de Tarjetas de Playlists */}
      <div className="grid grid-cards" style={{ marginBottom: "var(--space-6)" }}>
        {playlists.map((pl) => {
          const isSelected = pl.id === selectedId;
          return (
            <div
              key={pl.id}
              className="glass-card"
              onClick={() => setSelectedId(pl.id)}
              style={{
                cursor: "pointer",
                padding: "var(--space-4)",
                borderColor: isSelected ? "var(--accent)" : undefined,
                background: isSelected
                  ? "color-mix(in srgb, var(--accent) 8%, var(--surface-glass))"
                  : "var(--surface-glass)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-3)",
              }}
            >
              {/* Portada */}
              <div
                style={{
                  width: "100%",
                  height: "8rem",
                  borderRadius: "var(--radius-sm)",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  backgroundImage: pl.artworkUrl ? `url(${pl.artworkUrl})` : undefined,
                  background: !pl.artworkUrl
                    ? "linear-gradient(135deg, oklch(0.6 0.17 265 / 0.8), oklch(0.48 0.14 200 / 0.8))"
                    : undefined,
                  display: "grid",
                  placeItems: "center",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {!pl.artworkUrl && <IconPlaylist size={36} stroke={1.5} color="white" />}
                <button
                  className="btn-icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePlayPlaylist(pl);
                  }}
                  aria-label={`Reproducir ${pl.name}`}
                  style={{
                    position: "absolute",
                    bottom: "var(--space-2)",
                    right: "var(--space-2)",
                    background: "var(--accent)",
                    color: "var(--text-inverse)",
                    boxShadow: "var(--shadow)",
                  }}
                >
                  <IconPlayerPlay size={18} stroke={2} />
                </button>
              </div>

              <div>
                <div style={{ fontWeight: 700, fontSize: "var(--text-base)", color: "var(--text)" }}>
                  {pl.name}
                </div>
                <div className="muted" style={{ fontSize: "var(--text-xs)", marginTop: "2px" }}>
                  {pl.description || `${pl.tracks.length} canciones`}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: "auto",
                  paddingTop: "var(--space-2)",
                  borderTop: "1px solid var(--line)",
                }}
              >
                <span className="badge" style={{ fontSize: "var(--text-xs)" }}>
                  {pl.downloadedCount}/{pl.totalTracks} descargadas
                </span>
                {pl.newTracks > 0 && (
                  <span className="badge badge-accent">+{pl.newTracks} nuevas</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detalle de Playlist Seleccionada */}
      {selectedPlaylist && (
        <div style={{ marginTop: "var(--space-5)" }}>
          <div className="section-head">
            <div>
              <div className="section-kicker">Pistas de la lista</div>
              <h2 style={{ fontSize: "var(--text-xl)", fontWeight: 750 }}>
                {selectedPlaylist.name}
              </h2>
            </div>

            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => handlePlayPlaylist(selectedPlaylist)}
              >
                <IconPlayerPlay size={16} stroke={2} />
                <span>Reproducir lista</span>
              </button>

              <button
                className="btn btn-ghost btn-sm"
                onClick={() => handleSync(selectedPlaylist)}
              >
                <IconRefresh size={16} stroke={1.75} />
                <span>Sincronizar</span>
              </button>

              <button
                className="btn btn-ghost btn-sm"
                onClick={() => handleDeletePlaylist(selectedPlaylist)}
                style={{ color: "var(--danger)" }}
              >
                <IconTrash size={16} stroke={1.75} />
                <span>Eliminar</span>
              </button>
            </div>
          </div>

          <TrackList
            tracks={selectedPlaylist.tracks}
            emptyTitle="La playlist no tiene pistas"
            emptyMessage="Inspecciona el enlace de YouTube para actualizar o sincronizar las canciones."
          />
        </div>
      )}
    </section>
  );
}