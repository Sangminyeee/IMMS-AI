import type { ButtonHTMLAttributes, ReactNode } from "react";
import { classNames } from "@/lib/classNames";

type MoaButtonVariant = "primary" | "brand" | "secondary" | "ghost" | "dark";
type MoaButtonSize = "sm" | "md" | "lg";

interface MoaButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  size?: MoaButtonSize;
  variant?: MoaButtonVariant;
}

const variantClasses: Record<MoaButtonVariant, string> = {
  primary:
    "border border-[var(--moa-primary)] bg-[var(--moa-primary)] text-white shadow-none hover:border-[var(--moa-primary-hover)] hover:bg-[var(--moa-primary-hover)]",
  brand:
    "border border-[var(--moa-brand)] bg-[var(--moa-brand)] text-white shadow-[0_14px_28px_rgba(207,60,177,0.18)] hover:border-[var(--moa-brand-strong)] hover:bg-[var(--moa-brand-strong)]",
  secondary:
    "border border-[var(--moa-border)] bg-white text-[var(--moa-text)] hover:border-[var(--moa-brand-soft-border)] hover:bg-[var(--moa-brand-soft)] hover:text-[var(--moa-brand-strong)]",
  ghost:
    "border border-transparent bg-transparent text-[var(--moa-muted)] hover:bg-[var(--moa-neutral-soft)] hover:text-[var(--moa-text)]",
  dark:
    "border border-[#242124] bg-[#242124] text-white shadow-[0_14px_28px_rgba(24,24,24,0.16)] hover:border-black hover:bg-black",
};

const sizeClasses: Record<MoaButtonSize, string> = {
  sm: "h-9 rounded-[10px] px-3 text-xs",
  md: "h-11 rounded-[12px] px-4 text-sm",
  lg: "h-[44px] rounded-[11px] px-5 text-[16px]",
};

export function MoaButton({
  children,
  className,
  disabled,
  fullWidth = false,
  leftIcon,
  rightIcon,
  size = "md",
  type = "button",
  variant = "primary",
  ...props
}: MoaButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={classNames(
        "inline-flex min-w-0 items-center justify-center gap-2 whitespace-nowrap font-semibold transition disabled:pointer-events-none disabled:border-[var(--moa-disabled)] disabled:bg-[var(--moa-disabled)] disabled:text-[var(--moa-muted)] disabled:shadow-none",
        sizeClasses[size],
        variantClasses[variant],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    >
      {leftIcon ? <span className="shrink-0">{leftIcon}</span> : null}
      <span className="truncate">{children}</span>
      {rightIcon ? <span className="shrink-0">{rightIcon}</span> : null}
    </button>
  );
}
