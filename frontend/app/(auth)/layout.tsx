import type { ReactNode } from "react";
import { AuthSplitLayout } from "@/components/layout/AuthSplitLayout";

interface AuthLayoutProps {
  children: ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return <AuthSplitLayout>{children}</AuthSplitLayout>;
}
