"use client";

import { useState } from "react";
import type { FormEventHandler } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  AuthPixelAccountLink,
  AuthPixelError,
  AuthPixelGuestLoginButton,
  AuthPixelPasswordField,
  AuthPixelSubmitButton,
  AuthPixelTextField,
} from "@/components/layout/AuthPixelControls";
import { AuthTransitionLink } from "@/components/layout/AuthTransitionLink";
import { useAuthRenderMode } from "@/components/layout/AuthSplitLayout";
import { MoaButton } from "@/components/moa-ui/MoaButton";
import { MoaGuestLoginButton } from "@/components/moa-ui/MoaSocialLoginButtons";
import { MoaLoadingState } from "@/components/moa-ui/MoaLoadingState";
import { MoaPasswordField } from "@/components/moa-ui/MoaPasswordField";
import { MoaTextField } from "@/components/moa-ui/MoaTextField";

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return fallback;
}

function getGuestLoginErrorMessage(error: unknown) {
  const message = getErrorMessage(error, "");
  const normalized = [
    message,
    typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : "",
    typeof error === "object" && error !== null && "error_code" in error ? (error as { error_code?: unknown }).error_code : "",
    String(error || ""),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    normalized.includes("anonymous") ||
    normalized.includes("disabled") ||
    normalized.includes("not allowed") ||
    normalized.includes("not enabled") ||
    normalized.includes("forbidden") ||
    normalized.includes("403")
  ) {
    return "관리자가 게스트 로그인을 비활성화했습니다. 관리자에게 문의해 주세요.";
  }

  return message || "게스트 로그인에 실패했습니다.";
}

export default function LoginPage() {
  const renderMode = useAuthRenderMode();
  const router = useRouter();
  const { signIn, signInGuest, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { error: signInError } = await signIn(email, password);
      if (signInError) {
        setError(getErrorMessage(signInError, "로그인에 실패했습니다."));
        return;
      }
      router.push("/dashboard");
    } catch (err) {
      setError(getErrorMessage(err, "로그인에 실패했습니다."));
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setError("");
    setGuestLoading(true);

    try {
      const { error: guestError } = await signInGuest();
      if (guestError) {
        setError(getGuestLoginErrorMessage(guestError));
        return;
      }
      router.push("/dashboard");
    } catch (err) {
      setError(getGuestLoginErrorMessage(err));
    } finally {
      setGuestLoading(false);
    }
  };

  if (authLoading) {
    return <MoaLoadingState label="로딩 중..." />;
  }

  if (renderMode === "desktop") {
    return (
      <form onSubmit={handleSubmit}>
        <AuthPixelTextField
          id="desktop-email"
          autoComplete="email"
          label="이메일"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="example@email.com"
          required
          top={397}
          type="email"
          value={email}
        />
        <AuthPixelPasswordField
          id="desktop-password"
          autoComplete="current-password"
          label="비밀번호"
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          required
          top={516}
          value={password}
        />
        {error ? <AuthPixelError message={error} top={610} /> : null}
        <AuthPixelSubmitButton disabled={loading || guestLoading} top={664} type="submit">
          {loading ? "로그인 중..." : "로그인"}
        </AuthPixelSubmitButton>
        <AuthPixelAccountLink href="/register" label="계정이 없으신가요?" linkLabel="회원가입" top={744} />
        <AuthPixelGuestLoginButton disabled={loading} loading={guestLoading} onClick={handleGuestLogin} />
      </form>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-[18px]">
        <MoaTextField
          id="email"
          autoComplete="email"
          label="이메일"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="example@email.com"
          required
          type="email"
          value={email}
        />

        <MoaPasswordField
          id="password"
          autoComplete="current-password"
          label="비밀번호"
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          required
          value={password}
        />

        {error ? <div className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div> : null}

        <MoaButton type="submit" disabled={loading || guestLoading} fullWidth size="lg" className="!mt-[42px] !h-[38px] !rounded-[10px] !text-[13px]">
          {loading ? "로그인 중..." : "로그인"}
        </MoaButton>
      </form>

      <p className="mt-4 text-center text-[12px] leading-[17px] text-[var(--moa-muted)]">
        계정이 없으신가요?{" "}
        <AuthTransitionLink href="/register" className="font-bold text-[var(--moa-primary)] hover:text-[var(--moa-primary-hover)]">
          회원가입
        </AuthTransitionLink>
      </p>
      <MoaGuestLoginButton disabled={loading} loading={guestLoading} onClick={handleGuestLogin} />
    </>
  );
}
