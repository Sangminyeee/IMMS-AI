"use client";

import { useState } from "react";
import type { InputHTMLAttributes } from "react";
import { MoaTextField } from "@/components/moa-ui/MoaTextField";

type MoaPasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  error?: string;
  label: string;
  wrapperClassName?: string;
};

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
      {hidden ? <path d="M4 4l16 16" strokeLinecap="round" /> : null}
    </svg>
  );
}

export function MoaPasswordField({ autoComplete, ...props }: MoaPasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <MoaTextField
      {...props}
      autoComplete={autoComplete}
      type={isVisible ? "text" : "password"}
      rightSlot={
        <button
          aria-label={isVisible ? "비밀번호 숨기기" : "비밀번호 보기"}
          className="flex h-7 w-7 items-center justify-center rounded-[8px] text-[var(--moa-muted)] transition hover:bg-[var(--moa-neutral-soft)] hover:text-[var(--moa-text)] lg:h-[clamp(28px,1vw,36px)] lg:w-[clamp(28px,1vw,36px)]"
          onClick={() => setIsVisible((current) => !current)}
          type="button"
        >
          <EyeIcon hidden={isVisible} />
        </button>
      }
    />
  );
}
