import { Icon } from "./ui/Icon";
import { WindowControls } from "./WindowControls";
import type { AppView } from "../types";

interface Props {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenAddModal: () => void;
  onNavigate: (view: AppView) => void;
}

export function TopBar({ searchQuery, onSearchChange, onOpenAddModal, onNavigate }: Props) {
  return (
    <header className="topbar" data-tauri-drag-region>
      <button className="brand" onClick={() => onNavigate("library")} aria-label="Ir al inicio">
        <span className="brand-mark" aria-hidden="true">
          <Icon icon="solar:vinyl-bold" size={22} />
        </span>
        <span className="brand-name">Audionave</span>
      </button>

      <div className="search" role="search">
        <Icon icon="solar:magnifier-linear" size={18} className="search-icon" aria-hidden="true" />
        <input
          className="field search-field"
          type="search"
          placeholder="Buscar canciones, artistas, álbumes..."
          aria-label="Buscar en tu música"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {searchQuery && (
          <button
            className="search-clear"
            onClick={() => onSearchChange("")}
            aria-label="Limpiar búsqueda"
          >
            <Icon icon="solar:close-linear" size={16} />
          </button>
        )}
      </div>

      <div className="topbar-drag" data-tauri-drag-region aria-hidden="true" />

      <div className="top-actions">
        <button
          className="btn btn-ghost btn-sm"
          onClick={onOpenAddModal}
          aria-label="Añadir playlist o canción por URL"
        >
          <Icon icon="solar:add-circle-bold" size={16} />
          <span>Añadir URL</span>
        </button>
      </div>

      <WindowControls />
    </header>
  );
}