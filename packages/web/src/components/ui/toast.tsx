import * as React from "react";
import {cn} from "../../lib/cn";

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
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-3 md:right-6 md:top-6">
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
      ? "border-[#E50914]/40 bg-[linear-gradient(180deg,rgba(229,9,20,0.16),rgba(10,10,10,0.96))] text-white shadow-[0_12px_36px_rgba(229,9,20,0.22)]"
      : toast.type === "success"
      ? "border-success/30 bg-[linear-gradient(180deg,rgba(18,71,42,0.88),rgba(10,10,10,0.96))] text-white shadow-[0_12px_36px_rgba(16,185,129,0.18)]"
      : "border-white/10 bg-[linear-gradient(180deg,rgba(25,25,25,0.96),rgba(10,10,10,0.98))] text-white shadow-[0_12px_36px_rgba(0,0,0,0.45)]";

  const accent =
    toast.type === "error"
      ? "bg-[#E50914]"
      : toast.type === "success"
      ? "bg-emerald-500"
      : "bg-white/40";

  return (
    <div
      className={cn(
        "enter-rise pointer-events-auto relative overflow-hidden rounded-xl border px-4 py-3 text-sm backdrop-blur-xl",
        tone
      )}
      role={toast.type === "error" ? "alert" : "status"}
      aria-live={toast.type === "error" ? "assertive" : "polite"}
    >
      <div className={cn("absolute inset-y-0 left-0 w-1", accent)} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_45%)]" />
      <div className="flex items-start justify-between gap-3">
        <div className="relative pl-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/55">
            Deckflix
          </p>
          <p className="mt-1 font-semibold">{toast.title}</p>
          {toast.description ? (
            <p className="mt-1 text-xs leading-5 text-white/72">
              {toast.description}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onClose(toast.id)}
          className="relative text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45 transition hover:text-white/80"
        >
          Close
        </button>
      </div>
    </div>
  );
}
