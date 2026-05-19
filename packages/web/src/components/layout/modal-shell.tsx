import {useEffect, type ReactNode} from "react";
import {cn} from "../../lib/cn";

type ModalShellProps = {
  children: ReactNode;
  className?: string;
  closeLabel?: string;
  onClose: () => void;
  open: boolean;
};

export function ModalShell({
  children,
  className,
  closeLabel = "Close",
  onClose,
  open,
}: ModalShellProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-md sm:items-center sm:p-6"
      onClick={onClose}>
      <div
        className={cn(
          "relative h-[92vh] w-full overflow-hidden rounded-t-[2rem] border border-white/10 bg-[#0b0b0d] shadow-[0_40px_120px_rgba(0,0,0,0.65)] sm:h-[88vh] sm:max-w-6xl sm:rounded-[2rem]",
          className,
        )}
        onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="absolute right-4 top-4 z-20 rounded-full border border-white/10 bg-black/60 px-3 py-2 text-xs uppercase tracking-[0.24em] text-white/72 transition hover:bg-black/80"
          onClick={onClose}>
          {closeLabel}
        </button>
        {children}
      </div>
    </div>
  );
}
