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

type AuthPixelGuestLoginButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
};

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

function GuestIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none">
      <path d="M12 12.2a3.9 3.9 0 1 0 0-7.8 3.9 3.9 0 0 0 0 7.8Z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4.9 20.1c.8-3.1 3.5-5.1 7.1-5.1s6.3 2 7.1 5.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function AuthPixelGuestLoginButton({ disabled, loading, ...props }: AuthPixelGuestLoginButtonProps) {
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
      <button
        {...props}
        className="absolute flex h-[54px] w-[493px] items-center justify-center gap-[10px] rounded-[12px] border border-[#c7c7c7] bg-white text-[17px] font-bold leading-[24px] tracking-normal text-[var(--moa-auth-text)] transition hover:border-[#8f8f8f] hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:border-[#d8d8d8] disabled:bg-[#f4f4f4] disabled:text-[var(--moa-disabled-text)]"
        disabled={disabled || loading}
        style={{ left: AUTH_FIELD_LEFT, top: 847 }}
        type="button"
      >
        <GuestIcon className="h-[22px] w-[22px]" />
        <span className="text-[17px] font-bold leading-[24px] tracking-normal">
          {loading ? "게스트 로그인 중..." : "게스트로 시작하기"}
        </span>
      </button>
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
