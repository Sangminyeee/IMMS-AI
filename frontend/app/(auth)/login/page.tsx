"use client";

import { useState } from "react";
import type { FormEventHandler } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  AuthPixelAccountLink,
  AuthPixelError,
  AuthPixelPasswordField,
  AuthPixelSocialLoginButtons,
  AuthPixelSubmitButton,
  AuthPixelTextField,
} from "@/components/layout/AuthPixelControls";
import { AuthTransitionLink } from "@/components/layout/AuthTransitionLink";
import { useAuthRenderMode } from "@/components/layout/AuthSplitLayout";
import { MoaButton } from "@/components/moa-ui/MoaButton";
import { MoaLoadingState } from "@/components/moa-ui/MoaLoadingState";
import { MoaPasswordField } from "@/components/moa-ui/MoaPasswordField";
import { MoaSocialLoginButtons } from "@/components/moa-ui/MoaSocialLoginButtons";
import { MoaTextField } from "@/components/moa-ui/MoaTextField";

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return fallback;
}

export default function LoginPage() {
  const renderMode = useAuthRenderMode();
  const router = useRouter();
  const { signIn, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await signIn(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(getErrorMessage(err, "로그인에 실패했습니다."));
    } finally {
      setLoading(false);
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
          top={499}
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
          top={661}
          value={password}
        />
        {error ? <AuthPixelError message={error} top={810} /> : null}
        <AuthPixelSubmitButton disabled={loading} top={873} type="submit">
          {loading ? "로그인 중..." : "로그인"}
        </AuthPixelSubmitButton>
        <AuthPixelAccountLink href="/register" label="계정이 없으신가요?" linkLabel="회원가입" top={973} />
        <AuthPixelSocialLoginButtons />
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

        <MoaButton type="submit" disabled={loading} fullWidth size="lg" className="!mt-[42px] !h-[38px] !rounded-[10px] !text-[13px]">
          {loading ? "로그인 중..." : "로그인"}
        </MoaButton>
      </form>

      <p className="mt-4 text-center text-[12px] leading-[17px] text-[var(--moa-muted)]">
        계정이 없으신가요?{" "}
        <AuthTransitionLink href="/register" className="font-bold text-[var(--moa-primary)] hover:text-[var(--moa-primary-hover)]">
          회원가입
        </AuthTransitionLink>
      </p>
      <MoaSocialLoginButtons />
    </>
  );
}
