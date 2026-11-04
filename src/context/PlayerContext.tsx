import {
  createContext,
  useCallback,
  useContext,
  useReducer,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { listen, emit, type UnlistenFn } from "@tauri-apps/api/event";
import { frontendLog, getStreamUrl, mediaUrl } from "../api";
import type {
  PlayerBroadcast,
  PlayerStatus,
  RepeatMode,
  Theme,
  Track,
} from "../types";

interface PlayerState {
  queue: Track[];
  originalQueue: Track[];
  currentIndex: number;
  status: PlayerStatus;
  progress: number; // 0 - 1
  currentTime: number; // seconds
  duration: number; // seconds
  volume: number; // 0 - 1
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  error: string | null;
}

type Action =
  | { type: "SET_QUEUE"; tracks: Track[]; startIndex?: number }
  | { type: "ADD_TO_QUEUE"; tracks: Track[] }
  | { type: "REMOVE_FROM_QUEUE"; index: number }
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "TOGGLE_PLAY" }
  | { type: "NEXT" }
  | { type: "PREVIOUS" }
  | { type: "SEEK"; progress: number }
  | { type: "SET_VOLUME"; volume: number }
  | { type: "TOGGLE_MUTE" }
  | { type: "TOGGLE_SHUFFLE" }
  | { type: "CYCLE_REPEAT" }
  | { type: "SET_PROGRESS"; progress: number; currentTime: number; duration: number }
  | { type: "SET_STATUS"; status: PlayerStatus }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "CLEAR_ERROR" }
  | { type: "CLEAR_QUEUE" };

const initialState: PlayerState = {
  queue: [],
  originalQueue: [],
  currentIndex: -1,
  status: "idle",
  progress: 0,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  muted: false,
  shuffle: false,
  repeat: "off",
  error: null,
};

const AUDIO_FILE_RE = /\.(mp3|flac|opus|m4a|wav|ogg|oga|aac|wma|aiff|aif)$/i;

function shuffleArray<T>(array: T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function playerReducer(state: PlayerState, action: Action): PlayerState {
  switch (action.type) {
    case "SET_QUEUE": {
      const idx = action.startIndex ?? 0;
      const tracks = action.tracks;
      if (tracks.length === 0) {
        return { ...state, queue: [], originalQueue: [], currentIndex: -1, status: "idle" };
      }

      let finalQueue = tracks;
      let targetIdx = idx;

      if (state.shuffle) {
        const currentTrack = tracks[idx];
        const rest = tracks.filter((_, i) => i !== idx);
        finalQueue = [currentTrack, ...shuffleArray(rest)];
        targetIdx = 0;
      }

      return {
        ...state,
        queue: finalQueue,
        originalQueue: tracks,
        currentIndex: targetIdx,
        status: "loading",
        progress: 0,
        currentTime: 0,
        duration: tracks[targetIdx]?.durationSeconds ?? 0,
        error: null,
      };
    }

    case "ADD_TO_QUEUE": {
      const queue = [...state.queue, ...action.tracks];
      return {
        ...state,
        queue,
        originalQueue: [...state.originalQueue, ...action.tracks],
        currentIndex: state.currentIndex === -1 ? 0 : state.currentIndex,
      };
    }

    case "REMOVE_FROM_QUEUE": {
      const nextQueue = state.queue.filter((_, i) => i !== action.index);
      let nextIndex = state.currentIndex;
      if (action.index < state.currentIndex) {
        nextIndex = Math.max(0, state.currentIndex - 1);
      } else if (action.index === state.currentIndex) {
        nextIndex = Math.min(nextIndex, nextQueue.length - 1);
      }
      return { ...state, queue: nextQueue, currentIndex: nextIndex };
    }

    case "PLAY":
      return { ...state, status: "playing" };

    case "PAUSE":
      return { ...state, status: "paused" };

    case "TOGGLE_PLAY":
      return {
        ...state,
        status: state.status === "playing" ? "paused" : "playing",
      };

    case "NEXT": {
      if (state.queue.length === 0) return state;
      const next = state.currentIndex + 1;
      if (next >= state.queue.length) {
        if (state.repeat === "all") {
          return { ...state, currentIndex: 0, status: "loading", progress: 0, currentTime: 0 };
        }
        return { ...state, status: "paused", progress: 1 };
      }
      return { ...state, currentIndex: next, status: "loading", progress: 0, currentTime: 0 };
    }

    case "PREVIOUS": {
      if (state.currentTime > 3) {
        return { ...state, progress: 0, currentTime: 0 };
      }
      const prev = state.currentIndex - 1;
      if (prev < 0) {
        return { ...state, progress: 0, currentTime: 0 };
      }
      return { ...state, currentIndex: prev, status: "loading", progress: 0, currentTime: 0 };
    }

    case "SEEK":
      return { ...state, progress: Math.max(0, Math.min(1, action.progress)) };

    case "SET_VOLUME":
      return { ...state, volume: Math.max(0, Math.min(1, action.volume)), muted: false };

    case "TOGGLE_MUTE":
      return { ...state, muted: !state.muted };

    case "TOGGLE_SHUFFLE": {
      const nextShuffle = !state.shuffle;
      if (nextShuffle) {
        const current = state.queue[state.currentIndex];
        const rest = state.originalQueue.filter((t) => t.id !== current?.id);
        const shuffled = current
          ? [current, ...shuffleArray(rest)]
          : shuffleArray(state.originalQueue);
        return { ...state, shuffle: true, queue: shuffled, currentIndex: 0 };
      }
      const current = state.queue[state.currentIndex];
      const origIdx = state.originalQueue.findIndex((t) => t.id === current?.id);
      return {
        ...state,
        shuffle: false,
        queue: state.originalQueue,
        currentIndex: origIdx !== -1 ? origIdx : 0,
      };
    }

    case "CYCLE_REPEAT": {
      const nextRepeat: RepeatMode =
        state.repeat === "off" ? "all" : state.repeat === "all" ? "one" : "off";
      return { ...state, repeat: nextRepeat };
    }

    case "SET_PROGRESS":
      return {
        ...state,
        progress: action.progress,
        currentTime: action.currentTime,
        duration: action.duration || state.duration,
      };

    case "SET_STATUS":
      return { ...state, status: action.status };

    case "SET_ERROR":
      return { ...state, error: action.error, status: "error" };

    case "CLEAR_ERROR":
      return {
        ...state,
        error: null,
        // Solo se toca el estado si lo puso el propio error.
        status:
          state.status === "error"
            ? state.queue.length > 0
              ? "paused"
              : "idle"
            : state.status,
      };

    case "CLEAR_QUEUE":
      return { ...initialState };

    default:
      return state;
  }
}

/**
 * Deja el elemento <audio> sin fuente.
 *
 * NUNCA asignar `src = ""`: el navegador resuelve la cadena vacia contra la URL
 * del documento, intenta cargar la propia pagina como si fuera audio y dispara
 * un evento `error`. Eso hacia aparecer "No se pudo reproducir este audio" al
 * abrir la aplicacion, sin haber elegido ninguna cancion.
 *
 * Quitar el atributo y llamar a load() deja el elemento en NETWORK_EMPTY, sin
 * error y sin peticiones de red.
 */
function resetAudio(audio: HTMLAudioElement): void {
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
}

/** Cache de URLs de streaming de YouTube. Caducan, por eso llevan marca de tiempo. */
const streamUrlCache = new Map<string, { url: string; at: number }>();
const STREAM_TTL_MS = 30 * 60 * 1000;

async function resolveStreamUrl(youtubeId: string): Promise<string> {
  const cached = streamUrlCache.get(youtubeId);
  if (cached && Date.now() - cached.at < STREAM_TTL_MS) {
    return cached.url;
  }
  const url = await getStreamUrl(youtubeId);
  if (url) streamUrlCache.set(youtubeId, { url, at: Date.now() });
  return url;
}

/**
 * Determina de donde sale el audio:
 *  1. Archivo en disco -> servidor HTTP local (con Range, sin cargar en memoria).
 *  2. Video de YouTube -> URL de stream directa.
 */
async function resolveTrackSource(track: Track): Promise<string> {
  if (track.path && AUDIO_FILE_RE.test(track.path)) {
    return mediaUrl(track.path);
  }
  if (track.youtubeId) {
    return resolveStreamUrl(track.youtubeId);
  }
  return "";
}

const PlayerContext = createContext<{
  state: PlayerState;
  dispatch: React.Dispatch<Action>;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  togglePlay: () => void;
  play: () => void;
  pause: () => void;
} | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(playerReducer, initialState);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeLoadIdRef = useRef<string>("");
  const currentLoadedTrackIdRef = useRef<string>("");
  const userPausedRef = useRef<boolean>(false);
  const repeatRef = useRef<RepeatMode>("off");

  repeatRef.current = state.repeat;

  // Instantaneas para los oyentes de eventos, que no deben re-registrarse.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const togglePlayRef = useRef<() => void>(() => {});

  // Elemento de audio HTML5
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      if (audio.duration && !Number.isNaN(audio.duration)) {
        dispatch({
          type: "SET_PROGRESS",
          progress: audio.currentTime / audio.duration,
          currentTime: audio.currentTime,
          duration: audio.duration,
        });
      }
    };

    const handleEnded = () => {
      if (repeatRef.current === "one") {
        audio.currentTime = 0;
        void audio.play().catch(() => {});
      } else {
        dispatch({ type: "NEXT" });
      }
    };

    const handleLoadedMeta = () => {
      if (audio.duration && !Number.isNaN(audio.duration)) {
        dispatch({
          type: "SET_PROGRESS",
          progress: 0,
          currentTime: 0,
          duration: audio.duration,
        });
      }
    };

    const handleError = () => {
      // Sin fuente asignada no hay nada que reproducir: el evento es espurio.
      // Se registra para poder diagnosticarlo sin depender de la interfaz.
      const hasSource = Boolean(audio.getAttribute("src"));
      void frontendLog(`audio: evento error (fuente asignada: ${hasSource})`);
      if (!hasSource) return;
      const snapshot = stateRef.current;
      if (!snapshot.queue[snapshot.currentIndex]) return;

      dispatch({
        type: "SET_ERROR",
        error:
          "No se pudo reproducir este audio. Puede que el archivo ya no exista o no sea valido.",
      });
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("loadedmetadata", handleLoadedMeta);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("loadedmetadata", handleLoadedMeta);
      audio.removeEventListener("error", handleError);
      resetAudio(audio);
    };
  }, []);

  // Carga de la fuente de audio cuando cambia la pista
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (state.queue.length === 0 || state.currentIndex < 0) {
      currentLoadedTrackIdRef.current = "";
      resetAudio(audio);
      return;
    }

    const currentTrack = state.queue[state.currentIndex];
    if (!currentTrack) return;

    if (currentLoadedTrackIdRef.current === currentTrack.id && audio.src) {
      return;
    }

    resetAudio(audio);
    // Al empezar una pista nueva, el error anterior ya no aplica.
    dispatch({ type: "CLEAR_ERROR" });
    dispatch({ type: "SET_STATUS", status: "loading" });
    dispatch({
      type: "SET_PROGRESS",
      progress: 0,
      currentTime: 0,
      duration: currentTrack.durationSeconds ?? 0,
    });

    currentLoadedTrackIdRef.current = currentTrack.id;
    userPausedRef.current = false;

    const loadId = `${currentTrack.id}-${Date.now()}`;
    activeLoadIdRef.current = loadId;

    void (async () => {
      let source = "";
      try {
        source = await resolveTrackSource(currentTrack);
      } catch (error) {
        console.error("No se pudo resolver el audio", error);
      }

      // El usuario pudo cambiar de pista mientras se resolvia la URL.
      if (activeLoadIdRef.current !== loadId || audioRef.current !== audio) return;

      if (!source) {
        dispatch({
          type: "SET_ERROR",
          error: currentTrack.youtubeId
            ? "No se pudo obtener el audio de YouTube"
            : "La pista no tiene archivo ni video asociado",
        });
        return;
      }

      audio.src = source;
      audio.volume = state.muted ? 0 : state.volume;

      if (userPausedRef.current) {
        dispatch({ type: "SET_STATUS", status: "paused" });
        return;
      }

      try {
        await audio.play();
        dispatch({ type: "SET_STATUS", status: "playing" });

        // Precarga en segundo plano de la siguiente pista de la cola.
        const nextIndex = state.currentIndex + 1;
        const nextTrack = state.queue[nextIndex];
        if (nextTrack && !nextTrack.path && nextTrack.youtubeId) {
          void resolveStreamUrl(nextTrack.youtubeId).catch(() => {});
        }
      } catch {
        dispatch({ type: "SET_STATUS", status: "paused" });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentIndex, state.queue]);

  const play = () => {
    userPausedRef.current = false;
    dispatch({ type: "PLAY" });
    const audio = audioRef.current;
    if (audio && audio.src) {
      void audio.play().catch(() => {});
    }
  };

  const pause = () => {
    userPausedRef.current = true;
    dispatch({ type: "PAUSE" });
    audioRef.current?.pause();
  };

  const togglePlay = () => {
    if (state.status === "playing") {
      pause();
    } else {
      play();
    }
  };

  // Volumen y silencio
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = state.muted ? 0 : state.volume;
  }, [state.volume, state.muted]);

  togglePlayRef.current = togglePlay;

  // -------------------------------------------------------------------
  // Integracion con navigator.mediaSession (teclas multimedia fisicas y
  // flyout nativo de Windows 11).
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const currentTrack = state.queue[state.currentIndex];
    if (!currentTrack) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
      return;
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album ?? "Audionave",
      artwork: currentTrack.artworkUrl
        ? [{ src: currentTrack.artworkUrl, sizes: "512x512", type: "image/jpeg" }]
        : [],
    });

    navigator.mediaSession.playbackState =
      state.status === "playing" ? "playing" : "paused";
  }, [state.currentIndex, state.queue, state.status]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const safeSetHandler = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null,
    ) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Algunas plataformas no implementan todas las acciones de MediaSession.
      }
    };

    safeSetHandler("play", () => {
      userPausedRef.current = false;
      dispatch({ type: "PLAY" });
      void audioRef.current?.play().catch(() => {});
    });
    safeSetHandler("pause", () => {
      userPausedRef.current = true;
      dispatch({ type: "PAUSE" });
      audioRef.current?.pause();
    });
    safeSetHandler("previoustrack", () => dispatch({ type: "PREVIOUS" }));
    safeSetHandler("nexttrack", () => dispatch({ type: "NEXT" }));
    safeSetHandler("seekto", (details) => {
      const audio = audioRef.current;
      if (
        audio &&
        typeof details.seekTime === "number" &&
        audio.duration &&
        Number.isFinite(audio.duration)
      ) {
        audio.currentTime = details.seekTime;
        dispatch({
          type: "SET_PROGRESS",
          progress: details.seekTime / audio.duration,
          currentTime: details.seekTime,
          duration: audio.duration,
        });
      }
    });

    return () => {
      safeSetHandler("play", null);
      safeSetHandler("pause", null);
      safeSetHandler("previoustrack", null);
      safeSetHandler("nexttrack", null);
      safeSetHandler("seekto", null);
    };
  }, []);

  // -------------------------------------------------------------------
  // Puente con la bandeja del sistema, el mini reproductor y la barra de
  // miniaturas de la barra de tareas.
  // -------------------------------------------------------------------

  /** Difunde el estado para que el mini reproductor lo refleje. */
  const broadcast = useCallback(() => {
    const snapshot = stateRef.current;
    const track = snapshot.queue[snapshot.currentIndex];
    const payload: PlayerBroadcast = {
      status: snapshot.status,
      theme: (document.documentElement.dataset.theme as Theme) ?? "dark",
      title: track?.title ?? "",
      artist: track?.artist ?? "",
      artworkUrl: track?.artworkUrl ?? null,
      progress: snapshot.progress,
      currentTime: snapshot.currentTime,
      duration: snapshot.duration || track?.durationSeconds || 0,
      volume: snapshot.volume,
      muted: snapshot.muted,
      shuffle: snapshot.shuffle,
      repeat: snapshot.repeat,
      hasTrack: Boolean(track),
    };
    void emit("player://state", payload);
  }, []);

  // Cambios discretos: se difunden de inmediato.
  useEffect(() => {
    broadcast();
  }, [
    state.currentIndex,
    state.status,
    state.volume,
    state.muted,
    state.shuffle,
    state.repeat,
    broadcast,
  ]);

  // El avance de la pista se difunde a intervalos para no saturar el IPC.
  useEffect(() => {
    const timer = window.setInterval(broadcast, 500);
    return () => window.clearInterval(timer);
  }, [broadcast]);

  // Comandos entrantes.
  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];
    let cancelled = false;

    const register = (promise: Promise<UnlistenFn>) => {
      void promise.then((unlisten) => {
        if (cancelled) unlisten();
        else unlisteners.push(unlisten);
      });
    };

    register(
      listen("media://toggle-play", () => {
        // Usa el helper real: cambiar solo el estado del reductor dejaba el
        // elemento <audio> sonando igual.
        togglePlayRef.current();
      }),
    );
    register(listen("media://next", () => dispatch({ type: "NEXT" })));
    register(listen("media://previous", () => dispatch({ type: "PREVIOUS" })));
    register(listen("media://shuffle", () => dispatch({ type: "TOGGLE_SHUFFLE" })));
    register(listen("media://repeat", () => dispatch({ type: "CYCLE_REPEAT" })));
    register(
      listen<number>("media://seek", (event) => {
        const ratio = Math.min(1, Math.max(0, Number(event.payload)));
        const audio = audioRef.current;
        if (audio && audio.duration && Number.isFinite(audio.duration)) {
          audio.currentTime = ratio * audio.duration;
          dispatch({
            type: "SET_PROGRESS",
            progress: ratio,
            currentTime: audio.currentTime,
            duration: audio.duration,
          });
        }
      }),
    );
    register(listen("player://request-state", () => broadcast()));

    return () => {
      cancelled = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [broadcast]);

  return (
    <PlayerContext.Provider value={{ state, dispatch, audioRef, play, pause, togglePlay }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer debe utilizarse dentro de PlayerProvider");
  return ctx;
}
