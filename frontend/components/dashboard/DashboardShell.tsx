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
      className="moa-dashboard-type min-h-screen overflow-hidden bg-[var(--moa-bg)] text-[var(--moa-text)]"
      style={
        {
          "--dashboard-sidebar": "clamp(282px, 17.65vw, 500px)",
          "--dashboard-frame-top": "clamp(72px, 4.48vw, 127px)",
          "--dashboard-main-radius": "clamp(31px, 1.91vw, 54px)",
        } as CSSProperties
      }
    >
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[var(--dashboard-sidebar)] flex-col px-[clamp(27px,1.69vw,48px)] pb-[clamp(9px,0.56vw,16px)] pt-[clamp(28px,1.73vw,49px)] lg:flex">
        <MoaLogo
          size="md"
          markClassName="h-[clamp(20px,1.23vw,35px)] w-[clamp(32px,2.01vw,57px)]"
          className="moa-dt-logo ml-[clamp(3px,0.18vw,5px)] gap-[clamp(8px,0.64vw,18px)]"
        />

        <button
          type="button"
          className="mt-[clamp(36px,2.26vw,64px)] flex h-[clamp(51px,3.18vw,90px)] w-[clamp(235px,14.65vw,415px)] items-center rounded-[clamp(14px,0.85vw,24px)] bg-white px-[clamp(14px,0.88vw,25px)] text-left shadow-[0_0_5px_rgba(190,187,189,0.18)]"
        >
          <span className="h-[clamp(24px,1.5vw,43px)] w-[clamp(24px,1.5vw,43px)] shrink-0 rounded-full bg-[linear-gradient(135deg,var(--moa-avatar-start),var(--moa-avatar-end))]" />
          <span className="ml-[clamp(7px,0.43vw,12px)] min-w-0">
            <span className="moa-dt-workspace-title block truncate">
              Workshop · 03
            </span>
            <span className="moa-dt-workspace-subtitle block truncate">
              Design Sprint Team
            </span>
          </span>
          <ChevronDownIcon className="ml-auto h-[clamp(10px,0.64vw,18px)] w-[clamp(10px,0.64vw,18px)] shrink-0 text-[var(--moa-text)]" />
        </button>

        <nav className="mt-[clamp(46px,2.86vw,81px)] space-y-[clamp(7px,0.42vw,12px)]">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                aria-current={item.selected ? "page" : undefined}
                className={classNames(
                  "flex h-[clamp(33px,2.05vw,58px)] w-[clamp(235px,14.65vw,415px)] items-center rounded-[clamp(6px,0.35vw,10px)] px-[clamp(19px,1.2vw,34px)] transition",
                  item.selected
                    ? "bg-[var(--moa-surface)] shadow-[0_2px_2.5px_rgba(0,0,0,0.1)]"
                    : "hover:bg-white/70",
                )}
              >
                <Icon className="mr-[clamp(11px,0.71vw,20px)] h-[clamp(14px,0.85vw,24px)] w-[clamp(14px,0.85vw,24px)] shrink-0" />
                <span className={classNames("block", item.selected ? "moa-dt-nav-active" : "moa-dt-nav")}>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto">
          <button
            type="button"
            className="flex h-[clamp(33px,2.05vw,58px)] w-[clamp(235px,14.65vw,415px)] items-center rounded-[clamp(6px,0.35vw,10px)] px-[clamp(19px,1.2vw,34px)] transition hover:bg-white/70"
          >
            <SettingsIcon className="mr-[clamp(11px,0.71vw,20px)] h-[clamp(14px,0.85vw,24px)] w-[clamp(14px,0.85vw,24px)] shrink-0" />
            <span className="moa-dt-nav block">설정</span>
          </button>
        </div>
      </aside>

      <div className="fixed right-[clamp(27px,1.69vw,48px)] top-[clamp(19px,1.2vw,34px)] z-30 flex items-center gap-3">
        <button
          type="button"
          onClick={onLogout}
          aria-label="로그아웃"
          title="로그아웃"
          className="relative h-[clamp(38px,2.36vw,67px)] w-[clamp(38px,2.36vw,67px)] overflow-hidden rounded-full bg-[var(--moa-logo-text)] text-[clamp(14px,0.78vw,22px)] font-bold text-white shadow-[0_10px_24px_rgba(0,0,0,0.14)] transition hover:scale-[1.02]"
        >
          <span className="grid h-full w-full place-items-center">{(userEmail || "M").slice(0, 1).toUpperCase()}</span>
          <span className="absolute right-0 top-0 h-[clamp(8px,0.5vw,14px)] w-[clamp(8px,0.5vw,14px)] rounded-full bg-[var(--moa-accent)]" />
        </button>
      </div>

      <main className="min-h-screen lg:pl-[var(--dashboard-sidebar)] lg:pt-[var(--dashboard-frame-top)]">
        <section className="min-h-screen overflow-hidden bg-[var(--moa-surface)] shadow-[-205px_-40px_209px_rgba(208,208,208,0.13),-51px_-10px_115px_rgba(208,208,208,0.15)] lg:min-h-[calc(100vh-var(--dashboard-frame-top))] lg:rounded-tl-[var(--dashboard-main-radius)]">
          {children}
        </section>
      </main>
    </div>
  );
}
