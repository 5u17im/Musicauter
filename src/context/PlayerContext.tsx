import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { getLocalAudioUrl, getStreamUrl } from "../api";
import type { RepeatMode, Track } from "../types";

type PlayerStatus = "idle" | "playing" | "paused" | "loading" | "error";

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
        currentIndex: tracks.length ? targetIdx : -1,
        status: tracks.length ? "loading" : "idle",
        progress: 0,
        currentTime: 0,
        duration: tracks[idx]?.durationSeconds || 0,
        error: null,
      };
    }

    case "ADD_TO_QUEUE": {
      return {
        ...state,
        queue: [...state.queue, ...action.tracks],
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
      return {
        ...state,
        queue: nextQueue,
        currentIndex: nextIndex,
      };
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
          return {
            ...state,
            currentIndex: 0,
            status: "loading",
            progress: 0,
            currentTime: 0,
          };
        }
        return { ...state, status: "paused", progress: 1 };
      }
      return {
        ...state,
        currentIndex: next,
        status: "loading",
        progress: 0,
        currentTime: 0,
      };
    }

    case "PREVIOUS": {
      if (state.currentTime > 3) {
        return { ...state, progress: 0, currentTime: 0 };
      }
      const prev = state.currentIndex - 1;
      if (prev < 0) {
        return { ...state, progress: 0, currentTime: 0 };
      }
      return {
        ...state,
        currentIndex: prev,
        status: "loading",
        progress: 0,
        currentTime: 0,
      };
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
        const shuffled = current ? [current, ...shuffleArray(rest)] : shuffleArray(state.originalQueue);
        return {
          ...state,
          shuffle: true,
          queue: shuffled,
          currentIndex: 0,
        };
      } else {
        const current = state.queue[state.currentIndex];
        const origIdx = state.originalQueue.findIndex((t) => t.id === current?.id);
        return {
          ...state,
          shuffle: false,
          queue: state.originalQueue,
          currentIndex: origIdx !== -1 ? origIdx : 0,
        };
      }
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

    case "CLEAR_QUEUE":
      return { ...initialState };

    default:
      return state;
  }
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

  // Inicializar elemento de audio HTML5
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const handleTimeUpdate = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        dispatch({
          type: "SET_PROGRESS",
          progress: audio.currentTime / audio.duration,
          currentTime: audio.currentTime,
          duration: audio.duration,
        });
      }
    };

    const handleEnded = () => {
      if (state.repeat === "one") {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else {
        dispatch({ type: "NEXT" });
      }
    };

    const handleLoadedMeta = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        dispatch({
          type: "SET_PROGRESS",
          progress: 0,
          currentTime: 0,
          duration: audio.duration,
        });
      }
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("loadedmetadata", handleLoadedMeta);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("loadedmetadata", handleLoadedMeta);
      audio.pause();
      audio.src = "";
    };
  }, [state.repeat]);

  // Carga y resolución de la fuente de audio SOLO si cambió la pista actual
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (state.queue.length === 0 || state.currentIndex < 0) {
      currentLoadedTrackIdRef.current = "";
      audio.pause();
      audio.src = "";
      return;
    }

    const currentTrack = state.queue[state.currentIndex];
    if (!currentTrack) return;

    // Si ya estamos reproduciendo esta pista exacta, no recargar el stream
    if (currentLoadedTrackIdRef.current === currentTrack.id && audio.src) {
      return;
    }

    currentLoadedTrackIdRef.current = currentTrack.id;
    userPausedRef.current = false;

    const loadId = `${currentTrack.id}-${Date.now()}`;
    activeLoadIdRef.current = loadId;

    async function loadAudioSource() {
      let resolvedSrc = "";

      // 1. Si la pista está descargada localmente
      if (currentTrack.path) {
        resolvedSrc = await getLocalAudioUrl(currentTrack.path);
      }
      // 2. Si es una pista de YouTube (online)
      else if (currentTrack.youtubeId || (currentTrack.id && currentTrack.id.startsWith("yt-"))) {
        const ytid = currentTrack.youtubeId || currentTrack.id.replace(/^yt-/, "").split("-")[0];
        resolvedSrc = await getStreamUrl(ytid);
      }

      // Evitar condiciones de carrera si el usuario cambió de pista mientras cargaba
      if (activeLoadIdRef.current !== loadId || !audio) return;

      if (resolvedSrc) {
        audio.src = resolvedSrc;
        audio.volume = state.muted ? 0 : state.volume;

        // Si el usuario pausó mientras se obtenía la URL, no forzar play
        if (!userPausedRef.current) {
          audio.play()
            .then(() => {
              dispatch({ type: "SET_STATUS", status: "playing" });
            })
            .catch(() => {
              dispatch({ type: "SET_STATUS", status: "paused" });
            });
        } else {
          dispatch({ type: "SET_STATUS", status: "paused" });
        }
      } else {
        dispatch({ type: "SET_STATUS", status: "paused" });
      }
    }

    void loadAudioSource();
  }, [state.currentIndex, state.queue]);

  // Controles directos e inmediatos de reproducción
  const play = () => {
    userPausedRef.current = false;
    dispatch({ type: "PLAY" });
    const audio = audioRef.current;
    if (audio && audio.src) {
      audio.play().catch(() => {});
    }
  };

  const pause = () => {
    userPausedRef.current = true;
    dispatch({ type: "PAUSE" });
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
    }
  };

  const togglePlay = () => {
    if (state.status === "playing") {
      pause();
    } else {
      play();
    }
  };

  // Sincronizar volumen y silencio
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = state.muted ? 0 : state.volume;
  }, [state.volume, state.muted]);

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