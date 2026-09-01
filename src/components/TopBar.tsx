import { IconDisc, IconPlus, IconSearch, IconX } from "@tabler/icons-react";
import type { AppView } from "../types";

interface Props {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenAddModal: () => void;
  onNavigate: (view: AppView) => void;
}

export function TopBar({ searchQuery, onSearchChange, onOpenAddModal, onNavigate }: Props) {
  return (
    <header className="topbar">
      <button className="brand" onClick={() => onNavigate("library")} aria-label="Ir al inicio">
        <span className="brand-mark" aria-hidden="true">
          <IconDisc size={22} stroke={2} />
        </span>
        <span className="brand-name">Audionave</span>
      </button>

      <div className="search" role="search">
        <IconSearch size={18} stroke={1.75} className="search-icon" aria-hidden="true" />
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
            <IconX size={16} stroke={1.75} />
          </button>
        )}
      </div>

      <div className="top-actions">
        <button
          className="btn btn-ghost btn-sm"
          onClick={onOpenAddModal}
          aria-label="Añadir playlist o canción por URL"
        >
          <IconPlus size={16} stroke={2} />
          <span>Añadir URL</span>
        </button>
      </div>
    </header>
  );
}