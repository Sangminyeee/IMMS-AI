"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

type AuthScreen = "login" | "register";
type AuthRenderMode = "desktop" | "mobile";

interface AuthSplitLayoutProps {
  children: ReactNode;
}

interface AuthScreenCopy {
  description: string;
  title: string;
  visualDescription: string;
}

const AUTH_STAGE_WIDTH = 2844;
const AUTH_STAGE_HEIGHT = 1421;

const AUTH_SCREEN_COPY: Record<AuthScreen, AuthScreenCopy> = {
  login: {
    title: "MOA에 로그인하기",
    description: "흩어진 아이디어를 모아, 하나의 흐름이 되도록.",
    visualDescription: "회의의 아이디어, 문제정의, 요약을\n하나의 흐름으로 정리하는 AI 워크스페이스",
  },
  register: {
    title: "MOA 시작하기",
    description: "생각을 모을 준비, 이름과 이메일만으로 충분하도록.",
    visualDescription: "회의의 아이디어, 문제정의, 요약을\n하나의 흐름으로 정리하는 AI 워크스페이스",
  },
};

const AUTH_HEADER_POSITIONS: Record<AuthScreen, { logoTop: number; titleTop: number; descriptionTop: number }> = {
  login: {
    logoTop: 246,
    titleTop: 338,
    descriptionTop: 410,
  },
  register: {
    logoTop: 179,
    titleTop: 266,
    descriptionTop: 338,
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
      setScale(Math.min(window.innerWidth / AUTH_STAGE_WIDTH, window.innerHeight / AUTH_STAGE_HEIGHT));
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
  const { description, title, visualDescription } = AUTH_SCREEN_COPY[screen];
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
              className="absolute overflow-hidden rounded-[43px] bg-[var(--moa-primary)] bg-cover bg-center text-white"
              style={{ backgroundImage: "url('/figma-assets/auth-visual.png')", height: 1348, left: 38, top: 37, width: 1384 }}
            >
              <Image alt="MOA" className="absolute h-auto" height={47} priority src="/figma-assets/moa-logo-white.svg" style={{ left: 76, top: 60, width: 77 }} width={77} />
            </section>

            <Image
              alt="MOA"
              className="absolute h-auto"
              height={43}
              priority
              src="/figma-assets/moa-logo-red.svg"
              style={{ left: 1789, top: headerPosition.logoTop, width: 70 }}
              width={70}
            />
            <h1
              className="absolute left-[114px] top-[1061px] tracking-normal text-[#3e3e3e]"
              style={{ fontSize: 96, fontWeight: 200, lineHeight: "105px" }}
            >
              <span className="block whitespace-nowrap">
                <span className="text-[var(--moa-primary)]" style={{ fontWeight: 500 }}>
                  생각
                </span>
                을 모아,
              </span>
              <span className="block whitespace-nowrap">
                <span className="text-[var(--moa-primary)]" style={{ fontWeight: 500 }}>
                  흐름
                </span>
                을 만들다
              </span>
            </h1>
            <p
              className="absolute left-[680px] top-[1183px] w-[560px] whitespace-pre-line tracking-normal text-[#545454]"
              style={{ fontSize: 27, fontWeight: 300, lineHeight: "38px" }}
            >
              {visualDescription}
            </p>
            <div className="auth-route-copy" key={`desktop-copy-${screen}`}>
              <h2
                className="absolute tracking-normal text-[#4c4c4c]"
                style={{ fontSize: 64, fontWeight: 700, left: 1789, lineHeight: "64px", top: headerPosition.titleTop }}
              >
                {title}
              </h2>
              <p
                className="absolute tracking-normal text-[#4c4c4c]"
                style={{ fontSize: 26, fontWeight: 300, left: 1789, lineHeight: "36px", top: headerPosition.descriptionTop }}
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
              <Image alt="MOA" className="h-auto w-[36px]" height={43} priority src="/figma-assets/moa-logo-red.svg" width={70} />
              <div className="auth-route-copy" key={`mobile-copy-${screen}`}>
                <h2 className="mt-[25px] text-[36px] font-bold leading-none tracking-normal text-[#4c4c4c]">{title}</h2>
                <p className="mt-2 text-[14px] font-light leading-[20px] text-[#4c4c4c]">{description}</p>
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
