export interface DashboardMeeting {
  id: string;
  title: string;
  status: string;
  created_at: string;
  started_at?: string;
  ended_at?: string;
  scheduled_at?: string;
  host_id: string;
}

export type MeetingStatusFilter = "all" | "completed" | "scheduled" | "active";
