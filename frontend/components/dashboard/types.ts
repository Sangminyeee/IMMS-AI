export interface DashboardMeeting {
  id: string;
  title: string;
  status: string;
  meeting_mode?: string | null;
  created_at: string;
  started_at?: string;
  ended_at?: string;
  scheduled_at?: string;
  host_id: string;
}

export interface DashboardMeetingTemplate {
  id: string;
  title: string;
  optionA: string;
  optionAKeyword: string;
  optionB: string;
  optionBKeyword: string;
  createdAt: string;
  updatedAt: string;
}

export type MeetingStatusFilter = "all" | "completed" | "scheduled" | "active";
