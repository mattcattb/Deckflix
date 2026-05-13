import type {ComponentProps, ReactNode} from "react";
import {BrandMark, Eyebrow, StatusMessage} from "../common";

type RoomSocketStatus =
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed"
  | "error";

type RoomHeaderProps = {
  actions?: ReactNode;
  brandTo: ComponentProps<typeof BrandMark>["to"];
  center?: ReactNode;
  title?: ReactNode;
};

type RoomScreenShellProps = {
  children: ReactNode;
  error?: string | null;
  header: ReactNode;
  mobileSidebar?: ReactNode;
  sidebar?: ReactNode;
  widthClassName?: string;
};

export function RoomHeader({
  actions,
  brandTo,
  center,
  title,
}: RoomHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-black/92 backdrop-blur-md">
      <div className="relative flex w-full items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <BrandMark to={brandTo} />
          {title ? (
            <>
              <div className="h-8 w-px bg-white/10" />
              {title}
            </>
          ) : null}
        </div>

        {center ? (
          <div className="absolute left-1/2 -translate-x-1/2">
            {center}
          </div>
        ) : null}

        {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
      </div>
    </header>
  );
}

const socketStatusClasses: Record<RoomSocketStatus, string> = {
  closed: "bg-white/30",
  connecting: "bg-amber-300",
  error: "bg-red-400",
  open: "bg-emerald-400",
  reconnecting: "bg-amber-300",
};

const socketStatusLabels: Record<RoomSocketStatus, string> = {
  closed: "Socket closed",
  connecting: "Socket connecting",
  error: "Socket error",
  open: "Socket connected",
  reconnecting: "Socket reconnecting",
};

export function SocketStatusDot({status}: {status: RoomSocketStatus}) {
  return (
    <span
      aria-label={socketStatusLabels[status]}
      className="inline-flex h-8 w-8 items-center justify-center"
      title={socketStatusLabels[status]}>
      <span
        className={`h-2.5 w-2.5 rounded-full ${socketStatusClasses[status]}`}
      />
    </span>
  );
}

export function RoomScreenShell({
  children,
  error,
  header,
  mobileSidebar,
  sidebar,
  widthClassName = "max-w-[1600px]",
}: RoomScreenShellProps) {
  return (
    <div className="flex min-h-screen w-full flex-col bg-black text-white">
      {header}
      <div className="flex w-full flex-1 gap-6 px-4 py-6 sm:px-6 lg:px-8">
        {sidebar ? <aside className="hidden w-60 shrink-0 lg:block">{sidebar}</aside> : null}
        <main className="min-w-0 flex-1">
          <div className={`mx-auto w-full ${widthClassName}`}>
            {mobileSidebar}
            {error ? (
              <StatusMessage tone="danger" className="mb-5">
                {error}
              </StatusMessage>
            ) : null}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export function RoomSidebarSection({
  children,
  title,
}: {
  children: ReactNode;
  title: ReactNode;
}) {
  return (
    <div className="sticky top-24 h-[calc(100vh-7.5rem)] border-r border-white/10 pr-6">
      <div className="pb-5">
        <Eyebrow className="text-white/45">{title}</Eyebrow>
      </div>
      <div className="h-[calc(100%-5.75rem)] overflow-y-auto">{children}</div>
    </div>
  );
}
