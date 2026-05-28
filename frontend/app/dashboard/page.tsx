"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardCreateMeetingDialog } from "@/components/dashboard/DashboardCreateMeetingDialog";
import { DashboardMeetingsView } from "@/components/dashboard/DashboardMeetingsView";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { formatDashboardDateTime, getMeetingStatusLabel } from "@/components/dashboard/dashboardUtils";
import type { DashboardMeeting, MeetingStatusFilter } from "@/components/dashboard/types";
import { useAuth } from "@/contexts/AuthContext";
import { getCanvasWorkspaceState, saveCanvasWorkspacePatch } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { CanvasFinalSolutionSummary, CanvasFinalSolutionSummaryTopic, CanvasSolutionTopicResponse } from "@/lib/types";

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return fallback;
}

function getFinalResultCount(summary: CanvasFinalSolutionSummary | null | undefined) {
  if (!summary) return 0;
  const topicNoteCount = (summary.topics || []).reduce((count, topic) => count + (topic.final_notes || []).length, 0);
  return Math.max(summary.final_count || 0, (summary.items || []).length, topicNoteCount, (summary.sections || []).length);
}

function hasFinalResult(summary: CanvasFinalSolutionSummary | null | undefined) {
  return getFinalResultCount(summary) > 0 || Boolean(summary?.markdown?.trim());
}

function getFinalResultTopics(summary: CanvasFinalSolutionSummary | null | undefined): CanvasFinalSolutionSummaryTopic[] {
  if (!summary) return [];
  if ((summary.topics || []).length > 0) {
    return summary.topics.map((topic) => ({
      ...topic,
      final_notes:
        topic.final_notes && topic.final_notes.length > 0
          ? topic.final_notes
          : (summary.items || []).filter((item) => item.topic_id === topic.topic_id),
    }));
  }

  const topicMap = new Map<string, CanvasFinalSolutionSummaryTopic>();
  for (const item of summary.items || []) {
    const topicId = item.topic_id || item.topic_title || "result";
    const current = topicMap.get(topicId);
    if (current) {
      current.final_notes.push(item);
      continue;
    }
    topicMap.set(topicId, {
      topic_id: topicId,
      topic_no: item.topic_no || topicMap.size + 1,
      topic_title: item.topic_title || item.problem_topic || "최종 결과",
      problem_topic: item.problem_topic || "",
      solution_conclusion: item.solution_conclusion || "",
      final_notes: [item],
    });
  }
  return Array.from(topicMap.values()).sort((a, b) => a.topic_no - b.topic_no);
}

function buildFinalResultMarkdown(summary: CanvasFinalSolutionSummary | null | undefined) {
  if (!summary) return "";
  if (summary.markdown?.trim()) return summary.markdown.trim();

  return getFinalResultTopics(summary)
    .map((topic) => {
      const lines = [
        `## ${topic.topic_title || topic.problem_topic || `주제 ${topic.topic_no}`}`,
        topic.problem_topic ? `- 문제: ${topic.problem_topic}` : "",
        topic.solution_conclusion ? `- 해결책: ${topic.solution_conclusion}` : "",
        ...topic.final_notes.map((note) => `- ${note.note_text}${note.final_comment ? `: ${note.final_comment}` : ""}`),
      ].filter(Boolean);
      return lines.join("\n");
    })
    .join("\n\n");
}

function buildFinalResultSummaryFromSolutionTopics(topics: CanvasSolutionTopicResponse[]): CanvasFinalSolutionSummary {
  const summaryTopics = (topics || [])
    .map((topic) => {
      const finalNotes = (topic.notes || [])
        .filter((note) => note.is_final_candidate)
        .map((note) => ({
          id: `${topic.group_id}::${note.id}`,
          topic_id: topic.group_id,
          topic_no: topic.topic_no,
          topic_title: topic.topic,
          problem_topic: topic.problem_topic || "",
          problem_conclusion: topic.problem_conclusion || "",
          solution_conclusion: topic.conclusion || "",
          note_id: note.id,
          note_text: note.text,
          final_comment: note.final_comment || "",
          source: note.source || "user",
          source_ai_id: note.source_ai_id || "",
          agenda_titles: topic.agenda_titles || [],
        }))
        .filter((note) => note.note_text.trim());

      return {
        topic_id: topic.group_id,
        topic_no: topic.topic_no,
        topic_title: topic.topic,
        problem_topic: topic.problem_topic || "",
        solution_conclusion: topic.conclusion || "",
        final_notes: finalNotes,
      };
    })
    .filter((topic) => topic.final_notes.length > 0);

  const items = summaryTopics.flatMap((topic) => topic.final_notes);
  const markdown = summaryTopics
    .map((topic) => {
      const title = topic.topic_title || `해결책 ${topic.topic_no}`;
      const lines = topic.final_notes.map((note) => {
        const comment = note.final_comment ? `\n  - 설명: ${note.final_comment}` : "";
        return `- ${note.note_text}${comment}`;
      });
      return [`## ${title}`, ...lines].join("\n");
    })
    .join("\n\n");

  return {
    final_count: items.length,
    topics: summaryTopics,
    items,
    markdown,
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();

  const [meetings, setMeetings] = useState<DashboardMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newMeetingTitle, setNewMeetingTitle] = useState("");
  const [meetingSearchQuery, setMeetingSearchQuery] = useState("");
  const [meetingStatusFilter, setMeetingStatusFilter] = useState<MeetingStatusFilter>("all");
  const [selectedResultMeeting, setSelectedResultMeeting] = useState<DashboardMeeting | null>(null);
  const [resultSummaries, setResultSummaries] = useState<Record<string, CanvasFinalSolutionSummary | null>>({});
  const [resultSolutionTopics, setResultSolutionTopics] = useState<Record<string, CanvasSolutionTopicResponse[]>>({});
  const [resultSavedAt, setResultSavedAt] = useState<Record<string, string>>({});
  const [resultErrors, setResultErrors] = useState<Record<string, string>>({});
  const [resultRebuildMessages, setResultRebuildMessages] = useState<Record<string, string>>({});
  const [resultLoadingMeetingId, setResultLoadingMeetingId] = useState<string | null>(null);
  const [resultRebuildingMeetingId, setResultRebuildingMeetingId] = useState<string | null>(null);

  useEffect(() => {
    console.log("📊 Dashboard - Auth check:", { authLoading, userEmail: user?.email });
    if (!authLoading && !user) {
      console.log("❌ Dashboard - No user, redirecting to /login");
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      console.log("📊 Dashboard - Loading meetings for user:", user.email);
      void loadMeetings();
    }
  }, [user]);

  const loadMeetings = async () => {
    try {
      setLoading(true);
      console.log("📊 Dashboard - Fetching meetings from Supabase...");

      const { data, error } = await supabase
        .from("meetings")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error("❌ Dashboard - Failed to load meetings:", error);
        throw error;
      }

      console.log("✅ Dashboard - Loaded meetings:", data?.length || 0);
      setMeetings(data || []);
    } catch (error) {
      console.error("Error loading meetings:", error);
      alert("회의 목록을 불러오는데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMeeting = async () => {
    if (!user) return;
    if (!newMeetingTitle.trim()) {
      alert("회의 제목을 입력해주세요.");
      return;
    }

    try {
      console.log("📊 Dashboard - Creating new meeting:", newMeetingTitle);

      const { data, error } = await supabase
        .from("meetings")
        .insert([
          {
            title: newMeetingTitle,
            host_id: user.id,
            status: "scheduled",
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("❌ Dashboard - Failed to create meeting:", error);
        throw error;
      }

      console.log("✅ Dashboard - Meeting created:", data.id);
      setShowCreateModal(false);
      setNewMeetingTitle("");

      await loadMeetings();
      router.push(`/?meeting_id=${data.id}`);
    } catch (error) {
      console.error("Error creating meeting:", error);
      alert("회의 생성에 실패했습니다: " + getErrorMessage(error, "알 수 없는 오류"));
    }
  };

  const handleJoinMeeting = (meetingId: string) => {
    console.log("📊 Dashboard - Joining meeting:", meetingId);
    router.push(`/?meeting_id=${meetingId}`);
  };

  const handleOpenMeetingResult = async (meeting: DashboardMeeting) => {
    setSelectedResultMeeting(meeting);
    if (resultLoadingMeetingId === meeting.id) return;

    try {
      setResultLoadingMeetingId(meeting.id);
      setResultErrors((prev) => {
        const next = { ...prev };
        delete next[meeting.id];
        return next;
      });
      setResultRebuildMessages((prev) => {
        const next = { ...prev };
        delete next[meeting.id];
        return next;
      });

      const workspace = await getCanvasWorkspaceState(meeting.id);
      const summary = workspace.final_solution_summary || null;
      setResultSummaries((prev) => ({ ...prev, [meeting.id]: summary }));
      setResultSolutionTopics((prev) => ({ ...prev, [meeting.id]: workspace.solution_topics || [] }));
      setResultSavedAt((prev) => ({ ...prev, [meeting.id]: workspace.saved_at || "" }));
    } catch (error) {
      console.error("Failed to load meeting final result:", error);
      setResultSummaries((prev) => ({ ...prev, [meeting.id]: null }));
      setResultErrors((prev) => ({
        ...prev,
        [meeting.id]: getErrorMessage(error, "최종 결과를 불러오지 못했습니다."),
      }));
    } finally {
      setResultLoadingMeetingId((current) => (current === meeting.id ? null : current));
    }
  };

  const handleCopyFinalResultMarkdown = async () => {
    const markdown = buildFinalResultMarkdown(selectedResultMeeting ? resultSummaries[selectedResultMeeting.id] : null);
    if (!markdown) return;

    try {
      await navigator.clipboard.writeText(markdown);
      alert("최종 결과 마크다운을 복사했습니다.");
    } catch (error) {
      console.error("Failed to copy final result markdown:", error);
      alert("마크다운 복사에 실패했습니다.");
    }
  };

  const handleRebuildFinalResult = async (meeting: DashboardMeeting) => {
    if (resultRebuildingMeetingId === meeting.id) return;

    try {
      setResultRebuildingMeetingId(meeting.id);
      setResultErrors((prev) => {
        const next = { ...prev };
        delete next[meeting.id];
        return next;
      });
      setResultRebuildMessages((prev) => {
        const next = { ...prev };
        delete next[meeting.id];
        return next;
      });

      let topics = resultSolutionTopics[meeting.id] || [];
      if (topics.length === 0) {
        const workspace = await getCanvasWorkspaceState(meeting.id);
        topics = workspace.solution_topics || [];
        setResultSolutionTopics((prev) => ({ ...prev, [meeting.id]: topics }));

        if (hasFinalResult(workspace.final_solution_summary)) {
          setResultSummaries((prev) => ({ ...prev, [meeting.id]: workspace.final_solution_summary || null }));
          setResultSavedAt((prev) => ({ ...prev, [meeting.id]: workspace.saved_at || "" }));
          setResultRebuildMessages((prev) => ({ ...prev, [meeting.id]: "이미 저장된 최종 결과를 다시 불러왔습니다." }));
          return;
        }
      }

      const rebuiltSummary = buildFinalResultSummaryFromSolutionTopics(topics);
      if (!hasFinalResult(rebuiltSummary)) {
        setResultRebuildMessages((prev) => ({
          ...prev,
          [meeting.id]: "최종 결과로 선택된 해결책 메모가 없어 재구성할 수 없습니다.",
        }));
        return;
      }

      const savedWorkspace = await saveCanvasWorkspacePatch({
        meeting_id: meeting.id,
        final_solution_summary: rebuiltSummary,
      });
      setResultSummaries((prev) => ({ ...prev, [meeting.id]: rebuiltSummary }));
      setResultSavedAt((prev) => ({ ...prev, [meeting.id]: savedWorkspace.saved_at || new Date().toISOString() }));
      setResultRebuildMessages((prev) => ({
        ...prev,
        [meeting.id]: `최종 결과 ${rebuiltSummary.final_count}개를 재구성해 저장했습니다.`,
      }));
    } catch (error) {
      console.error("Failed to rebuild final result:", error);
      setResultErrors((prev) => ({
        ...prev,
        [meeting.id]: getErrorMessage(error, "최종 결과 재구성에 실패했습니다."),
      }));
    } finally {
      setResultRebuildingMeetingId((current) => (current === meeting.id ? null : current));
    }
  };

  const handleLogout = async () => {
    console.log("📊 Dashboard - Logging out...");
    await signOut();
    router.push("/login");
  };

  if (authLoading) {
    console.log("⏳ Dashboard - Auth loading...");
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--moa-app-bg)]">
        <div className="rounded-2xl border border-black/10 bg-white px-8 py-7 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-[3px] border-[var(--moa-primary-soft)] border-t-[var(--moa-primary)]" />
          <p className="mt-4 text-sm font-medium text-[var(--moa-text-body)]">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    console.log("❌ Dashboard - No user, showing redirect message");
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--moa-app-bg)]">
        <div className="rounded-2xl border border-black/10 bg-white px-8 py-7 text-center">
          <p className="text-sm font-medium text-[var(--moa-text-body)]">로그인이 필요합니다. 리다이렉트 중...</p>
        </div>
      </div>
    );
  }

  console.log("🎨 Dashboard - Rendering UI with", meetings.length, "meetings");

  const selectedResultSummary = selectedResultMeeting ? resultSummaries[selectedResultMeeting.id] : null;
  const selectedResultError = selectedResultMeeting ? resultErrors[selectedResultMeeting.id] : "";
  const selectedResultRebuildMessage = selectedResultMeeting ? resultRebuildMessages[selectedResultMeeting.id] : "";
  const selectedResultSavedAt = selectedResultMeeting ? resultSavedAt[selectedResultMeeting.id] : "";
  const selectedResultLoading = selectedResultMeeting ? resultLoadingMeetingId === selectedResultMeeting.id : false;
  const selectedResultRebuilding = selectedResultMeeting ? resultRebuildingMeetingId === selectedResultMeeting.id : false;
  const selectedResultTopics = getFinalResultTopics(selectedResultSummary);
  const selectedResultCount = getFinalResultCount(selectedResultSummary);
  const selectedResultStatusLabel = selectedResultLoading
    ? "확인 중"
    : selectedResultRebuilding
      ? "재구성 중"
    : hasFinalResult(selectedResultSummary)
      ? "저장됨"
      : "없음";

  return (
    <DashboardShell userEmail={user.email} onLogout={() => void handleLogout()}>
      <DashboardMeetingsView
        loading={loading}
        meetings={meetings}
        searchQuery={meetingSearchQuery}
        statusFilter={meetingStatusFilter}
        onCreateMeeting={() => setShowCreateModal(true)}
        onJoinMeeting={handleJoinMeeting}
        onOpenMeetingResult={(meeting) => void handleOpenMeetingResult(meeting)}
        onSearchQueryChange={setMeetingSearchQuery}
        onStatusFilterChange={setMeetingStatusFilter}
      />

      <DashboardCreateMeetingDialog
        open={showCreateModal}
        meetingTitle={newMeetingTitle}
        onMeetingTitleChange={setNewMeetingTitle}
        onCreate={() => void handleCreateMeeting()}
        onClose={() => {
          setShowCreateModal(false);
          setNewMeetingTitle("");
        }}
      />

      {selectedResultMeeting ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-[clamp(12px,2vw,28px)]">
          <div className="flex max-h-[90vh] w-full max-w-[1120px] flex-col overflow-hidden rounded-[20px] bg-[var(--moa-app-bg)] shadow-2xl">
            <div className="bg-[#111827] px-[clamp(20px,3vw,36px)] py-[clamp(20px,3vh,30px)] text-white">
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white/12 px-3 py-1 text-xs font-semibold tracking-[0.12em] text-white/80">
                      FINAL REPORT
                    </span>
                    <span className="rounded-full bg-[var(--moa-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--moa-primary-strong)]">
                      {getMeetingStatusLabel(selectedResultMeeting.status)}
                    </span>
                  </div>
                  <h2 className="mt-4 truncate text-[clamp(24px,3vw,36px)] font-semibold leading-tight text-white">
                    {selectedResultMeeting.title}
                  </h2>
                  <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/70">
                    <span>생성 {formatDashboardDateTime(selectedResultMeeting.created_at)}</span>
                    <span>종료 {formatDashboardDateTime(selectedResultMeeting.ended_at)}</span>
                    <span>결과 저장 {formatDashboardDateTime(selectedResultSavedAt)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleJoinMeeting(selectedResultMeeting.id)}
                    className="inline-flex h-10 items-center rounded-[12px] bg-white/10 px-4 text-sm font-semibold text-white transition hover:bg-white/16"
                  >
                    회의 열기
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopyFinalResultMarkdown()}
                    disabled={!hasFinalResult(selectedResultSummary)}
                    className="inline-flex h-10 items-center rounded-[12px] bg-white px-4 text-sm font-semibold text-[#111827] transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    마크다운 복사
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedResultMeeting(null)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl font-semibold text-white transition hover:bg-white/16"
                    aria-label="결과 닫기"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[16px] border border-white/10 bg-white/8 px-4 py-3">
                  <p className="text-xs font-semibold text-white/55">최종 결과</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{selectedResultCount}</p>
                </div>
                <div className="rounded-[16px] border border-white/10 bg-white/8 px-4 py-3">
                  <p className="text-xs font-semibold text-white/55">문서 섹션</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{selectedResultTopics.length}</p>
                </div>
                <div className="rounded-[16px] border border-white/10 bg-white/8 px-4 py-3">
                  <p className="text-xs font-semibold text-white/55">결과 상태</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{selectedResultStatusLabel}</p>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-[clamp(16px,2.6vw,32px)] py-[clamp(18px,3vh,30px)]">
              {selectedResultLoading ? (
                <div className="rounded-[20px] border border-black/10 bg-white p-8">
                  <div className="flex items-center gap-4">
                    <div className="h-11 w-11 animate-spin rounded-full border-[3px] border-[var(--moa-primary-soft)] border-t-[var(--moa-primary)]" />
                    <div>
                      <p className="text-base font-semibold text-black">최종 결과를 확인하는 중입니다.</p>
                      <p className="mt-1 text-sm text-[var(--moa-text-body)]">회의 종료 시 저장된 워크스페이스 결과를 확인하고 있습니다.</p>
                    </div>
                  </div>
                  <div className="mt-7 grid gap-4 md:grid-cols-2">
                    <div className="h-28 animate-pulse rounded-[16px] bg-[var(--moa-surface-soft)]" />
                    <div className="h-28 animate-pulse rounded-[16px] bg-[var(--moa-surface-soft)]" />
                  </div>
                </div>
              ) : selectedResultError ? (
                <div className="rounded-[20px] border border-[#f0c6c6] bg-white p-7">
                  <div className="inline-flex rounded-full bg-[#fff5f5] px-3 py-1 text-xs font-semibold text-[#b23b3b]">확인 실패</div>
                  <h3 className="mt-4 text-xl font-semibold text-black">최종 결과를 확인할 수 없습니다.</h3>
                  <p className="mt-3 text-sm leading-6 text-[#b23b3b]">{selectedResultError}</p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void handleOpenMeetingResult(selectedResultMeeting)}
                      className="inline-flex h-10 items-center rounded-[12px] border border-[var(--moa-primary-border)] bg-[var(--moa-primary-soft)] px-4 text-sm font-semibold text-[var(--moa-primary-strong)] transition hover:border-[var(--moa-primary)] hover:bg-[var(--moa-primary-soft)]"
                    >
                      다시 시도
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRebuildFinalResult(selectedResultMeeting)}
                      disabled={selectedResultRebuilding}
                      className="inline-flex h-10 items-center rounded-[12px] border border-black/10 bg-white px-4 text-sm font-semibold text-black transition hover:bg-[#f5f6f8] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {selectedResultRebuilding ? "재구성 중" : "결과 재구성"}
                    </button>
                  </div>
                </div>
              ) : selectedResultTopics.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-black/15 bg-white px-6 py-12 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--moa-primary-soft)] text-2xl font-semibold text-[var(--moa-primary)]">
                    !
                  </div>
                  <h3 className="mt-5 text-xl font-semibold text-black">저장된 최종 결과가 없습니다.</h3>
                  <p className="mx-auto mt-3 max-w-[520px] text-sm leading-6 text-[var(--moa-text-body)]">
                    요약 단계에서 최종 정리 문서를 생성하거나 직접 작성한 뒤 회의를 종료하면 이곳에 보고서 형태로 표시됩니다.
                  </p>
                  {selectedResultRebuildMessage ? (
                    <p className="mx-auto mt-5 max-w-[520px] rounded-[14px] bg-[var(--moa-primary-soft)] px-4 py-3 text-sm font-semibold leading-6 text-[var(--moa-primary)]">
                      {selectedResultRebuildMessage}
                    </p>
                  ) : null}
                  <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => void handleRebuildFinalResult(selectedResultMeeting)}
                      disabled={selectedResultRebuilding}
                      className="inline-flex h-11 items-center rounded-[14px] border border-black/10 bg-white px-5 text-sm font-semibold text-black transition hover:bg-[#f5f6f8] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {selectedResultRebuilding ? "재구성 중" : "결과 재구성"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleJoinMeeting(selectedResultMeeting.id)}
                      className="inline-flex h-11 items-center rounded-[14px] border border-[var(--moa-primary-border)] bg-[var(--moa-primary-soft)] px-5 text-sm font-semibold text-[var(--moa-primary-strong)] transition hover:border-[var(--moa-primary)] hover:bg-[var(--moa-primary-soft)]"
                    >
                      회의 화면으로 이동
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {selectedResultRebuildMessage ? (
                    <div className="rounded-[16px] border border-[var(--moa-primary-border)] bg-[var(--moa-primary-soft)] px-5 py-4 text-sm font-semibold text-[var(--moa-primary)]">
                      {selectedResultRebuildMessage}
                    </div>
                  ) : null}
                  {selectedResultTopics.map((topic) => (
                    <section key={topic.topic_id} className="overflow-hidden rounded-[20px] border border-black/10 bg-white shadow-[0_8px_26px_rgba(15,23,42,0.05)]">
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-black/10 bg-[#fbfcff] px-6 py-5">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--moa-primary)]">Solution {topic.topic_no}</p>
                          <h3 className="mt-2 text-[clamp(18px,2vw,24px)] font-semibold leading-tight text-black">
                            {topic.topic_title || topic.problem_topic || `해결책 ${topic.topic_no}`}
                          </h3>
                        </div>
                        <span className="rounded-full bg-[#111827] px-3 py-1 text-xs font-semibold text-white">
                          최종 {(topic.final_notes || []).length}개
                        </span>
                      </div>
                      <div className="p-6">
                        {topic.problem_topic || topic.solution_conclusion ? (
                          <div className="grid gap-4 md:grid-cols-2">
                            {topic.problem_topic ? (
                              <div className="rounded-[16px] border border-black/10 bg-[var(--moa-app-bg)] p-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#777]">문제 정의</p>
                                <p className="mt-2 text-sm leading-6 text-black">{topic.problem_topic}</p>
                              </div>
                            ) : null}
                            {topic.solution_conclusion ? (
                              <div className="rounded-[16px] border border-[var(--moa-primary-border)] bg-[var(--moa-primary-soft)] p-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--moa-primary)]">해결책 결론</p>
                                <p className="mt-2 text-sm leading-6 text-black">{topic.solution_conclusion}</p>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="mt-5 space-y-3">
                          <p className="text-sm font-semibold text-[var(--moa-text-body)]">최종 선택 메모</p>
                          {(topic.final_notes || []).map((note) => (
                            <article key={note.id} className="border-l-4 border-[var(--moa-primary)] bg-[var(--moa-app-bg)] px-4 py-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[var(--moa-primary)]">
                                  {note.source === "ai" ? "AI 채택" : "사용자 메모"}
                                </span>
                                {(note.agenda_titles || []).length > 0 ? (
                                  <span className="text-xs text-[#777]">{(note.agenda_titles || []).join(", ")}</span>
                                ) : null}
                              </div>
                              <p className="mt-3 text-base font-semibold leading-7 text-black">{note.note_text}</p>
                              {note.final_comment ? (
                                <p className="mt-2 text-sm leading-6 text-[var(--moa-text-body)]">{note.final_comment}</p>
                              ) : null}
                            </article>
                          ))}
                        </div>
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}
