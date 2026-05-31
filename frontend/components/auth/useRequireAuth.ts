"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

function getCurrentPath() {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}

function buildLoginRedirectPath(nextPath: string) {
  return `/login?next=${encodeURIComponent(nextPath)}`;
}

export function useRequireAuth() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading || user) return;
    router.replace(buildLoginRedirectPath(getCurrentPath()));
  }, [loading, router, user]);

  return {
    authenticated: Boolean(user),
    checkingAuth: loading || !user,
    user,
  };
}
