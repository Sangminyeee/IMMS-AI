import { classNames } from "@/lib/classNames";

interface MoaLogoProps {
  className?: string;
  markClassName?: string;
  showText?: boolean;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "gap-2 text-base",
  md: "gap-2.5 text-xl",
  lg: "gap-3 text-2xl",
};

const markSizeClasses = {
  sm: "h-6 w-9",
  md: "h-8 w-12",
  lg: "h-10 w-14",
};

export function MoaLogo({ className, markClassName, showText = true, size = "md" }: MoaLogoProps) {
  return (
    <div className={classNames("inline-flex items-center font-black tracking-[-0.03em] text-[#181818]", sizeClasses[size], className)}>
      <svg
        aria-hidden="true"
        viewBox="0 0 64 42"
        className={classNames("shrink-0 text-[var(--moa-brand)]", markSizeClasses[size], markClassName)}
        fill="none"
      >
        <path d="M9 13.5 23.5 29" stroke="currentColor" strokeWidth="8.5" strokeLinecap="round" />
        <path d="M23.5 13.5 38 29" stroke="currentColor" strokeWidth="8.5" strokeLinecap="round" />
        <path d="M38 13.5 52.5 29" stroke="currentColor" strokeWidth="8.5" strokeLinecap="round" />
        <circle cx="57.5" cy="11" r="4.2" fill="currentColor" />
      </svg>
      {showText ? <span>MOA</span> : null}
    </div>
  );
}
