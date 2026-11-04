import { useEffect, useRef, useState } from "react";
import { Icon } from "./ui/Icon";
import { listen } from "@tauri-apps/api/event";
import { toggleMiniPlayer } from "../api";
import { usePlayer } from "../context/PlayerContext";
import { DownloadManager } from "../services/downloadManager";
import { StorageService } from "../services/storage";
import type { AppView } from "../types";
import { formatDur } from "./TrackList";

interface Props {
  onToggleQueue: () => void;
  onNavigate: (view: AppView) => void;
}

export function PlayerBar({ onToggleQueue, onNavigate }: Props) {
  const { state, dispatch, audioRef, togglePlay } = usePlayer();
  const current = state.queue[state.currentIndex];

  const [dragging, setDragging] = useState<number | null>(null);
  const [hoverRatio, setHoverRatio] = useState<number | null>(null);
  const [favoritePop, setFavoritePop] = useState(false);
  const [miniOpen, setMiniOpen] = useState(false);

  const scrubRef = useRef<HTMLDivElement | null>(null);

  const totalDuration = state.duration || current?.durationSeconds || 0;
  const displayedProgress = dragging ?? state.progress;
  const isPlaying = state.status === "playing";
  const isLoading = state.status === "loading";
  const queueSize = state.queue.length;

  const ratioFromClientX = (clientX: number): number => {
    const element = scrubRef.current;
    if (!element) return 0;
    const rect = element.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  const seekTo = (ratio: number) => {
    const audio = audioRef.current;
    if (audio && audio.duration && Number.isFinite(audio.duration)) {
      audio.currentTime = ratio * audio.duration;
    }
    dispatch({
      type: "SET_PROGRESS",
      progress: ratio,
      currentTime: ratio * totalDuration,
      duration: totalDuration,
    });
  };

  const handleSeekKey = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 0.1 : 0.02;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      seekTo(Math.min(1, displayedProgress + step));
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      seekTo(Math.max(0, displayedProgress - step));
    }
  };

  const handleToggleFavorite = () => {
    if (!current) return;
    StorageService.toggleFavorite(current.id);
    setFavoritePop(true);
    window.setTimeout(() => setFavoritePop(false), 420);
  };

  const handleDownloadCurrent = () => {
    if (current && !current.downloaded) {
      DownloadManager.enqueueTrack(current);
    }
  };

  // El mini reproductor puede cerrarse desde su propia ventana.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void listen("mini://closed", () => setMiniOpen(false)).then((stop) => {
      if (cancelled) stop();
      else unlisten = stop;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const handleMiniPlayer = async () => {
    try {
      setMiniOpen(await toggleMiniPlayer());
    } catch (error) {
      console.error("No se pudo abrir el mini reproductor", error);
    }
  };

  if (!current) {
    return (
      <footer className="playerbar playerbar-idle" aria-label="Reproductor">
        <div className="idle-note">
          <Icon icon="solar:music-note-bold" size={22} className="anim-float" />
          <div>
            <div style={{ fontWeight: 650, fontSize: "var(--text-sm)" }}>
              Nada en reproduccion
            </div>
            <div className="muted" style={{ fontSize: "var(--text-xs)" }}>
              Elige una cancion de tu biblioteca para empezar
            </div>
          </div>
        </div>
        <div />
        <div />
      </footer>
    );
  }

  return (
    <footer className="playerbar" aria-label="Reproductor de audio">
      {/* ---------------- Pista actual ---------------- */}
      <section className="now-playing" aria-label="Cancion actual">
        <button
          className="art"
          onClick={() => onNavigate("now-playing")}
          aria-label="Abrir vista de reproduccion"
          title="Ver en pantalla completa"
          style={{
            backgroundImage: current.artworkUrl ? `url(${current.artworkUrl})` : undefined,
            background: !current.artworkUrl
              ? "linear-gradient(135deg, oklch(0.6 0.18 265 / 0.85), oklch(0.48 0.14 200 / 0.85))"
              : undefined,
          }}
        >
          {!current.artworkUrl && <Icon icon="solar:music-note-bold" size={22} color="white" />}
          <span className="art-overlay" aria-hidden="true">
            <Icon icon="solar:maximize-square-bold" size={16} />
          </span>
          {isPlaying && (
            <span className="art-eq" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          )}
        </button>

        <div className="np-meta">
          <div className="np-title" title={current.title}>
            {current.title}
          </div>
          <div className="np-artist" title={current.artist}>
            {current.artist}
          </div>
          <div className="np-tags">
            {current.downloaded ? (
              <span className="chip chip-success">
                <Icon icon="solar:check-circle-bold" size={11} />
                {current.format ?? "Local"}
              </span>
            ) : (
              <span className="chip">En streaming</span>
            )}
          </div>
        </div>

        <div className="np-actions">
          <button
            className={`icon-btn-sm ${current.isFavorite ? "fav-active" : ""}`}
            data-pop={favoritePop}
            onClick={handleToggleFavorite}
            aria-label={current.isFavorite ? "Quitar de favoritos" : "Marcar como favorita"}
            title="Favorito"
          >
            <Icon
              icon={current.isFavorite ? "solar:heart-bold" : "solar:heart-linear"}
              size={18}
            />
          </button>

          <button
            className="icon-btn-sm"
            onClick={handleDownloadCurrent}
            disabled={current.downloaded}
            aria-label={current.downloaded ? "Ya descargada" : "Descargar cancion"}
            title={current.downloaded ? "Ya descargada" : "Descargar"}
          >
            {current.downloaded ? (
              <Icon icon="solar:check-circle-bold" size={18} color="var(--success)" />
            ) : (
              <Icon icon="solar:download-square-bold" size={18} />
            )}
          </button>
        </div>
      </section>

      {/* ---------------- Transporte y progreso ---------------- */}
      <section className="transport" aria-label="Controles de reproduccion">
        <div className="tcontrols">
          <button
            className="t-btn"
            data-active={state.shuffle}
            onClick={() => dispatch({ type: "TOGGLE_SHUFFLE" })}
            aria-label="Modo aleatorio"
            title={state.shuffle ? "Aleatorio activado" : "Aleatorio desactivado"}
          >
            <Icon icon="solar:shuffle-bold" size={17} />
          </button>

          <button
            className="t-btn"
            onClick={() => dispatch({ type: "PREVIOUS" })}
            aria-label="Pista anterior"
            title="Anterior"
          >
            <Icon icon="solar:skip-previous-bold" size={19} />
          </button>

          <button
            className="t-btn t-btn-main"
            data-playing={isPlaying}
            data-loading={isLoading}
            onClick={togglePlay}
            aria-label={isPlaying ? "Pausar" : "Reproducir"}
            title={isPlaying ? "Pausar (Espacio)" : "Reproducir (Espacio)"}
          >
            {isLoading ? (
              <span className="t-spinner" />
            ) : isPlaying ? (
              <Icon icon="solar:pause-bold" size={22} />
            ) : (
              <Icon icon="solar:play-bold" size={22} />
            )}
          </button>

          <button
            className="t-btn"
            onClick={() => dispatch({ type: "NEXT" })}
            aria-label="Pista siguiente"
            title="Siguiente"
          >
            <Icon icon="solar:skip-next-bold" size={19} />
          </button>

          <button
            className="t-btn"
            data-active={state.repeat !== "off"}
            onClick={() => dispatch({ type: "CYCLE_REPEAT" })}
            aria-label="Repetir"
            title={`Repeticion: ${state.repeat === "all" ? "todo" : state.repeat === "one" ? "pista" : "desactivada"}`}
          >
            {state.repeat === "one" ? (
              <Icon icon="solar:repeat-one-bold" size={17} />
            ) : (
              <Icon icon="solar:repeat-bold" size={17} />
            )}
          </button>
        </div>

        <div className="scrubber">
          <span className="time" aria-hidden="true">
            {formatDur(Math.floor(dragging != null ? dragging * totalDuration : state.currentTime))}
          </span>

          <div
            ref={scrubRef}
            className="scrub-track"
            data-dragging={dragging != null}
            role="slider"
            tabIndex={0}
            aria-label="Posicion de reproduccion"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(displayedProgress * 100)}
            aria-valuetext={`${formatDur(Math.floor(displayedProgress * totalDuration))} de ${formatDur(Math.floor(totalDuration))}`}
            onKeyDown={handleSeekKey}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              setDragging(ratioFromClientX(event.clientX));
            }}
            onPointerMove={(event) => {
              const ratio = ratioFromClientX(event.clientX);
              setHoverRatio(ratio);
              if (event.buttons === 1) setDragging(ratio);
            }}
            onPointerLeave={() => setHoverRatio(null)}
            onPointerUp={(event) => {
              if (dragging != null) seekTo(dragging);
              setDragging(null);
              // Con la captura activa el puntero puede soltarse fuera.
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
          >
            <div className="scrub-rail" />
            <div
              className={`scrub-fill ${isPlaying ? "scrub-fill-live" : ""}`}
              style={{ width: `${displayedProgress * 100}%` }}
            />
            <div
              className="scrub-thumb"
              style={{ left: `${displayedProgress * 100}%` }}
            />
            {hoverRatio != null && (
              <div className="scrub-tip" style={{ left: `${hoverRatio * 100}%` }}>
                {formatDur(Math.floor(hoverRatio * totalDuration))}
              </div>
            )}
          </div>

          <span className="time" aria-hidden="true">
            {formatDur(Math.floor(totalDuration))}
          </span>
        </div>
      </section>

      {/* ---------------- Acciones ---------------- */}
      <section className="right-zone">
        <button
          className="t-btn"
          onClick={onToggleQueue}
          aria-label="Ver cola de reproduccion"
          title={`Cola de reproduccion (${queueSize})`}
        >
          <Icon icon="solar:list-bold" size={18} />
          {queueSize > 0 && <span className="btn-badge">{queueSize}</span>}
        </button>

        <button
          className="t-btn"
          data-active={miniOpen}
          onClick={() => void handleMiniPlayer()}
          aria-label="Mini reproductor"
          title="Mini reproductor siempre visible"
        >
          <Icon icon="solar:pip-bold" size={18} />
        </button>

        <button
          className="t-btn"
          onClick={() => onNavigate("now-playing")}
          aria-label="Abrir vista de reproduccion"
          title="Vista inmersiva"
        >
          <Icon icon="solar:maximize-square-bold" size={18} />
        </button>

        <div className="volume">
          <button
            className="t-btn"
            onClick={() => dispatch({ type: "TOGGLE_MUTE" })}
            aria-label={state.muted ? "Activar sonido" : "Silenciar"}
            title={state.muted ? "Desilenciar (M)" : "Silenciar (M)"}
          >
            {state.muted || state.volume === 0 ? (
              <Icon icon="solar:volume-cross-bold" size={18} color="var(--danger)" />
            ) : state.volume > 0.5 ? (
              <Icon icon="solar:volume-loud-bold" size={18} />
            ) : (
              <Icon icon="solar:volume-small-bold" size={18} />
            )}
          </button>

          <input
            className="vol-slider"
            type="range"
            min={0}
            max={100}
            value={state.muted ? 0 : Math.round(state.volume * 100)}
            onChange={(event) =>
              dispatch({ type: "SET_VOLUME", volume: Number(event.target.value) / 100 })
            }
            aria-label="Control de volumen"
            style={{
              background: `linear-gradient(90deg, var(--accent) ${
                state.muted ? 0 : state.volume * 100
              }%, var(--line) ${state.muted ? 0 : state.volume * 100}%)`,
            }}
          />
        </div>
      </section>
    </footer>
  );
}
