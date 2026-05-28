import type { ButtonHTMLAttributes } from "react";

type MoaGuestLoginButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
};

function GuestIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none">
      <path d="M12 12.2a3.9 3.9 0 1 0 0-7.8 3.9 3.9 0 0 0 0 7.8Z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4.9 20.1c.8-3.1 3.5-5.1 7.1-5.1s6.3 2 7.1 5.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function MoaGuestLoginButton({ disabled, loading, ...props }: MoaGuestLoginButtonProps) {
  return (
    <div className="mt-[30px] lg:mt-[clamp(30px,5vh,68px)]">
      <div className="flex items-center gap-4">
        <span className="h-px flex-1 bg-[#d7d7d7]" />
        <span className="text-[11px] font-medium leading-4 text-[#777] lg:text-[clamp(11px,1vw,20px)] lg:leading-[163%]">간편 로그인</span>
        <span className="h-px flex-1 bg-[#d7d7d7]" />
      </div>
      <button
        {...props}
        className="mt-[22px] flex h-[42px] w-full items-center justify-center gap-2 rounded-[10px] border border-[#d6d6d6] bg-white text-[13px] font-bold text-[var(--moa-auth-text)] transition hover:border-[#bdbdbd] hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:bg-[#f4f4f4] disabled:text-[var(--moa-disabled-text)]"
        disabled={disabled || loading}
        type="button"
      >
        <GuestIcon />
        <span>{loading ? "게스트 로그인 중..." : "게스트로 시작하기"}</span>
      </button>
    </div>
  );
}
