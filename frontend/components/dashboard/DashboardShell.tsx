import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import { MoaLogo } from "@/components/moa-ui/MoaLogo";
import { useMoaPresence, useMoaPresenceValue } from "@/components/moa-ui/useMoaPresence";
import { classNames } from "@/lib/classNames";
import { ArchiveIcon, FileIcon, GridIcon, SettingsIcon } from "./DashboardIcons";

interface DashboardShellProps {
  children: ReactNode;
  onLogout: () => void;
  userEmail?: string | null;
}

const navItems = [
  { icon: GridIcon, label: "내 회의", selected: true },
  { icon: FileIcon, label: "회의 결과", selected: false },
  { icon: ArchiveIcon, label: "보관함", selected: false },
];

export function DashboardShell({ children, onLogout, userEmail }: DashboardShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [permissionDialogTitle, setPermissionDialogTitle] = useState("");
  const permissionDialogTitleId = useId();
  const permissionDialogDescriptionId = useId();
  const mobileMenuPresence = useMoaPresence(mobileMenuOpen);
  const permissionDialogPresence = useMoaPresenceValue(permissionDialogTitle || null);
  const visiblePermissionDialogTitle = permissionDialogPresence.presentValue || "";

  const openPermissionDialog = (label: string) => {
    setMobileMenuOpen(false);
    setPermissionDialogTitle(label);
  };

  const closePermissionDialog = () => {
    setPermissionDialogTitle("");
  };

  useEffect(() => {
    if (!permissionDialogTitle) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePermissionDialog();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [permissionDialogTitle]);

  return (
    <div
      className="moa-dashboard-type moa-dashboard-route-enter relative h-screen w-full overflow-hidden bg-[var(--moa-bg)] text-[var(--moa-text)]"
      style={
        {
          "--dashboard-sidebar": "333px",
          "--dashboard-frame-top": "86px",
          "--dashboard-main-radius": "36.597px",
        } as CSSProperties
      }
    >
      <header className="absolute inset-x-0 top-0 z-30 flex h-[72px] items-center justify-between bg-[var(--moa-bg)] px-5 lg:hidden">
        <MoaLogo size="figma" className="moa-dt-logo" />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onLogout}
            aria-label="로그아웃"
            title="로그아웃"
            className="relative h-[38px] w-[38px] overflow-hidden rounded-full bg-[var(--moa-logo-text)] text-[14px] font-bold text-white shadow-[0_10px_24px_rgba(0,0,0,0.12)]"
          >
            <span className="grid h-full w-full place-items-center">{(userEmail || "M").slice(0, 1).toUpperCase()}</span>
            <span className="absolute right-[1px] top-[2px] h-[8px] w-[8px] rounded-full bg-[#0542ff]" />
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="메뉴 열기"
            className="grid h-[38px] w-[38px] place-items-center rounded-full border border-[#d8e7ff] bg-white text-[#236cf3] shadow-[0_8px_24px_rgba(15,23,42,0.06)]"
          >
            <MenuIcon className="h-[18px] w-[18px]" />
          </button>
        </div>
      </header>

      <aside className="absolute inset-y-0 left-0 z-20 hidden w-[var(--dashboard-sidebar)] flex-col overflow-hidden bg-[var(--moa-bg)] lg:flex">
        <div className="flex shrink-0 flex-col px-[32.53px] pt-[35px]">
          <MoaLogo
            size="figma"
            className="moa-dt-logo ml-[5.47px]"
          />

          <button
            type="button"
            className="mt-[42px] flex h-[60.995px] w-[281.257px] items-center rounded-[16.265px] bg-white pl-[16.94px] pr-[16.94px] text-left shadow-[0_0_3.389px_rgba(190,187,189,0.01),0_0_2.711px_rgba(190,187,189,0.04),0_0_2.711px_rgba(190,187,189,0.15),0_0_2.033px_rgba(190,187,189,0.26),0_0_1.355px_rgba(190,187,189,0.29)]"
          >
            <span className="h-[28.845px] w-[28.845px] shrink-0 rounded-full bg-[linear-gradient(270deg,var(--moa-primary-gradient-end)_0%,var(--moa-primary-gradient-start)_100%)] opacity-70" />
            <span className="ml-[8.24px] min-w-0">
              <span className="moa-dt-workspace-title block truncate">
                Workshop · 03
              </span>
              <span className="moa-dt-workspace-subtitle block truncate">
                Design Sprint Team
              </span>
            </span>
          </button>

          <div className="-mx-[32.53px] mt-[23.04px] h-px bg-[#dfdfdf]" />

          <nav className="mt-[31.85px] space-y-[8.13px]">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.selected ? undefined : () => openPermissionDialog(item.label)}
                  aria-current={item.selected ? "page" : undefined}
                  className={classNames(
                    "flex h-[39.308px] w-[281.257px] items-center rounded-[6.777px] pl-[23.04px] transition",
                    item.selected
                      ? "bg-[var(--moa-surface)] text-[#111111] shadow-[0_1.355px_1.694px_rgba(0,0,0,0.1)]"
                      : "text-[rgba(76,76,76,0.7)] hover:bg-white/70",
                  )}
                >
                  <Icon className="mr-[12.16px] h-[16.265px] w-[16.265px] shrink-0 text-current" />
                  <span className={classNames("block", item.selected ? "moa-dt-nav-active" : "moa-dt-nav")}>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto px-[32.53px] pb-[23.7px]">
          <button
            type="button"
            onClick={() => openPermissionDialog("설정")}
            className="flex h-[39.308px] w-[281.257px] items-center rounded-[6.777px] pl-[23.72px] text-[rgba(76,76,76,0.7)] transition hover:bg-white/70"
          >
            <SettingsIcon className="mr-[13.55px] h-[14.827px] w-[14.232px] shrink-0 text-current" />
            <span className="moa-dt-nav block">설정</span>
          </button>
        </div>
      </aside>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-10 hidden h-[var(--dashboard-frame-top)] bg-[var(--moa-bg)] lg:block"
      />

      <div className="absolute right-[31.85px] top-[23.04px] z-30 hidden items-center gap-3 lg:flex">
        <button
          type="button"
          onClick={onLogout}
          aria-label="로그아웃"
          title="로그아웃"
          className="relative h-[45.408px] w-[45.408px] overflow-hidden rounded-full bg-[var(--moa-logo-text)] text-[16px] font-bold text-white shadow-[0_10px_24px_rgba(0,0,0,0.14)] transition hover:scale-[1.02]"
        >
          <span className="grid h-full w-full place-items-center">{(userEmail || "M").slice(0, 1).toUpperCase()}</span>
          <span className="absolute right-0 top-[2.71px] h-[9.488px] w-[9.488px] rounded-full bg-[#0542ff]" />
        </button>
      </div>

      <main className="h-screen pt-[72px] lg:pl-[var(--dashboard-sidebar)] lg:pt-[var(--dashboard-frame-top)]">
        <section className="h-full overflow-hidden bg-[var(--moa-surface)] lg:h-[calc(100vh-var(--dashboard-frame-top))] lg:rounded-tl-[var(--dashboard-main-radius)]">
          {children}
        </section>
      </main>

      {mobileMenuPresence.shouldRender ? (
        <div
          className="moa-popover-backdrop fixed inset-0 z-50 bg-[#0f172a]/28 px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-[calc(env(safe-area-inset-top)+76px)] backdrop-blur-[2px] lg:hidden"
          data-exiting={mobileMenuPresence.isExiting}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMobileMenuOpen(false);
          }}
        >
          <section className="moa-popover-menu ml-auto w-full max-w-[360px] overflow-hidden rounded-[28px] border border-[#d8e7ff] bg-white p-3 shadow-[0_28px_80px_rgba(15,23,42,0.18)]" data-exiting={mobileMenuPresence.isExiting}>
            <div className="flex items-center justify-between px-2 pb-2 pt-1">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-bold leading-[1.4] tracking-[-0.035px] text-[#181818]">
                  Workshop · 03
                </p>
                <p className="truncate text-[11px] font-medium leading-[1.4] tracking-[-0.025px] text-[#90a1b9]">
                  {userEmail || "MOA"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="메뉴 닫기"
                className="grid h-9 w-9 place-items-center rounded-full bg-[#f3f8ff] text-[#526070]"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>

            <nav className="mt-2 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={item.selected ? () => setMobileMenuOpen(false) : () => openPermissionDialog(item.label)}
                    aria-current={item.selected ? "page" : undefined}
                    className={classNames(
                      "flex h-[46px] w-full items-center rounded-[16px] px-4 transition",
                      item.selected
                        ? "bg-[#f3f8ff] text-[#181818]"
                        : "text-[rgba(76,76,76,0.72)] hover:bg-[#f8fbff]",
                    )}
                  >
                    <Icon className="mr-3 h-[17px] w-[17px] shrink-0 text-current" />
                    <span className={classNames("block text-[14px] leading-[1.4] tracking-[-0.035px]", item.selected ? "font-bold" : "font-semibold")}>
                      {item.label}
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => openPermissionDialog("설정")}
                className="flex h-[46px] w-full items-center rounded-[16px] px-4 text-[rgba(76,76,76,0.72)] transition hover:bg-[#f8fbff]"
              >
                <SettingsIcon className="mr-3 h-[17px] w-[17px] shrink-0 text-current" />
                <span className="block text-[14px] font-semibold leading-[1.4] tracking-[-0.035px]">설정</span>
              </button>
            </nav>

            <button
              type="button"
              onClick={onLogout}
              className="mt-3 flex h-[46px] w-full items-center justify-center rounded-[16px] border border-[#d8e7ff] bg-white text-[#526070] transition hover:bg-[#f8fbff]"
            >
              <span className="block text-[14px] font-bold leading-[1.4] tracking-[-0.035px]">로그아웃</span>
            </button>
          </section>
        </div>
      ) : null}

      {permissionDialogPresence.shouldRender && visiblePermissionDialogTitle ? (
        <div
          className="moa-popover-backdrop fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/28 px-5 backdrop-blur-[2px]"
          data-exiting={permissionDialogPresence.isExiting}
          role="dialog"
          aria-modal="true"
          aria-labelledby={permissionDialogTitleId}
          aria-describedby={permissionDialogDescriptionId}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePermissionDialog();
          }}
        >
          <div className="moa-popover-panel w-[min(426px,calc(100vw-40px))] rounded-[26px] border border-[#dbeafe] bg-white px-[28px] pb-[24px] pt-[26px] text-center shadow-[0_28px_80px_rgba(15,23,42,0.18)]" data-exiting={permissionDialogPresence.isExiting}>
            <div className="mx-auto grid h-[54px] w-[54px] place-items-center rounded-full bg-[linear-gradient(90deg,#54c1ff_32.705%,#2f70e9_157.88%)] text-white shadow-[0_-4px_3px_rgba(255,255,255,0.29),0_6px_18px_rgba(35,108,243,0.22)]">
              <LockIcon className="h-[22px] w-[22px]" />
            </div>
            <p className="mt-[18px] text-[12px] font-bold leading-[1.4] tracking-[0.08em] text-[#236cf3]">
              권한 안내
            </p>
            <h2 id={permissionDialogTitleId} className="mt-[6px] text-[22px] font-bold leading-[1.35] tracking-[-0.55px] text-[#111]">
              {visiblePermissionDialogTitle}
            </h2>
            <p id={permissionDialogDescriptionId} className="mt-[10px] text-[14px] font-medium leading-[1.65] tracking-[-0.2px] text-[#64748b]">
              권한이 없습니다.
              <br />
              관리자에게 요청하세요.
            </p>
            <button
              type="button"
              onClick={closePermissionDialog}
              className="moa-dashboard-primary-button mt-[24px] inline-flex h-[42px] min-w-[128px] items-center justify-center rounded-full px-6 text-[14px] font-bold leading-none text-white shadow-[0_3px_8px_rgba(5,66,255,0.14)] transition hover:brightness-105"
            >
              <span className="block text-[14px] font-bold leading-none text-white">확인</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path d="M7.5 10V8.2a4.5 4.5 0 0 1 9 0V10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="5.5" y="10" width="13" height="9.5" rx="2.4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 14.1v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
