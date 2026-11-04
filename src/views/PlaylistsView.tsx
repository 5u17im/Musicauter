import { useEffect, useState } from "react";
import { Icon } from "../components/ui/Icon";
import { scanPlaylist, type YtDlpEntry } from "../api";
import { TrackList } from "../components/TrackList";
import { usePlayer } from "../context/PlayerContext";
import { DownloadManager } from "../services/downloadManager";
import { StorageService } from "../services/storage";
import type { Playlist, Track } from "../types";

interface Props {
  onOpenAddModal: () => void;
}

/** Construye una pista a partir de una entrada de yt-dlp (id estable). */
function entryToTrack(entry: YtDlpEntry, fallbackArtist?: string): Track | null {
  const youtubeId = typeof entry.id === "string" ? entry.id : "";
  if (!youtubeId) return null;
  return {
    id: `yt-${youtubeId}`,
    title: entry.title ?? "Sin titulo",
    artist: entry.uploader ?? entry.channel ?? fallbackArtist ?? "Artista desconocido",
    durationSeconds: entry.duration ?? 0,
    downloaded: false,
    artworkUrl: entry.thumbnail ?? entry.thumbnails?.[0]?.url,
    youtubeId,
    addedAt: Date.now(),
  };
}

function downloadedCount(playlist: Playlist): number {
  const byId = new Map(StorageService.getTracks().map((t) => [t.youtubeId, t]));
  return playlist.tracks.filter((track) => {
    if (track.downloaded) return true;
    const current = track.youtubeId ? byId.get(track.youtubeId) : undefined;
    return Boolean(current?.downloaded);
  }).length;
}

export function PlaylistsView({ onOpenAddModal }: Props) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
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

  /**
   * Sincroniza la playlist contra YouTube: descubre pistas nuevas, las añade a
   * la biblioteca y las pone en cola. Antes esta accion se limitaba a marcar
   * todo como descargado sin descargar nada.
   */
  const handleSync = async (playlist: Playlist) => {
    if (!playlist.url) {
      setSyncMessage("Esta lista no tiene URL de origen; usa \"Añadir playlist\" para importarla de nuevo.");
      return;
    }

    setSyncingId(playlist.id);
    setSyncMessage(null);
    const settings = StorageService.getSettings();

    try {
      const scanned = await scanPlaylist(
        playlist.url,
        settings.browserAuth ? "browser" : "none",
        settings.selectedBrowser,
      );

      const known = new Set(
        playlist.tracks.map((track) => track.youtubeId).filter(Boolean),
      );
      const discovered = scanned.entries
        .map((entry) =>
          entryToTrack(entry, scanned.uploader ?? scanned.channel ?? scanned.artist),
        )
        .filter((track): track is Track => track !== null);
      const fresh = discovered.filter((track) => !known.has(track.youtubeId));

      if (fresh.length > 0) {
        StorageService.addTracks(fresh);
      }

      const merged = [...playlist.tracks, ...fresh];
      StorageService.addPlaylist({
        ...playlist,
        name: scanned.title ?? playlist.name,
        artworkUrl: scanned.thumbnail ?? playlist.artworkUrl,
        tracks: merged,
        totalTracks: merged.length,
        newTracks: fresh.length,
        downloadedCount: merged.filter((track) => track.downloaded).length,
        updatedAt: Date.now(),
      });

      const pending = merged.filter((track) => !track.downloaded);
      if (pending.length > 0) {
        DownloadManager.enqueueTracks(pending);
      }

      setSyncMessage(
        fresh.length > 0
          ? `Sincronizada: ${fresh.length} pista(s) nueva(s), ${pending.length} en cola de descarga.`
          : pending.length > 0
            ? `Sin novedades. ${pending.length} pista(s) pendientes enviadas a la cola.`
            : "Sin novedades: todas las pistas ya estan en disco.",
      );
    } catch (error) {
      setSyncMessage(
        `No se pudo sincronizar: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`,
      );
    } finally {
      setSyncingId(null);
    }
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
          <Icon icon="solar:add-circle-bold" size={16} />
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
                {!pl.artworkUrl && <Icon icon="solar:playlist-bold" size={36} color="white" />}
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
                  <Icon icon="solar:play-bold" size={18} />
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
                  {downloadedCount(pl)}/{pl.tracks.length} descargadas
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
                <Icon icon="solar:play-bold" size={16} />
                <span>Reproducir lista</span>
              </button>

              <button
                className="btn btn-ghost btn-sm"
                onClick={() => void handleSync(selectedPlaylist)}
                disabled={syncingId === selectedPlaylist.id}
              >
                <Icon
                  icon="solar:refresh-circle-bold"
                  size={16}
                  className={syncingId === selectedPlaylist.id ? "anim-pulse" : ""}
                />
                <span>{syncingId === selectedPlaylist.id ? "Sincronizando..." : "Sincronizar"}</span>
              </button>

              <button
                className="btn btn-ghost btn-sm"
                onClick={() => handleDeletePlaylist(selectedPlaylist)}
                style={{ color: "var(--danger)" }}
              >
                <Icon icon="solar:trash-bin-trash-bold" size={16} />
                <span>Eliminar</span>
              </button>
            </div>
          </div>

          {syncMessage && (
            <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-3)" }}>
              {syncMessage}
            </p>
          )}

          <TrackList
            tracks={selectedPlaylist.tracks}
            emptyTitle="La playlist no tiene pistas"
            emptyMessage="Pulsa Sincronizar para volver a leer las canciones desde YouTube."
          />
        </div>
      )}
    </section>
  );
}