import type {ReactNode} from "react";
import type {PlayerAvatarId} from "@deckflix/shared";
import {cn} from "../../lib/cn";

type ProfileAvatarSize = "sm" | "md" | "lg" | "xl";

type ProfileAvatarProps = {
  avatarKey?: PlayerAvatarId;
  className?: string;
  colorKey?: string;
  displayName: string;
  iconKey?: PlayerAvatarId;
  imageUrl?: string;
  size?: ProfileAvatarSize;
};

const AVATAR_GRADIENTS = [
  "from-red-500 to-rose-700",
  "from-amber-400 to-orange-600",
  "from-emerald-400 to-teal-600",
  "from-sky-400 to-indigo-600",
  "from-fuchsia-400 to-purple-600",
  "from-pink-400 to-rose-600",
] as const;

const avatarSizes = {
  sm: "h-9 w-9 text-sm",
  md: "h-11 w-11 text-lg",
  lg: "h-14 w-14 text-xl",
  xl: "h-20 w-20 text-2xl",
};

const iconSizes = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
  xl: "h-9 w-9",
};

const playerAvatars: Record<
  PlayerAvatarId,
  {
    className: string;
    label: string;
    path: ReactNode;
  }
> = {
  bolt: {
    className: "from-sky-400 to-blue-700",
    label: "Bolt",
    path: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m13 2-7 12h5l-1 8 8-13h-5l0-7Z"
      />
    ),
  },
  camera: {
    className: "from-zinc-300 to-zinc-700",
    label: "Camera",
    path: (
      <>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 8.5A2.5 2.5 0 0 1 6.5 6H9l1.2-2h3.6L15 6h2.5A2.5 2.5 0 0 1 20 8.5v7A2.5 2.5 0 0 1 17.5 18h-11A2.5 2.5 0 0 1 4 15.5v-7Z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        />
      </>
    ),
  },
  crown: {
    className: "from-yellow-300 to-amber-700",
    label: "Crown",
    path: (
      <>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m4 8 4.5 4L12 5l3.5 7L20 8l-1.5 10h-13L4 8Z"
        />
        <path strokeLinecap="round" d="M6.5 21h11" />
      </>
    ),
  },
  ghost: {
    className: "from-violet-300 to-purple-700",
    label: "Ghost",
    path: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 20V10a7 7 0 0 1 14 0v10l-2.3-1.6L14.4 20 12 18.4 9.6 20l-2.3-1.6L5 20Zm5-9h.01M14 11h.01"
      />
    ),
  },
  heart: {
    className: "from-pink-400 to-rose-700",
    label: "Heart",
    path: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.4 5.6a5 5 0 0 0-7.1 0L12 6.9l-1.3-1.3a5 5 0 0 0-7.1 7.1L12 21l8.4-8.3a5 5 0 0 0 0-7.1Z"
      />
    ),
  },
  kid: {
    className: "from-lime-300 to-green-700",
    label: "Kid",
    path: (
      <>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M7 11a5 5 0 0 1 10 0v2a5 5 0 0 1-10 0v-2Z"
        />
        <path strokeLinecap="round" d="M9 10h.01M15 10h.01" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 14c1.3 1 3.7 1 5 0" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.5c.8-1.7 2.8-2.8 5-2.2" />
      </>
    ),
  },
  popcorn: {
    className: "from-red-500 to-yellow-500",
    label: "Popcorn",
    path: (
      <>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M7 9h10l-1.2 11H8.2L7 9Z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8 9c-.8-.5-1.2-1.2-1.2-2 0-1.3 1-2.3 2.3-2.3.3-1.1 1.2-1.9 2.4-1.9.8 0 1.5.4 2 1 1.6-.5 3.1.7 3.1 2.3 1.1.2 1.9 1.1 1.9 2.2 0 .3-.1.5-.2.7"
        />
        <path strokeLinecap="round" d="M10 12.5v4.5M14 12.5v4.5" />
      </>
    ),
  },
  robot: {
    className: "from-cyan-300 to-slate-700",
    label: "Robot",
    path: (
      <>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M7 9h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z"
        />
        <path strokeLinecap="round" d="M12 5v4M9 14h.01M15 14h.01" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 17h4" />
      </>
    ),
  },
  rocket: {
    className: "from-orange-400 to-red-700",
    label: "Rocket",
    path: (
      <>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M14 4c2.5.2 4.4 2.1 4.6 4.6L12 15.2 8.8 12 14 4Z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.8 12 5 13l2.4 2.4L8.8 12ZM12 15.2 11 19l2.4-2.4L12 15.2Z" />
        <path strokeLinecap="round" d="M6 18l-2 2M7.5 20.5l-1 1" />
      </>
    ),
  },
  smile: {
    className: "from-blue-300 to-indigo-700",
    label: "Smile",
    path: (
      <>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"
        />
        <path strokeLinecap="round" d="M9 10h.01M15 10h.01" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 14.5c1.8 2 5.2 2 7 0" />
      </>
    ),
  },
  star: {
    className: "from-amber-300 to-orange-700",
    label: "Star",
    path: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m12 3 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7L6.8 19l1-5.8-4.2-4.1 5.8-.8L12 3Z"
      />
    ),
  },
  ticket: {
    className: "from-emerald-400 to-teal-700",
    label: "Ticket",
    path: (
      <>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 9V6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5V9a3 3 0 0 0 0 6v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5V15a3 3 0 0 0 0-6Z"
        />
        <path strokeLinecap="round" d="M12 7v1.5M12 11.25v1.5M12 15.5V17" />
      </>
    ),
  },
};

const getInitial = (displayName: string) =>
  displayName.trim().charAt(0).toUpperCase() || "?";

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
};

const getAvatarGradient = (value: string) =>
  AVATAR_GRADIENTS[hashString(value) % AVATAR_GRADIENTS.length];

function ProfileIcon({
  avatarKey,
  className,
  iconKey,
  size = "md",
}: {
  avatarKey?: PlayerAvatarId;
  className?: string;
  iconKey?: PlayerAvatarId;
  size?: ProfileAvatarSize;
}) {
  const avatar = playerAvatars[avatarKey ?? iconKey ?? "smile"];

  return (
    <span
      aria-label={avatar.label}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-sm bg-gradient-to-br text-white",
        avatarSizes[size],
        avatar.className,
        className,
      )}
      title={avatar.label}>
      <svg
        aria-hidden="true"
        className={iconSizes[size]}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="2">
        {avatar.path}
      </svg>
    </span>
  );
}

export const PlayerAvatarImage = ProfileIcon;

export function ProfileAvatar({
  avatarKey,
  className,
  colorKey,
  displayName,
  iconKey,
  imageUrl,
  size = "md",
}: ProfileAvatarProps) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={displayName}
        className={cn(
          "shrink-0 rounded-sm object-cover",
          avatarSizes[size],
          className,
        )}
      />
    );
  }

  const resolvedAvatarKey = avatarKey ?? iconKey;
  if (resolvedAvatarKey) {
    return (
      <PlayerAvatarImage
        avatarKey={resolvedAvatarKey}
        className={className}
        size={size}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-sm bg-gradient-to-br font-semibold text-white",
        getAvatarGradient(colorKey ?? iconKey ?? displayName),
        avatarSizes[size],
        className,
      )}>
      {getInitial(displayName)}
    </div>
  );
}
