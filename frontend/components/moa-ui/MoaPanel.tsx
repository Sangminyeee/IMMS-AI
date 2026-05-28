import type { HTMLAttributes, ReactNode } from "react";
import { classNames } from "@/lib/classNames";

interface MoaPanelProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  padded?: boolean;
}

export function MoaPanel({ children, className, padded = true, ...props }: MoaPanelProps) {
  return (
    <section
      className={classNames(
        "min-w-0 border-[var(--moa-border)] bg-white text-[var(--moa-text)]",
        padded && "p-6",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}
