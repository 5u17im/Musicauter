import {
  IconList,
  IconPlayerPause,
  IconPlayerPlay,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { usePlayer } from "../context/PlayerContext";
import { formatDur } from "./TrackList";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function QueueDrawer({ isOpen, onClose }: Props) {
  const { state, dispatch } = usePlayer();

  if (!isOpen) return null;

  const handlePlayQueueItem = (index: number) => {
    dispatch({ type: "SET_QUEUE", tracks: state.queue, startIndex: index });
  };

  const handleRemove = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch({ type: "REMOVE_FROM_QUEUE", index });
  };

  const handleClear = () => {
    dispatch({ type: "CLEAR_QUEUE" });
    onClose();
  };

  return (
    <aside className="queue-drawer" aria-label="Cola de reproducción">
      <div className="queue-head">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <IconList size={20} stroke={1.75} color="var(--accent)" />
          <span style={{ fontWeight: 700, fontSize: "var(--text-base)" }}>
            Cola ({state.queue.length})
          </span>
        </div>
        <div style={{ display: "flex", gap: "var(--space-1)" }}>
          {state.queue.length > 0 && (
            <button
              className="icon-btn-sm"
              onClick={handleClear}
              aria-label="Vaciar cola"
              title="Vaciar cola"
            >
              <IconTrash size={16} stroke={1.75} />
            </button>
          )}
          <button className="icon-btn-sm" onClick={onClose} aria-label="Cerrar panel de cola">
            <IconX size={18} stroke={1.75} />
          </button>
        </div>
      </div>

      <div className="queue-list">
        {state.queue.length === 0 ? (
          <div className="empty-state" style={{ padding: "var(--space-6) var(--space-3)" }}>
            <span className="muted" style={{ fontSize: "var(--text-sm)" }}>
              La cola está vacía
            </span>
          </div>
        ) : (
          state.queue.map((track, idx) => {
            const isCurrent = idx === state.currentIndex;
            return (
              <div
                key={`${track.id}-${idx}`}
                onClick={() => handlePlayQueueItem(idx)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-3)",
                  padding: "0.5rem var(--space-3)",
                  borderRadius: "var(--radius-sm)",
                  background: isCurrent ? "var(--accent-soft)" : "transparent",
                  color: isCurrent ? "var(--accent)" : "var(--text)",
                  cursor: "pointer",
                  border: isCurrent ? "1px solid var(--accent)" : "1px solid transparent",
                  transition: "background var(--dur-fast) var(--ease)",
                }}
              >
                <div style={{ width: "1.2rem", textAlign: "center", fontSize: "var(--text-xs)", flexShrink: 0 }}>
                  {isCurrent ? (
                    state.status === "playing" ? (
                      <IconPlayerPause size={14} stroke={2} />
                    ) : (
                      <IconPlayerPlay size={14} stroke={2} />
                    )
                  ) : (
                    idx + 1
                  )}
                </div>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: "var(--text-sm)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {track.title}
                  </div>
                  <div
                    className="muted"
                    style={{
                      fontSize: "var(--text-xs)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {track.artist}
                  </div>
                </div>

                <span
                  className="muted"
                  style={{
                    fontSize: "var(--text-xs)",
                    fontFamily: "var(--font-mono)",
                    flexShrink: 0,
                  }}
                >
                  {track.durationSeconds ? formatDur(track.durationSeconds) : "–:–"}
                </span>

                <button
                  className="icon-btn-sm"
                  onClick={(e) => handleRemove(idx, e)}
                  aria-label="Quitar de la cola"
                  title="Quitar"
                >
                  <IconX size={14} stroke={1.75} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
