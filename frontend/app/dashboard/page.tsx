"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardCreateMeetingDialog } from "@/components/dashboard/DashboardCreateMeetingDialog";
import { DashboardMeetingsView } from "@/components/dashboard/DashboardMeetingsView";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { formatDashboardDateTime, getMeetingStatusLabel } from "@/components/dashboard/dashboardUtils";
import type { DashboardMeeting, MeetingStatusFilter } from "@/components/dashboard/types";
import { buildPrintableSummaryDocumentHtml } from "@/components/canvas/summaryDocumentHelpers";
import { useRequireAuth } from "@/components/auth/useRequireAuth";
import { MoaLogo } from "@/components/moa-ui/MoaLogo";
import { useMoaPresenceValue } from "@/components/moa-ui/useMoaPresence";
import { useAuth } from "@/contexts/AuthContext";
import { getCanvasWorkspaceState, saveCanvasWorkspacePatch } from "@/lib/api";
import { buildDemoBalanceMeetingContext, buildDemoBalanceMeetingGoal, normalizeCanvasDemoConfig } from "@/lib/demoMode";
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

function formatMeetingDuration(startedAt?: string, endedAt?: string) {
  const startedMs = Date.parse(startedAt || "");
  const endedMs = Date.parse(endedAt || "");
  if (!Number.isFinite(startedMs) || !Number.isFinite(endedMs) || endedMs < startedMs) {
    return "";
  }

  const totalMinutes = Math.max(0, Math.round((endedMs - startedMs) / 60000));
  if (totalMinutes < 60) return `${totalMinutes}분`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`;
}

export default function DashboardPage() {
  const router = useRouter();
  const { loading: authLoading, signOut } = useAuth();
  const { user } = useRequireAuth();

  const [meetings, setMeetings] = useState<DashboardMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newMeetingTitle, setNewMeetingTitle] = useState("");
  const [newMeetingDemoMode, setNewMeetingDemoMode] = useState(false);
  const [newMeetingDemoOptionA, setNewMeetingDemoOptionA] = useState("");
  const [newMeetingDemoOptionB, setNewMeetingDemoOptionB] = useState("");
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
  const [deletingMeetingId, setDeletingMeetingId] = useState<string | null>(null);

  useEffect(() => {
    console.log("📊 Dashboard - Auth check:", { authLoading, userEmail: user?.email });
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
      setMeetings((data || []) as DashboardMeeting[]);
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
    if (newMeetingDemoMode && (!newMeetingDemoOptionA.trim() || !newMeetingDemoOptionB.trim())) {
      alert("시연용 밸런스 게임은 A, B 선택지를 모두 입력해야 만들 수 있습니다.");
      return;
    }

    try {
      console.log("📊 Dashboard - Creating new meeting:", newMeetingTitle);
      const demoConfig = normalizeCanvasDemoConfig(
        newMeetingDemoMode
          ? {
              enabled: true,
              mode: "demo_balance",
              option_a: newMeetingDemoOptionA,
              option_b: newMeetingDemoOptionB,
              instruction: "발화할 때 A 또는 B를 먼저 말하고 이유를 설명해 주세요.",
            }
          : null,
      );
      const demoGoal = demoConfig.enabled
        ? buildDemoBalanceMeetingGoal(newMeetingTitle, demoConfig.option_a || "", demoConfig.option_b || "")
        : "";
      const demoContext = demoConfig.enabled
        ? buildDemoBalanceMeetingContext(demoConfig.option_a || "", demoConfig.option_b || "")
        : "";

      const { data, error } = await supabase
        .from("meetings")
        .insert([
          {
            title: newMeetingTitle,
            host_id: user.id,
            meeting_mode: demoConfig.enabled ? "demo_balance" : "normal",
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
      if (demoConfig.enabled) {
        await saveCanvasWorkspacePatch({
          meeting_id: data.id,
          demo_config: demoConfig,
          meeting_goal: demoGoal,
          meeting_goal_context: demoContext,
        });
      }
      setShowCreateModal(false);
      setNewMeetingTitle("");
      setNewMeetingDemoMode(false);
      setNewMeetingDemoOptionA("");
      setNewMeetingDemoOptionB("");

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

  const handleDeleteMeeting = async (meeting: DashboardMeeting) => {
    if (deletingMeetingId) return;
    const confirmed = window.confirm(
      `"${meeting.title}" 회의를 삭제할까요?\n삭제하면 전사, 캔버스, 최종 문서 데이터도 함께 삭제됩니다.`,
    );
    if (!confirmed) return;

    try {
      setDeletingMeetingId(meeting.id);
      const { error } = await supabase
        .from("meetings")
        .delete()
        .eq("id", meeting.id);

      if (error) throw error;

      setMeetings((prev) => prev.filter((item) => item.id !== meeting.id));
      setSelectedResultMeeting((current) => (current?.id === meeting.id ? null : current));
      setResultSummaries((prev) => {
        const next = { ...prev };
        delete next[meeting.id];
        return next;
      });
      setResultSolutionTopics((prev) => {
        const next = { ...prev };
        delete next[meeting.id];
        return next;
      });
      setResultSavedAt((prev) => {
        const next = { ...prev };
        delete next[meeting.id];
        return next;
      });
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
    } catch (error) {
      console.error("Error deleting meeting:", error);
      alert("회의 삭제에 실패했습니다: " + getErrorMessage(error, "알 수 없는 오류"));
    } finally {
      setDeletingMeetingId((current) => (current === meeting.id ? null : current));
    }
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

  const selectedResultPresence = useMoaPresenceValue(selectedResultMeeting);
  const selectedResultDialogMeeting = selectedResultPresence.presentValue;
  const selectedResultSummary = selectedResultDialogMeeting ? resultSummaries[selectedResultDialogMeeting.id] : null;
  const selectedResultError = selectedResultDialogMeeting ? resultErrors[selectedResultDialogMeeting.id] : "";
  const selectedResultRebuildMessage = selectedResultDialogMeeting ? resultRebuildMessages[selectedResultDialogMeeting.id] : "";
  const selectedResultSavedAt = selectedResultDialogMeeting ? resultSavedAt[selectedResultDialogMeeting.id] : "";
  const selectedResultLoading = selectedResultDialogMeeting ? resultLoadingMeetingId === selectedResultDialogMeeting.id : false;
  const selectedResultRebuilding = selectedResultDialogMeeting ? resultRebuildingMeetingId === selectedResultDialogMeeting.id : false;
  const selectedResultTopics = getFinalResultTopics(selectedResultSummary);
  const selectedResultCount = getFinalResultCount(selectedResultSummary);
  const selectedResultMarkdown = buildFinalResultMarkdown(selectedResultSummary);
  const selectedResultHasFinalResult = hasFinalResult(selectedResultSummary);
  const selectedResultDisplayCount = selectedResultCount || (selectedResultMarkdown ? 1 : 0);
  const selectedResultDocumentHtml = selectedResultMarkdown
    ? buildPrintableSummaryDocumentHtml(selectedResultMarkdown, { includeToolbar: false })
    : "";
  const selectedResultStatusLabel = selectedResultLoading
    ? "확인 중"
    : selectedResultRebuilding
      ? "재구성 중"
      : selectedResultHasFinalResult
        ? "저장됨"
        : "없음";
  const selectedResultDuration = selectedResultDialogMeeting
    ? formatMeetingDuration(selectedResultDialogMeeting.started_at, selectedResultDialogMeeting.ended_at)
    : "";

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

  return (
    <DashboardShell userEmail={user.email} onLogout={() => void handleLogout()}>
      <DashboardMeetingsView
        loading={loading}
        meetings={meetings}
        searchQuery={meetingSearchQuery}
        statusFilter={meetingStatusFilter}
        deletingMeetingId={deletingMeetingId}
        onCreateMeeting={() => setShowCreateModal(true)}
        onDeleteMeeting={(meeting) => void handleDeleteMeeting(meeting)}
        onJoinMeeting={handleJoinMeeting}
        onOpenMeetingResult={(meeting) => void handleOpenMeetingResult(meeting)}
        onSearchQueryChange={setMeetingSearchQuery}
        onStatusFilterChange={setMeetingStatusFilter}
      />

      <DashboardCreateMeetingDialog
        open={showCreateModal}
        meetingTitle={newMeetingTitle}
        demoMode={newMeetingDemoMode}
        demoOptionA={newMeetingDemoOptionA}
        demoOptionB={newMeetingDemoOptionB}
        onMeetingTitleChange={setNewMeetingTitle}
        onDemoModeChange={setNewMeetingDemoMode}
        onDemoOptionAChange={setNewMeetingDemoOptionA}
        onDemoOptionBChange={setNewMeetingDemoOptionB}
        onCreate={() => void handleCreateMeeting()}
        onClose={() => {
          setShowCreateModal(false);
          setNewMeetingTitle("");
          setNewMeetingDemoMode(false);
          setNewMeetingDemoOptionA("");
          setNewMeetingDemoOptionB("");
        }}
      />

      {selectedResultPresence.shouldRender && selectedResultDialogMeeting ? (
        <div className="moa-popover-backdrop fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/42 p-[clamp(14px,2vw,28px)] backdrop-blur-[3px]" data-exiting={selectedResultPresence.isExiting}>
          <div className="moa-popover-panel moa-font-pretendard flex max-h-[92vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-[30px] border border-[#dbe7f5] bg-[#f8f8f8] shadow-[0_30px_90px_rgba(15,23,42,0.18)]" data-exiting={selectedResultPresence.isExiting}>
            <div className="relative overflow-hidden border-b border-[#e1e7f2] bg-white px-[clamp(22px,3vw,42px)] py-[clamp(20px,3vh,30px)]">
              <div className="moa-dashboard-primary-button absolute inset-x-0 top-0 h-[5px]" />
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <MoaLogo showText={false} markClassName="h-[24px] w-[39px]" />
                    <span className="inline-flex h-[30px] items-center rounded-full border border-[#d8e7ff] bg-[#f3f9ff] px-3">
                      <span className="text-[12px] font-semibold leading-[1.4] tracking-[-0.03px] text-[#067bf8]">
                        최종 정리 문서
                      </span>
                    </span>
                    <span className="inline-flex h-[30px] items-center rounded-full border border-[#e1e7f2] bg-white px-3">
                      <span className="text-[12px] font-semibold leading-[1.4] tracking-[-0.03px] text-[#505050]">
                        {getMeetingStatusLabel(selectedResultDialogMeeting.status)}
                      </span>
                    </span>
                  </div>
                  <h2 className="mt-5 truncate text-[clamp(24px,2.4vw,32px)] font-bold leading-[1.35] tracking-[-0.8px] text-[#181818]">
                    {selectedResultDialogMeeting.title}
                  </h2>
                  <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] font-medium leading-[1.4] tracking-[-0.03px] text-[#90a1b9]">
                    <span>생성 {formatDashboardDateTime(selectedResultDialogMeeting.created_at)}</span>
                    {selectedResultDuration ? <span>진행 {selectedResultDuration}</span> : null}
                    <span>종료 {formatDashboardDateTime(selectedResultDialogMeeting.ended_at)}</span>
                    <span>결과 저장 {formatDashboardDateTime(selectedResultSavedAt)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleJoinMeeting(selectedResultDialogMeeting.id)}
                    className="inline-flex h-[40px] items-center justify-center rounded-full border border-[#c9c9c9] bg-white px-5 transition hover:bg-[#f5f8ff]"
                  >
                    <span className="text-[12px] font-semibold leading-[1.4] tracking-[-0.03px] text-[#505050]">
                      회의 열기
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopyFinalResultMarkdown()}
                    disabled={!hasFinalResult(selectedResultSummary)}
                    className="inline-flex h-[40px] items-center justify-center rounded-full border border-[#d8e7ff] bg-[#f3f9ff] px-5 transition hover:border-[#9ecbff] hover:bg-[#eaf5ff] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="text-[12px] font-semibold leading-[1.4] tracking-[-0.03px] text-[#067bf8]">
                      마크다운 복사
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedResultMeeting(null)}
                    className="inline-flex h-[40px] w-[40px] items-center justify-center rounded-full border border-[#e1e7f2] bg-white text-[20px] font-semibold leading-none text-[#505050] transition hover:bg-[#f5f8ff]"
                    aria-label="결과 닫기"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[18px] border border-[#e3e8f1] bg-[#fbfdff] px-4 py-4">
                  <p className="text-[12px] font-semibold leading-[1.4] tracking-[-0.03px] text-[#90a1b9]">최종 결과</p>
                  <p className="mt-2 text-[24px] font-bold leading-none tracking-[-0.6px] text-[#181818]">{selectedResultDisplayCount}</p>
                </div>
                <div className="rounded-[18px] border border-[#e3e8f1] bg-[#fbfdff] px-4 py-4">
                  <p className="text-[12px] font-semibold leading-[1.4] tracking-[-0.03px] text-[#90a1b9]">문서 섹션</p>
                  <p className="mt-2 text-[24px] font-bold leading-none tracking-[-0.6px] text-[#181818]">{selectedResultTopics.length}</p>
                </div>
                <div className="rounded-[18px] border border-[#e3e8f1] bg-[#fbfdff] px-4 py-4">
                  <p className="text-[12px] font-semibold leading-[1.4] tracking-[-0.03px] text-[#90a1b9]">결과 상태</p>
                  <p className="mt-2 text-[24px] font-bold leading-none tracking-[-0.6px] text-[#181818]">{selectedResultStatusLabel}</p>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-[clamp(18px,2.6vw,34px)] py-[clamp(20px,3vh,32px)]">
              {selectedResultLoading ? (
                <div className="rounded-[26px] border border-[#e1e7f2] bg-white p-8 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                  <div className="flex items-center gap-4">
                    <div className="h-11 w-11 animate-spin rounded-full border-[3px] border-[#d8e7ff] border-t-[#067bf8]" />
                    <div>
                      <p className="text-[16px] font-bold leading-[1.4] tracking-[-0.4px] text-[#181818]">최종 결과를 확인하는 중입니다.</p>
                      <p className="mt-1 text-[13px] font-medium leading-[1.6] tracking-[-0.325px] text-[#667085]">회의 종료 시 저장된 워크스페이스 결과를 확인하고 있습니다.</p>
                    </div>
                  </div>
                  <div className="mt-7 grid gap-4 md:grid-cols-2">
                    <div className="h-28 animate-pulse rounded-[18px] bg-[#f7f9fc]" />
                    <div className="h-28 animate-pulse rounded-[18px] bg-[#f7f9fc]" />
                  </div>
                </div>
              ) : selectedResultError ? (
                <div className="rounded-[26px] border border-[#f0c6c6] bg-white p-7 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                  <div className="inline-flex h-[30px] items-center rounded-full bg-[#fff5f5] px-3">
                    <span className="text-[12px] font-semibold leading-[1.4] tracking-[-0.03px] text-[#b23b3b]">확인 실패</span>
                  </div>
                  <h3 className="mt-4 text-[20px] font-bold leading-[1.4] tracking-[-0.5px] text-[#181818]">최종 결과를 확인할 수 없습니다.</h3>
                  <p className="mt-3 text-[13px] font-medium leading-[1.7] tracking-[-0.325px] text-[#b23b3b]">{selectedResultError}</p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void handleOpenMeetingResult(selectedResultDialogMeeting)}
                      className="inline-flex h-[40px] items-center justify-center rounded-full border border-[#d8e7ff] bg-[#f3f9ff] px-5 transition hover:border-[#9ecbff] hover:bg-[#eaf5ff]"
                    >
                      <span className="text-[12px] font-semibold leading-[1.4] tracking-[-0.03px] text-[#067bf8]">다시 시도</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRebuildFinalResult(selectedResultDialogMeeting)}
                      disabled={selectedResultRebuilding}
                      className="inline-flex h-[40px] items-center justify-center rounded-full border border-[#c9c9c9] bg-white px-5 transition hover:bg-[#f5f8ff] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="text-[12px] font-semibold leading-[1.4] tracking-[-0.03px] text-[#505050]">
                        {selectedResultRebuilding ? "재구성 중" : "결과 재구성"}
                      </span>
                    </button>
                  </div>
                </div>
              ) : !selectedResultHasFinalResult ? (
                <div className="rounded-[26px] border border-dashed border-[#cbd7e8] bg-white px-6 py-12 text-center shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#f3f9ff] text-2xl font-semibold text-[#067bf8]">
                    !
                  </div>
                  <h3 className="mt-5 text-[20px] font-bold leading-[1.4] tracking-[-0.5px] text-[#181818]">저장된 최종 결과가 없습니다.</h3>
                  <p className="mx-auto mt-3 max-w-[520px] text-[13px] font-medium leading-[1.7] tracking-[-0.325px] text-[#667085]">
                    요약 단계에서 최종 정리 문서를 생성하거나 직접 작성한 뒤 회의를 종료하면 이곳에 보고서 형태로 표시됩니다.
                  </p>
                  {selectedResultRebuildMessage ? (
                    <p className="mx-auto mt-5 max-w-[520px] rounded-[18px] border border-[#d8e7ff] bg-[#f3f9ff] px-4 py-3 text-[13px] font-semibold leading-[1.7] tracking-[-0.325px] text-[#067bf8]">
                      {selectedResultRebuildMessage}
                    </p>
                  ) : null}
                  <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => void handleRebuildFinalResult(selectedResultDialogMeeting)}
                      disabled={selectedResultRebuilding}
                      className="inline-flex h-[40px] items-center justify-center rounded-full border border-[#c9c9c9] bg-white px-5 transition hover:bg-[#f5f8ff] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="text-[12px] font-semibold leading-[1.4] tracking-[-0.03px] text-[#505050]">
                        {selectedResultRebuilding ? "재구성 중" : "결과 재구성"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleJoinMeeting(selectedResultDialogMeeting.id)}
                      className="moa-dashboard-primary-button inline-flex h-[40px] items-center justify-center rounded-full px-6 shadow-[0_12px_28px_rgba(5,66,255,0.18)] transition"
                    >
                      <span className="relative z-[1] block whitespace-nowrap text-[12px] font-bold leading-[1.4] tracking-[-0.03px] text-white">회의 화면으로 이동</span>
                    </button>
                  </div>
                </div>
              ) : selectedResultTopics.length === 0 ? (
                <div className="space-y-5">
                  {selectedResultRebuildMessage ? (
                    <div className="rounded-[18px] border border-[#d8e7ff] bg-[#f3f9ff] px-5 py-4 text-[13px] font-semibold leading-[1.7] tracking-[-0.325px] text-[#067bf8]">
                      {selectedResultRebuildMessage}
                    </div>
                  ) : null}
                  <section className="overflow-hidden rounded-[26px] border border-[#e1e7f2] bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e1e7f2] bg-[#fbfdff] px-6 py-5">
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold leading-[1.4] tracking-[-0.03px] text-[#067bf8]">
                          Final Document
                        </p>
                        <h3 className="mt-2 text-[clamp(18px,1.8vw,24px)] font-bold leading-[1.4] tracking-[-0.6px] text-[#181818]">
                          최종 정리 문서
                        </h3>
                      </div>
                      <span className="moa-dashboard-primary-button inline-flex h-[30px] items-center rounded-full px-3">
                        <span className="relative z-[1] block whitespace-nowrap text-[12px] font-bold leading-[1.4] tracking-[-0.03px] text-white">
                          저장됨
                        </span>
                      </span>
                    </div>
                    <div className="h-[min(68vh,760px)] bg-[#f7f9fc] p-3">
                      <iframe
                        title="저장된 최종 정리 문서"
                        srcDoc={selectedResultDocumentHtml}
                        className="h-full w-full rounded-[20px] border border-[#edf1f6] bg-white"
                      />
                    </div>
                  </section>
                </div>
              ) : (
                <div className="space-y-5">
                  {selectedResultRebuildMessage ? (
                    <div className="rounded-[18px] border border-[#d8e7ff] bg-[#f3f9ff] px-5 py-4 text-[13px] font-semibold leading-[1.7] tracking-[-0.325px] text-[#067bf8]">
                      {selectedResultRebuildMessage}
                    </div>
                  ) : null}
                  {selectedResultTopics.map((topic) => (
                    <section key={topic.topic_id} className="overflow-hidden rounded-[26px] border border-[#e1e7f2] bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e1e7f2] bg-[#fbfdff] px-6 py-5">
                        <div className="min-w-0">
                          <p className="text-[12px] font-semibold leading-[1.4] tracking-[-0.03px] text-[#067bf8]">Section {topic.topic_no}</p>
                          <h3 className="mt-2 text-[clamp(18px,1.8vw,24px)] font-bold leading-[1.4] tracking-[-0.6px] text-[#181818]">
                            {topic.topic_title || topic.problem_topic || `해결책 ${topic.topic_no}`}
                          </h3>
                        </div>
                        <span className="moa-dashboard-primary-button inline-flex h-[30px] items-center rounded-full px-3">
                          <span className="relative z-[1] block whitespace-nowrap text-[12px] font-bold leading-[1.4] tracking-[-0.03px] text-white">
                            최종 {(topic.final_notes || []).length}개
                          </span>
                        </span>
                      </div>
                      <div className="p-6">
                        {topic.problem_topic || topic.solution_conclusion ? (
                          <div className="grid gap-4 md:grid-cols-2">
                            {topic.problem_topic ? (
                              <div className="rounded-[18px] border border-[#e1e7f2] bg-[#f7f9fc] p-4">
                                <p className="text-[12px] font-semibold leading-[1.4] tracking-[-0.03px] text-[#90a1b9]">문제 정의</p>
                                <p className="mt-2 text-[14px] font-medium leading-[1.75] tracking-[-0.35px] text-[#181818]">{topic.problem_topic}</p>
                              </div>
                            ) : null}
                            {topic.solution_conclusion ? (
                              <div className="rounded-[18px] border border-[#d8e7ff] bg-[#f3f9ff] p-4">
                                <p className="text-[12px] font-semibold leading-[1.4] tracking-[-0.03px] text-[#067bf8]">해결책 결론</p>
                                <p className="mt-2 text-[14px] font-medium leading-[1.75] tracking-[-0.35px] text-[#181818]">{topic.solution_conclusion}</p>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="mt-5 space-y-3">
                          <p className="text-[13px] font-bold leading-[1.4] tracking-[-0.325px] text-[#4d4d4d]">최종 선택 메모</p>
                          {(topic.final_notes || []).map((note) => (
                            <article key={note.id} className="rounded-[18px] border border-[#e1e7f2] bg-[#fbfdff] px-4 py-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex h-[26px] items-center rounded-full border border-[#d8e7ff] bg-white px-2.5">
                                  <span className="text-[11px] font-semibold leading-[1.4] tracking-[-0.028px] text-[#067bf8]">
                                    {note.source === "ai" ? "AI 채택" : "사용자 메모"}
                                  </span>
                                </span>
                                {(note.agenda_titles || []).length > 0 ? (
                                  <span className="text-[12px] font-medium leading-[1.4] tracking-[-0.03px] text-[#90a1b9]">{(note.agenda_titles || []).join(", ")}</span>
                                ) : null}
                              </div>
                              <p className="mt-3 text-[15px] font-bold leading-[1.7] tracking-[-0.375px] text-[#181818]">{note.note_text}</p>
                              {note.final_comment ? (
                                <p className="mt-2 text-[13px] font-medium leading-[1.7] tracking-[-0.325px] text-[#667085]">{note.final_comment}</p>
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
