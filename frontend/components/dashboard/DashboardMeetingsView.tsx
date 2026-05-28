import { useMemo, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent, type WheelEvent } from "react";
import { classNames } from "@/lib/classNames";
import { BellIcon, PlusIcon, SearchIcon } from "./DashboardIcons";
import {
  formatDashboardCompactDateTime,
  getMeetingActionLabel,
  getMeetingSortDate,
  getMeetingStatusLabel,
  getMeetingStatusTone,
  getUpcomingMeetingActionLabel,
  isCompletedMeeting,
  matchesStatusFilter,
} from "./dashboardUtils";
import type { DashboardMeeting, MeetingStatusFilter } from "./types";

interface DashboardMeetingsViewProps {
  loading: boolean;
  meetings: DashboardMeeting[];
  onCreateMeeting: () => void;
  onDeleteMeeting: (meeting: DashboardMeeting) => void;
  onJoinMeeting: (meetingId: string) => void;
  onOpenMeetingResult: (meeting: DashboardMeeting) => void;
  onSearchQueryChange: (query: string) => void;
  onStatusFilterChange: (filter: MeetingStatusFilter) => void;
  searchQuery: string;
  statusFilter: MeetingStatusFilter;
  deletingMeetingId?: string | null;
}

const statusFilters: Array<{ label: string; value: MeetingStatusFilter }> = [
  { label: "전체", value: "all" },
  { label: "종료", value: "completed" },
  { label: "예정", value: "scheduled" },
  { label: "진행중", value: "active" },
];

const UPCOMING_CARD_SCROLL_STEP = 427;
const UPCOMING_DRAG_IGNORE_SELECTOR = "button,a,input,textarea,select,[role='button']";

function isUpcomingInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(UPCOMING_DRAG_IGNORE_SELECTOR));
}

export function DashboardMeetingsView({
  loading,
  meetings,
  onCreateMeeting,
  onDeleteMeeting,
  onJoinMeeting,
  onOpenMeetingResult,
  onSearchQueryChange,
  onStatusFilterChange,
  searchQuery,
  statusFilter,
  deletingMeetingId = null,
}: DashboardMeetingsViewProps) {
  const upcomingScrollRef = useRef<HTMLDivElement | null>(null);
  const upcomingDragRef = useRef({
    active: false,
    pointerId: -1,
    startScrollLeft: 0,
    startX: 0,
    suppressClick: false,
  });
  const suppressClickTimerRef = useRef<number | null>(null);

  const upcomingMeetings = useMemo(
    () => meetings.filter((meeting) => !isCompletedMeeting(meeting.status)).slice(0, 8),
    [meetings],
  );

  const filteredMeetings = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return meetings.filter((meeting) => {
      if (!matchesStatusFilter(meeting, statusFilter)) return false;
      if (!normalizedQuery) return true;
      return meeting.title.toLowerCase().includes(normalizedQuery);
    });
  }, [meetings, searchQuery, statusFilter]);
  const meetingRowCount = loading ? 5 : Math.max(filteredMeetings.length, 1);
  const contentMinHeight = 702 + meetingRowCount * 49.5 + 48;
  const resetUpcomingDrag = () => {
    const scrollElement = upcomingScrollRef.current;
    const dragState = upcomingDragRef.current;
    if (scrollElement && dragState.active && dragState.pointerId >= 0) {
      try {
        scrollElement.releasePointerCapture(dragState.pointerId);
      } catch {
        // Pointer capture may already be released by the browser.
      }
    }

    if (scrollElement) {
      delete scrollElement.dataset.dragging;
    }

    dragState.active = false;
    dragState.pointerId = -1;
  };

  const handleUpcomingPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const scrollElement = upcomingScrollRef.current;
    if (!scrollElement || scrollElement.scrollWidth <= scrollElement.clientWidth) return;
    if (isUpcomingInteractiveTarget(event.target)) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const dragState = upcomingDragRef.current;
    dragState.active = true;
    dragState.pointerId = event.pointerId;
    dragState.startX = event.clientX;
    dragState.startScrollLeft = scrollElement.scrollLeft;
    dragState.suppressClick = false;

    scrollElement.dataset.dragging = "true";
    scrollElement.setPointerCapture(event.pointerId);
  };

  const handleUpcomingPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const scrollElement = upcomingScrollRef.current;
    const dragState = upcomingDragRef.current;
    if (!scrollElement || !dragState.active || dragState.pointerId !== event.pointerId) return;

    const distance = event.clientX - dragState.startX;
    if (Math.abs(distance) > 6) {
      dragState.suppressClick = true;
      event.preventDefault();
    }

    scrollElement.scrollLeft = dragState.startScrollLeft - distance;
  };

  const handleUpcomingPointerEnd = () => {
    resetUpcomingDrag();

    if (suppressClickTimerRef.current) {
      window.clearTimeout(suppressClickTimerRef.current);
    }
    suppressClickTimerRef.current = window.setTimeout(() => {
      upcomingDragRef.current.suppressClick = false;
    }, 180);
  };

  const handleUpcomingClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (!upcomingDragRef.current.suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
    upcomingDragRef.current.suppressClick = false;
  };

  const handleUpcomingWheel = (event: WheelEvent<HTMLDivElement>) => {
    const scrollElement = event.currentTarget;
    if (scrollElement.scrollWidth <= scrollElement.clientWidth) return;
    if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;

    const nextScrollLeft = scrollElement.scrollLeft + event.deltaY;
    const canScrollLeft = event.deltaY < 0 && scrollElement.scrollLeft > 0;
    const canScrollRight =
      event.deltaY > 0 && scrollElement.scrollLeft < scrollElement.scrollWidth - scrollElement.clientWidth;

    if (!canScrollLeft && !canScrollRight) return;

    event.preventDefault();
    scrollElement.scrollLeft = nextScrollLeft;
  };

  const handleUpcomingKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const direction = event.key === "ArrowRight" ? 1 : -1;
    event.preventDefault();
    event.currentTarget.scrollBy({ behavior: "smooth", left: direction * UPCOMING_CARD_SCROLL_STEP });
  };

  return (
    <div className="imms-overlay-scroll moa-dashboard-type relative h-full overflow-y-auto overflow-x-hidden bg-[var(--moa-surface)]">
      <div aria-hidden="true" style={{ height: contentMinHeight }} />
      <section
        className="absolute left-[19px] right-0 top-[19px] h-[550px] overflow-hidden rounded-tl-[31.853px] bg-[linear-gradient(104deg,#fcfcfc_1%,#f0f0f2_87%)] bg-[length:100%_100%] bg-no-repeat"
        style={{ backgroundImage: "url('/figma-assets/dashboard-hero-blue.png')" }}
      >
        <h1 className="moa-dt-hero absolute left-[98.95px] top-[60.32px] whitespace-nowrap">
          <span className="block">
            <span className="text-[#e9fffc]">오늘의 회의</span>를
          </span>
          <span className="block">
            <span className="text-[#e9fffc]">하나의 흐름</span>으로 정리하세요
          </span>
        </h1>

        <div className="absolute left-[98.95px] right-[67px] top-[141.65px] h-px bg-white/60" />

        <button
          type="button"
          onClick={onCreateMeeting}
          className="moa-dashboard-primary-button absolute right-[232px] top-[79px] inline-flex h-[43px] w-[143px] items-center justify-center rounded-[46.085px] px-[12px] text-white transition"
        >
          <PlusIcon className="h-[17.621px] w-[17.621px] shrink-0 text-white" />
          <span className="moa-dt-main-cta ml-[5px] block whitespace-nowrap text-white">새 회의 만들기</span>
        </button>

        <div className="absolute left-[103.69px] top-[267.03px] flex items-start text-white">
          <h2 className="text-[20px] font-bold leading-[28px] tracking-[-0.05px]">예정된 회의</h2>
          <BellIcon className="ml-[10.31px] mt-[1.97px] h-[23.043px] w-[23.043px] shrink-0 text-white" />
        </div>

        <div
          ref={upcomingScrollRef}
          aria-label="예정된 회의 목록"
          className="moa-upcoming-scroll absolute left-[99.37px] right-0 top-[311.8px] cursor-grab touch-pan-x overflow-x-auto overflow-y-hidden overscroll-x-contain pb-[18px] pr-[160px] scroll-smooth snap-x snap-mandatory data-[dragging=true]:cursor-grabbing"
          role="region"
          tabIndex={0}
          onClickCapture={handleUpcomingClickCapture}
          onKeyDown={handleUpcomingKeyDown}
          onPointerCancel={handleUpcomingPointerEnd}
          onPointerDown={handleUpcomingPointerDown}
          onPointerMove={handleUpcomingPointerMove}
          onPointerUp={handleUpcomingPointerEnd}
          onWheel={handleUpcomingWheel}
        >
          <div className="flex w-max gap-[35.92px]">
            {loading ? (
              <UpcomingSkeleton />
            ) : upcomingMeetings.length === 0 ? (
              <div className="flex h-[191.119px] w-[391.048px] shrink-0 snap-start items-center rounded-[19.654px] border-[0.949px] border-[rgba(19,127,188,0.5)] bg-white px-[21.42px] shadow-[0.678px_3.389px_8.133px_rgba(138,204,255,0.1)]">
                <p className="text-[14px] font-semibold text-[var(--moa-disabled-text)]">예정된 회의가 없습니다.</p>
              </div>
            ) : (
              upcomingMeetings.map((meeting, index) => (
                <UpcomingMeetingCard
                  key={meeting.id}
                  featured={index === 0}
                  meeting={meeting}
                  onJoinMeeting={onJoinMeeting}
                />
              ))
            )}
          </div>
        </div>

      </section>

      <h2 className="moa-dt-section-title absolute left-[118.37px] top-[599.18px] whitespace-nowrap">
        전체 회의 목록
      </h2>

      <div className="absolute left-[120.4px] top-[642.55px] flex items-center gap-[5.422px]">
        {statusFilters.map((filter) => {
          const active = statusFilter === filter.value;
          return (
            <button
              key={filter.value}
              type="button"
              onClick={() => onStatusFilterChange(filter.value)}
              className={classNames(
                "moa-dt-filter inline-flex h-[26px] items-center justify-center rounded-[6px] px-[8px] transition",
                active
                  ? "moa-dt-filter-active gap-[5px] bg-[var(--moa-filter-selected-bg)] text-[var(--moa-filter-selected-text)]"
                  : "bg-[var(--moa-surface-soft)] text-[var(--moa-filter-text)] hover:bg-[var(--moa-filter-hover)] hover:text-[var(--moa-dashboard-action-text)]",
              )}
            >
              {active ? <span className="text-[11.5px] leading-none text-white">✓</span> : null}
              <span className={classNames("block leading-none", active ? "text-white" : "")}>{filter.label}</span>
            </button>
          );
        })}
      </div>

      <label className="absolute right-[107.08px] top-[647.98px] flex h-[27.265px] w-[151.133px] items-center rounded-full border-[0.678px] border-[var(--moa-border-soft)] bg-white px-[10.844px] py-[8.133px] text-[var(--moa-text-body)]">
        <input
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="Search"
          className="moa-dt-search-input min-w-0 flex-1 bg-transparent text-[var(--moa-text-strong)] outline-none"
        />
        <SearchIcon className="ml-[5.422px] h-[10.844px] w-[10.844px] shrink-0 text-[var(--moa-text)]" />
      </label>

      <div className="absolute left-[118.37px] right-[107.08px] top-[701.52px] space-y-[6.1px] pb-[48px] pr-1">
        {loading ? (
          <MeetingRowsSkeleton />
        ) : filteredMeetings.length === 0 ? (
          <div className="flex h-[88px] items-center justify-center rounded-[19.654px] bg-[var(--moa-surface-muted)] px-6 text-center">
            <p className="text-[13px] font-semibold text-[var(--moa-disabled-text)]">
              {meetings.length === 0 ? "아직 생성된 회의가 없습니다." : "조건에 맞는 회의가 없습니다."}
            </p>
          </div>
        ) : (
          filteredMeetings.map((meeting) => (
            <MeetingListRow
              key={meeting.id}
              meeting={meeting}
              deleting={deletingMeetingId === meeting.id}
              onDeleteMeeting={onDeleteMeeting}
              onJoinMeeting={onJoinMeeting}
              onOpenMeetingResult={onOpenMeetingResult}
            />
          ))
        )}
      </div>
    </div>
  );
}

function UpcomingMeetingCard({
  featured,
  meeting,
  onJoinMeeting,
}: {
  featured: boolean;
  meeting: DashboardMeeting;
  onJoinMeeting: (meetingId: string) => void;
}) {
  const tone = getMeetingStatusTone(meeting.status);

  return (
    <article
      className={classNames(
        "relative h-[191.119px] w-[391.048px] shrink-0 snap-start overflow-hidden rounded-[19.654px] bg-white",
        featured
          ? "border-[0.949px] border-[rgba(19,127,188,0.5)] shadow-[21.01px_92.849px_26.431px_rgba(138,204,255,0),13.555px_59.64px_24.398px_rgba(138,204,255,0.01),7.455px_33.209px_20.332px_rgba(138,204,255,0.05),3.389px_14.91px_14.91px_rgba(138,204,255,0.09),0.678px_3.389px_8.133px_rgba(138,204,255,0.1)]"
          : "border-[0.678px] border-[#b5b5b5] shadow-[0_2.711px_5.422px_-1.355px_rgba(23,23,23,0.1),0_1.355px_2.711px_-1.355px_rgba(23,23,23,0.06)]",
      )}
    >
      <h3 className="moa-dt-card-title absolute left-[21.42px] top-[15.99px] max-w-[330px] truncate whitespace-nowrap">
        {meeting.title}
      </h3>
      <p className="moa-dt-card-date absolute left-[21.42px] top-[127.82px] max-w-[160px] truncate whitespace-nowrap">
        {formatDashboardCompactDateTime(getMeetingSortDate(meeting))}
      </p>
      <button
        type="button"
        onClick={() => onJoinMeeting(meeting.id)}
        onPointerDown={(event) => event.stopPropagation()}
        className={classNames(
          "absolute left-[264.04px] top-[133.24px] inline-flex h-[33.213px] w-[98.256px] items-center justify-center rounded-[54.896px] transition",
          featured || tone === "active"
            ? "moa-dashboard-primary-button border-0 text-white shadow-[0_3px_8px_rgba(5,66,255,0.14)]"
            : "border-[0.949px] border-[var(--moa-dashboard-outline)] bg-white text-[var(--moa-dashboard-outline)] hover:bg-[var(--moa-dashboard-outline-hover)]",
        )}
      >
        <span className={classNames("moa-dt-card-cta block whitespace-nowrap", featured || tone === "active" ? "moa-dt-card-cta-strong text-white" : "text-[var(--moa-dashboard-outline)]")}>
          {getUpcomingMeetingActionLabel(meeting.status)}
        </span>
      </button>
    </article>
  );
}

function MeetingListRow({
  deleting,
  meeting,
  onDeleteMeeting,
  onJoinMeeting,
  onOpenMeetingResult,
}: {
  deleting: boolean;
  meeting: DashboardMeeting;
  onDeleteMeeting: (meeting: DashboardMeeting) => void;
  onJoinMeeting: (meetingId: string) => void;
  onOpenMeetingResult: (meeting: DashboardMeeting) => void;
}) {
  const completed = isCompletedMeeting(meeting.status);
  const tone = getMeetingStatusTone(meeting.status);

  return (
    <div className="relative h-[43.375px] w-full overflow-hidden rounded-[19.654px] bg-[var(--moa-surface-muted)] transition hover:bg-[var(--moa-hover-muted)]">
      <span
        className={classNames(
          "absolute left-[12.88px] top-[8.13px] inline-flex h-[27.787px] min-w-[45.408px] items-center justify-center rounded-full border-[0.678px] border-[var(--moa-border)] px-[8.7px] text-white",
          completed ? "bg-[var(--moa-status-completed)]" : tone === "active" ? "bg-[var(--moa-status-active)]" : "bg-[var(--moa-status-scheduled)]",
        )}
      >
        <span className="moa-dt-pill-text block whitespace-nowrap text-white">{getMeetingStatusLabel(meeting.status)}</span>
      </span>

      <button
        type="button"
        onClick={() => (completed ? onOpenMeetingResult(meeting) : onJoinMeeting(meeting.id))}
        className="absolute inset-y-0 left-[71.16px] right-[238px] flex min-w-0 items-center text-left"
      >
        <span className="moa-dt-row-title max-w-[min(780px,45vw)] truncate whitespace-nowrap">
          {meeting.title}
        </span>
        <span className="mx-[12px] h-[19.654px] w-px shrink-0 bg-[var(--moa-row-divider)]" />
        <span className="moa-dt-row-date shrink-0 whitespace-nowrap">
          {formatDashboardCompactDateTime(getMeetingSortDate(meeting))}
        </span>
      </button>

      <div className="absolute right-[20.67px] top-[8.13px] flex items-center gap-[8px]">
        {completed ? (
          <button
            type="button"
            onClick={() => onOpenMeetingResult(meeting)}
            className="inline-flex h-[27.78px] min-w-[70.973px] items-center justify-center rounded-full border-[0.678px] border-[var(--moa-result-button)] bg-[var(--moa-result-button)] px-[14.233px] text-white transition hover:bg-[var(--moa-result-button-hover)]"
          >
            <span className="moa-dt-row-action-text moa-dt-row-action-text-strong block whitespace-nowrap">결과 보기</span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onJoinMeeting(meeting.id)}
          className="group inline-flex h-[27.78px] min-w-[69.467px] items-center justify-center rounded-full border-[0.678px] border-[var(--moa-dashboard-action-border)] bg-white px-[14.233px] text-[var(--moa-dashboard-action-text)] transition hover:border-[var(--moa-dashboard-outline)] hover:bg-[var(--moa-dashboard-outline-hover)] hover:text-[var(--moa-dashboard-outline)]"
        >
          <span className="moa-dt-row-action-text block whitespace-nowrap transition group-hover:text-[var(--moa-dashboard-outline)]">{getMeetingActionLabel(meeting.status)}</span>
        </button>
        <button
          type="button"
          onClick={() => onDeleteMeeting(meeting)}
          disabled={deleting}
          className="group inline-flex h-[27.78px] min-w-[57px] items-center justify-center rounded-full border-[0.678px] border-[#d9e4f4] bg-white px-[11px] text-[#90a1b9] transition hover:border-[#ef4444]/30 hover:bg-[#fff5f5] hover:text-[#ef4444] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="moa-dt-row-action-text block whitespace-nowrap transition group-hover:text-[#ef4444]">
            {deleting ? "삭제 중" : "삭제"}
          </span>
        </button>
      </div>
    </div>
  );
}

function UpcomingSkeleton() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-[191.119px] w-[391.048px] shrink-0 snap-start animate-pulse rounded-[19.654px] bg-white/90 shadow-[0_2.711px_5.422px_-1.355px_rgba(23,23,23,0.1)]"
        />
      ))}
    </>
  );
}

function MeetingRowsSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="h-[43.375px] animate-pulse rounded-[19.654px] bg-[var(--moa-surface-muted)]" />
      ))}
    </>
  );
}
