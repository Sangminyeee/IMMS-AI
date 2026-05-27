import { useMemo } from "react";
import { classNames } from "@/lib/classNames";
import { BellIcon, PlusIcon, SearchIcon } from "./DashboardIcons";
import {
  formatDashboardDateTime,
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
  onJoinMeeting: (meetingId: string) => void;
  onOpenMeetingResult: (meeting: DashboardMeeting) => void;
  onSearchQueryChange: (query: string) => void;
  onStatusFilterChange: (filter: MeetingStatusFilter) => void;
  searchQuery: string;
  statusFilter: MeetingStatusFilter;
}

const statusFilters: Array<{ label: string; value: MeetingStatusFilter }> = [
  { label: "전체", value: "all" },
  { label: "종료", value: "completed" },
  { label: "예정", value: "scheduled" },
  { label: "진행중", value: "active" },
];

export function DashboardMeetingsView({
  loading,
  meetings,
  onCreateMeeting,
  onJoinMeeting,
  onOpenMeetingResult,
  onSearchQueryChange,
  onStatusFilterChange,
  searchQuery,
  statusFilter,
}: DashboardMeetingsViewProps) {
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

  return (
    <div className="moa-dashboard-type min-h-full bg-[var(--moa-surface)] pb-16">
      <section className="relative ml-[clamp(11px,0.71vw,20px)] mt-[clamp(12px,0.74vw,21px)] min-h-[clamp(458px,28.63vw,811px)] overflow-hidden rounded-tl-[clamp(27px,1.66vw,47px)] bg-[linear-gradient(104deg,var(--moa-hero-start)_1%,var(--moa-hero-end)_87%)]">
        <div className="absolute left-[clamp(83px,5.15vw,146px)] top-[clamp(50px,3.14vw,89px)]">
          <h1 className="moa-dt-hero">
            <span className="block">오늘의 회의를</span>
            <span className="block">하나의 흐름으로 정리하세요</span>
          </h1>
        </div>

        <div className="absolute left-[clamp(83px,5.15vw,146px)] right-[clamp(250px,15.6vw,442px)] top-[clamp(118px,7.38vw,209px)] h-px bg-[linear-gradient(90deg,var(--moa-primary)_0%,var(--moa-placeholder-text)_100%)] opacity-70" />

        <button
          type="button"
          onClick={onCreateMeeting}
          className="absolute left-[clamp(874px,54.54vw,1545px)] top-[clamp(70px,4.34vw,123px)] inline-flex h-[64px] w-[202px] items-center justify-start rounded-[68px] bg-[var(--moa-primary)] pl-[22px] transition hover:bg-[var(--moa-primary-hover)]"
        >
          <PlusIcon className="mr-[7px] h-[26px] w-[26px]" />
          <span className="moa-dt-main-cta block">새 회의 만들기</span>
        </button>

        <div className="absolute left-[clamp(83px,5.15vw,146px)] top-[clamp(222px,13.9vw,394px)]">
          <div className="mb-[clamp(5px,0.32vw,9px)] ml-[clamp(9px,0.56vw,16px)] flex items-center gap-[clamp(4px,0.25vw,7px)]">
            <BellIcon className="h-[39px] w-[39px] text-[var(--moa-primary)]" />
            <h2 className="moa-dt-section-title">
              <span className="block">예정된 회의</span>
            </h2>
          </div>

          {loading ? (
            <UpcomingSkeleton />
          ) : upcomingMeetings.length === 0 ? (
            <div className="flex h-[282px] w-[577px] items-center rounded-[29px] bg-[var(--moa-surface)] px-[33px] shadow-[0_12px_22px_rgba(143,143,143,0.08)]">
              <p className="text-[20px] font-semibold text-[var(--moa-disabled-text)]">
                <span className="block">예정된 회의가 없습니다.</span>
              </p>
            </div>
          ) : (
            <div className="relative -mx-2 overflow-hidden">
              <div className="flex max-w-[calc(100vw-var(--dashboard-sidebar)-clamp(120px,7.5vw,212px))] gap-[53px] overflow-x-auto px-2 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {upcomingMeetings.map((meeting) => (
                  <UpcomingMeetingCard key={meeting.id} meeting={meeting} onJoinMeeting={onJoinMeeting} />
                ))}
              </div>
              <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[110px] bg-gradient-to-r from-white/0 to-white lg:block" />
            </div>
          )}
        </div>
      </section>

      <section className="pl-[clamp(94px,5.86vw,166px)] pr-[clamp(90px,5.58vw,158px)] pt-[clamp(29px,1.84vw,52px)]">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <h2 className="moa-dt-section-title">
              <span className="block">전체 회의 목록</span>
            </h2>
            <div className="flex flex-wrap gap-[clamp(4px,0.28vw,8px)]">
              {statusFilters.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => onStatusFilterChange(filter.value)}
                  className={classNames(
                    "moa-dt-filter inline-flex h-8 items-center rounded-lg px-3 transition",
                    statusFilter === filter.value
                      ? "bg-[var(--moa-filter-selected-bg)] text-[var(--moa-filter-selected-text)]"
                      : "bg-[var(--moa-surface-soft)] text-[var(--moa-filter-text)] hover:bg-[var(--moa-filter-hover)]",
                  )}
                >
                  {filter.value === "all" && statusFilter === "all" ? <span className="mr-1.5 text-[13px]">✓</span> : null}
                  <span className="block">{filter.label}</span>
                </button>
              ))}
            </div>
          </div>

          <label className="flex h-[45px] w-[223px] items-center rounded-full border border-[var(--moa-border-soft)] bg-[var(--moa-surface)] px-4 text-[var(--moa-text-body)]">
            <input
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="Search"
              className="moa-dt-search-input min-w-0 flex-1 bg-transparent text-[var(--moa-text-strong)] outline-none"
            />
            <SearchIcon className="ml-2 h-4 w-4 shrink-0 text-[var(--moa-text)]" />
          </label>
        </div>

        <div className="mt-[clamp(31px,1.94vw,55px)] space-y-[clamp(5px,0.32vw,9px)]">
          {loading ? (
            <MeetingRowsSkeleton />
          ) : filteredMeetings.length === 0 ? (
            <div className="flex h-[128px] items-center justify-center rounded-[29px] bg-[var(--moa-surface-muted)] px-6 text-center">
              <p className="text-[20px] font-semibold text-[var(--moa-disabled-text)]">
                <span className="block">
                  {meetings.length === 0 ? "아직 생성된 회의가 없습니다." : "조건에 맞는 회의가 없습니다."}
                </span>
              </p>
            </div>
          ) : (
            filteredMeetings.map((meeting) => (
              <MeetingListRow
                key={meeting.id}
                meeting={meeting}
                onJoinMeeting={onJoinMeeting}
                onOpenMeetingResult={onOpenMeetingResult}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function UpcomingMeetingCard({
  meeting,
  onJoinMeeting,
}: {
  meeting: DashboardMeeting;
  onJoinMeeting: (meetingId: string) => void;
}) {
  const tone = getMeetingStatusTone(meeting.status);

  return (
    <article className="flex h-[282px] w-[577px] shrink-0 flex-col rounded-[29px] bg-[var(--moa-surface)] px-[33px] py-[25px] shadow-[0_22px_22px_rgba(143,143,143,0.09),0_1px_3px_rgba(143,143,143,0.1)]">
      <h3 className="moa-dt-card-title truncate">
        <span className="block truncate">{meeting.title}</span>
      </h3>
      <div className="mt-auto flex items-center justify-between gap-4">
        <p className="moa-dt-card-date truncate">
          <span className="block truncate">{formatDashboardDateTime(getMeetingSortDate(meeting))}</span>
        </p>
        <button
          type="button"
          onClick={() => onJoinMeeting(meeting.id)}
          className={classNames(
            "inline-flex h-16 w-[210px] items-center justify-center rounded-full px-10 transition",
            tone === "active"
              ? "border-2 border-white bg-[var(--moa-primary-border)] text-white hover:bg-[var(--moa-primary)]"
              : "border-2 border-[var(--moa-primary-border)] bg-[var(--moa-surface)] text-[var(--moa-primary-border)] hover:bg-[var(--moa-primary-soft)]",
          )}
        >
          <span className="moa-dt-card-cta block">
            {getUpcomingMeetingActionLabel(meeting.status)}
          </span>
        </button>
      </div>
    </article>
  );
}

function MeetingListRow({
  meeting,
  onJoinMeeting,
  onOpenMeetingResult,
}: {
  meeting: DashboardMeeting;
  onJoinMeeting: (meetingId: string) => void;
  onOpenMeetingResult: (meeting: DashboardMeeting) => void;
}) {
  const completed = isCompletedMeeting(meeting.status);

  return (
    <div className="grid h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-[29px] bg-[var(--moa-surface-muted)] px-[18px] transition hover:bg-[var(--moa-hover-muted)]">
      <span
        className={classNames(
          "inline-flex h-[41px] min-w-[67px] items-center justify-center rounded-full border border-[var(--moa-border)] px-[21px] text-white",
          completed ? "bg-[var(--moa-status-completed)]" : getMeetingStatusTone(meeting.status) === "active" ? "bg-[var(--moa-status-active)]" : "bg-[var(--moa-status-scheduled)]",
        )}
      >
        <span className="moa-dt-pill-text block text-white">{getMeetingStatusLabel(meeting.status)}</span>
      </span>

      <button
        type="button"
        onClick={() => (completed ? onOpenMeetingResult(meeting) : onJoinMeeting(meeting.id))}
        className="grid min-w-0 grid-cols-[minmax(0,max-content)_auto_minmax(0,1fr)] items-center gap-4 text-left"
      >
        <span className="moa-dt-row-title truncate">
          <span className="block truncate">{meeting.title}</span>
        </span>
        <span className="h-[29px] w-px bg-[var(--moa-row-divider)]" />
        <span className="moa-dt-row-date truncate">
          <span className="block truncate">{formatDashboardDateTime(getMeetingSortDate(meeting))}</span>
        </span>
      </button>

      <div className="flex items-center justify-end gap-2">
        {completed ? (
          <button
            type="button"
            onClick={() => onOpenMeetingResult(meeting)}
            className="inline-flex h-[41px] items-center justify-center rounded-full border border-[var(--moa-border)] bg-[var(--moa-result-button)] px-[21px] text-white transition hover:bg-[var(--moa-result-button-hover)]"
          >
            <span className="moa-dt-pill-text block text-white">결과 보기</span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onJoinMeeting(meeting.id)}
          className="group inline-flex h-[41px] min-w-[103px] items-center justify-center rounded-full border border-[var(--moa-border)] bg-[var(--moa-surface)] px-[21px] text-[var(--moa-control-text)] transition hover:bg-[var(--moa-primary-soft)] hover:text-[var(--moa-primary)]"
        >
          <span className="moa-dt-pill-text block text-[var(--moa-control-text)] transition group-hover:text-[var(--moa-primary)]">{getMeetingActionLabel(meeting.status)}</span>
        </button>
      </div>
    </div>
  );
}

function UpcomingSkeleton() {
  return (
    <div className="flex gap-[53px] overflow-hidden">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-[282px] w-[577px] shrink-0 animate-pulse rounded-[29px] bg-white/80 shadow-[0_12px_22px_rgba(143,143,143,0.08)]"
        />
      ))}
    </div>
  );
}

function MeetingRowsSkeleton() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-16 animate-pulse rounded-[29px] bg-[var(--moa-surface-muted)]" />
      ))}
    </>
  );
}
