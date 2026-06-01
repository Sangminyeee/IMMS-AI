"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { MoaLogo } from "@/components/moa-ui/MoaLogo";

type AuthScreen = "login" | "register";
type AuthRenderMode = "desktop" | "mobile";

interface AuthSplitLayoutProps {
  children: ReactNode;
}

interface AuthScreenCopy {
  description: string;
  formDescription: string;
  formTitle: string;
  heroLine1: string;
  heroLine2: string;
  title: string;
}

const AUTH_STAGE_WIDTH = 1920;
const AUTH_STAGE_HEIGHT = 1080;
const MOBILE_AUTH_SHEET_ANIMATION_MS = 620;

const AUTH_SCREEN_COPY: Record<AuthScreen, AuthScreenCopy> = {
  login: {
    title: "MOA에 로그인하기",
    description: "흩어진 아이디어를 모아, 하나의 흐름이 되도록.",
    formTitle: "로그인",
    formDescription: "이메일과 비밀번호로 회의 워크스페이스에 들어가세요.",
    heroLine1: "생각을 모아,",
    heroLine2: "흐름을 만들다",
  },
  register: {
    title: "MOA 시작하기",
    description: "생각을 모을 준비, 이름과 이메일만으로 충분하도록.",
    formTitle: "회원가입",
    formDescription: "기본 정보만 입력하면 바로 시작할 수 있습니다.",
    heroLine1: "회의의 흐름을",
    heroLine2: "함께 정리하다",
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
  const router = useRouter();
  const screen = getAuthScreen(pathname);
  const { description, formDescription, formTitle, heroLine1, heroLine2, title } = AUTH_SCREEN_COPY[screen];
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [mobileSheetClosing, setMobileSheetClosing] = useState(false);
  const [pendingMobileSheetScreen, setPendingMobileSheetScreen] = useState<AuthScreen | null>(null);
  const mobileSheetCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headerPosition = AUTH_HEADER_POSITIONS[screen];
  const stageStyle: CSSProperties = {
    "--auth-stage-scale": stageScale ?? 1,
  } as CSSProperties;

  const showMobileAuthSheet = useCallback(() => {
    if (mobileSheetCloseTimerRef.current) {
      clearTimeout(mobileSheetCloseTimerRef.current);
      mobileSheetCloseTimerRef.current = null;
    }

    setMobileSheetClosing(false);
    setMobileSheetOpen(true);
  }, []);

  const closeMobileAuthSheet = useCallback(() => {
    setMobileSheetClosing((isClosing) => {
      if (isClosing) return isClosing;

      mobileSheetCloseTimerRef.current = setTimeout(() => {
        setMobileSheetOpen(false);
        setMobileSheetClosing(false);
        mobileSheetCloseTimerRef.current = null;
      }, MOBILE_AUTH_SHEET_ANIMATION_MS);

      return true;
    });
  }, []);

  useEffect(() => {
    if (!pendingMobileSheetScreen || pendingMobileSheetScreen !== screen) return;
    showMobileAuthSheet();
    setPendingMobileSheetScreen(null);
  }, [pendingMobileSheetScreen, screen, showMobileAuthSheet]);

  useEffect(() => {
    if (!mobileSheetOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMobileAuthSheet();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeMobileAuthSheet, mobileSheetOpen]);

  useEffect(() => {
    return () => {
      if (mobileSheetCloseTimerRef.current) {
        clearTimeout(mobileSheetCloseTimerRef.current);
      }
    };
  }, []);

  const openMobileAuthSheet = (targetScreen: AuthScreen) => {
    if (screen === targetScreen) {
      showMobileAuthSheet();
      return;
    }

    setPendingMobileSheetScreen(targetScreen);
    router.push(targetScreen === "register" ? "/register" : "/login");
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--moa-bg)] text-[var(--moa-text)] lg:overflow-hidden">
      <div className="relative min-h-screen w-full overflow-x-hidden lg:overflow-hidden">
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

          <section className="min-h-screen bg-[#f8fbff] px-0 py-0 lg:hidden">
            <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col">
              <div className="relative min-h-[58vh] flex-1 overflow-hidden bg-[#0542ff] shadow-[0_18px_46px_rgba(5,66,255,0.16)]">
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-no-repeat"
                  style={{
                    backgroundImage: "url('/figma-assets/auth-visual-blue.png')",
                    backgroundPosition: "88% 9%",
                    backgroundSize: "185% auto",
                  }}
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,9,40,0.26)_0%,rgba(2,9,40,0.08)_44%,rgba(248,251,255,0.18)_100%)]" />
                <div className="absolute inset-x-5 top-[calc(env(safe-area-inset-top)+22px)]">
                  <MoaLogo showText={false} variant="white" markClassName="h-[28px] w-[46px]" />
                  <span className="sr-only">MOA</span>
                </div>
                <div className="absolute inset-x-6 bottom-[86px]">
                  <p className="max-w-[260px] text-[30px] font-bold leading-[1.16] tracking-[-0.75px] text-white">
                    <span className="block">{heroLine1}</span>
                    <span className="block">{heroLine2}</span>
                  </p>
                  <p className="mt-3 max-w-[238px] text-[12px] font-medium leading-[19px] tracking-[-0.03px] text-white/78">
                    {description}
                  </p>
                </div>
              </div>
              <div className="relative z-10 -mt-[42px] rounded-t-[36px] border-t border-[#d8e7ff] bg-white px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-7 shadow-[0_-18px_44px_rgba(15,23,42,0.08)]">
                <div className="auth-route-copy">
                  <h2 className="text-[25px] font-bold leading-[1.25] tracking-[-0.65px] text-[var(--moa-auth-title)]">
                    회의를 더 가볍게 시작하세요
                  </h2>
                  <p className="mt-2 text-[13px] font-medium leading-[20px] tracking-[-0.03px] text-[var(--moa-auth-muted)]">
                    로그인하거나 새 계정을 만들어 회의 흐름을 이어갈 수 있습니다.
                  </p>
                </div>
                <div className="mt-6 space-y-3">
                  <button
                    type="button"
                    onClick={() => openMobileAuthSheet("login")}
                    className="moa-dashboard-primary-button flex h-[50px] w-full items-center justify-center rounded-[16px] text-white shadow-[0_12px_30px_rgba(5,66,255,0.18)]"
                  >
                    <span className="block text-[15px] font-bold leading-none tracking-[-0.035px] text-white">로그인</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openMobileAuthSheet("register")}
                    className="flex h-[50px] w-full items-center justify-center rounded-[16px] border border-[#d8e7ff] bg-white text-[#236cf3] shadow-[0_10px_28px_rgba(15,23,42,0.05)]"
                  >
                    <span className="block text-[15px] font-bold leading-none tracking-[-0.035px] text-[#236cf3]">회원가입</span>
                  </button>
                </div>
              </div>

              {mobileSheetOpen ? (
                <div
                  className="mobile-auth-backdrop fixed inset-0 z-50 flex items-end bg-[#0f172a]/34 backdrop-blur-[2px]"
                  data-closing={mobileSheetClosing}
                  role="presentation"
                  onMouseDown={(event) => {
                    if (event.target === event.currentTarget) {
                      closeMobileAuthSheet();
                    }
                  }}
                >
                  <section
                    className="auth-route-panel mobile-auth-sheet max-h-[88vh] w-full overflow-y-auto rounded-t-[34px] border-t border-[#d8e7ff] bg-white px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-4 shadow-[0_-24px_70px_rgba(15,23,42,0.18)]"
                    data-closing={mobileSheetClosing}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="mobile-auth-sheet-title"
                  >
                    <div className="mx-auto mb-4 h-[4px] w-[42px] rounded-full bg-[#d8e7ff]" />
                    <div className="mb-5 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h2 id="mobile-auth-sheet-title" className="text-[24px] font-bold leading-[1.25] tracking-[-0.6px] text-[var(--moa-auth-title)]">
                          {formTitle}
                        </h2>
                        <p className="mt-2 text-[13px] font-medium leading-[20px] tracking-[-0.03px] text-[var(--moa-auth-muted)]">{formDescription}</p>
                      </div>
                      <button
                        type="button"
                        onClick={closeMobileAuthSheet}
                        aria-label="인증 창 닫기"
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#f3f8ff] text-[#526070]"
                      >
                        <CloseIcon className="h-4 w-4" />
                      </button>
                    </div>
                    <AuthRenderModeContext.Provider value="mobile">{children}</AuthRenderModeContext.Provider>
                  </section>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
