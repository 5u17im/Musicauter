import { useEffect, useState } from "react";
import { Icon } from "./components/ui/Icon";
import {
  frontendLog,
  getStatus,
  setMediaInfo,
  setTaskbarPlaybackState,
} from "./api";
import { AddPlaylistModal } from "./components/AddPlaylistModal";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PlayerBar } from "./components/PlayerBar";
import { QueueDrawer } from "./components/QueueDrawer";
import { Sidebar } from "./components/Sidebar";
import { ToastContainer } from "./components/Toast";
import { TopBar } from "./components/TopBar";
import { PlayerProvider, usePlayer } from "./context/PlayerContext";
import { DownloadManager } from "./services/downloadManager";
import { StorageService } from "./services/storage";
import type { AppView, Theme, ToastNotification } from "./types";
import { DiscoverView } from "./views/DiscoverView";
import { DownloadsView } from "./views/DownloadsView";
import { FavoritesView } from "./views/FavoritesView";
import { LibraryView } from "./views/LibraryView";
import { NowPlayingView } from "./views/NowPlayingView";
import { PlaylistsView } from "./views/PlaylistsView";
import { SettingsView } from "./views/SettingsView";

function AppInner() {
  const [view, setView] = useState<AppView>("library");
  const [theme, setTheme] = useState<Theme>(
    () => StorageService.getSettings().theme ?? "dark",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [stats, setStats] = useState({
    tracksCount: 0,
    playlistsCount: 0,
    downloadsCount: 0,
    favoritesCount: 0,
  });

  const {
    state: playerState,
    dispatch: playerDispatch,
    togglePlay,
  } = usePlayer();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Estadisticas de la barra lateral
  useEffect(() => {
    const updateStats = () => {
      const tracks = StorageService.getTracks();
      const playlists = StorageService.getPlaylists();
      const downloads = StorageService.getDownloads();
      setStats({
        tracksCount: tracks.length,
        playlistsCount: playlists.length,
        downloadsCount: downloads.filter(
          (d) => d.status === "downloading" || d.status === "pending",
        ).length,
        favoritesCount: tracks.filter((t) => t.isFavorite).length,
      });
    };

    updateStats();
    return StorageService.subscribe(updateStats);
  }, []);

  // El reproductor activo, para los avisos al sistema operativo.
  const currentTrack = playerState.queue[playerState.currentIndex];

  // Estado de reproduccion en la barra de miniaturas de la barra de tareas.
  useEffect(() => {
    void setTaskbarPlaybackState(
      playerState.status === "playing",
      currentTrack?.title,
    ).catch(() => {
      /* la barra de miniaturas es un extra: su fallo no debe molestar */
    });
  }, [playerState.status, currentTrack?.title]);

  const addToast = (toast: Omit<ToastNotification, "id">) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    setToasts((previous) => [...previous, { ...toast, id }]);
  };

  const removeToast = (id: string) => {
    setToasts((previous) => previous.filter((toast) => toast.id !== id));
  };

  // Atajos de teclado
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (event.code === "Space") {
        event.preventDefault();
        // togglePlay actua sobre el elemento de audio, no solo sobre el estado.
        togglePlay();
      } else if (event.code === "KeyM") {
        playerDispatch({ type: "TOGGLE_MUTE" });
      } else if (event.code === "ArrowRight" && event.ctrlKey) {
        playerDispatch({ type: "NEXT" });
      } else if (event.code === "ArrowLeft" && event.ctrlKey) {
        playerDispatch({ type: "PREVIOUS" });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [playerDispatch, togglePlay]);

  return (
    <div className="app" data-view={view}>
      <TopBar
        searchQuery={searchQuery}
        onSearchChange={(query) => {
          setSearchQuery(query);
          if (query.trim() && view !== "library") setView("library");
        }}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        onNavigate={setView}
      />

      <div className="app-body">
        <Sidebar active={view} onNavigate={setView} stats={stats} />

        <main className="app-main">
          <ErrorBoundary scope={`la vista "${view}"`} resetKey={view}>
            {view === "now-playing" && <NowPlayingView />}
            {view === "library" && <LibraryView searchQuery={searchQuery} />}
            {view === "playlists" && (
              <PlaylistsView onOpenAddModal={() => setIsAddModalOpen(true)} />
            )}
            {view === "downloads" && <DownloadsView />}
            {view === "favorites" && <FavoritesView />}
            {view === "discover" && <DiscoverView />}
            {view === "settings" && (
              <SettingsView theme={theme} onThemeChange={setTheme} />
            )}
          </ErrorBoundary>
        </main>
      </div>

      <PlayerBar
        onToggleQueue={() => setIsQueueOpen((previous) => !previous)}
        onNavigate={setView}
      />

      <AddPlaylistModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdded={(info) => {
          addToast({
            title: info.isSingle ? "Cancion agregada" : "Playlist agregada",
            message: info.isSingle
              ? `Se importo "${info.title}" a tu biblioteca`
              : `Se importo "${info.title}" (${info.count} canciones)`,
            type: "success",
          });
        }}
      />

      <QueueDrawer isOpen={isQueueOpen} onClose={() => setIsQueueOpen(false)} />
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      {playerState.error && (
        <div className="toast toast-error" role="alert">
          <div className="toast-icon">
            <Icon icon="solar:danger-circle-bold" size={18} color="var(--danger)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 650, fontSize: "var(--text-sm)" }}>Error de reproduccion</div>
            <div className="muted" style={{ fontSize: "var(--text-xs)" }}>
              {playerState.error}
            </div>
          </div>
          <button
            className="icon-btn-sm"
            onClick={() => playerDispatch({ type: "CLEAR_ERROR" })}
            aria-label="Descartar el aviso de error"
            title="Descartar"
            style={{ width: "24px", height: "24px", minWidth: "24px", minHeight: "24px" }}
          >
            <Icon icon="solar:close-linear" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function Splash({ message }: { message: string }) {
  return (
    <div
      style={{
        height: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg, #101318)",
        color: "var(--text, #e6e9ef)",
        fontFamily: "var(--font-display, system-ui)",
      }}
    >
      <div style={{ textAlign: "center", display: "grid", gap: "0.75rem", justifyItems: "center" }}>
        <Icon icon="solar:vinyl-bold" size={44} className="anim-spin" />
        <div style={{ fontWeight: 750, fontSize: "1.1rem", letterSpacing: "-0.02em" }}>Audionave</div>
        <div style={{ opacity: 0.65, fontSize: "0.8rem" }}>{message}</div>
      </div>
    </div>
  );
}

export function App() {
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        // Cada paso se registra en el log: si el arranque se cuelga, el ultimo
        // mensaje indica exactamente donde.
        void frontendLog("arranque: pidiendo estado del backend");
        const status = await getStatus();
        setMediaInfo(status.mediaBase, status.mediaToken);

        void frontendLog("arranque: hidratando la biblioteca");
        await StorageService.init();

        void frontendLog("arranque: preparando la cola de descargas");
        await DownloadManager.init();

        void frontendLog("arranque: listo");
        if (!cancelled) setReady(true);
      } catch (error) {
        if (!cancelled) {
          setBootError(error instanceof Error ? error.message : String(error));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (bootError) {
    return (
      <div style={{ height: "100vh", display: "grid", placeItems: "center", padding: "2rem" }}>
        <div style={{ maxWidth: "34rem", textAlign: "center", display: "grid", gap: "0.75rem", justifyItems: "center" }}>
          <Icon icon="solar:danger-circle-bold" size={40} color="var(--danger, #f2555a)" />
          <h1 style={{ fontSize: "1.15rem", fontWeight: 750 }}>No se pudo iniciar Audionave</h1>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontSize: "0.78rem",
              opacity: 0.8,
              textAlign: "left",
              background: "rgba(255,255,255,0.04)",
              padding: "0.75rem",
              borderRadius: "8px",
            }}
          >
            {bootError}
          </pre>
        </div>
      </div>
    );
  }

  if (!ready) return <Splash message="Preparando biblioteca y motor de audio..." />;

  return (
    <PlayerProvider>
      <AppInner />
    </PlayerProvider>
  );
}
