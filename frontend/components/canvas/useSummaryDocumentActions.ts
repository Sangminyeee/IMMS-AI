"use client";

import { useCallback, useEffect, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  buildSummaryDocumentSourceSignature,
  getSummaryEligibleStructureGroups,
  type ProblemStructureGroupViewModel,
  type ProblemStructureNodeViewModel,
} from "@/components/canvas/problemStructureModel";
import { SUMMARY_DOCUMENT_ARTIFACT } from "@/components/canvas/canvasArtifactGeneration";
import {
  areSummaryDocumentBlocksEqual,
  summaryDocumentBlocksToMarkdown,
} from "@/components/canvas/summaryDocumentHelpers";
import { generateCanvasSummaryConclusion, generateCanvasSummaryDocument, saveCanvasWorkspacePatch } from "@/lib/api";
import type {
  CanvasArtifactGenerationKey,
  CanvasArtifactGenerationMap,
  CanvasArtifactGenerationState,
  CanvasFinalSolutionSummary,
  CanvasEditPresencePayload,
  CanvasSummaryDocumentBlock,
  CanvasSummaryDocumentSection,
  CanvasSummaryStructuredDocument,
  MeetingState,
} from "@/lib/types";

type CanvasStage = "ideation" | "problem-definition" | "solution";

type SharedWorkspaceSnapshot = {
  stage: CanvasStage;
  finalSolutionSummary: CanvasFinalSolutionSummary;
  artifactGeneration: CanvasArtifactGenerationMap;
  importedState: MeetingState | null;
};

type BuildSummaryDocumentFromResponse = (input: {
  markdown: string;
  documentBlocks?: CanvasSummaryDocumentBlock[];
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
    artifactGeneration?: CanvasArtifactGenerationMap;
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
  setSummaryDocumentDraftBlocks: Dispatch<SetStateAction<CanvasSummaryDocumentBlock[]>>;
  setSummaryDocumentDraftMarkdown: Dispatch<SetStateAction<string>>;
  setSummaryDocumentEditMode: Dispatch<SetStateAction<boolean>>;
  setSummaryDocumentPending: Dispatch<SetStateAction<boolean>>;
  setSummaryEvidenceOpenGroupIds: Dispatch<SetStateAction<Set<string>>>;
  setLocalEditPresenceTarget: (target: { targetType: CanvasEditPresencePayload["target_type"]; targetId: string; noteId?: string } | null) => void;
  sharedSyncEnabled: boolean;
  startSharedArtifactGeneration: (
    artifactKey: CanvasArtifactGenerationKey,
    force?: boolean,
  ) => Promise<{
    acquired: boolean;
    generation: CanvasArtifactGenerationState;
    artifactGeneration: CanvasArtifactGenerationMap;
  }>;
  finishSharedArtifactGeneration: (
    artifactKey: CanvasArtifactGenerationKey,
    status: "ready" | "failed",
    generationId?: string,
    error?: string,
  ) => CanvasArtifactGenerationMap;
  summaryDocumentDraftBlocks: CanvasSummaryDocumentBlock[];
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
  setSummaryDocumentDraftBlocks,
  setSummaryDocumentDraftMarkdown,
  setSummaryDocumentEditMode,
  setSummaryDocumentPending,
  setSummaryEvidenceOpenGroupIds,
  setLocalEditPresenceTarget,
  sharedSyncEnabled,
  startSharedArtifactGeneration,
  finishSharedArtifactGeneration,
  summaryDocumentDraftBlocks,
  summaryDocumentDraftDirty,
  summaryDocumentDraftMarkdown,
  summaryDocumentEditMode,
  summaryDocumentPending,
}: UseSummaryDocumentActionsOptions) {
  const [summaryDocumentSaving, setSummaryDocumentSaving] = useState(false);

  useEffect(() => {
    if (!summaryDocumentEditMode && !summaryDocumentDraftDirty) {
      setSummaryDocumentDraftMarkdown(finalSummaryDocument.markdown);
      setSummaryDocumentDraftBlocks(finalSummaryDocument.document_blocks || []);
    }
  }, [
    finalSummaryDocument.document_blocks,
    finalSummaryDocument.markdown,
    setSummaryDocumentDraftBlocks,
    setSummaryDocumentDraftMarkdown,
    summaryDocumentDraftDirty,
    summaryDocumentEditMode,
  ]);

  const handleSetSummaryDocumentEditMode = useCallback(
    (editMode: boolean) => {
      if (editMode && summaryDocumentPending) {
        setActivityMessage("현재 재생성 중이라 수정할 수 없습니다. 완료 후 다시 시도해 주세요.");
        return;
      }
      setSummaryDocumentEditMode(editMode);
      setLocalEditPresenceTarget(editMode ? { targetType: "summary_document", targetId: "final" } : null);
      if (editMode) {
        setSummaryDocumentDraftBlocks(finalSummaryDocument.document_blocks || []);
        setSummaryDocumentDraftMarkdown(finalSummaryDocument.markdown);
        setSummaryDocumentDraftDirty(false);
      } else {
        setSummaryDocumentDraftBlocks(finalSummaryDocument.document_blocks || []);
        setSummaryDocumentDraftMarkdown(finalSummaryDocument.markdown);
        setSummaryDocumentDraftDirty(false);
      }
    },
    [
      finalSummaryDocument.document_blocks,
      finalSummaryDocument.markdown,
      setLocalEditPresenceTarget,
      setSummaryDocumentDraftBlocks,
      setSummaryDocumentDraftDirty,
      setSummaryDocumentDraftMarkdown,
      setSummaryDocumentEditMode,
      summaryDocumentPending,
      setActivityMessage,
    ],
  );

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
      if (summaryDocumentPending) {
        setActivityMessage("현재 재생성 중이라 문서를 수정할 수 없습니다. 완료 후 다시 시도해 주세요.");
        return;
      }
      setSummaryDocumentDraftMarkdown(value);
      setSummaryDocumentDraftDirty(value !== finalSummaryDocument.markdown);
    },
    [
      finalSummaryDocument.markdown,
      setActivityMessage,
      setSummaryDocumentDraftDirty,
      setSummaryDocumentDraftMarkdown,
      summaryDocumentPending,
    ],
  );

  const handleSummaryDocumentBlocksChange = useCallback(
    (blocks: CanvasSummaryDocumentBlock[]) => {
      if (summaryDocumentPending) {
        setActivityMessage("현재 재생성 중이라 문서를 수정할 수 없습니다. 완료 후 다시 시도해 주세요.");
        return;
      }
      const nextMarkdown = summaryDocumentBlocksToMarkdown(blocks);
      setSummaryDocumentDraftBlocks(blocks);
      setSummaryDocumentDraftMarkdown(nextMarkdown);
      setSummaryDocumentDraftDirty(
        nextMarkdown !== finalSummaryDocument.markdown ||
          !areSummaryDocumentBlocksEqual(blocks, finalSummaryDocument.document_blocks || []),
      );
    },
    [
      finalSummaryDocument.document_blocks,
      finalSummaryDocument.markdown,
      setActivityMessage,
      setSummaryDocumentDraftBlocks,
      setSummaryDocumentDraftDirty,
      setSummaryDocumentDraftMarkdown,
      summaryDocumentPending,
    ],
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
    async (options?: { force?: boolean; refreshCache?: boolean }) => {
      const eligibleGroups = getSummaryEligibleStructureGroups(problemStructureGroups, problemStructureNodes);
      if (eligibleGroups.length === 0) {
        setStage("solution");
        setLeftPanelTab("detail");
        setSelectedProblemGroupId("");
        setSelectedNodeId("");
        setSummaryDocumentPending(false);
        setActivityMessage("문제정의 2단계에서 확정된 분류가 있어야 요약 및 정리 문서를 생성할 수 있습니다.");
        return;
      }

      if (summaryDocumentPending) {
        setStage("solution");
        setLeftPanelTab("detail");
        setActivityMessage("현재 재생성 중입니다. 완료되면 자동으로 반영됩니다.");
        return;
      }
      setStage("solution");
      setLeftPanelTab("detail");
      setSelectedProblemGroupId("");
      setSelectedNodeId("");

      const hasExistingSummaryDocument =
        (finalSummaryDocument.markdown.trim() || (finalSummaryDocument.document_blocks || []).length > 0) &&
        (finalSummaryDocument.sections || []).length > 0;
      if (!options?.force && hasExistingSummaryDocument) {
        setActivityMessage("기존 요약 문서를 유지했습니다. 다시 만들려면 요약 단계의 다시 생성 버튼을 사용해 주세요.");
        return;
      }

      setSummaryDocumentPending(true);
      setBusy(true);
      let generationId = "";
      try {
        const generationStart = await startSharedArtifactGeneration(SUMMARY_DOCUMENT_ARTIFACT, false);
        generationId = generationStart.generation.generation_id || "";
        if (!generationStart.acquired) {
          setActivityMessage("요약 및 정리 문서 생성 요청이 이미 진행 중입니다. 완료되면 자동으로 반영됩니다.");
          return;
        }

        const result = await generateCanvasSummaryDocument({
          meeting_id: meetingId,
          meeting_topic: meetingTopicForAi,
          refresh_chunk_summaries: options?.refreshCache || undefined,
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
        const currentGenerationId =
          latestSharedWorkspaceRef.current.artifactGeneration?.[SUMMARY_DOCUMENT_ARTIFACT]?.generation_id || "";
        if (generationId && currentGenerationId && currentGenerationId !== generationId) {
          setActivityMessage("초기화 이후 도착한 이전 요약 생성 결과를 무시했습니다.");
          return;
        }
        const nextFinalSummary = buildSummaryDocumentFromResponse({
          markdown: result.markdown || "",
          documentBlocks: result.document_blocks || [],
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
        setSummaryDocumentDraftBlocks(nextFinalSummary.document_blocks || []);
        setSummaryDocumentDraftDirty(false);
        setSummaryDocumentEditMode(false);
        setLocalEditPresenceTarget(null);
        setSummaryEvidenceOpenGroupIds(new Set());
        latestSharedWorkspaceRef.current = {
          ...latestSharedWorkspaceRef.current,
          stage: "solution",
          finalSolutionSummary: nextFinalSummary,
          importedState: persistedSharedImportedState,
        };
        const readyArtifactGeneration = finishSharedArtifactGeneration(
          SUMMARY_DOCUMENT_ARTIFACT,
          "ready",
          generationId,
        );
        if (sharedSyncEnabled) {
          forceBroadcastSharedCanvas({
            stage: "solution",
            finalSolutionSummary: nextFinalSummary,
            artifactGeneration: readyArtifactGeneration,
          });
          if (meetingId) {
            void saveCanvasWorkspacePatch({
              meeting_id: meetingId,
              stage: "solution",
              final_solution_summary: nextFinalSummary,
              artifact_generation: readyArtifactGeneration,
              imported_state: persistedSharedImportedState,
            }).catch((error) => {
              console.error("Failed to save summary document:", error);
            });
          }
        }
        setActivityMessage(
          result.warning ||
            (options?.refreshCache
              ? `요약 캐시를 새로 만들고 구조화 그룹 ${eligibleGroups.length}개 기준으로 문서를 생성했습니다.`
              : `구조화 그룹 ${eligibleGroups.length}개 기준으로 요약 문서를 생성했습니다.`),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const currentGenerationId =
          latestSharedWorkspaceRef.current.artifactGeneration?.[SUMMARY_DOCUMENT_ARTIFACT]?.generation_id || "";
        if (generationId && currentGenerationId && currentGenerationId !== generationId) {
          setActivityMessage("초기화 이후 도착한 이전 요약 실패 응답을 무시했습니다.");
          return;
        }
        const failedArtifactGeneration = finishSharedArtifactGeneration(
          SUMMARY_DOCUMENT_ARTIFACT,
          "failed",
          generationId,
          message,
        );
        if (meetingId) {
          void saveCanvasWorkspacePatch({
            meeting_id: meetingId,
            artifact_generation: failedArtifactGeneration,
          }).catch((saveError) => {
            console.error("Failed to save failed summary document generation state:", saveError);
          });
        }
        setActivityMessage(`요약 문서 생성 실패: ${message}`);
      } finally {
        setSummaryDocumentPending(false);
        setBusy(false);
      }
    },
    [
      buildSummaryDocumentFromResponse,
      finalSummaryDocument.markdown,
      finalSummaryDocument.document_blocks,
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
      setLocalEditPresenceTarget,
      setSelectedNodeId,
      setSelectedProblemGroupId,
      setStage,
      setSummaryDocumentDraftBlocks,
      setSummaryDocumentDraftDirty,
      setSummaryDocumentDraftMarkdown,
      setSummaryDocumentEditMode,
      setSummaryDocumentPending,
      setSummaryEvidenceOpenGroupIds,
      sharedSyncEnabled,
      summaryDocumentPending,
      startSharedArtifactGeneration,
      finishSharedArtifactGeneration,
    ],
  );

  const handleSaveSummaryDocument = useCallback(async () => {
    if (summaryDocumentPending) {
      setActivityMessage("현재 재생성 중이라 저장할 수 없습니다. 완료 후 다시 시도해 주세요.");
      return;
    }
    if (summaryDocumentSaving) {
      setActivityMessage("요약 문서 저장 작업이 이미 진행 중입니다.");
      return;
    }

    const nextMarkdown = summaryDocumentBlocksToMarkdown(summaryDocumentDraftBlocks) || summaryDocumentDraftMarkdown;
    const nextFinalSummary = normalizeFinalSolutionSummaryPayload({
      ...finalSummaryDocument,
      markdown: nextMarkdown,
      document_blocks: summaryDocumentDraftBlocks,
      document_status: nextMarkdown.trim() || summaryDocumentDraftBlocks.length > 0 ? "edited" : "empty",
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
      setSummaryDocumentDraftBlocks(nextFinalSummary.document_blocks || []);
      setSummaryDocumentDraftDirty(false);
      setSummaryDocumentEditMode(false);
      setLocalEditPresenceTarget(null);
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
    setLocalEditPresenceTarget,
    setSummaryDocumentDraftBlocks,
    setSummaryDocumentDraftDirty,
    setSummaryDocumentDraftMarkdown,
    setSummaryDocumentEditMode,
    sharedSyncEnabled,
    summaryDocumentDraftBlocks,
    summaryDocumentDraftMarkdown,
    summaryDocumentPending,
    summaryDocumentSaving,
  ]);

  const handleRegenerateSummaryDocument = useCallback(async (options?: { refreshCache?: boolean }) => {
    const eligibleGroups = getSummaryEligibleStructureGroups(problemStructureGroups, problemStructureNodes);
    if (eligibleGroups.length === 0) {
      setStage("solution");
      setLeftPanelTab("detail");
      setSelectedProblemGroupId("");
      setSelectedNodeId("");
      setSummaryDocumentPending(false);
      setActivityMessage("문제정의 2단계에서 확정된 분류가 있어야 결론 문서를 다시 생성할 수 있습니다.");
      return;
    }

    if (summaryDocumentPending) {
      setActivityMessage("현재 재생성 중입니다. 완료되면 자동으로 반영됩니다.");
      return;
    }
    if (busy) {
      setActivityMessage("결론 문서 생성 작업이 이미 진행 중입니다.");
      return;
    }

    setStage("solution");
    setLeftPanelTab("detail");
    setSelectedProblemGroupId("");
    setSelectedNodeId("");

    setSummaryDocumentPending(true);
    setBusy(true);
    let generationId = "";
    try {
      const generationStart = await startSharedArtifactGeneration(SUMMARY_DOCUMENT_ARTIFACT, false);
      generationId = generationStart.generation.generation_id || "";
      if (!generationStart.acquired) {
        setActivityMessage("결론 문서 재생성 요청이 이미 진행 중입니다. 완료되면 자동으로 반영됩니다.");
        return;
      }

      const result = await generateCanvasSummaryConclusion({
        meeting_id: meetingId,
        meeting_topic: meetingTopicForAi,
        refresh_chunk_summaries: options?.refreshCache || undefined,
        regenerate_nonce: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        current_summary: finalSummaryDocument,
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
      const currentGenerationId =
        latestSharedWorkspaceRef.current.artifactGeneration?.[SUMMARY_DOCUMENT_ARTIFACT]?.generation_id || "";
      if (generationId && currentGenerationId && currentGenerationId !== generationId) {
        setActivityMessage("초기화 이후 도착한 이전 결론 재생성 결과를 무시했습니다.");
        return;
      }
      const nextFinalSummary = buildSummaryDocumentFromResponse({
        markdown: result.markdown || "",
        documentBlocks: result.document_blocks || [],
        sections: result.sections || finalSummaryDocument.sections || [],
        generatedAt: result.generated_at,
        usedLlm: result.used_llm,
        warning: result.warning,
        sourceSignature:
          result.source_signature || buildSummaryDocumentSourceSignature(eligibleGroups, problemStructureNodes),
        structured: result.structured || finalSummaryDocument.structured,
      });

      setFinalSummaryDocument(nextFinalSummary);
      setSummaryDocumentDraftMarkdown(nextFinalSummary.markdown);
      setSummaryDocumentDraftBlocks(nextFinalSummary.document_blocks || []);
      setSummaryDocumentDraftDirty(false);
      setSummaryDocumentEditMode(false);
      setLocalEditPresenceTarget(null);
      latestSharedWorkspaceRef.current = {
        ...latestSharedWorkspaceRef.current,
        stage: "solution",
        finalSolutionSummary: nextFinalSummary,
        importedState: persistedSharedImportedState,
      };
      const readyArtifactGeneration = finishSharedArtifactGeneration(
        SUMMARY_DOCUMENT_ARTIFACT,
        "ready",
        generationId,
      );
      if (sharedSyncEnabled) {
        forceBroadcastSharedCanvas({
          stage: "solution",
          finalSolutionSummary: nextFinalSummary,
          artifactGeneration: readyArtifactGeneration,
        });
        if (meetingId) {
          void saveCanvasWorkspacePatch({
            meeting_id: meetingId,
            stage: "solution",
            final_solution_summary: nextFinalSummary,
            artifact_generation: readyArtifactGeneration,
            imported_state: persistedSharedImportedState,
          }).catch((error) => {
            console.error("Failed to save regenerated conclusion document:", error);
          });
        }
      }
      setActivityMessage(result.warning || (options?.refreshCache ? "요약 캐시를 새로 만들고 결론 문서를 다시 생성했습니다." : "결론 문서를 다시 생성했습니다."));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const currentGenerationId =
        latestSharedWorkspaceRef.current.artifactGeneration?.[SUMMARY_DOCUMENT_ARTIFACT]?.generation_id || "";
      if (generationId && currentGenerationId && currentGenerationId !== generationId) {
        setActivityMessage("초기화 이후 도착한 이전 결론 재생성 실패 응답을 무시했습니다.");
        return;
      }
      const failedArtifactGeneration = finishSharedArtifactGeneration(
        SUMMARY_DOCUMENT_ARTIFACT,
        "failed",
        generationId,
        message,
      );
      if (meetingId) {
        void saveCanvasWorkspacePatch({
          meeting_id: meetingId,
          artifact_generation: failedArtifactGeneration,
        }).catch((saveError) => {
          console.error("Failed to save failed conclusion generation state:", saveError);
        });
      }
      setActivityMessage(`결론 문서 재생성 실패: ${message}`);
    } finally {
      setSummaryDocumentPending(false);
      setBusy(false);
    }
  }, [
    buildSummaryDocumentFromResponse,
    busy,
    finalSummaryDocument,
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
    setLocalEditPresenceTarget,
    setSelectedNodeId,
    setSelectedProblemGroupId,
    setStage,
    setSummaryDocumentDraftBlocks,
    setSummaryDocumentDraftDirty,
    setSummaryDocumentDraftMarkdown,
    setSummaryDocumentEditMode,
    setSummaryDocumentPending,
    sharedSyncEnabled,
    startSharedArtifactGeneration,
    finishSharedArtifactGeneration,
    summaryDocumentPending,
  ]);

  const handleRefreshSummaryCache = useCallback(() => {
    return handleRegenerateSummaryDocument({ refreshCache: true });
  }, [handleRegenerateSummaryDocument]);

  return {
    handleCopyFinalSolutionMarkdown,
    handleGenerateSummaryDocument,
    handleRegenerateSummaryDocument,
    handleRefreshSummaryCache,
    handleSaveSummaryDocument,
    handleSetSummaryDocumentEditMode,
    handleSummaryDocumentBlocksChange,
    handleSummaryDocumentMarkdownChange,
    handleToggleSummaryEvidence,
    summaryDocumentDraftDirty,
    summaryDocumentSaving,
  };
}
