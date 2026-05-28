import { classNames } from "@/lib/classNames";

export interface MoaAvatar {
  color?: string;
  id: string;
  label: string;
}

interface MoaAvatarStackProps {
  avatars: MoaAvatar[];
  className?: string;
  maxVisible?: number;
}

const fallbackColors = [
  "var(--moa-primary)",
  "var(--moa-accent)",
  "var(--moa-logo-text)",
  "var(--moa-primary-border)",
  "var(--moa-primary-strong)",
];

export function MoaAvatarStack({ avatars, className, maxVisible = 5 }: MoaAvatarStackProps) {
  const visibleAvatars = avatars.slice(0, maxVisible);
  const hiddenCount = Math.max(0, avatars.length - visibleAvatars.length);

  return (
    <div className={classNames("flex items-center", className)}>
      {visibleAvatars.map((avatar, index) => (
        <span
          key={avatar.id}
          className="-ml-2 flex h-9 w-9 first:ml-0 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-sm"
          style={{ backgroundColor: avatar.color || fallbackColors[index % fallbackColors.length] }}
          title={avatar.label}
        >
          {avatar.label.slice(0, 2).toUpperCase()}
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span className="-ml-2 flex h-9 min-w-9 items-center justify-center rounded-full border-2 border-white bg-[var(--moa-neutral-soft)] px-2 text-xs font-semibold text-[var(--moa-muted)]">
          +{hiddenCount}
        </span>
      ) : null}
    </div>
  );
}
