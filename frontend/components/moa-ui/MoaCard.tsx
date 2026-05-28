import type { HTMLAttributes, ReactNode } from "react";
import { classNames } from "@/lib/classNames";

interface MoaCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padded?: boolean;
}

export function MoaCard({ children, className, padded = true, ...props }: MoaCardProps) {
  return (
    <div
      className={classNames(
        "rounded-[16px] border border-[var(--moa-border)] bg-white shadow-[var(--moa-shadow-card)]",
        padded && "p-5",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
