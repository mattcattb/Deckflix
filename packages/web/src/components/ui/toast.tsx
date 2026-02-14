import * as React from "react";
import { cn } from "../../lib/cn";

type ToastType = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  type?: ToastType;
}

interface ToastContextValue {
  notify: (toast: Omit<ToastItem, "id">) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const notify = React.useCallback((toast: Omit<ToastItem, "id">) => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [...prev, { id, ...toast }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4000);
  }, []);

  const remove = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <ToastViewport>
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onClose={remove} />
        ))}
      </ToastViewport>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}

function ToastViewport({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none fixed right-6 top-6 z-50 flex w-[320px] flex-col gap-3">
      {children}
    </div>
  );
}

function ToastCard({
  toast,
  onClose,
}: {
  toast: ToastItem;
  onClose: (id: string) => void;
}) {
  const tone =
    toast.type === "error"
      ? "border-danger/40 bg-danger/15 text-danger"
      : toast.type === "success"
      ? "border-success/40 bg-success/15 text-success"
      : "border-border bg-surface-elevated text-foreground";

  return (
    <div
      className={cn(
        "pointer-events-auto rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur",
        tone
      )}
      role="status"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{toast.title}</p>
          {toast.description ? (
            <p className="mt-1 text-xs text-foreground/80">
              {toast.description}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onClose(toast.id)}
          className="text-xs text-foreground/60 transition hover:text-foreground"
        >
          Close
        </button>
      </div>
    </div>
  );
}
