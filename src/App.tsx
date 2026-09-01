import { useEffect, useState } from "react";
import { AddPlaylistModal } from "./components/AddPlaylistModal";
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
  const [theme, setTheme] = useState<Theme>(() => StorageService.getSettings().theme || "dark");
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

  const { state: playerState, dispatch: playerDispatch } = usePlayer();

  // Actualizar tema visual en HTML dataset
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Suscribirse a cambios en la base de datos local
  useEffect(() => {
    const updateStats = () => {
      const tracks = StorageService.getTracks();
      const playlists = StorageService.getPlaylists();
      const downloads = StorageService.getDownloads();
      setStats({
        tracksCount: tracks.length,
        playlistsCount: playlists.length,
        downloadsCount: downloads.filter((d) => d.status === "downloading" || d.status === "pending").length,
        favoritesCount: tracks.filter((t) => t.isFavorite).length,
      });
    };

    updateStats();
    DownloadManager.init();
    const unsub = StorageService.subscribe(updateStats);
    return unsub;
  }, []);

  const addToast = (toast: Omit<ToastNotification, "id">) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Atajos de teclado globales
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar si el usuario está escribiendo en un input
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        playerDispatch({ type: "TOGGLE_PLAY" });
      } else if (e.code === "KeyM") {
        playerDispatch({ type: "TOGGLE_MUTE" });
      } else if (e.code === "ArrowRight" && e.ctrlKey) {
        playerDispatch({ type: "NEXT" });
      } else if (e.code === "ArrowLeft" && e.ctrlKey) {
        playerDispatch({ type: "PREVIOUS" });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [playerDispatch]);

  return (
    <div className="app" data-view={view}>
      <TopBar
        searchQuery={searchQuery}
        onSearchChange={(q) => {
          setSearchQuery(q);
          if (q.trim() && view !== "library") {
            setView("library");
          }
        }}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        onNavigate={setView}
      />

      <div className="app-body">
        <Sidebar active={view} onNavigate={setView} stats={stats} />

        <main className="app-main">
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
        </main>
      </div>

      <PlayerBar
        onToggleQueue={() => setIsQueueOpen((prev) => !prev)}
        onNavigate={setView}
      />

      {/* Modal para añadir URL */}
      <AddPlaylistModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdded={(info) => {
          addToast({
            title: info.isSingle ? "Canción agregada con éxito" : "Playlist agregada con éxito",
            message: info.isSingle
              ? `Se importó "${info.title}" a tu biblioteca`
              : `Se importó "${info.title}" (${info.count} canciones)`,
            type: "success",
          });
        }}
      />

      {/* Panel lateral de Cola */}
      <QueueDrawer isOpen={isQueueOpen} onClose={() => setIsQueueOpen(false)} />

      {/* Contenedor de Alertas Toast */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}

export function App() {
  return (
    <PlayerProvider>
      <AppInner />
    </PlayerProvider>
  );
}