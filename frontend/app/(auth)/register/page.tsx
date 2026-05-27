"use client";

import { useState } from "react";
import type { FormEventHandler } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  AuthPixelAccountLink,
  AuthPixelError,
  AuthPixelPasswordField,
  AuthPixelSubmitButton,
  AuthPixelTextField,
} from "@/components/layout/AuthPixelControls";
import { AuthTransitionLink } from "@/components/layout/AuthTransitionLink";
import { useAuthRenderMode } from "@/components/layout/AuthSplitLayout";
import { MoaButton } from "@/components/moa-ui/MoaButton";
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

export default function RegisterPage() {
  const renderMode = useAuthRenderMode();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { signUp } = useAuth();

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    if (!email || !password || !passwordConfirm || !fullName) {
      setError("모든 필드를 입력해주세요.");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("비밀번호는 최소 6자 이상이어야 합니다.");
      setLoading(false);
      return;
    }

    if (password !== passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
      setLoading(false);
      return;
    }

    const { error: signUpError } = await signUp(email, password, fullName);

    if (signUpError) {
      setError(getErrorMessage(signUpError, "회원가입에 실패했습니다."));
      setLoading(false);
    } else {
      router.push("/dashboard");
    }
  };

  if (renderMode === "desktop") {
    return (
      <form onSubmit={handleSubmit}>
        <AuthPixelTextField
          id="desktop-fullName"
          autoComplete="name"
          label="이름"
          onChange={(event) => setFullName(event.target.value)}
          placeholder="홍길동"
          required
          top={438}
          type="text"
          value={fullName}
        />
        <AuthPixelTextField
          id="desktop-register-email"
          autoComplete="email"
          label="이메일"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="example@email.com"
          required
          top={602}
          type="email"
          value={email}
        />
        <AuthPixelPasswordField
          id="desktop-register-password"
          autoComplete="new-password"
          label="비밀번호"
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          required
          top={766}
          value={password}
        />
        <AuthPixelPasswordField
          id="desktop-register-passwordConfirm"
          autoComplete="new-password"
          label="비밀번호 확인"
          onChange={(event) => setPasswordConfirm(event.target.value)}
          placeholder="••••••••"
          required
          top={930}
          value={passwordConfirm}
        />
        {error ? <AuthPixelError message={error} top={1064} /> : null}
        <AuthPixelSubmitButton disabled={loading} top={1134} type="submit">
          {loading ? "가입 중..." : "회원가입!"}
        </AuthPixelSubmitButton>
        <AuthPixelAccountLink href="/login" label="이미 계정이 있으신가요?" linkLabel="로그인" top={1241} />
      </form>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-[14px]">
        <MoaTextField
          id="fullName"
          autoComplete="name"
          label="이름"
          onChange={(event) => setFullName(event.target.value)}
          placeholder="홍길동"
          required
          type="text"
          value={fullName}
        />

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
          autoComplete="new-password"
          label="비밀번호"
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          required
          value={password}
        />

        <MoaPasswordField
          id="passwordConfirm"
          autoComplete="new-password"
          label="비밀번호 확인"
          onChange={(event) => setPasswordConfirm(event.target.value)}
          placeholder="••••••••"
          required
          value={passwordConfirm}
        />

        {error ? <div className="rounded-[12px] border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div> : null}

        <MoaButton type="submit" disabled={loading} fullWidth size="lg" className="!mt-[28px] !h-[38px] !rounded-[10px] !text-[13px]">
          {loading ? "가입 중..." : "회원가입"}
        </MoaButton>
      </form>

      <p className="mt-4 text-center text-[12px] leading-[17px] text-[var(--moa-muted)]">
        이미 계정이 있으신가요?{" "}
        <AuthTransitionLink href="/login" className="font-bold text-[var(--moa-primary)] hover:text-[var(--moa-primary-hover)]">
          로그인
        </AuthTransitionLink>
      </p>
    </>
  );
}
