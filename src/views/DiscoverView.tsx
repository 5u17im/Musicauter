import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../components/ui/Icon";
import { getMix, searchYouTube } from "../api";
import { formatDur } from "../components/TrackList";
import { usePlayer } from "../context/PlayerContext";
import { DownloadManager } from "../services/downloadManager";
import { StorageService } from "../services/storage";
import type { Track, YouTubeSearchResult } from "../types";

/** Cuantas pistas semilla se usan para pedir mezclas a YouTube. */
const MAX_SEED_TRACKS = 3;
/** Cuantas recomendaciones se muestran. */
const MAX_RECOMMENDATIONS = 12;

interface Recommendation extends YouTubeSearchResult {
  /** Titulo de la pista propia que origino la recomendacion. */
  basedOn: string;
}

function ytToTrack(item: YouTubeSearchResult): Track {
  return {
    id: `yt-${item.id}`,
    title: item.title,
    artist: item.uploader ?? "Artista desconocido",
    album: "YouTube",
    durationSeconds: item.duration ?? 0,
    downloaded: false,
    artworkUrl: item.thumbnail,
    youtubeId: item.id,
    addedAt: Date.now(),
  };
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function DiscoverView() {
  const { dispatch } = usePlayer();

  // --- Busqueda en YouTube ---
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YouTubeSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // --- Recomendaciones reales (mezclas de YouTube) ---
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isLoadingRecs, setIsLoadingRecs] = useState(false);
  const [recsError, setRecsError] = useState<string | null>(null);
  const [recsGenerated, setRecsGenerated] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());

  const libraryIds = useMemo(
    () => new Set(StorageService.getTracks().map((t) => t.youtubeId).filter(Boolean)),
    [saved],
  );

  /**
   * Las recomendaciones salen de la mezcla automatica de YouTube ("mix") de
   * tus propias pistas favoritas o recientes. No hay ninguna lista fija.
   */
  const loadRecommendations = useCallback(async () => {
    const library = StorageService.getTracks();
    const seeds = library
      .filter((track) => Boolean(track.youtubeId))
      .sort((a, b) => {
        if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
        return (b.addedAt ?? 0) - (a.addedAt ?? 0);
      })
      .slice(0, MAX_SEED_TRACKS);

    if (seeds.length === 0) {
      setRecommendations([]);
      setRecsGenerated(true);
      setRecsError(null);
      return;
    }

    setIsLoadingRecs(true);
    setRecsError(null);

    const collected: Recommendation[] = [];
    const seen = new Set<string>();

    for (const seed of seeds) {
      try {
        const mix = await getMix(seed.youtubeId as string);
        for (const item of mix) {
          if (seen.has(item.id)) continue;
          if (libraryIds.has(item.id)) continue;
          seen.add(item.id);
          collected.push({ ...item, basedOn: seed.title });
        }
      } catch (error) {
        console.warn("No se pudo obtener la mezcla de YouTube", error);
      }
    }

    if (collected.length === 0) {
      setRecsError(
        "YouTube no devolvio recomendaciones. Comprueba tu conexion o actualiza yt-dlp desde Ajustes.",
      );
    }

    setRecommendations(shuffle(collected).slice(0, MAX_RECOMMENDATIONS));
    setRecsGenerated(true);
    setIsLoadingRecs(false);
  }, [libraryIds]);

  useEffect(() => {
    if (!recsGenerated) void loadRecommendations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setHasSearched(true);
    setSearchError(null);
    try {
      setResults(await searchYouTube(query.trim()));
    } catch (error) {
      setResults([]);
      setSearchError(
        error instanceof Error ? error.message : "La busqueda fallo",
      );
    } finally {
      setIsSearching(false);
    }
  };

  const markSaved = (id: string) => {
    setSaved((previous) => new Set(previous).add(id));
  };

  const playItem = (item: YouTubeSearchResult) => {
    dispatch({ type: "SET_QUEUE", tracks: [ytToTrack(item)], startIndex: 0 });
  };

  const saveItem = (item: YouTubeSearchResult) => {
    StorageService.addTracks([ytToTrack(item)]);
    markSaved(item.id);
  };

  const downloadItem = (item: YouTubeSearchResult) => {
    const track = ytToTrack(item);
    StorageService.addTracks([track]);
    DownloadManager.enqueueTrack(track);
    markSaved(item.id);
  };

  return (
    <section>
      <div className="section-head">
        <div>
          <div className="section-kicker">Explorador</div>
          <h1 className="section-title">Descubrir y buscar en YouTube</h1>
        </div>
      </div>

      <form
        onSubmit={handleSearch}
        style={{
          display: "flex",
          gap: "var(--space-2)",
          marginBottom: "var(--space-6)",
          maxWidth: "42rem",
        }}
      >
        <div style={{ position: "relative", flex: 1 }}>
          <Icon
            icon="solar:magnifier-linear"
            size={18}
            style={{ position: "absolute", left: "12px", top: "13px", color: "var(--text-faint)" }}
          />
          <input
            className="field"
            type="search"
            placeholder="Buscar cualquier cancion, artista o album en YouTube..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            style={{ paddingLeft: "2.4rem" }}
            aria-label="Buscar en YouTube"
          />
        </div>
        <button className="btn" type="submit" disabled={isSearching}>
          {isSearching ? (
            <Icon icon="solar:restart-bold" size={18} className="anim-pulse" />
          ) : (
            <Icon icon="solar:magnifier-linear" size={18} />
          )}
          <span>{isSearching ? "Buscando..." : "Buscar"}</span>
        </button>
      </form>

      {searchError && (
        <div className="glass-card" style={{ padding: "var(--space-3)", marginBottom: "var(--space-5)", color: "var(--danger)" }}>
          <Icon icon="solar:danger-circle-bold" size={16} /> {searchError}
        </div>
      )}

      {hasSearched && (
        <div style={{ marginBottom: "var(--space-7)" }}>
          <div className="section-head" style={{ marginBottom: "var(--space-4)" }}>
            <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 750 }}>
              Resultados para &quot;{query}&quot; ({results.length})
            </h2>
            {results.length > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setResults([]);
                  setHasSearched(false);
                  setQuery("");
                }}
              >
                Limpiar
              </button>
            )}
          </div>

          {results.length === 0 && !isSearching ? (
            <div className="empty-state" style={{ padding: "var(--space-5) 0" }}>
              <Icon icon="solar:music-note-bold" size={44} className="empty-icon" />
              <div style={{ fontWeight: 650 }}>Sin resultados</div>
              <p className="muted" style={{ fontSize: "var(--text-xs)" }}>
                Prueba con el nombre del artista, el titulo exacto o pega el enlace directo.
              </p>
            </div>
          ) : (
            <div className="grid grid-cards">
              {results.map((item) => (
                <ResultCard
                  key={item.id}
                  item={item}
                  isSaved={saved.has(item.id)}
                  onPlay={() => playItem(item)}
                  onSave={() => saveItem(item)}
                  onDownload={() => downloadItem(item)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recomendaciones reales */}
      <div className="section-head" style={{ marginBottom: "var(--space-4)" }}>
        <div>
          <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 750 }}>
            <Icon icon="solar:stars-minimalistic-bold" size={18} style={{ verticalAlign: "-3px", marginRight: "6px" }} />
            Basado en tu musica
          </h2>
          <p className="muted" style={{ fontSize: "var(--text-xs)", marginTop: "4px" }}>
            Mezclas automaticas de YouTube a partir de tus pistas favoritas. Necesita conexion a internet.
          </p>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => void loadRecommendations()}
          disabled={isLoadingRecs}
        >
          <Icon icon="solar:refresh-circle-bold" size={16} className={isLoadingRecs ? "anim-pulse" : ""} />
          <span>Regenerar</span>
        </button>
      </div>

      {isLoadingRecs ? (
        <div className="empty-state" style={{ padding: "var(--space-6) 0" }}>
          <Icon icon="solar:restart-bold" size={32} className="anim-spin empty-icon" />
          <div style={{ fontWeight: 650 }}>Consultando a YouTube...</div>
        </div>
      ) : recommendations.length === 0 ? (
        <div className="empty-state">
          <Icon icon="solar:compass-bold" size={44} className="empty-icon" />
          <div style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>
            Todavia no hay recomendaciones
          </div>
          <p className="muted" style={{ maxWidth: "30rem", fontSize: "var(--text-sm)" }}>
            {recsError ??
              "Añade canciones de YouTube o importa una playlist. A partir de ellas se generaran las mezclas."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cards">
          {recommendations.map((item) => (
            <ResultCard
              key={item.id}
              item={item}
              isSaved={saved.has(item.id)}
              footnote={`Basado en ${item.basedOn}`}
              onPlay={() => playItem(item)}
              onSave={() => saveItem(item)}
              onDownload={() => downloadItem(item)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ResultCard({
  item,
  isSaved,
  footnote,
  onPlay,
  onSave,
  onDownload,
}: {
  item: YouTubeSearchResult;
  isSaved: boolean;
  footnote?: string;
  onPlay: () => void;
  onSave: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="glass-card result-card" style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", padding: "var(--space-4)" }}>
      <div
        style={{
          width: "100%",
          height: "8.5rem",
          borderRadius: "var(--radius-sm)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundImage: item.thumbnail ? `url(${item.thumbnail})` : undefined,
          background: item.thumbnail ? undefined : "var(--surface-solid)",
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
        }}
      >
        <button
          className="btn-icon"
          onClick={onPlay}
          aria-label={`Reproducir ${item.title}`}
          style={{ background: "var(--accent)", color: "var(--text-inverse)", boxShadow: "var(--shadow)" }}
        >
          <Icon icon="solar:play-bold" size={20} />
        </button>
      </div>

      <div>
        <div style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--text)" }}>
          {item.title}
        </div>
        <div className="muted" style={{ fontSize: "var(--text-xs)", marginTop: "2px" }}>
          {item.uploader}
        </div>
        {footnote && (
          <div className="muted" style={{ fontSize: "var(--text-xs)", marginTop: "4px", fontStyle: "italic" }}>
            {footnote}
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: "auto",
          paddingTop: "var(--space-3)",
          borderTop: "1px solid var(--line)",
        }}
      >
        <span className="muted" style={{ fontSize: "var(--text-xs)", fontFamily: "var(--font-mono)" }}>
          {item.duration ? formatDur(item.duration) : "–:–"}
        </span>

        <div style={{ display: "flex", gap: "var(--space-1)" }}>
          <button className="btn btn-ghost btn-sm" onClick={onSave} disabled={isSaved} title="Guardar en la biblioteca">
            {isSaved ? <Icon icon="solar:check-circle-bold" size={14} color="var(--success)" /> : <Icon icon="solar:add-circle-bold" size={14} />}
            <span>{isSaved ? "Guardada" : "Guardar"}</span>
          </button>
          <button className="btn btn-sm" onClick={onDownload} title="Descargar audio">
            <Icon icon="solar:download-square-bold" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
