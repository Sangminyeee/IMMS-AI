"use client";

import { useState } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { AuthTransitionLink } from "@/components/layout/AuthTransitionLink";

const AUTH_FIELD_LEFT = 1198;
const AUTH_FIELD_WIDTH = 493;
const AUTH_FIELD_INPUT_TOP = 31;
const AUTH_FIELD_INPUT_HEIGHT = 54;

type AuthPixelTextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  label: string;
  top: number;
};

type AuthPixelPasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "type"> & {
  label: string;
  top: number;
};

type AuthPixelSubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  top: number;
};

type AuthPixelAccountLinkProps = {
  href: string;
  label: string;
  linkLabel: string;
  top: number;
};

type AuthPixelErrorProps = {
  message: string;
  top: number;
};

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[29px] w-[29px]">
      <path fill="#4285F4" d="M22.1 12.25c0-.77-.07-1.5-.2-2.2H12v4.15h5.65a4.84 4.84 0 0 1-2.1 3.18v2.64h3.4c1.99-1.83 3.15-4.53 3.15-7.77Z" />
      <path fill="#34A853" d="M12 22c2.84 0 5.23-.94 6.97-2.55l-3.4-2.64c-.94.63-2.14 1-3.57 1-2.74 0-5.06-1.85-5.9-4.34H2.6v2.72A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.1 13.47A6 6 0 0 1 5.78 12c0-.5.08-1 .22-1.47V7.81H2.6A10 10 0 0 0 2 12c0 1.61.39 3.13 1.1 4.19l3-2.72Z" />
      <path fill="#EA4335" d="M12 6.18c1.55 0 2.93.53 4.02 1.57l3.02-3.02A10 10 0 0 0 12 2a10 10 0 0 0-9.4 6.19l3.5 2.72c.84-2.49 3.16-4.73 5.9-4.73Z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[36px] w-[36px]" fill="currentColor" style={{ transform: "translate(-1px, -2px)" }}>
      <path d="M16.53 12.78c-.02-2.24 1.83-3.31 1.91-3.36-1.04-1.52-2.65-1.73-3.22-1.75-1.37-.14-2.68.81-3.37.81-.7 0-1.78-.79-2.93-.77-1.51.02-2.9.88-3.68 2.23-1.57 2.73-.4 6.77 1.13 8.98.75 1.08 1.64 2.3 2.81 2.25 1.13-.04 1.56-.73 2.92-.73 1.37 0 1.75.73 2.94.71 1.21-.02 1.98-1.1 2.72-2.19.86-1.25 1.21-2.47 1.23-2.53-.03-.01-2.37-.91-2.42-3.65ZM14.32 6.22c.62-.75 1.04-1.79.92-2.83-.89.04-1.97.59-2.61 1.34-.57.66-1.07 1.72-.94 2.73.99.08 2-.5 2.63-1.24Z" />
    </svg>
  );
}

function KakaoIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 28 28" className="h-[43px] w-[43px]" fill="none">
      <path fill="#111" d="M14 5.25c-5.1 0-9.25 3.2-9.25 7.14 0 2.52 1.69 4.73 4.24 6l-.68 2.46c-.1.38.33.69.66.47l3.02-2.02c.64.12 1.31.19 2.01.19 5.1 0 9.25-3.2 9.25-7.1 0-3.94-4.15-7.14-9.25-7.14Z" />
      <path fill="#fff" d="M8.27 12.24h1.06v3.02h.88v-3.02h1.06v-.73h-3v.73Zm5.54-.73h-.93l-1.19 3.75h.86l.19-.66h1.18l.19.66h.89l-1.19-3.75Zm-.87 2.37.39-1.38.39 1.38h-.78Zm3.5-2.37h-.87v3.75h2.38v-.74h-1.51v-3.01Zm4.04 0h-1.02l-1.13 1.53v-1.53h-.87v3.75h.87v-1.1l.37-.47.85 1.57h1.01l-1.29-2.25 1.2-1.5Z" />
    </svg>
  );
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[24px] w-[24px]" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
      {hidden ? <path d="M4 4l16 16" strokeLinecap="round" /> : null}
    </svg>
  );
}

export function AuthPixelTextField({ id, label, top, ...props }: AuthPixelTextFieldProps) {
  return (
    <label className="absolute block" htmlFor={id} style={{ height: 85, left: AUTH_FIELD_LEFT, top, width: AUTH_FIELD_WIDTH }}>
      <span className="block text-[20px] font-bold leading-[28px] tracking-normal text-[var(--moa-auth-text)]">{label}</span>
      <span
        className="absolute left-0 flex items-center rounded-[12px] bg-[var(--moa-auth-input-bg)] px-[31px] transition focus-within:border-[var(--moa-auth-field-border-focus)]"
        style={{ backgroundColor: "var(--moa-auth-input-bg)", borderColor: "var(--moa-auth-field-border)", borderStyle: "solid", borderWidth: 1, height: AUTH_FIELD_INPUT_HEIGHT, top: AUTH_FIELD_INPUT_TOP, width: AUTH_FIELD_WIDTH }}
      >
        <input
          {...props}
          id={id}
          className="auth-pixel-input h-full min-w-0 flex-1 bg-transparent text-[18px] font-medium leading-[26px] tracking-normal text-[var(--moa-auth-text)] outline-none placeholder:text-[var(--moa-auth-text)]"
          style={{ backgroundColor: "transparent", color: "var(--moa-auth-text)", fontSize: 18, fontWeight: 500, lineHeight: "26px" }}
        />
      </span>
    </label>
  );
}

export function AuthPixelPasswordField({ autoComplete, id, label, top, ...props }: AuthPixelPasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <label className="absolute block" htmlFor={id} style={{ height: 85, left: AUTH_FIELD_LEFT, top, width: AUTH_FIELD_WIDTH }}>
      <span className="block text-[20px] font-bold leading-[28px] tracking-normal text-[var(--moa-auth-text)]">{label}</span>
      <span
        className="absolute left-0 flex items-center rounded-[12px] bg-[var(--moa-auth-input-bg)] pl-[31px] pr-[66px] transition focus-within:border-[var(--moa-auth-field-border-focus)]"
        style={{ backgroundColor: "var(--moa-auth-input-bg)", borderColor: "var(--moa-auth-field-border)", borderStyle: "solid", borderWidth: 1, height: AUTH_FIELD_INPUT_HEIGHT, top: AUTH_FIELD_INPUT_TOP, width: AUTH_FIELD_WIDTH }}
      >
        <input
          {...props}
          autoComplete={autoComplete}
          id={id}
          type={isVisible ? "text" : "password"}
          className="auth-pixel-input h-full min-w-0 flex-1 bg-transparent text-[18px] font-medium leading-[26px] tracking-normal text-[var(--moa-auth-text)] outline-none placeholder:text-[var(--moa-auth-text)]"
          style={{ backgroundColor: "transparent", color: "var(--moa-auth-text)", fontSize: 18, fontWeight: 500, lineHeight: "26px" }}
        />
      </span>
      <button
        aria-label={isVisible ? "비밀번호 숨기기" : "비밀번호 보기"}
        className="absolute right-[22px] top-[47px] flex h-[24px] w-[24px] items-center justify-center text-[#8e8e8e] transition hover:text-[var(--moa-auth-text)]"
        onClick={() => setIsVisible((current) => !current)}
        type="button"
      >
        <EyeIcon hidden={isVisible} />
      </button>
    </label>
  );
}

export function AuthPixelSubmitButton({ children, disabled, top, ...props }: AuthPixelSubmitButtonProps) {
  return (
    <button
      {...props}
      className="absolute flex h-[55px] w-[493px] items-center justify-center rounded-[12px] bg-[image:var(--moa-auth-button-gradient)] text-[17px] font-bold leading-[24px] tracking-normal text-white transition hover:brightness-95 disabled:bg-none disabled:bg-[var(--moa-disabled)] disabled:text-[var(--moa-disabled-text)]"
      disabled={disabled}
      style={{ color: disabled ? "var(--moa-disabled-text)" : "#ffffff", fontSize: 17, fontWeight: 700, left: AUTH_FIELD_LEFT, lineHeight: "24px", top }}
    >
      {children}
    </button>
  );
}

export function AuthPixelAccountLink({ href, label, linkLabel, top }: AuthPixelAccountLinkProps) {
  return (
    <p className="absolute m-0 w-[493px] text-center text-[17px] font-normal leading-[24px] tracking-normal text-[var(--moa-auth-muted)]" style={{ left: AUTH_FIELD_LEFT, top }}>
      {label}{" "}
      <AuthTransitionLink className="font-bold text-[var(--moa-primary-strong)] hover:text-[var(--moa-primary-hover)]" href={href}>
        {linkLabel}
      </AuthTransitionLink>
    </p>
  );
}

export function AuthPixelSocialLoginButtons() {
  return (
    <>
      <div className="absolute h-px w-[196px] bg-[var(--moa-auth-field-border)]" style={{ left: AUTH_FIELD_LEFT, top: 808 }} />
      <div className="absolute h-px w-[196px] bg-[var(--moa-auth-field-border)]" style={{ left: 1495, top: 808 }} />
      <span
        className="absolute bg-[var(--moa-bg)] px-[20px] text-[17px] font-normal leading-[24px] tracking-normal text-[var(--moa-auth-muted)]"
        style={{ left: 1393, top: 796 }}
      >
        간편 로그인
      </span>
      {[
        { icon: <GoogleIcon />, label: "Google 로그인", left: 1295 },
        { icon: <AppleIcon />, label: "Apple 로그인", left: 1418 },
        { icon: <KakaoIcon />, label: "Kakao 로그인", left: 1538 },
      ].map((item) => (
        <button
          aria-label={item.label}
          className="absolute flex h-[54px] w-[54px] items-center justify-center rounded-full border border-[#c7c7c7] bg-white text-black transition hover:border-[#9f9f9f] hover:bg-[#fafafa]"
          key={item.label}
          style={{ left: item.left, top: 847 }}
          type="button"
        >
          {item.icon}
        </button>
      ))}
    </>
  );
}

export function AuthPixelError({ message, top }: AuthPixelErrorProps) {
  return (
    <div
      className="absolute rounded-[12px] border border-red-200 bg-red-50 px-[18px] py-[11px] text-[15px] font-medium leading-[22px] tracking-normal text-red-700"
      style={{ left: AUTH_FIELD_LEFT, top, width: AUTH_FIELD_WIDTH }}
    >
      {message}
    </div>
  );
}
