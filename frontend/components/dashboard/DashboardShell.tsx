import type { CSSProperties, ReactNode } from "react";
import { MoaLogo } from "@/components/moa-ui/MoaLogo";
import { classNames } from "@/lib/classNames";
import { ArchiveIcon, ChevronDownIcon, FileIcon, GridIcon, SettingsIcon } from "./DashboardIcons";

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
  return (
    <div
      className="moa-dashboard-type relative h-screen w-full overflow-hidden bg-[var(--moa-bg)] text-[var(--moa-text)]"
      style={
        {
          "--dashboard-sidebar": "333px",
          "--dashboard-frame-top": "86px",
          "--dashboard-main-radius": "36.597px",
        } as CSSProperties
      }
    >
      <aside className="absolute inset-y-0 left-0 z-20 hidden w-[var(--dashboard-sidebar)] lg:block">
        <MoaLogo
          size="md"
          markClassName="h-[23.358px] w-[38.269px]"
          className="moa-dt-logo absolute left-[38.63px] top-[34.56px] gap-[11.52px]"
        />

        <button
          type="button"
          className="absolute left-[32.53px] top-[100.3px] flex h-[60.995px] w-[281.257px] items-center rounded-[16.265px] bg-white pl-[16.94px] pr-[16.94px] text-left shadow-[0_0_3.389px_rgba(190,187,189,0.01),0_0_2.711px_rgba(190,187,189,0.04),0_0_2.711px_rgba(190,187,189,0.15),0_0_2.033px_rgba(190,187,189,0.26),0_0_1.355px_rgba(190,187,189,0.29)]"
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
          <ChevronDownIcon className="ml-auto h-[11.625px] w-[9.488px] shrink-0 text-[#111111]" />
        </button>

        <div className="absolute left-[-108.44px] top-[184.34px] h-px w-[447.3px] bg-[#dfdfdf]" />

        <nav className="absolute left-[32.53px] top-[216.19px] space-y-[8.13px]">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
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

        <div className="absolute bottom-[23.7px] left-[32.53px]">
          <button
            type="button"
            className="flex h-[39.308px] w-[281.257px] items-center rounded-[6.777px] pl-[23.72px] text-[rgba(76,76,76,0.7)] transition hover:bg-white/70"
          >
            <SettingsIcon className="mr-[13.55px] h-[14.827px] w-[14.232px] shrink-0 text-current" />
            <span className="moa-dt-nav block">설정</span>
          </button>
        </div>
      </aside>

      <div className="absolute right-[31.85px] top-[23.04px] z-30 flex items-center gap-3">
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

      <main className="h-screen lg:pl-[var(--dashboard-sidebar)] lg:pt-[var(--dashboard-frame-top)]">
        <section className="h-screen overflow-hidden bg-[var(--moa-surface)] shadow-[-867.49px_-168.076px_169.432px_rgba(208,208,208,0),-555.058px_-107.081px_169.432px_rgba(208,208,208,0.02),-312.432px_-60.318px_169.432px_rgba(208,208,208,0.08),-138.934px_-27.109px_141.645px_rgba(208,208,208,0.13),-34.564px_-6.777px_77.939px_rgba(208,208,208,0.15)] lg:h-[calc(100vh-var(--dashboard-frame-top))] lg:rounded-tl-[var(--dashboard-main-radius)]">
          {children}
        </section>
      </main>
    </div>
  );
}
