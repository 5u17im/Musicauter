import { useEffect } from "react";
import {
  IconAlertCircle,
  IconCheck,
  IconDownload,
  IconInfoCircle,
  IconX,
} from "@tabler/icons-react";
import type { ToastNotification } from "../types";

interface Props {
  toasts: ToastNotification[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: Props) {
  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastNotification;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, toast.duration || 4000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  const getIcon = () => {
    switch (toast.type) {
      case "success":
        return <IconCheck size={18} stroke={2} color="var(--success)" />;
      case "error":
        return <IconAlertCircle size={18} stroke={2} color="var(--danger)" />;
      case "download":
        return <IconDownload size={18} stroke={2} color="var(--accent)" />;
      default:
        return <IconInfoCircle size={18} stroke={2} color="var(--accent)" />;
    }
  };

  return (
    <div className={`toast toast-${toast.type}`} role="status">
      <div className="toast-icon">{getIcon()}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 650, fontSize: "var(--text-sm)" }}>{toast.title}</div>
        {toast.message && (
          <div className="muted" style={{ fontSize: "var(--text-xs)", marginTop: "2px" }}>
            {toast.message}
          </div>
        )}
      </div>
      <button
        className="icon-btn-sm"
        onClick={() => onDismiss(toast.id)}
        aria-label="Cerrar notificación"
        style={{ width: "24px", height: "24px", minWidth: "24px", minHeight: "24px" }}
      >
        <IconX size={14} stroke={1.75} />
      </button>
    </div>
  );
}
