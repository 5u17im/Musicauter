import { Icon } from "./ui/Icon";
import type { AppView } from "../types";

interface SideItemProps {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  badge?: string | number;
}

function SideItem({ label, icon, active, onClick, badge }: SideItemProps) {
  return (
    <button
      className="side-item"
      data-active={active}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
    >
      <span className="side-icon" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
      {badge !== undefined && badge !== 0 ? <span className="badge">{badge}</span> : null}
    </button>
  );
}

interface Props {
  active: AppView;
  onNavigate: (view: AppView) => void;
  stats?: {
    tracksCount: number;
    playlistsCount: number;
    downloadsCount: number;
    favoritesCount: number;
  };
}

export function Sidebar({ active, onNavigate, stats }: Props) {
  return (
    <aside className="sidebar" aria-label="Navegación principal">
      <div className="side-group">
        <span className="side-label">Tu música</span>
        <SideItem
          label="En reproducción"
          icon={<Icon icon="solar:play-bold" size={18} />}
          active={active === "now-playing"}
          onClick={() => onNavigate("now-playing")}
        />
        <SideItem
          label="Biblioteca"
          icon={<Icon icon="solar:music-note-bold" size={18} />}
          active={active === "library"}
          onClick={() => onNavigate("library")}
          badge={stats?.tracksCount}
        />
        <SideItem
          label="Favoritos"
          icon={<Icon icon="solar:heart-bold" size={18} />}
          active={active === "favorites"}
          onClick={() => onNavigate("favorites")}
          badge={stats?.favoritesCount}
        />
      </div>

      <div className="side-group">
        <span className="side-label">Colección</span>
        <SideItem
          label="Playlists"
          icon={<Icon icon="solar:playlist-bold" size={18} />}
          active={active === "playlists"}
          onClick={() => onNavigate("playlists")}
          badge={stats?.playlistsCount}
        />
        <SideItem
          label="Descargas"
          icon={<Icon icon="solar:download-square-bold" size={18} />}
          active={active === "downloads"}
          onClick={() => onNavigate("downloads")}
          badge={stats?.downloadsCount}
        />
        <SideItem
          label="Descubrir"
          icon={<Icon icon="solar:compass-bold" size={18} />}
          active={active === "discover"}
          onClick={() => onNavigate("discover")}
        />
      </div>

      <div className="side-group" style={{ marginTop: "auto" }}>
        <SideItem
          label="Ajustes"
          icon={<Icon icon="solar:settings-bold" size={18} />}
          active={active === "settings"}
          onClick={() => onNavigate("settings")}
        />
      </div>
    </aside>
  );
}