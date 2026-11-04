import { useEffect } from "react";
import { Icon } from "./ui/Icon";
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
        return <Icon icon="solar:check-circle-bold" size={18} color="var(--success)" />;
      case "error":
        return <Icon icon="solar:danger-circle-bold" size={18} color="var(--danger)" />;
      case "download":
        return <Icon icon="solar:download-square-bold" size={18} color="var(--accent)" />;
      default:
        return <Icon icon="solar:info-circle-bold" size={18} color="var(--accent)" />;
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
        <Icon icon="solar:close-linear" size={14} />
      </button>
    </div>
  );
}
