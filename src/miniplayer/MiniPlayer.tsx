import { useCallback, useEffect, useRef, useState } from "react";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { showMainWindow } from "../api";
import { Icon } from "../components/ui/Icon";
import type { PlayerBroadcast } from "../types";

const IDLE: PlayerBroadcast = {
  status: "idle",
  theme: "dark",
  title: "",
  artist: "",
  artworkUrl: null,
  progress: 0,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  muted: false,
  shuffle: false,
  repeat: "off",
  hasTrack: false,
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
}

/**
 * Ventana compacta que controla la reproduccion de la ventana principal.
 *
 * No crea su propio elemento <audio>: seria una segunda reproduccion
 * independiente. En su lugar envia comandos (media://*) y dibuja el estado que
 * la ventana principal difunde por player://state.
 */
export function MiniPlayer() {
  const [state, setState] = useState<PlayerBroadcast>(IDLE);
  const [scrubbing, setScrubbing] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;

    void (async () => {
      const stop = await listen<PlayerBroadcast>("player://state", (event) => {
        setState(event.payload);
        document.documentElement.dataset.theme = event.payload.theme;
      });
      if (cancelled) {
        stop();
        return;
      }
      unlisten = stop;
      // Pedir el estado actual: la ventana principal puede llevar rato sonando.
      await emit("player://request-state");
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const send = useCallback((command: string) => {
    void emit(command);
  }, []);

  const seekTo = useCallback((clientX: number) => {
    const bar = barRef.current;
    if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setScrubbing(ratio);
  }, []);

  const commitSeek = useCallback(
    (clientX: number) => {
      const bar = barRef.current;
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      setScrubbing(null);
      void emit("media://seek", ratio);
    },
    [],
  );

  const displayedProgress = scrubbing ?? state.progress;
  const isPlaying = state.status === "playing";
  const isLoading = state.status === "loading";

  return (
    <div className="mini" data-tauri-drag-region>
      <div className="mini-glow" aria-hidden="true" />

      <div className="mini-art" data-tauri-drag-region>
        {state.artworkUrl ? (
          <img src={state.artworkUrl} alt="" draggable={false} />
        ) : (
          <div className="mini-art-fallback">
            <Icon icon="solar:play-bold" size={18} />
          </div>
        )}
      </div>

      <div className="mini-main" data-tauri-drag-region>
        <div className="mini-meta" data-tauri-drag-region>
          <div className="mini-title" title={state.title}>
            {state.title || "Sin reproduccion"}
          </div>
          <div className="mini-artist" title={state.artist}>
            {state.artist || "Elige una cancion en Audionave"}
          </div>
        </div>

        <div className="mini-transport">
          <button
            className="mini-btn"
            data-active={state.shuffle}
            onClick={() => send("media://shuffle")}
            title="Aleatorio"
            aria-label="Aleatorio"
          >
            <Icon icon="solar:shuffle-bold" size={14} />
          </button>

          <button
            className="mini-btn"
            onClick={() => send("media://previous")}
            title="Anterior"
            aria-label="Pista anterior"
          >
            <Icon icon="solar:skip-previous-bold" size={16} />
          </button>

          <button
            className="mini-btn mini-btn-main"
            data-loading={isLoading}
            onClick={() => send("media://toggle-play")}
            title={isPlaying ? "Pausar" : "Reproducir"}
            aria-label={isPlaying ? "Pausar" : "Reproducir"}
            disabled={!state.hasTrack}
          >
            {isLoading ? (
              <span className="mini-spinner" />
            ) : isPlaying ? (
              <Icon icon="solar:pause-bold" size={16} />
            ) : (
              <Icon icon="solar:play-bold" size={16} />
            )}
          </button>

          <button
            className="mini-btn"
            onClick={() => send("media://next")}
            title="Siguiente"
            aria-label="Pista siguiente"
          >
            <Icon icon="solar:skip-next-bold" size={16} />
          </button>

          <button
            className="mini-btn"
            data-active={state.repeat !== "off"}
            onClick={() => send("media://repeat")}
            title={`Repetir: ${state.repeat}`}
            aria-label="Repetir"
          >
            {state.repeat === "one" ? (
              <Icon icon="solar:repeat-one-bold" size={14} />
            ) : (
              <Icon icon="solar:repeat-bold" size={14} />
            )}
          </button>
        </div>

        <div className="mini-scrub-row">
          <span className="mini-time">
            {formatTime(scrubbing != null ? scrubbing * state.duration : state.currentTime)}
          </span>

          <div
            ref={barRef}
            className="mini-scrub"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              seekTo(event.clientX);
            }}
            onPointerMove={(event) => {
              if (event.buttons === 1) seekTo(event.clientX);
            }}
            onPointerUp={(event) => commitSeek(event.clientX)}
            role="slider"
            aria-label="Posicion de reproduccion"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(displayedProgress * 100)}
            tabIndex={0}
          >
            <div className="mini-scrub-fill" style={{ width: `${displayedProgress * 100}%` }} />
            <div className="mini-scrub-knob" style={{ left: `${displayedProgress * 100}%` }} />
          </div>

          <span className="mini-time">{formatTime(state.duration)}</span>
        </div>
      </div>

      <div className="mini-side">
        <button
          className="mini-side-btn"
          onClick={() => {
            void showMainWindow();
          }}
          title="Mostrar Audionave"
          aria-label="Mostrar Audionave"
        >
          <Icon icon="solar:maximize-square-bold" size={14} />
        </button>
        <button
          className="mini-side-btn"
          onClick={() => {
            void getCurrentWindow().close();
          }}
          title="Cerrar mini reproductor"
          aria-label="Cerrar mini reproductor"
        >
          <Icon icon="solar:close-linear" size={14} />
        </button>
      </div>
    </div>
  );
}
