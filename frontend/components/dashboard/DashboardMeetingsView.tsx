import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type WheelEvent } from "react";
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
type DashboardListTransitionPhase = "idle" | "out" | "in";

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
  const filterSignature = `${loading ? "loading" : "ready"}:${statusFilter}:${searchQuery.trim().toLowerCase()}:${filteredMeetings
    .map((meeting) => meeting.id)
    .join(",")}`;
  const [displayedFilteredMeetings, setDisplayedFilteredMeetings] = useState(filteredMeetings);
  const [displayedListLoading, setDisplayedListLoading] = useState(loading);
  const [listTransitionPhase, setListTransitionPhase] = useState<DashboardListTransitionPhase>("idle");
  const listTransitionInitializedRef = useRef(false);
  const listTransitionTimerRef = useRef<number | null>(null);
  const listTransitionIdleTimerRef = useRef<number | null>(null);
  const meetingRowCount = displayedListLoading ? 5 : Math.max(displayedFilteredMeetings.length, 1);
  const contentMinHeight = 702 + meetingRowCount * 49.5 + 48;

  useEffect(() => {
    if (listTransitionTimerRef.current !== null) {
      window.clearTimeout(listTransitionTimerRef.current);
      listTransitionTimerRef.current = null;
    }
    if (listTransitionIdleTimerRef.current !== null) {
      window.clearTimeout(listTransitionIdleTimerRef.current);
      listTransitionIdleTimerRef.current = null;
    }

    if (!listTransitionInitializedRef.current) {
      listTransitionInitializedRef.current = true;
      setDisplayedFilteredMeetings(filteredMeetings);
      setDisplayedListLoading(loading);
      return;
    }

    setListTransitionPhase("out");
    listTransitionTimerRef.current = window.setTimeout(() => {
      setDisplayedFilteredMeetings(filteredMeetings);
      setDisplayedListLoading(loading);
      setListTransitionPhase("in");
      listTransitionIdleTimerRef.current = window.setTimeout(() => {
        setListTransitionPhase("idle");
        listTransitionIdleTimerRef.current = null;
      }, 240);
      listTransitionTimerRef.current = null;
    }, 130);

    return () => {
      if (listTransitionTimerRef.current !== null) {
        window.clearTimeout(listTransitionTimerRef.current);
        listTransitionTimerRef.current = null;
      }
      if (listTransitionIdleTimerRef.current !== null) {
        window.clearTimeout(listTransitionIdleTimerRef.current);
        listTransitionIdleTimerRef.current = null;
      }
    };
  }, [filterSignature, filteredMeetings, loading]);
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
      <MobileDashboardContent
        deletingMeetingId={deletingMeetingId}
        filteredMeetings={displayedFilteredMeetings}
        listTransitionPhase={listTransitionPhase}
        loading={displayedListLoading}
        meetings={meetings}
        onCreateMeeting={onCreateMeeting}
        onDeleteMeeting={onDeleteMeeting}
        onJoinMeeting={onJoinMeeting}
        onOpenMeetingResult={onOpenMeetingResult}
        onSearchQueryChange={onSearchQueryChange}
        onStatusFilterChange={onStatusFilterChange}
        searchQuery={searchQuery}
        statusFilter={statusFilter}
        upcomingMeetings={upcomingMeetings}
      />

      <div className="relative hidden min-h-full lg:block">
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
          className="moa-action-button moa-dashboard-primary-button absolute right-[232px] top-[79px] inline-flex h-[43px] w-[143px] items-center justify-center rounded-[46.085px] px-[12px] text-white transition"
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
              <div className="moa-action-card flex h-[191.119px] w-[391.048px] shrink-0 snap-start items-center rounded-[19.654px] border-[0.949px] border-[rgba(19,127,188,0.5)] bg-white px-[21.42px] shadow-[0.678px_3.389px_8.133px_rgba(138,204,255,0.1)]">
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
                "moa-dashboard-filter-button moa-dt-filter inline-flex h-[26px] items-center justify-center rounded-[6px] px-[8px]",
                active
                  ? "moa-dashboard-filter-button-active moa-dt-filter-active gap-[5px] border border-[#2cb1fe] text-white shadow-[0_3px_8px_rgba(5,66,255,0.14)]"
                  : "bg-[var(--moa-surface-soft)] text-[var(--moa-filter-text)] hover:bg-[var(--moa-filter-hover)] hover:text-[var(--moa-dashboard-action-text)]",
              )}
            >
              <span className={classNames("moa-dashboard-filter-check text-[11.5px] leading-none text-white", active ? "opacity-100" : "opacity-0")}>✓</span>
              <span className={classNames("block leading-none", active ? "text-white" : "")}>{filter.label}</span>
            </button>
          );
        })}
      </div>

      <label className="moa-action-input absolute right-[107.08px] top-[647.98px] flex h-[27.265px] w-[151.133px] items-center rounded-full border-[0.678px] border-[var(--moa-border-soft)] bg-white px-[10.844px] py-[8.133px] text-[var(--moa-text-body)]">
        <input
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="Search"
          className="moa-dt-search-input min-w-0 flex-1 bg-transparent text-[var(--moa-text-strong)] outline-none"
        />
        <SearchIcon className="ml-[5.422px] h-[10.844px] w-[10.844px] shrink-0 text-[var(--moa-text)]" />
      </label>

      <div
        className={classNames(
          "moa-dashboard-meeting-list absolute left-[118.37px] right-[107.08px] top-[701.52px] space-y-[6.1px] pb-[48px] pr-1",
          listTransitionPhase === "out" ? "moa-dashboard-meeting-list-out" : "",
          listTransitionPhase === "in" ? "moa-dashboard-meeting-list-in" : "",
        )}
      >
        {displayedListLoading ? (
          <MeetingRowsSkeleton />
        ) : displayedFilteredMeetings.length === 0 ? (
          <div className="flex h-[88px] items-center justify-center rounded-[19.654px] bg-[var(--moa-surface-muted)] px-6 text-center">
            <p className="text-[13px] font-semibold text-[var(--moa-disabled-text)]">
              {meetings.length === 0 ? "아직 생성된 회의가 없습니다." : "조건에 맞는 회의가 없습니다."}
            </p>
          </div>
        ) : (
          displayedFilteredMeetings.map((meeting) => (
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
    </div>
  );
}

function MobileDashboardContent({
  deletingMeetingId,
  filteredMeetings,
  listTransitionPhase,
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
  upcomingMeetings,
}: {
  deletingMeetingId?: string | null;
  filteredMeetings: DashboardMeeting[];
  listTransitionPhase: DashboardListTransitionPhase;
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
  upcomingMeetings: DashboardMeeting[];
}) {
  return (
    <div className="lg:hidden">
      <section className="px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-4">
        <section className="overflow-hidden rounded-[30px] bg-[linear-gradient(135deg,#5cc8ff_0%,#0542ff_100%)] px-5 pb-5 pt-6 text-white shadow-[0_22px_54px_rgba(5,66,255,0.22)]">
          <h1 className="text-[27px] font-bold leading-[1.24] tracking-[-0.8px]">
            오늘의 회의를
            <br />
            하나의 흐름으로 정리하세요
          </h1>
          <button
            type="button"
            onClick={onCreateMeeting}
            className="moa-action-button mt-6 inline-flex h-[46px] items-center justify-center rounded-full bg-white px-5 text-[#0542ff] shadow-[0_12px_30px_rgba(0,0,0,0.12)]"
          >
            <PlusIcon className="h-[18px] w-[18px] shrink-0 text-[#0542ff]" />
            <span className="ml-2 block text-[14px] font-bold leading-none tracking-[-0.035px] text-[#0542ff]">새 회의 만들기</span>
          </button>
        </section>

        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[20px] font-bold leading-[1.4] tracking-[-0.5px] text-[#181818]">예정된 회의</h2>
            <span className="text-[12px] font-bold leading-none tracking-[-0.03px] text-[#90a1b9]">{upcomingMeetings.length}개</span>
          </div>
          <div className="-mx-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex gap-3">
              {loading ? (
                <MobileMeetingCardSkeleton compact />
              ) : upcomingMeetings.length === 0 ? (
                <MobileEmptyCard message="예정된 회의가 없습니다." />
              ) : (
                upcomingMeetings.map((meeting) => (
                  <MobileMeetingCard
                    key={meeting.id}
                    compact
                    deleting={deletingMeetingId === meeting.id}
                    meeting={meeting}
                    onDeleteMeeting={onDeleteMeeting}
                    onJoinMeeting={onJoinMeeting}
                    onOpenMeetingResult={onOpenMeetingResult}
                  />
                ))
              )}
            </div>
          </div>
        </section>

        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="shrink-0 text-[20px] font-bold leading-[1.4] tracking-[-0.5px] text-[#181818]">전체 회의 목록</h2>
            <label className="moa-action-input flex h-[38px] min-w-0 flex-1 items-center rounded-full border border-[#d8e7ff] bg-white px-3">
              <input
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
                placeholder="Search"
                className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-[#181818] outline-none placeholder:text-[#90a1b9]"
              />
              <SearchIcon className="ml-2 h-[14px] w-[14px] shrink-0 text-[#526070]" />
            </label>
          </div>

          <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex gap-2">
              {statusFilters.map((filter) => {
                const active = statusFilter === filter.value;
                return (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => onStatusFilterChange(filter.value)}
                    className={classNames(
                      "moa-dashboard-filter-button inline-flex h-[34px] shrink-0 items-center justify-center rounded-full px-4",
                      active
                        ? "moa-dashboard-filter-button-active border border-[#2cb1fe] bg-white text-white shadow-[0_6px_16px_rgba(5,66,255,0.16)]"
                        : "border border-[#d8e7ff] bg-white text-[#526070]",
                    )}
                  >
                    <span className={classNames("block text-[13px] font-bold leading-none tracking-[-0.03px]", active ? "text-white" : "")}>{filter.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className={classNames(
              "moa-dashboard-meeting-list mt-3 space-y-3",
              listTransitionPhase === "out" ? "moa-dashboard-meeting-list-out" : "",
              listTransitionPhase === "in" ? "moa-dashboard-meeting-list-in" : "",
            )}
          >
            {loading ? (
              <MobileMeetingListSkeleton />
            ) : filteredMeetings.length === 0 ? (
              <MobileEmptyCard message={meetings.length === 0 ? "아직 생성된 회의가 없습니다." : "조건에 맞는 회의가 없습니다."} />
            ) : (
              filteredMeetings.map((meeting) => (
                <MobileMeetingCard
                  key={meeting.id}
                  deleting={deletingMeetingId === meeting.id}
                  meeting={meeting}
                  onDeleteMeeting={onDeleteMeeting}
                  onJoinMeeting={onJoinMeeting}
                  onOpenMeetingResult={onOpenMeetingResult}
                />
              ))
            )}
          </div>
        </section>
      </section>
    </div>
  );
}

function MobileMeetingCard({
  compact = false,
  deleting,
  meeting,
  onDeleteMeeting,
  onJoinMeeting,
  onOpenMeetingResult,
}: {
  compact?: boolean;
  deleting: boolean;
  meeting: DashboardMeeting;
  onDeleteMeeting: (meeting: DashboardMeeting) => void;
  onJoinMeeting: (meetingId: string) => void;
  onOpenMeetingResult: (meeting: DashboardMeeting) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const completed = isCompletedMeeting(meeting.status);
  const tone = getMeetingStatusTone(meeting.status);
  const statusClassName = completed
    ? "bg-[var(--moa-status-completed)]"
    : tone === "active"
      ? "bg-[var(--moa-status-active)]"
      : "bg-[var(--moa-status-scheduled)]";

  return (
    <article
      className={classNames(
        "moa-action-card relative rounded-[22px] border border-[#d8e7ff] bg-white p-4 shadow-[0_14px_42px_rgba(15,23,42,0.07)]",
        compact ? "w-[286px] shrink-0" : "w-full",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={classNames("inline-flex h-[24px] items-center rounded-full px-3 text-white", statusClassName)}>
            <span className="block text-[11px] font-semibold leading-none tracking-[-0.025px] text-white">
              {getMeetingStatusLabel(meeting.status)}
            </span>
          </span>
          <MeetingModeTag meeting={meeting} size="mobile" />
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            aria-label="회의 메뉴"
            className="moa-action-icon grid h-[30px] w-[30px] place-items-center rounded-full bg-[#f3f8ff] text-[#526070]"
          >
            <MoreIcon className="h-[16px] w-[16px]" />
          </button>
          {menuOpen ? (
            <div className="moa-popover-menu absolute right-0 top-[34px] z-10 w-[116px] rounded-[14px] border border-[#e5edf6] bg-white p-1 shadow-[0_16px_40px_rgba(15,23,42,0.14)]">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onDeleteMeeting(meeting);
                }}
                disabled={deleting}
                className="moa-action-button flex h-[36px] w-full items-center justify-center rounded-[10px] text-[#ef4444] transition hover:bg-[#fff5f5] disabled:opacity-50"
              >
                <span className="block text-[12px] font-bold leading-none tracking-[-0.03px]">
                  {deleting ? "삭제 중" : "삭제"}
                </span>
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <h3 className="mt-4 line-clamp-2 min-h-[44px] text-[18px] font-bold leading-[1.25] tracking-[-0.6px] text-[#181818]">
        {meeting.title}
      </h3>
      <p className="mt-3 text-[13px] font-medium leading-none tracking-[-0.03px] text-[#90a1b9]">
        {formatDashboardCompactDateTime(getMeetingSortDate(meeting))}
      </p>

      <div className="mt-5 flex items-center gap-2">
        {completed ? (
          <button
            type="button"
            onClick={() => onOpenMeetingResult(meeting)}
            className="moa-action-button moa-dashboard-primary-button inline-flex h-[40px] flex-1 items-center justify-center rounded-full px-4 text-white"
          >
            <span className="block text-[13px] font-bold leading-none tracking-[-0.03px] text-white">결과 보기</span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onJoinMeeting(meeting.id)}
          className={classNames(
            "moa-action-button inline-flex h-[40px] flex-1 items-center justify-center rounded-full px-4 transition",
            completed
              ? "border border-[#d8e7ff] bg-white text-[#526070]"
              : "moa-dashboard-primary-button text-white",
          )}
        >
          <span className={classNames("block text-[13px] font-bold leading-none tracking-[-0.03px]", completed ? "text-[#526070]" : "text-white")}>
            {compact && !completed ? getUpcomingMeetingActionLabel(meeting.status) : getMeetingActionLabel(meeting.status)}
          </span>
        </button>
      </div>
    </article>
  );
}

function MobileEmptyCard({ message }: { message: string }) {
  return (
    <div className="flex min-h-[118px] w-full items-center justify-center rounded-[22px] border border-dashed border-[#d8e7ff] bg-white px-6 text-center">
      <p className="text-[13px] font-semibold leading-6 tracking-[-0.03px] text-[#90a1b9]">{message}</p>
    </div>
  );
}

function MobileMeetingCardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <article
      className={classNames(
        "h-[188px] animate-pulse rounded-[22px] border border-[#e5edf6] bg-white shadow-[0_14px_42px_rgba(15,23,42,0.05)]",
        compact ? "w-[286px] shrink-0" : "w-full",
      )}
    />
  );
}

function MobileMeetingListSkeleton() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, index) => (
        <MobileMeetingCardSkeleton key={index} />
      ))}
    </>
  );
}

function MoreIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path d="M6.5 12h.01M12 12h.01M17.5 12h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function MeetingModeTag({ meeting, size = "desktop" }: { meeting: DashboardMeeting; size?: "desktop" | "mobile" | "upcoming" }) {
  const demoMode = String(meeting.meeting_mode || "normal").toLowerCase() === "demo_balance";
  const sizeClassName =
    size === "mobile"
      ? "h-[24px] px-2.5"
      : size === "upcoming"
        ? "h-[24.5px] px-[9px]"
        : "h-[25px] px-[8.5px]";
  const textClassName =
    size === "mobile"
      ? "text-[11px] tracking-[-0.025px]"
      : size === "upcoming"
        ? "text-[10.5px] tracking-[-0.026px]"
        : "text-[10.5px] tracking-[-0.026px]";

  return (
    <span
      className={classNames(
        "inline-flex shrink-0 items-center justify-center rounded-full border",
        sizeClassName,
        demoMode
          ? "border-[#b8d9ff] bg-[#eff8ff] text-[#236cf3]"
          : "border-[#e3e8f1] bg-white text-[#90a1b9]",
      )}
    >
      <span className={classNames("moa-font-pretendard block whitespace-nowrap font-bold leading-none", textClassName)}>
        {demoMode ? "시연용" : "일반"}
      </span>
    </span>
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
        "moa-action-card relative h-[191.119px] w-[391.048px] shrink-0 snap-start overflow-hidden rounded-[19.654px] bg-white",
        featured
          ? "border-[0.949px] border-[rgba(19,127,188,0.5)] shadow-[21.01px_92.849px_26.431px_rgba(138,204,255,0),13.555px_59.64px_24.398px_rgba(138,204,255,0.01),7.455px_33.209px_20.332px_rgba(138,204,255,0.05),3.389px_14.91px_14.91px_rgba(138,204,255,0.09),0.678px_3.389px_8.133px_rgba(138,204,255,0.1)]"
          : "border-[0.678px] border-[#b5b5b5] shadow-[0_2.711px_5.422px_-1.355px_rgba(23,23,23,0.1),0_1.355px_2.711px_-1.355px_rgba(23,23,23,0.06)]",
      )}
    >
      <h3 className="moa-dt-card-title absolute left-[21.42px] top-[15.99px] max-w-[330px] truncate whitespace-nowrap">
        {meeting.title}
      </h3>
      <div className="absolute left-[21.42px] top-[56px]">
        <MeetingModeTag meeting={meeting} size="upcoming" />
      </div>
      <p className="moa-dt-card-date absolute left-[21.42px] top-[127.82px] max-w-[160px] truncate whitespace-nowrap">
        {formatDashboardCompactDateTime(getMeetingSortDate(meeting))}
      </p>
      <button
        type="button"
        onClick={() => onJoinMeeting(meeting.id)}
        onPointerDown={(event) => event.stopPropagation()}
        className={classNames(
          "moa-action-button absolute left-[264.04px] top-[133.24px] inline-flex h-[33.213px] w-[98.256px] items-center justify-center rounded-[54.896px] transition",
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
    <div className="moa-action-row relative h-[43.375px] w-full overflow-hidden rounded-[19.654px] bg-[var(--moa-surface-muted)] transition hover:bg-[var(--moa-hover-muted)]">
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
        <span className="ml-[10px] shrink-0">
          <MeetingModeTag meeting={meeting} />
        </span>
      </button>

      <div className="absolute right-[20.67px] top-[8.13px] flex items-center gap-[8px]">
        {completed ? (
          <button
            type="button"
            onClick={() => onOpenMeetingResult(meeting)}
            className="moa-action-button inline-flex h-[27.78px] min-w-[70.973px] items-center justify-center rounded-full border-[0.678px] border-[var(--moa-result-button)] bg-[var(--moa-result-button)] px-[14.233px] text-white transition hover:bg-[var(--moa-result-button-hover)]"
          >
            <span className="moa-dt-row-action-text moa-dt-row-action-text-strong block whitespace-nowrap">결과 보기</span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onJoinMeeting(meeting.id)}
          className="moa-action-button group inline-flex h-[27.78px] min-w-[69.467px] items-center justify-center rounded-full border-[0.678px] border-[var(--moa-dashboard-action-border)] bg-white px-[14.233px] text-[var(--moa-dashboard-action-text)] transition hover:border-[var(--moa-dashboard-outline)] hover:bg-[var(--moa-dashboard-outline-hover)] hover:text-[var(--moa-dashboard-outline)]"
        >
          <span className="moa-dt-row-action-text block whitespace-nowrap transition group-hover:text-[var(--moa-dashboard-outline)]">{getMeetingActionLabel(meeting.status)}</span>
        </button>
        <button
          type="button"
          onClick={() => onDeleteMeeting(meeting)}
          disabled={deleting}
          className="moa-action-button group inline-flex h-[27.78px] min-w-[57px] items-center justify-center rounded-full border-[0.678px] border-[#d9e4f4] bg-white px-[11px] text-[#90a1b9] transition hover:border-[#ef4444]/30 hover:bg-[#fff5f5] hover:text-[#ef4444] disabled:cursor-not-allowed disabled:opacity-50"
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
