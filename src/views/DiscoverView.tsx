import { useMemo, useState } from "react";
import {
  IconCheck,
  IconClock,
  IconCompass,
  IconDownload,
  IconLoader2,
  IconMusic,
  IconPlayerPlay,
  IconPlus,
  IconSearch,
  IconSparkles,
} from "@tabler/icons-react";
import { searchYouTube, type YouTubeSearchResult } from "../api";
import { formatDur } from "../components/TrackList";
import { usePlayer } from "../context/PlayerContext";
import { DownloadManager } from "../services/downloadManager";
import { StorageService } from "../services/storage";
import type { Recommendation, Track } from "../types";

const GENRES = ["Todos", "Lo-Fi", "Synthwave", "Indie Rock", "Ambient", "Electrónica"];

const RECOMMENDATIONS: Recommendation[] = [
  {
    id: "rec-1",
    title: "Neon Rain Whispers",
    artist: "Kessler Trio",
    source: "local",
    score: 96,
    reason: "Misma afinidad armónica y tempo (118 BPM) que tu colección.",
    artworkUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&q=80",
    genre: "Synthwave",
    youtubeId: "MwpMEbgC7DA",
  },
  {
    id: "rec-2",
    title: "Sombra y Luz del Alba",
    artist: "Amara & The Waves",
    source: "local",
    score: 92,
    reason: "Género acústico y energía melódica similar a ‘Ceniza’.",
    artworkUrl: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80",
    genre: "Indie Rock",
    youtubeId: "L_LUpnjgPso",
  },
  {
    id: "rec-3",
    title: "Marea Baja en Saturno",
    artist: "Nalini Bloom",
    source: "local",
    score: 88,
    reason: "Tonalidad Re menor coincidente con tus pistas favoritas.",
    artworkUrl: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=400&q=80",
    genre: "Ambient",
    youtubeId: "kJQP7kiw5Fk",
  },
  {
    id: "rec-4",
    title: "Ocaso Lofi en Tokio",
    artist: "Parr & Co.",
    source: "internet",
    score: 94,
    reason: "Tendencia viral en YouTube Music para sesiones de código.",
    artworkUrl: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&q=80",
    genre: "Lo-Fi",
    youtubeId: "5qap5aO4i9A",
  },
  {
    id: "rec-5",
    title: "Cybernetic Horizon",
    artist: "Mildé System",
    source: "internet",
    score: 87,
    reason: "Bajo arpegiado y percusión sintética recomendada.",
    artworkUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&q=80",
    genre: "Electrónica",
    youtubeId: "RgKAFK5djSk",
  },
  {
    id: "rec-6",
    title: "Horizonte Carmesí (Live Acoustic)",
    artist: "Veltre Project",
    source: "local",
    score: 85,
    reason: "Versión alternativa recomendada del mismo artista.",
    artworkUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80",
    genre: "Indie Rock",
    youtubeId: "fJ9rUzIMcZQ",
  },
];

function recToTrack(rec: Recommendation): Track {
  return {
    id: `rec-${rec.id}`,
    title: rec.title,
    artist: rec.artist,
    album: "Recomendación",
    durationSeconds: 220,
    downloaded: false,
    artworkUrl: rec.artworkUrl,
    youtubeId: rec.youtubeId,
    addedAt: Date.now(),
  };
}

function ytToTrack(yt: YouTubeSearchResult): Track {
  return {
    id: `yt-${yt.id}-${Date.now()}`,
    title: yt.title,
    artist: yt.uploader || "Artista de YouTube",
    album: "YouTube",
    durationSeconds: yt.duration || 0,
    downloaded: false,
    artworkUrl: yt.thumbnail,
    youtubeId: yt.id,
    addedAt: Date.now(),
  };
}

export function DiscoverView() {
  const { dispatch } = usePlayer();
  const [selectedGenre, setSelectedGenre] = useState("Todos");
  const [addedTracks, setAddedTracks] = useState<Set<string>>(new Set());

  // Búsqueda en YouTube
  const [ytQuery, setYtQuery] = useState("");
  const [ytResults, setYtResults] = useState<YouTubeSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleYtSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ytQuery.trim()) return;

    setIsSearching(true);
    setHasSearched(true);
    try {
      const results = await searchYouTube(ytQuery.trim());
      setYtResults(results);
    } catch {
      setYtResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const filteredRecs = useMemo(() => {
    if (selectedGenre === "Todos") return RECOMMENDATIONS;
    return RECOMMENDATIONS.filter((r) => r.genre === selectedGenre);
  }, [selectedGenre]);

  const handlePlayRec = (rec: Recommendation) => {
    const trk = recToTrack(rec);
    dispatch({ type: "SET_QUEUE", tracks: [trk], startIndex: 0 });
  };

  const handleAddToLibrary = (rec: Recommendation) => {
    const trk = recToTrack(rec);
    StorageService.addTrack(trk);
    setAddedTracks((prev) => new Set(prev).add(rec.id));
  };

  const handleDownloadRec = (rec: Recommendation) => {
    const trk = recToTrack(rec);
    StorageService.addTrack(trk);
    DownloadManager.enqueueTrack(trk);
    setAddedTracks((prev) => new Set(prev).add(rec.id));
  };

  const handlePlayYt = (item: YouTubeSearchResult) => {
    const trk = ytToTrack(item);
    dispatch({ type: "SET_QUEUE", tracks: [trk], startIndex: 0 });
  };

  const handleDownloadYt = (item: YouTubeSearchResult) => {
    const trk = ytToTrack(item);
    StorageService.addTrack(trk);
    DownloadManager.enqueueTrack(trk);
    setAddedTracks((prev) => new Set(prev).add(item.id));
  };

  return (
    <section>
      <div className="section-head">
        <div>
          <div className="section-kicker">Explorador y Recomendaciones</div>
          <h1 className="section-title">Descubrir y Buscar en YouTube</h1>
        </div>

        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <span className="badge badge-accent">
            <IconSparkles size={14} stroke={2} />
            <span>Motor de afinidad activo</span>
          </span>
        </div>
      </div>

      {/* Buscador Integrado de YouTube */}
      <form
        onSubmit={handleYtSearch}
        style={{
          display: "flex",
          gap: "var(--space-2)",
          marginBottom: "var(--space-6)",
          maxWidth: "42rem",
        }}
      >
        <div style={{ position: "relative", flex: 1 }}>
          <IconSearch
            size={18}
            stroke={1.75}
            style={{ position: "absolute", left: "12px", top: "13px", color: "var(--text-faint)" }}
          />
          <input
            className="field"
            type="search"
            placeholder="Buscar cualquier canción, artista o álbum en YouTube..."
            value={ytQuery}
            onChange={(e) => setYtQuery(e.target.value)}
            style={{ paddingLeft: "2.4rem" }}
            aria-label="Buscar en YouTube"
          />
        </div>
        <button className="btn" type="submit" disabled={isSearching}>
          {isSearching ? (
            <IconLoader2 size={18} stroke={2} className="anim-pulse" />
          ) : (
            <IconSearch size={18} stroke={2} />
          )}
          <span>{isSearching ? "Buscando..." : "Buscar"}</span>
        </button>
      </form>

      {/* Resultados de Búsqueda de YouTube */}
      {hasSearched && (
        <div style={{ marginBottom: "var(--space-7)" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "var(--space-4)",
            }}
          >
            <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 750 }}>
              Resultados en YouTube para "{ytQuery}" ({ytResults.length})
            </h2>
            {ytResults.length > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setYtResults([]);
                  setHasSearched(false);
                  setYtQuery("");
                }}
              >
                Limpiar resultados
              </button>
            )}
          </div>

          {ytResults.length === 0 && !isSearching ? (
            <div className="empty-state" style={{ padding: "var(--space-5) 0" }}>
              <IconMusic className="empty-icon" stroke={1.5} />
              <div style={{ fontWeight: 650 }}>No se encontraron resultados en YouTube</div>
              <p className="muted" style={{ fontSize: "var(--text-xs)" }}>
                Prueba con el nombre del artista, título exacto o pega el enlace directo.
              </p>
            </div>
          ) : (
            <div className="grid grid-cards">
              {ytResults.map((item) => {
                const isAdded = addedTracks.has(item.id);
                return (
                  <div
                    key={item.id}
                    className="glass-card"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "var(--space-3)",
                      padding: "var(--space-4)",
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        height: "8.5rem",
                        borderRadius: "var(--radius-sm)",
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        backgroundImage: item.thumbnail ? `url(${item.thumbnail})` : undefined,
                        background: !item.thumbnail ? "var(--surface-solid)" : undefined,
                        display: "grid",
                        placeItems: "center",
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      <button
                        className="btn-icon"
                        onClick={() => handlePlayYt(item)}
                        aria-label={`Reproducir ${item.title}`}
                        style={{
                          background: "var(--accent)",
                          color: "var(--text-inverse)",
                          boxShadow: "var(--shadow)",
                        }}
                      >
                        <IconPlayerPlay size={20} stroke={2} />
                      </button>
                    </div>

                    <div>
                      <div style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--text)" }}>
                        {item.title}
                      </div>
                      <div className="muted" style={{ fontSize: "var(--text-xs)", marginTop: "2px" }}>
                        {item.uploader}
                      </div>
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
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            const trk = ytToTrack(item);
                            StorageService.addTrack(trk);
                            setAddedTracks((prev) => new Set(prev).add(item.id));
                          }}
                          disabled={isAdded}
                          title="Añadir a la biblioteca"
                        >
                          {isAdded ? (
                            <IconCheck size={14} stroke={2} color="var(--success)" />
                          ) : (
                            <IconPlus size={14} stroke={2} />
                          )}
                          <span>{isAdded ? "Guardada" : "Guardar"}</span>
                        </button>

                        <button
                          className="btn btn-sm"
                          onClick={() => handleDownloadYt(item)}
                          title="Descargar audio"
                        >
                          <IconDownload size={14} stroke={2} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Sección de Recomendaciones por Género */}
      <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 750, marginBottom: "var(--space-3)" }}>
        Recomendaciones para ti
      </h2>

      <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-5)", flexWrap: "wrap" }}>
        {GENRES.map((g) => (
          <button
            key={g}
            className={`btn btn-ghost btn-sm ${selectedGenre === g ? "badge-accent" : ""}`}
            onClick={() => setSelectedGenre(g)}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="grid grid-cards">
        {filteredRecs.map((rec) => {
          const isAdded = addedTracks.has(rec.id);
          return (
            <div
              key={rec.id}
              className="glass-card"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-3)",
                padding: "var(--space-4)",
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: "8.5rem",
                  borderRadius: "var(--radius-sm)",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  backgroundImage: rec.artworkUrl ? `url(${rec.artworkUrl})` : undefined,
                  display: "grid",
                  placeItems: "center",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <button
                  className="btn-icon"
                  onClick={() => handlePlayRec(rec)}
                  aria-label={`Reproducir ${rec.title}`}
                  style={{
                    background: "var(--accent)",
                    color: "var(--text-inverse)",
                    boxShadow: "var(--shadow)",
                  }}
                >
                  <IconPlayerPlay size={20} stroke={2} />
                </button>
              </div>

              <div>
                <div style={{ fontWeight: 700, fontSize: "var(--text-base)", color: "var(--text)" }}>
                  {rec.title}
                </div>
                <div className="muted" style={{ fontSize: "var(--text-xs)", marginTop: "2px" }}>
                  {rec.artist} · <span style={{ color: "var(--accent)" }}>{rec.genre}</span>
                </div>
                <div className="muted" style={{ fontSize: "var(--text-xs)", marginTop: "var(--space-2)", lineHeight: 1.4 }}>
                  {rec.reason}
                </div>
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
                <span className="badge" title="Puntuación de afinidad">
                  {rec.score}% afinidad
                </span>

                <div style={{ display: "flex", gap: "var(--space-1)" }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleAddToLibrary(rec)}
                    disabled={isAdded}
                    title="Añadir a la biblioteca"
                  >
                    {isAdded ? (
                      <IconCheck size={14} stroke={2} color="var(--success)" />
                    ) : (
                      <IconPlus size={14} stroke={2} />
                    )}
                    <span>{isAdded ? "Guardada" : "Biblioteca"}</span>
                  </button>

                  <button
                    className="btn btn-sm"
                    onClick={() => handleDownloadRec(rec)}
                    title="Descargar canción"
                  >
                    <IconDownload size={14} stroke={2} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}