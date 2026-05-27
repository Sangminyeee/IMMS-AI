"use client";

import { useCallback, useEffect, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  buildSummaryDocumentSourceSignature,
  getSummaryEligibleStructureGroups,
  type ProblemStructureGroupViewModel,
  type ProblemStructureNodeViewModel,
} from "@/components/canvas/problemStructureModel";
import { generateCanvasSummaryDocument, saveCanvasWorkspacePatch } from "@/lib/api";
import type {
  CanvasFinalSolutionSummary,
  CanvasSummaryDocumentSection,
  CanvasSummaryStructuredDocument,
  MeetingState,
} from "@/lib/types";

type CanvasStage = "ideation" | "problem-definition" | "solution";

type SharedWorkspaceSnapshot = {
  stage: CanvasStage;
  finalSolutionSummary: CanvasFinalSolutionSummary;
  importedState: MeetingState | null;
};

type BuildSummaryDocumentFromResponse = (input: {
  markdown: string;
  sections: CanvasSummaryDocumentSection[];
  generatedAt: string;
  usedLlm: boolean;
  warning?: string;
  sourceSignature: string;
  structured?: CanvasSummaryStructuredDocument;
}) => CanvasFinalSolutionSummary;

type UseSummaryDocumentActionsOptions = {
  buildSummaryDocumentFromResponse: BuildSummaryDocumentFromResponse;
  busy: boolean;
  finalSummaryDocument: CanvasFinalSolutionSummary;
  forceBroadcastSharedCanvas: (overrides?: {
    stage?: CanvasStage;
    finalSolutionSummary?: CanvasFinalSolutionSummary;
  }) => void;
  latestSharedWorkspaceRef: MutableRefObject<SharedWorkspaceSnapshot>;
  meetingId: string;
  meetingTopicForAi: string;
  normalizeFinalSolutionSummaryPayload: (
    raw?: CanvasFinalSolutionSummary | null,
  ) => CanvasFinalSolutionSummary;
  persistedSharedImportedState: MeetingState | null;
  problemStructureGroups: ProblemStructureGroupViewModel[];
  problemStructureNodes: ProblemStructureNodeViewModel[];
  setActivityMessage: (message: string) => void;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setFinalSummaryDocument: Dispatch<SetStateAction<CanvasFinalSolutionSummary>>;
  setLeftPanelTab: (value: "detail") => void;
  setSelectedNodeId: Dispatch<SetStateAction<string>>;
  setSelectedProblemGroupId: Dispatch<SetStateAction<string>>;
  setStage: Dispatch<SetStateAction<CanvasStage>>;
  setSummaryDocumentDraftDirty: Dispatch<SetStateAction<boolean>>;
  setSummaryDocumentDraftMarkdown: Dispatch<SetStateAction<string>>;
  setSummaryDocumentEditMode: Dispatch<SetStateAction<boolean>>;
  setSummaryDocumentPending: Dispatch<SetStateAction<boolean>>;
  setSummaryEvidenceOpenGroupIds: Dispatch<SetStateAction<Set<string>>>;
  sharedSyncEnabled: boolean;
  summaryDocumentDraftDirty: boolean;
  summaryDocumentDraftMarkdown: string;
  summaryDocumentEditMode: boolean;
  summaryDocumentPending: boolean;
};

export function useSummaryDocumentActions({
  buildSummaryDocumentFromResponse,
  busy,
  finalSummaryDocument,
  forceBroadcastSharedCanvas,
  latestSharedWorkspaceRef,
  meetingId,
  meetingTopicForAi,
  normalizeFinalSolutionSummaryPayload,
  persistedSharedImportedState,
  problemStructureGroups,
  problemStructureNodes,
  setActivityMessage,
  setBusy,
  setFinalSummaryDocument,
  setLeftPanelTab,
  setSelectedNodeId,
  setSelectedProblemGroupId,
  setStage,
  setSummaryDocumentDraftDirty,
  setSummaryDocumentDraftMarkdown,
  setSummaryDocumentEditMode,
  setSummaryDocumentPending,
  setSummaryEvidenceOpenGroupIds,
  sharedSyncEnabled,
  summaryDocumentDraftDirty,
  summaryDocumentDraftMarkdown,
  summaryDocumentEditMode,
  summaryDocumentPending,
}: UseSummaryDocumentActionsOptions) {
  const [summaryDocumentSaving, setSummaryDocumentSaving] = useState(false);

  useEffect(() => {
    if (!summaryDocumentEditMode && !summaryDocumentDraftDirty) {
      setSummaryDocumentDraftMarkdown(finalSummaryDocument.markdown);
    }
  }, [finalSummaryDocument.markdown, setSummaryDocumentDraftMarkdown, summaryDocumentDraftDirty, summaryDocumentEditMode]);

  const handleCopyFinalSolutionMarkdown = useCallback(async () => {
    const markdown = (summaryDocumentDraftDirty ? summaryDocumentDraftMarkdown : finalSummaryDocument.markdown).trim();
    if (!markdown) {
      setActivityMessage("복사할 요약 문서가 없습니다.");
      return;
    }

    try {
      await navigator.clipboard.writeText(markdown);
      setActivityMessage("요약 문서를 마크다운으로 복사했습니다.");
    } catch (error) {
      console.error("Failed to copy final solution markdown:", error);
      setActivityMessage("브라우저 권한 문제로 마크다운 복사에 실패했습니다.");
    }
  }, [finalSummaryDocument.markdown, setActivityMessage, summaryDocumentDraftDirty, summaryDocumentDraftMarkdown]);

  const handleSummaryDocumentMarkdownChange = useCallback(
    (value: string) => {
      setSummaryDocumentDraftMarkdown(value);
      setSummaryDocumentDraftDirty(value !== finalSummaryDocument.markdown);
    },
    [finalSummaryDocument.markdown, setSummaryDocumentDraftDirty, setSummaryDocumentDraftMarkdown],
  );

  const handleToggleSummaryEvidence = useCallback(
    (groupId: string) => {
      setSummaryEvidenceOpenGroupIds((current) => {
        const next = new Set(current);
        if (next.has(groupId)) {
          next.delete(groupId);
        } else {
          next.add(groupId);
        }
        return next;
      });
    },
    [setSummaryEvidenceOpenGroupIds],
  );

  const handleGenerateSummaryDocument = useCallback(
    async (options?: { force?: boolean }) => {
      const eligibleGroups = getSummaryEligibleStructureGroups(problemStructureGroups);
      setStage("solution");
      setLeftPanelTab("detail");
      setSelectedProblemGroupId("");
      setSelectedNodeId("");

      if (eligibleGroups.length === 0) {
        setActivityMessage("요약 문서에 포함할 2단계 구조화 그룹이 없습니다.");
        return;
      }

      const hasExistingSummaryDocument =
        finalSummaryDocument.markdown.trim() && (finalSummaryDocument.sections || []).length > 0;
      if (!options?.force && hasExistingSummaryDocument) {
        setActivityMessage("기존 요약 문서를 유지했습니다. 다시 만들려면 요약 단계의 다시 생성 버튼을 사용해 주세요.");
        return;
      }

      setSummaryDocumentPending(true);
      setBusy(true);
      try {
        const result = await generateCanvasSummaryDocument({
          meeting_id: meetingId,
          meeting_topic: meetingTopicForAi,
          groups: eligibleGroups.map((group) => ({
            id: group.id,
            title: group.title,
            node_ids: group.nodeIds,
            rationale: group.rationale,
            status: group.status,
            created_by: group.createdBy,
          })),
          nodes: problemStructureNodes.map((node) => ({
            id: node.id,
            source_group_id: node.sourceGroupId,
            title: node.title,
            body: node.body,
            status: node.status,
            depth: node.depth,
          })),
        });
        const nextFinalSummary = buildSummaryDocumentFromResponse({
          markdown: result.markdown || "",
          sections: result.sections || [],
          generatedAt: result.generated_at,
          usedLlm: result.used_llm,
          warning: result.warning,
          sourceSignature:
            result.source_signature || buildSummaryDocumentSourceSignature(eligibleGroups, problemStructureNodes),
          structured: result.structured,
        });

        setFinalSummaryDocument(nextFinalSummary);
        setSummaryDocumentDraftMarkdown(nextFinalSummary.markdown);
        setSummaryDocumentDraftDirty(false);
        setSummaryDocumentEditMode(false);
        setSummaryEvidenceOpenGroupIds(new Set());
        latestSharedWorkspaceRef.current = {
          ...latestSharedWorkspaceRef.current,
          stage: "solution",
          finalSolutionSummary: nextFinalSummary,
          importedState: persistedSharedImportedState,
        };
        if (sharedSyncEnabled) {
          forceBroadcastSharedCanvas({
            stage: "solution",
            finalSolutionSummary: nextFinalSummary,
          });
          if (meetingId) {
            void saveCanvasWorkspacePatch({
              meeting_id: meetingId,
              stage: "solution",
              final_solution_summary: nextFinalSummary,
              imported_state: persistedSharedImportedState,
            }).catch((error) => {
              console.error("Failed to save summary document:", error);
            });
          }
        }
        setActivityMessage(result.warning || `구조화 그룹 ${eligibleGroups.length}개 기준으로 요약 문서를 생성했습니다.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setActivityMessage(`요약 문서 생성 실패: ${message}`);
      } finally {
        setSummaryDocumentPending(false);
        setBusy(false);
      }
    },
    [
      buildSummaryDocumentFromResponse,
      finalSummaryDocument.markdown,
      finalSummaryDocument.sections,
      forceBroadcastSharedCanvas,
      latestSharedWorkspaceRef,
      meetingId,
      meetingTopicForAi,
      persistedSharedImportedState,
      problemStructureGroups,
      problemStructureNodes,
      setActivityMessage,
      setBusy,
      setFinalSummaryDocument,
      setLeftPanelTab,
      setSelectedNodeId,
      setSelectedProblemGroupId,
      setStage,
      setSummaryDocumentDraftDirty,
      setSummaryDocumentDraftMarkdown,
      setSummaryDocumentEditMode,
      setSummaryDocumentPending,
      setSummaryEvidenceOpenGroupIds,
      sharedSyncEnabled,
    ],
  );

  const handleSaveSummaryDocument = useCallback(async () => {
    if (summaryDocumentPending || summaryDocumentSaving) {
      setActivityMessage("요약 문서 저장 작업이 이미 진행 중입니다.");
      return;
    }

    const nextFinalSummary = normalizeFinalSolutionSummaryPayload({
      ...finalSummaryDocument,
      markdown: summaryDocumentDraftMarkdown,
      document_status: summaryDocumentDraftMarkdown.trim() ? "edited" : "empty",
    });

    setSummaryDocumentSaving(true);
    try {
      if (meetingId) {
        await saveCanvasWorkspacePatch({
          meeting_id: meetingId,
          stage: "solution",
          final_solution_summary: nextFinalSummary,
          imported_state: persistedSharedImportedState,
        });
      }

      setFinalSummaryDocument(nextFinalSummary);
      setSummaryDocumentDraftMarkdown(nextFinalSummary.markdown);
      setSummaryDocumentDraftDirty(false);
      setSummaryDocumentEditMode(false);
      latestSharedWorkspaceRef.current = {
        ...latestSharedWorkspaceRef.current,
        stage: "solution",
        finalSolutionSummary: nextFinalSummary,
        importedState: persistedSharedImportedState,
      };

      if (sharedSyncEnabled) {
        forceBroadcastSharedCanvas({
          stage: "solution",
          finalSolutionSummary: nextFinalSummary,
        });
      }

      setActivityMessage(
        sharedSyncEnabled
          ? "최종 정리 문서를 저장하고 참가자에게 반영했습니다."
          : "최종 정리 문서를 저장했습니다. 공유 동기화가 꺼져 있어 참가자에게는 즉시 반영되지 않습니다.",
      );
    } catch (error) {
      console.error("Failed to save summary document edit:", error);
      const message = error instanceof Error ? error.message : String(error);
      setActivityMessage(`최종 정리 문서 저장 실패: ${message}`);
    } finally {
      setSummaryDocumentSaving(false);
    }
  }, [
    finalSummaryDocument,
    forceBroadcastSharedCanvas,
    latestSharedWorkspaceRef,
    meetingId,
    normalizeFinalSolutionSummaryPayload,
    persistedSharedImportedState,
    setActivityMessage,
    setFinalSummaryDocument,
    setSummaryDocumentDraftDirty,
    setSummaryDocumentDraftMarkdown,
    setSummaryDocumentEditMode,
    sharedSyncEnabled,
    summaryDocumentDraftMarkdown,
    summaryDocumentPending,
    summaryDocumentSaving,
  ]);

  const handleRegenerateSummaryDocument = useCallback(async () => {
    if (busy || summaryDocumentPending) {
      setActivityMessage("요약 문서 생성 작업이 이미 진행 중입니다.");
      return;
    }
    await handleGenerateSummaryDocument({ force: true });
  }, [busy, handleGenerateSummaryDocument, setActivityMessage, summaryDocumentPending]);

  return {
    handleCopyFinalSolutionMarkdown,
    handleGenerateSummaryDocument,
    handleRegenerateSummaryDocument,
    handleSaveSummaryDocument,
    handleSummaryDocumentMarkdownChange,
    handleToggleSummaryEvidence,
    summaryDocumentDraftDirty,
    summaryDocumentSaving,
  };
}
