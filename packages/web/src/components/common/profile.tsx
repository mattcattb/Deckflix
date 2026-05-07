import type {ReactNode} from "react";
import {cn} from "../../lib/cn";

type ProfileAvatarSize = "sm" | "md" | "lg";

type ProfileAvatarProps = {
  className?: string;
  colorKey?: string;
  displayName: string;
  iconKey?: string;
  imageUrl?: string;
  size?: ProfileAvatarSize;
};

type ProfileIdentityProps = ProfileAvatarProps & {
  avatarClassName?: string;
  avatarSize?: ProfileAvatarSize;
  subtitle?: ReactNode;
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

export function ProfileAvatar({
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

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-sm bg-gradient-to-br font-semibold text-white",
        getAvatarGradient(colorKey ?? iconKey ?? displayName),
        avatarSizes[size],
        className,
      )}>
      {iconKey ? iconKey.slice(0, 1).toUpperCase() : getInitial(displayName)}
    </div>
  );
}

export function ProfileIdentity({
  avatarClassName,
  avatarSize = "md",
  className,
  colorKey,
  displayName,
  iconKey,
  imageUrl,
  subtitle,
}: ProfileIdentityProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <ProfileAvatar
        className={avatarClassName}
        colorKey={colorKey}
        displayName={displayName}
        iconKey={iconKey}
        imageUrl={imageUrl}
        size={avatarSize}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-white">
          {displayName}
        </div>
        {subtitle ? (
          <div className="mt-0.5 truncate text-xs text-white/45">{subtitle}</div>
        ) : null}
      </div>
    </div>
  );
}
