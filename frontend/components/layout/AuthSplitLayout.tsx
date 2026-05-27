"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { MoaLogo } from "@/components/moa-ui/MoaLogo";

type AuthScreen = "login" | "register";
type AuthRenderMode = "desktop" | "mobile";

interface AuthSplitLayoutProps {
  children: ReactNode;
}

interface AuthScreenCopy {
  description: string;
  title: string;
}

const AUTH_STAGE_WIDTH = 1920;
const AUTH_STAGE_HEIGHT = 1080;

const AUTH_SCREEN_COPY: Record<AuthScreen, AuthScreenCopy> = {
  login: {
    title: "MOA에 로그인하기",
    description: "흩어진 아이디어를 모아, 하나의 흐름이 되도록.",
  },
  register: {
    title: "MOA 시작하기",
    description: "생각을 모을 준비, 이름과 이메일만으로 충분하도록.",
  },
};

const AUTH_CONTENT_LEFT = 1198;

const AUTH_HEADER_POSITIONS: Record<AuthScreen, { logoTop: number; titleTop: number; descriptionTop: number }> = {
  login: {
    logoTop: 208,
    titleTop: 269,
    descriptionTop: 321,
  },
  register: {
    logoTop: 145,
    titleTop: 206,
    descriptionTop: 258,
  },
};

const AuthRenderModeContext = createContext<AuthRenderMode>("desktop");

export function useAuthRenderMode() {
  return useContext(AuthRenderModeContext);
}

function useAuthStageScale() {
  const [scale, setScale] = useState<number | null>(null);

  useEffect(() => {
    const updateScale = () => {
      setScale(Math.min(1, window.innerWidth / AUTH_STAGE_WIDTH, window.innerHeight / AUTH_STAGE_HEIGHT));
    };

    updateScale();
    window.addEventListener("resize", updateScale);

    return () => {
      window.removeEventListener("resize", updateScale);
    };
  }, []);

  return scale;
}

function getAuthScreen(pathname: string | null): AuthScreen {
  return pathname?.startsWith("/register") ? "register" : "login";
}

export function AuthSplitLayout({ children }: AuthSplitLayoutProps) {
  const stageScale = useAuthStageScale();
  const pathname = usePathname();
  const screen = getAuthScreen(pathname);
  const { description, title } = AUTH_SCREEN_COPY[screen];
  const headerPosition = AUTH_HEADER_POSITIONS[screen];
  const stageStyle: CSSProperties = {
    "--auth-stage-scale": stageScale ?? 1,
  } as CSSProperties;

  return (
    <main className="min-h-screen overflow-hidden bg-[var(--moa-bg)] text-[var(--moa-text)]">
      <div className="relative min-h-screen w-full overflow-hidden">
        <div
          className="auth-stage relative min-h-screen w-full opacity-0 transition-opacity duration-150 data-[ready=true]:opacity-100 lg:absolute lg:left-1/2 lg:top-1/2 lg:min-h-0 lg:origin-center"
          data-ready={stageScale !== null}
          style={stageStyle}
        >
          <div className="hidden lg:block">
            <section
              className="absolute overflow-hidden rounded-[30px] bg-[var(--moa-primary)] bg-cover bg-center text-white"
              style={{ backgroundImage: "url('/figma-assets/auth-visual-blue.png')", height: 1010, left: 28, top: 35, width: 934 }}
            />

            <div className="absolute" style={{ left: AUTH_CONTENT_LEFT, top: headerPosition.logoTop }}>
              <MoaLogo showText={false} markClassName="h-[33px] w-[54px]" />
            </div>
            <div className="auth-route-copy" key={`desktop-copy-${screen}`}>
              <h2
                className="absolute tracking-normal text-[var(--moa-auth-title)]"
                style={{ fontSize: 48, fontWeight: 700, left: AUTH_CONTENT_LEFT, lineHeight: "58px", top: headerPosition.titleTop }}
              >
                {title}
              </h2>
              <p
                className="absolute tracking-normal text-[var(--moa-auth-muted)]"
                style={{ fontSize: 17, fontWeight: 400, left: AUTH_CONTENT_LEFT, lineHeight: "24px", top: headerPosition.descriptionTop }}
              >
                {description}
              </p>
            </div>
            <div className="auth-route-panel hidden lg:block" key={`desktop-panel-${screen}`}>
              <AuthRenderModeContext.Provider value="desktop">{children}</AuthRenderModeContext.Provider>
            </div>
          </div>

          <section className="flex min-h-screen items-start bg-[var(--moa-bg)] px-4 py-12 lg:hidden">
            <div className="w-full max-w-[343px]">
              <MoaLogo showText={false} markClassName="h-[24px] w-[39px]" />
              <div className="auth-route-copy" key={`mobile-copy-${screen}`}>
                <h2 className="mt-[25px] text-[36px] font-bold leading-none tracking-normal text-[var(--moa-auth-title)]">{title}</h2>
                <p className="mt-2 text-[14px] font-light leading-[20px] text-[var(--moa-auth-muted)]">{description}</p>
              </div>
              <div className="auth-route-panel mt-8" key={`mobile-panel-${screen}`}>
                <AuthRenderModeContext.Provider value="mobile">{children}</AuthRenderModeContext.Provider>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
