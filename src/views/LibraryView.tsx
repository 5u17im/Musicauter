import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/ui/Icon";
import { TrackList } from "../components/TrackList";
import { usePlayer } from "../context/PlayerContext";
import { DownloadManager } from "../services/downloadManager";
import { StorageService } from "../services/storage";
import type { Track } from "../types";

interface Props {
  searchQuery?: string;
}

export function LibraryView({ searchQuery = "" }: Props) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [filter, setFilter] = useState<"all" | "downloaded" | "pending">("all");
  const [sortBy, setSortBy] = useState<"added" | "title" | "artist" | "duration">("added");
  const { dispatch } = usePlayer();

  useEffect(() => {
    const loadTracks = () => setTracks(StorageService.getTracks());
    loadTracks();
    const unsub = StorageService.subscribe(loadTracks);
    return unsub;
  }, []);

  const filteredTracks = useMemo(() => {
    let list = [...tracks];

    // Filtro por estado de descarga
    if (filter === "downloaded") {
      list = list.filter((t) => t.downloaded);
    } else if (filter === "pending") {
      list = list.filter((t) => !t.downloaded);
    }

    // Filtro por búsqueda
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          (t.album && t.album.toLowerCase().includes(q)),
      );
    }

    // Ordenación
    list.sort((a, b) => {
      if (sortBy === "title") return a.title.localeCompare(b.title);
      if (sortBy === "artist") return a.artist.localeCompare(b.artist);
      if (sortBy === "duration") return (b.durationSeconds || 0) - (a.durationSeconds || 0);
      return (b.addedAt || 0) - (a.addedAt || 0);
    });

    return list;
  }, [tracks, filter, searchQuery, sortBy]);

  const downloadedCount = useMemo(() => tracks.filter((t) => t.downloaded).length, [tracks]);

  const handlePlayAll = () => {
    if (filteredTracks.length > 0) {
      dispatch({ type: "SET_QUEUE", tracks: filteredTracks, startIndex: 0 });
    }
  };

  const handleShuffleAll = () => {
    if (filteredTracks.length > 0) {
      dispatch({ type: "TOGGLE_SHUFFLE" });
      dispatch({ type: "SET_QUEUE", tracks: filteredTracks, startIndex: 0 });
    }
  };

  const handleDownloadAllPending = () => {
    DownloadManager.enqueueTracks(tracks);
  };

  return (
    <section>
      <div className="section-head">
        <div>
          <div className="section-kicker">Tu colección</div>
          <h1 className="section-title">Biblioteca de Música</h1>
        </div>

        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
          {tracks.length - downloadedCount > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={handleDownloadAllPending}>
              <Icon icon="solar:download-square-bold" size={16} />
              <span>Bajar pendientes ({tracks.length - downloadedCount})</span>
            </button>
          )}

          <button className="btn btn-ghost btn-sm" onClick={handleShuffleAll} disabled={tracks.length === 0}>
            <Icon icon="solar:shuffle-bold" size={16} />
            <span>Aleatorio</span>
          </button>

          <button className="btn btn-sm" onClick={handlePlayAll} disabled={tracks.length === 0}>
            <Icon icon="solar:play-bold" size={16} />
            <span>Reproducir todo</span>
          </button>
        </div>
      </div>

      {/* Barra de Filtros y Estadísticas */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "var(--space-4)",
          marginBottom: "var(--space-4)",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <button
            className={`btn btn-ghost btn-sm ${filter === "all" ? "badge-accent" : ""}`}
            onClick={() => setFilter("all")}
          >
            Todas ({tracks.length})
          </button>
          <button
            className={`btn btn-ghost btn-sm ${filter === "downloaded" ? "badge-accent" : ""}`}
            onClick={() => setFilter("downloaded")}
          >
            <Icon icon="solar:check-circle-bold" size={14} />
            <span>Descargadas ({downloadedCount})</span>
          </button>
          <button
            className={`btn btn-ghost btn-sm ${filter === "pending" ? "badge-accent" : ""}`}
            onClick={() => setFilter("pending")}
          >
            <Icon icon="solar:download-square-bold" size={14} />
            <span>Por bajar ({tracks.length - downloadedCount})</span>
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <Icon icon="solar:filter-bold" size={16} color="var(--text-faint)" />
          <select
            className="field"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "added" | "title" | "artist" | "duration")}
            style={{ width: "auto", height: "36px", padding: "0.2rem 0.6rem", fontSize: "var(--text-xs)" }}
            aria-label="Criterio de ordenación"
          >
            <option value="added">Recientes</option>
            <option value="title">Título (A-Z)</option>
            <option value="artist">Artista (A-Z)</option>
            <option value="duration">Duración</option>
          </select>
        </div>
      </div>

      <TrackList
        tracks={filteredTracks}
        emptyTitle={
          searchQuery
            ? `No se encontraron resultados para "${searchQuery}"`
            : "Biblioteca vacía"
        }
        emptyMessage={
          searchQuery
            ? "Prueba buscando con otros términos o añade pistas desde la vista Descubrir."
            : "Importa una lista de reproducción de YouTube o añade canciones desde la pestaña Descubrir."
        }
      />
    </section>
  );
}