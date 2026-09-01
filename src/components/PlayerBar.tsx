import {
  IconArrowsShuffle,
  IconCheck,
  IconDownload,
  IconHeart,
  IconList,
  IconMaximize,
  IconMusic,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerSkipBack,
  IconPlayerSkipForward,
  IconRepeat,
  IconRepeatOnce,
  IconVolume,
  IconVolume3,
  IconVolumeOff,
} from "@tabler/icons-react";
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

  const handlePlayToggle = togglePlay;
  const handleNext = () => dispatch({ type: "NEXT" });
  const handlePrev = () => dispatch({ type: "PREVIOUS" });

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const progress = Number(e.target.value) / 100;
    const dur = state.duration || current?.durationSeconds || 200;
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

  const toggleMute = () => dispatch({ type: "TOGGLE_MUTE" });
  const toggleShuffle = () => dispatch({ type: "TOGGLE_SHUFFLE" });
  const cycleRepeat = () => dispatch({ type: "CYCLE_REPEAT" });

  const handleToggleFavorite = () => {
    if (current) {
      StorageService.toggleFavorite(current.id);
    }
  };

  const handleDownloadCurrent = () => {
    if (current && !current.downloaded) {
      DownloadManager.enqueueTrack(current);
    }
  };

  if (!current) {
    return (
      <footer className="playerbar" aria-label="Reproductor">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", color: "var(--text-faint)" }}>
          <IconMusic size={22} stroke={1.75} />
          <span style={{ fontSize: "var(--text-sm)" }}>Selecciona una canción para comenzar la reproducción</span>
        </div>
        <div />
        <div />
      </footer>
    );
  }

  const isDownloaded = current.downloaded;
  const isFav = current.isFavorite;

  return (
    <footer className="playerbar" aria-label="Reproductor de audio">
      {/* Sección Izquierda: Canción Actual */}
      <section className="now-playing" aria-label="Canción actual">
        <div
          className="art"
          onClick={() => onNavigate("now-playing")}
          role="button"
          tabIndex={0}
          aria-label="Abrir vista inmersiva de reproducción"
          title="Ver en pantalla completa"
          style={{
            backgroundImage: current.artworkUrl ? `url(${current.artworkUrl})` : undefined,
            background: !current.artworkUrl
              ? "linear-gradient(135deg, oklch(0.6 0.18 265 / 0.8), oklch(0.48 0.14 200 / 0.8))"
              : undefined,
          }}
        >
          {!current.artworkUrl && <IconMusic size={24} stroke={1.5} color="white" />}
        </div>

        <div className="np-meta">
          <div className="np-title" title={current.title}>
            {current.title}
          </div>
          <div className="np-artist" title={current.artist}>
            {current.artist}
          </div>
        </div>

        <div className="np-actions">
          <button
            className={`icon-btn-sm ${isFav ? "fav-active" : ""}`}
            onClick={handleToggleFavorite}
            aria-label={isFav ? "Quitar de favoritos" : "Marcar como favorita"}
            title="Favorito"
          >
            <IconHeart size={18} stroke={1.75} fill={isFav ? "currentColor" : "none"} />
          </button>

          <button
            className="icon-btn-sm"
            onClick={handleDownloadCurrent}
            disabled={isDownloaded}
            aria-label={isDownloaded ? "Canción ya descargada" : "Descargar canción"}
            title={isDownloaded ? "Ya descargada" : "Descargar"}
          >
            {isDownloaded ? (
              <IconCheck size={18} stroke={2} color="var(--success)" />
            ) : (
              <IconDownload size={18} stroke={1.75} />
            )}
          </button>
        </div>
      </section>

      {/* Sección Central: Transporte y Scrubber */}
      <section className="transport" aria-label="Controles de transporte">
        <div className="tcontrols">
          <button
            className="t-btn"
            data-active={state.shuffle}
            onClick={toggleShuffle}
            aria-label="Modo aleatorio"
            title={state.shuffle ? "Aleatorio: activado" : "Aleatorio: desactivado"}
          >
            <IconArrowsShuffle size={18} stroke={1.75} />
          </button>

          <button
            className="t-btn"
            onClick={handlePrev}
            aria-label="Pista anterior"
            title="Anterior"
          >
            <IconPlayerSkipBack size={20} stroke={1.75} />
          </button>

          <button
            className="t-btn t-btn-main"
            onClick={handlePlayToggle}
            aria-label={state.status === "playing" ? "Pausar" : "Reproducir"}
            title={state.status === "playing" ? "Pausar (Espacio)" : "Reproducir (Espacio)"}
          >
            {state.status === "playing" ? (
              <IconPlayerPause size={24} stroke={2} />
            ) : (
              <IconPlayerPlay size={24} stroke={2} />
            )}
          </button>

          <button
            className="t-btn"
            onClick={handleNext}
            aria-label="Siguiente pista"
            title="Siguiente"
          >
            <IconPlayerSkipForward size={20} stroke={1.75} />
          </button>

          <button
            className="t-btn"
            data-active={state.repeat !== "off"}
            onClick={cycleRepeat}
            aria-label="Repetir reproducción"
            title={`Repetición: ${state.repeat === "all" ? "Todo" : state.repeat === "one" ? "Pista actual" : "Desactivada"}`}
          >
            {state.repeat === "one" ? (
              <IconRepeatOnce size={18} stroke={1.75} />
            ) : (
              <IconRepeat size={18} stroke={1.75} />
            )}
          </button>
        </div>

        <div className="scrubber">
          <span className="time" aria-hidden="true">
            {formatDur(Math.floor(state.currentTime))}
          </span>

          <input
            className="scrub-slider"
            type="range"
            min={0}
            max={100}
            value={Math.round(state.progress * 100) || 0}
            onChange={handleSeek}
            aria-label="Barra de progreso de reproducción"
            aria-valuetext={`${formatDur(Math.floor(state.currentTime))} de ${formatDur(Math.floor(state.duration || current.durationSeconds || 0))}`}
          />

          <span className="time" aria-hidden="true">
            {formatDur(Math.floor(state.duration || current.durationSeconds || 0))}
          </span>
        </div>
      </section>

      {/* Sección Derecha: Vista Inmersiva, Cola y Volumen */}
      <section className="right-zone">
        <button
          className="t-btn"
          onClick={() => onNavigate("now-playing")}
          aria-label="Abrir pantalla de reproducción"
          title="Vista inmersiva"
        >
          <IconMaximize size={18} stroke={1.75} />
        </button>

        <button
          className="t-btn"
          onClick={onToggleQueue}
          aria-label="Ver cola de reproducción"
          title="Cola de reproducción"
        >
          <IconList size={18} stroke={1.75} />
        </button>

        <button
          className="t-btn"
          onClick={toggleMute}
          aria-label={state.muted ? "Activar sonido" : "Silenciar"}
          title={state.muted ? "Desilenciar (M)" : "Silenciar (M)"}
        >
          {state.muted || state.volume === 0 ? (
            <IconVolumeOff size={18} stroke={1.75} color="var(--danger)" />
          ) : state.volume > 0.5 ? (
            <IconVolume size={18} stroke={1.75} />
          ) : (
            <IconVolume3 size={18} stroke={1.75} />
          )}
        </button>

        <input
          className="vol-slider"
          type="range"
          min={0}
          max={100}
          value={state.muted ? 0 : Math.round(state.volume * 100)}
          onChange={handleVolume}
          aria-label="Control de volumen"
        />
      </section>
    </footer>
  );
}