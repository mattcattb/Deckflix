import * as React from "react";
import {Toaster as SonnerToaster, toast} from "sonner";

type ToastType = "success" | "error" | "info";

type ToastItem = {
  title: string;
  description?: string;
  type?: ToastType;
};

type ToastContextValue = {
  notify: (toast: Omit<ToastItem, "id">) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({children}: {children: React.ReactNode}) {
  const notify = React.useCallback((toast: Omit<ToastItem, "id">) => {
    const options = {description: toast.description};
    if (toast.type === "error") {
      toastApi.error(toast.title, options);
      return;
    }

    if (toast.type === "success") {
      toastApi.success(toast.title, options);
      return;
    }

    toastApi(toast.title, options);
  }, []);

  return (
    <ToastContext.Provider value={{notify}}>
      {children}
      <Toaster />
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

function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      richColors
      toastOptions={{
        classNames: {
          toast:
            "border-white/10 bg-[linear-gradient(180deg,rgba(25,25,25,0.98),rgba(10,10,10,0.98))] text-white shadow-[0_12px_36px_rgba(0,0,0,0.45)]",
          title: "text-sm font-semibold",
          description: "text-xs text-white/70",
        },
      }}
    />
  );
}

const toastApi = toast;
