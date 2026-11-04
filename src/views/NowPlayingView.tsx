import { Icon } from "../components/ui/Icon";
import { formatBytes, formatDur } from "../components/TrackList";
import { usePlayer } from "../context/PlayerContext";
import { DownloadManager } from "../services/downloadManager";
import { StorageService } from "../services/storage";

export function NowPlayingView() {
  const { state, dispatch, audioRef, togglePlay } = usePlayer();
  const current = state.queue[state.currentIndex];

  if (!current) {
    return (
      <section className="empty-state" style={{ height: "100%", justifyContent: "center" }}>
        <Icon icon="solar:music-note-bold" className="empty-icon" size={64} />
        <h2 style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>Nada en reproducción</h2>
        <p className="muted">Selecciona una pista de tu biblioteca o playlists para reproducirla.</p>
      </section>
    );
  }

  const handlePlayToggle = togglePlay;
  const handleNext = () => dispatch({ type: "NEXT" });
  const handlePrev = () => dispatch({ type: "PREVIOUS" });
  const toggleShuffle = () => dispatch({ type: "TOGGLE_SHUFFLE" });
  const cycleRepeat = () => dispatch({ type: "CYCLE_REPEAT" });
  const toggleMute = () => dispatch({ type: "TOGGLE_MUTE" });

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const progress = Number(e.target.value) / 100;
    const dur = state.duration || current.durationSeconds || 200;
    const audio = audioRef.current;
    if (audio && audio.duration && !isNaN(audio.duration)) {
      audio.currentTime = progress * audio.duration;
    }
    dispatch({
      type: "SET_PROGRESS",
      progress,
      currentTime: progress * dur,
      duration: dur,
    });
  };

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: "SET_VOLUME", volume: Number(e.target.value) / 100 });
  };

  const handleToggleFav = () => {
    StorageService.toggleFavorite(current.id);
  };

  const handleDownload = () => {
    if (!current.downloaded) {
      DownloadManager.enqueueTrack(current);
    }
  };

  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(20rem, 1fr) minmax(18rem, 1.2fr)",
        gap: "var(--space-7)",
        alignItems: "center",
        maxWidth: "68rem",
        margin: "0 auto",
        width: "100%",
        height: "100%",
        padding: "var(--space-4) 0",
      }}
    >
      {/* Columna Izquierda: Carátula y Visualizador */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-5)" }}>
        <div
          style={{
            position: "relative",
            width: "100%",
            maxWidth: "24rem",
            aspectRatio: "1/1",
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
            boxShadow: "0 24px 60px -12px oklch(0 0 0 / 0.7)",
            border: "1px solid var(--line-strong)",
            background: !current.artworkUrl
              ? "linear-gradient(135deg, oklch(0.55 0.18 265), oklch(0.40 0.15 220))"
              : undefined,
          }}
        >
          {current.artworkUrl ? (
            <img
              src={current.artworkUrl}
              alt={current.title}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}>
              <Icon icon="solar:music-note-bold" size={80} color="white" />
            </div>
          )}

          {/* Efecto de ondas animadas */}
          {state.status === "playing" && (
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                height: "3.5rem",
                background: "linear-gradient(to top, oklch(0 0 0 / 0.8), transparent)",
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                gap: "4px",
                paddingBottom: "var(--space-2)",
              }}
            >
              {[...Array(24)].map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: "4px",
                    background: "var(--accent)",
                    borderRadius: "2px",
                    animation: `eq-bar ${0.6 + (i % 5) * 0.15}s ease-in-out infinite alternate`,
                    animationDelay: `${(i % 6) * 0.1}s`,
                    height: `${20 + ((i * 17) % 70)}%`,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Columna Derecha: Metadatos y Controles Ampliados */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
        <div>
          <div className="section-kicker">En Reproducción</div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-3xl)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: "var(--text)",
              marginBottom: "var(--space-1)",
              lineHeight: 1.2,
            }}
          >
            {current.title}
          </h1>
          <div style={{ fontSize: "var(--text-xl)", color: "var(--text-dim)", fontWeight: 600 }}>
            {current.artist}
          </div>
          <div className="muted" style={{ fontSize: "var(--text-sm)", marginTop: "var(--space-1)" }}>
            Álbum: {current.album || "Sencillo"} · {current.format || "Audio Local"}
          </div>
        </div>

        {/* Badges de Estado */}
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          {current.downloaded ? (
            <span className="badge badge-success">
              <Icon icon="solar:check-circle-bold" size={14} />
              <span>Descargado</span>
            </span>
          ) : (
            <span className="badge badge-accent">Audio en Red</span>
          )}
          {current.fileSizeBytes ? (
            <span className="badge">{formatBytes(current.fileSizeBytes)}</span>
          ) : null}
          {current.isFavorite && (
            <span className="badge badge-danger">
              <Icon icon="solar:heart-bold" size={14} />
              <span>Favorito</span>
            </span>
          )}
        </div>

        {/* Scrubber de Gran Formato */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <input
            className="scrub-slider"
            type="range"
            min={0}
            max={100}
            value={Math.round(state.progress * 100) || 0}
            onChange={handleSeek}
            aria-label="Progreso"
            style={{ height: "8px" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span className="time">{formatDur(Math.floor(state.currentTime))}</span>
            <span className="time">
              {formatDur(Math.floor(state.duration || current.durationSeconds || 0))}
            </span>
          </div>
        </div>

        {/* Transporte Ampliado */}
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", justifyContent: "center" }}>
          <button
            className="t-btn"
            data-active={state.shuffle}
            onClick={toggleShuffle}
            aria-label="Modo aleatorio"
          >
            <Icon icon="solar:shuffle-bold" size={22} />
          </button>

          <button className="t-btn" onClick={handlePrev} aria-label="Pista anterior">
            <Icon icon="solar:skip-previous-bold" size={24} />
          </button>

          <button
            className="t-btn t-btn-main"
            onClick={handlePlayToggle}
            aria-label={state.status === "playing" ? "Pausar" : "Reproducir"}
            style={{ width: "56px", height: "56px", minWidth: "56px", minHeight: "56px" }}
          >
            {state.status === "playing" ? (
              <Icon icon="solar:pause-bold" size={28} />
            ) : (
              <Icon icon="solar:play-bold" size={28} />
            )}
          </button>

          <button className="t-btn" onClick={handleNext} aria-label="Siguiente pista">
            <Icon icon="solar:skip-next-bold" size={24} />
          </button>

          <button
            className="t-btn"
            data-active={state.repeat !== "off"}
            onClick={cycleRepeat}
            aria-label="Modo repetición"
          >
            {state.repeat === "one" ? (
              <Icon icon="solar:repeat-one-bold" size={22} />
            ) : (
              <Icon icon="solar:repeat-bold" size={22} />
            )}
          </button>
        </div>

        {/* Acciones Secundarias: Favorito, Descarga y Volumen */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: "var(--space-4)",
            borderTop: "1px solid var(--line)",
          }}
        >
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <button
              className={`btn btn-ghost btn-sm ${current.isFavorite ? "fav-active" : ""}`}
              onClick={handleToggleFav}
            >
              <Icon icon={current.isFavorite ? "solar:heart-bold" : "solar:heart-linear"} size={16} />
              <span>{current.isFavorite ? "En favoritos" : "Guardar en favoritos"}</span>
            </button>

            <button
              className="btn btn-ghost btn-sm"
              onClick={handleDownload}
              disabled={current.downloaded}
            >
              {current.downloaded ? (
                <>
                  <Icon icon="solar:check-circle-bold" size={16} color="var(--success)" />
                  <span>En disco local</span>
                </>
              ) : (
                <>
                  <Icon icon="solar:download-square-bold" size={16} />
                  <span>Descargar pista</span>
                </>
              )}
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <button className="t-btn" onClick={toggleMute} aria-label="Silenciar">
              {state.muted ? <Icon icon="solar:volume-cross-bold" size={18} /> : <Icon icon="solar:volume-loud-bold" size={18} />}
            </button>
            <input
              className="vol-slider"
              type="range"
              min={0}
              max={100}
              value={state.muted ? 0 : Math.round(state.volume * 100)}
              onChange={handleVolume}
              aria-label="Volumen"
              style={{ width: "6rem" }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
