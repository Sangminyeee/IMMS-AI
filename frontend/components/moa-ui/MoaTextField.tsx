import type { InputHTMLAttributes, ReactNode } from "react";
import { classNames } from "@/lib/classNames";

interface MoaTextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  label: string;
  rightSlot?: ReactNode;
  wrapperClassName?: string;
}

export function MoaTextField({ className, error, id, label, rightSlot, wrapperClassName, ...props }: MoaTextFieldProps) {
  return (
    <label className={classNames("block", wrapperClassName)} htmlFor={id}>
      <span className="mb-[6px] block text-[13px] font-bold leading-[18px] text-[var(--moa-text-body)] lg:mb-[clamp(6px,1vh,13px)] lg:text-[clamp(13px,1vw,26px)] lg:leading-[143%]">{label}</span>
      <span
        className={classNames(
          "flex h-[38px] items-center rounded-[10px] border bg-[var(--moa-surface-muted)] px-5 transition focus-within:border-[#bdbdbd] focus-within:bg-white focus-within:ring-4 focus-within:ring-[var(--moa-primary-soft)] lg:h-[clamp(38px,5vh,74px)] lg:rounded-[clamp(10px,1vw,19px)] lg:px-[clamp(20px,2vw,44px)]",
          error ? "border-red-300" : "border-[var(--moa-border)]",
        )}
      >
        <input
          id={id}
          className={classNames(
            "h-full min-w-0 flex-1 bg-transparent text-[13px] font-semibold text-[var(--moa-text-body)] outline-none placeholder:text-[#5c5c5c] lg:text-[clamp(13px,1vw,26px)]",
            className,
          )}
          {...props}
        />
        {rightSlot ? <span className="ml-2 shrink-0">{rightSlot}</span> : null}
      </span>
      {error ? <span className="mt-2 block text-xs font-medium text-red-600">{error}</span> : null}
    </label>
  );
}
