import { useEffect, useState } from "react";
import { Icon } from "../components/ui/Icon";
import { TrackList } from "../components/TrackList";
import { usePlayer } from "../context/PlayerContext";
import { StorageService } from "../services/storage";
import type { Track } from "../types";

export function FavoritesView() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const { dispatch } = usePlayer();

  useEffect(() => {
    const load = () => {
      const all = StorageService.getTracks();
      setTracks(all.filter((t) => t.isFavorite));
    };
    load();
    const unsub = StorageService.subscribe(load);
    return unsub;
  }, []);

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      dispatch({ type: "SET_QUEUE", tracks, startIndex: 0 });
    }
  };

  const handleShufflePlay = () => {
    if (tracks.length > 0) {
      dispatch({ type: "TOGGLE_SHUFFLE" });
      dispatch({ type: "SET_QUEUE", tracks, startIndex: 0 });
    }
  };

  return (
    <section>
      <div className="section-head">
        <div>
          <div className="section-kicker">Tus preferidas</div>
          <h1 className="section-title">Canciones Favoritas</h1>
        </div>

        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <button className="btn btn-ghost btn-sm" onClick={handleShufflePlay} disabled={tracks.length === 0}>
            <Icon icon="solar:shuffle-bold" size={16} />
            <span>Aleatorio</span>
          </button>

          <button className="btn btn-sm" onClick={handlePlayAll} disabled={tracks.length === 0}>
            <Icon icon="solar:play-bold" size={16} />
            <span>Reproducir todo ({tracks.length})</span>
          </button>
        </div>
      </div>

      <TrackList
        tracks={tracks}
        emptyTitle="Aún no tienes canciones favoritas"
        emptyMessage="Haz clic en el icono del corazón en cualquier canción para guardarla aquí."
      />
    </section>
  );
}
