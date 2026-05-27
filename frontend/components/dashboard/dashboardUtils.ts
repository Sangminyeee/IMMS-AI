import type { DashboardMeeting, MeetingStatusFilter } from "./types";

export function isCompletedMeeting(status: string) {
  return status === "completed";
}

export function isActiveMeeting(status: string) {
  return status === "active" || status === "in_progress";
}

export function isScheduledMeeting(status: string) {
  return status === "scheduled" || status === "waiting";
}

export function getMeetingStatusLabel(status: string) {
  if (isActiveMeeting(status)) return "진행중";
  if (isScheduledMeeting(status)) return "예정";
  if (isCompletedMeeting(status)) return "종료";
  return status;
}

export function getMeetingActionLabel(status: string) {
  if (isCompletedMeeting(status)) return "회의 열기";
  if (isActiveMeeting(status)) return "입장하기";
  return "입장하기";
}

export function getUpcomingMeetingActionLabel(status: string) {
  if (isActiveMeeting(status)) return "참여하기";
  return "입장하기";
}

export function getMeetingSortDate(meeting: DashboardMeeting) {
  return meeting.scheduled_at || meeting.ended_at || meeting.created_at;
}

export function getMeetingStatusTone(status: string) {
  if (isCompletedMeeting(status)) return "completed";
  if (isActiveMeeting(status)) return "active";
  return "scheduled";
}

export function matchesStatusFilter(meeting: DashboardMeeting, filter: MeetingStatusFilter) {
  if (filter === "all") return true;
  if (filter === "completed") return isCompletedMeeting(meeting.status);
  if (filter === "active") return isActiveMeeting(meeting.status);
  return isScheduledMeeting(meeting.status);
}

export function formatDashboardDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .replace(/\. /g, ".")
    .replace(/\.$/, "");
}

export function formatDashboardDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(date)
    .replace(/\. /g, ".")
    .replace(/\.$/, "");
}

export function formatDashboardCompactDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const datePart = new Intl.DateTimeFormat("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .replace(/\. /g, ".")
    .replace(/\.$/, "");

  const timePart = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
  }).format(date);

  return `${datePart} ${timePart}`;
}
