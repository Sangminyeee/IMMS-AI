"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { PROBLEM_DEFINITION_STEP1_ARTIFACT } from "@/components/canvas/canvasArtifactGeneration";
import type { ProblemDefinitionMode, ProblemDefinitionPhase } from "@/components/canvas/problemStructureModel";
import { generateCanvasProblemTaxonomy, saveCanvasWorkspacePatch } from "@/lib/api";
import type {
  CanvasArtifactGenerationKey,
  CanvasArtifactGenerationMap,
  CanvasArtifactGenerationState,
  CanvasNodePositionsByStage,
  CanvasProblemDefinitionGroup,
  CanvasWorkspaceProblemGroup,
  MeetingState,
} from "@/lib/types";

type ProblemGroupStatus = "draft" | "review" | "final";
type CanvasStage = "ideation" | "problem-definition" | "solution";

type ProblemDefinitionGenerationGroup = CanvasProblemDefinitionGroup & {
  status: ProblemGroupStatus;
};

type ProblemTaxonomyUtterancePayload = {
  id: string;
  speaker: string;
  text: string;
  timestamp?: string;
};

type ExistingProblemTaxonomyGroupPayload = {
  group_id: string;
  parent_group_id?: string;
  depth?: number;
  topic: string;
  evidence_utterance_ids?: string[];
  source_summary_items?: string[];
};

type SharedWorkspaceSnapshot<TGroup extends ProblemDefinitionGenerationGroup> = {
  stage: CanvasStage;
  problemGroups: TGroup[];
  nodePositions: CanvasNodePositionsByStage;
  artifactGeneration: CanvasArtifactGenerationMap;
  importedState: MeetingState | null;
};

type UseProblemDefinitionGenerationOptions<
  TGroup extends ProblemDefinitionGenerationGroup,
  TTranscript,
  TRationale,
  TStructureNode,
  TStructureGroup,
> = {
  buildExistingGroupsPayload: (groups: TGroup[]) => ExistingProblemTaxonomyGroupPayload[];
  buildUtterances: (transcripts: TTranscript[]) => ProblemTaxonomyUtterancePayload[];
  busy: boolean;
  forceBroadcastSharedCanvas: (overrides?: {
    stage?: CanvasStage;
    problemGroups?: TGroup[];
    nodePositions?: CanvasNodePositionsByStage;
    artifactGeneration?: CanvasArtifactGenerationMap;
  }) => void;
  hydrateProblemGroups: (
    groups: Array<CanvasProblemDefinitionGroup & { status?: string }>,
    previousGroups?: TGroup[],
  ) => TGroup[];
  latestSharedWorkspaceRef: MutableRefObject<SharedWorkspaceSnapshot<TGroup>>;
  meetingId: string;
  meetingTopicForAi: string;
  nodePositions: CanvasNodePositionsByStage;
  persistedSharedImportedState: MeetingState | null;
  problemDefinitionStagePending: boolean;
  problemGroups: TGroup[];
  selectedProblemGroupId: string;
  serializeSharedProblemGroups: (groups: TGroup[]) => CanvasWorkspaceProblemGroup[];
  setActivityMessage: (message: string) => void;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setCollapsedProblemGroupIds: Dispatch<SetStateAction<Set<string>>>;
  setEditingProblemGroupId: Dispatch<SetStateAction<string>>;
  setNodePositions: Dispatch<SetStateAction<CanvasNodePositionsByStage>>;
  setProblemDefinitionMode: Dispatch<SetStateAction<ProblemDefinitionMode>>;
  setProblemDefinitionPhase: Dispatch<SetStateAction<ProblemDefinitionPhase>>;
  setProblemDefinitionStagePending: Dispatch<SetStateAction<boolean>>;
  setProblemGroups: Dispatch<SetStateAction<TGroup[]>>;
  setProblemGroupingRationaleById: Dispatch<SetStateAction<Record<string, TRationale>>>;
  setProblemGroupingRationaleOpenGroupId: Dispatch<SetStateAction<string>>;
  setProblemGroupingRationalePendingId: Dispatch<SetStateAction<string>>;
  setProblemStructureGroups: Dispatch<SetStateAction<TStructureGroup[]>>;
  setProblemStructureNodes: Dispatch<SetStateAction<TStructureNode[]>>;
  setProblemStructurePending: Dispatch<SetStateAction<boolean>>;
  setProblemStructureSetupOpen: Dispatch<SetStateAction<boolean>>;
  setSelectedNodeId: Dispatch<SetStateAction<string>>;
  setSelectedProblemGroupId: Dispatch<SetStateAction<string>>;
  setSelectedProblemSourceNodeId: Dispatch<SetStateAction<string>>;
  setStage: Dispatch<SetStateAction<CanvasStage>>;
  sharedSyncEnabled: boolean;
  startSharedArtifactGeneration: (
    artifactKey: CanvasArtifactGenerationKey,
    force?: boolean,
  ) => Promise<{
    acquired: boolean;
    generation: CanvasArtifactGenerationState;
    artifactGeneration: CanvasArtifactGenerationMap;
  }>;
  commitSharedProblemDefinitionGeneration: (
    payload: {
      generationId: string;
      status: "ready" | "failed";
      error?: string;
    },
  ) => Promise<{
    applied: boolean;
    artifactGeneration: CanvasArtifactGenerationMap;
  }>;
  finishSharedArtifactGeneration: (
    artifactKey: CanvasArtifactGenerationKey,
    status: "ready" | "failed",
    generationId?: string,
    error?: string,
  ) => CanvasArtifactGenerationMap;
  transcripts: TTranscript[];
};

export function useProblemDefinitionGeneration<
  TGroup extends ProblemDefinitionGenerationGroup,
  TTranscript,
  TRationale,
  TStructureNode,
  TStructureGroup,
>({
  buildExistingGroupsPayload,
  buildUtterances,
  busy,
  forceBroadcastSharedCanvas,
  hydrateProblemGroups,
  latestSharedWorkspaceRef,
  meetingId,
  meetingTopicForAi,
  nodePositions,
  persistedSharedImportedState,
  problemDefinitionStagePending,
  problemGroups,
  selectedProblemGroupId,
  serializeSharedProblemGroups,
  setActivityMessage,
  setBusy,
  setCollapsedProblemGroupIds,
  setEditingProblemGroupId,
  setNodePositions,
  setProblemDefinitionMode,
  setProblemDefinitionPhase,
  setProblemDefinitionStagePending,
  setProblemGroups,
  setProblemGroupingRationaleById,
  setProblemGroupingRationaleOpenGroupId,
  setProblemGroupingRationalePendingId,
  setProblemStructureGroups,
  setProblemStructureNodes,
  setProblemStructurePending,
  setProblemStructureSetupOpen,
  setSelectedNodeId,
  setSelectedProblemGroupId,
  setSelectedProblemSourceNodeId,
  setStage,
  sharedSyncEnabled,
  startSharedArtifactGeneration,
  commitSharedProblemDefinitionGeneration,
  finishSharedArtifactGeneration,
  transcripts,
}: UseProblemDefinitionGenerationOptions<TGroup, TTranscript, TRationale, TStructureNode, TStructureGroup>) {
  const handleGenerateProblemDefinition = useCallback(
    async (options?: { force?: boolean; refreshChunkSummaries?: boolean }) => {
      const forceRegenerate = Boolean(options?.force);
      const refreshChunkSummaries = Boolean(options?.refreshChunkSummaries);
      let generationId = "";
      try {
        setStage("problem-definition");
        setEditingProblemGroupId("");

        if (problemGroups.length > 0 && !forceRegenerate) {
          const firstGroupId = selectedProblemGroupId || problemGroups[0]?.group_id || "";
          setSelectedProblemGroupId(firstGroupId);
          setSelectedNodeId(firstGroupId ? `problem-${firstGroupId}` : "");
          setActivityMessage("기존 문제정의 캔버스를 유지했습니다.");
          return;
        }

        const generationStart = await startSharedArtifactGeneration(PROBLEM_DEFINITION_STEP1_ARTIFACT, forceRegenerate);
        generationId = generationStart.generation.generation_id || "";
        if (!generationStart.acquired) {
          setActivityMessage("다른 참가자가 문제정의를 생성 중입니다. 완료되면 자동으로 반영됩니다.");
          return;
        }

        setProblemDefinitionStagePending(true);
        setBusy(true);

        const utterances = buildUtterances(transcripts);
        if (utterances.length === 0) {
          if (problemGroups.length === 0) {
            setProblemDefinitionMode("");
            setSelectedProblemGroupId("");
            setSelectedNodeId("");
          }
          setActivityMessage("문제정의를 만들 STT 발화가 아직 없습니다.");
          try {
            await commitSharedProblemDefinitionGeneration({
              generationId,
              status: "failed",
              error: "STT 발화 없음",
            });
          } catch (error) {
            const failedArtifactGeneration = finishSharedArtifactGeneration(
              PROBLEM_DEFINITION_STEP1_ARTIFACT,
              "failed",
              generationId,
              "STT 발화 없음",
            );
            if (meetingId) {
              void saveCanvasWorkspacePatch({
                meeting_id: meetingId,
                artifact_generation: failedArtifactGeneration,
              }).catch((saveError) => {
                console.error("Failed to save failed problem taxonomy generation state:", saveError);
              });
            }
            console.error("Failed to commit failed problem taxonomy generation state:", error);
          }
          return;
        }

        const nextNodePositionsSnapshot = forceRegenerate
          ? {
              ...nodePositions,
              "problem-definition": {},
            }
          : nodePositions;
        if (forceRegenerate) {
          setProblemDefinitionPhase("explore");
          setProblemStructureSetupOpen(false);
          setProblemStructurePending(false);
          setSelectedProblemSourceNodeId("");
          setProblemGroupingRationaleOpenGroupId("");
          setProblemGroupingRationalePendingId("");
        }

        const result = await generateCanvasProblemTaxonomy({
          meeting_id: meetingId,
          meeting_topic: meetingTopicForAi,
          debug_nonce: forceRegenerate ? `debug-${refreshChunkSummaries ? "chunks-" : ""}${Date.now()}` : undefined,
          refresh_chunk_summaries: refreshChunkSummaries || undefined,
          utterances,
          existing_group_ids: [],
          existing_groups: forceRegenerate ? [] : buildExistingGroupsPayload(problemGroups),
          max_groups: 6,
        });
        const currentGenerationId =
          latestSharedWorkspaceRef.current.artifactGeneration?.[PROBLEM_DEFINITION_STEP1_ARTIFACT]?.generation_id || "";
        if (generationId && currentGenerationId && currentGenerationId !== generationId) {
          setActivityMessage("초기화 이후 도착한 이전 문제정의 생성 결과를 무시했습니다.");
          return;
        }
        const nextGroups = hydrateProblemGroups(result.groups || [], []).map(
          (group) =>
            ({
              ...group,
              parent_group_id: group.parent_group_id || "",
              depth: group.depth || 0,
              status: "draft",
            }) as TGroup,
        );
        const readyCommit = await commitSharedProblemDefinitionGeneration({
          generationId,
          status: "ready",
        });
        if (!readyCommit.applied) {
          setActivityMessage("초기화 이후 도착한 이전 문제정의 생성 결과를 무시했습니다.");
          return;
        }
        const readyArtifactGeneration = readyCommit.artifactGeneration;

        if (forceRegenerate) {
          setNodePositions(nextNodePositionsSnapshot);
          setCollapsedProblemGroupIds(new Set());
          setProblemGroupingRationaleById({});
        }
        setProblemGroups(nextGroups);
        setProblemDefinitionPhase("explore");
        setProblemStructureSetupOpen(false);
        setProblemStructureNodes([]);
        setProblemStructureGroups([]);
        setProblemStructurePending(false);
        const nextSelectedGroupId = nextGroups[0]?.group_id || "";
        setSelectedProblemGroupId(nextSelectedGroupId);
        setSelectedNodeId(nextSelectedGroupId ? `problem-${nextSelectedGroupId}` : "");
        latestSharedWorkspaceRef.current = {
          ...latestSharedWorkspaceRef.current,
          problemGroups: nextGroups,
          nodePositions: nextNodePositionsSnapshot,
          importedState: persistedSharedImportedState,
          artifactGeneration: readyArtifactGeneration,
        };

        if (sharedSyncEnabled) {
          forceBroadcastSharedCanvas({
            problemGroups: nextGroups,
            nodePositions: nextNodePositionsSnapshot,
            artifactGeneration: readyArtifactGeneration,
          });
          if (meetingId) {
            void saveCanvasWorkspacePatch({
              meeting_id: meetingId,
              problem_groups: serializeSharedProblemGroups(nextGroups),
              solution_topics: [],
              node_positions: nextNodePositionsSnapshot,
              artifact_generation: readyArtifactGeneration,
              imported_state: persistedSharedImportedState,
            }).catch((error) => {
              console.error("Failed to save problem taxonomy:", error);
            });
          }
        }

        setActivityMessage(
          result.warning ||
            (nextGroups.length > 0
              ? forceRegenerate
                ? refreshChunkSummaries
                  ? `요약 캐시까지 다시 만들고 문제정의를 재생성했습니다. 큰 분류 ${nextGroups.length}개를 만들었습니다.`
                  : `문제정의를 다시 생성했습니다. 큰 분류 ${nextGroups.length}개를 만들었습니다.`
                : `STT 발화에서 큰 분류 ${nextGroups.length}개를 만들었습니다.`
              : "분류할 만큼 뚜렷한 STT 발화를 찾지 못했습니다."),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const currentGenerationId =
          latestSharedWorkspaceRef.current.artifactGeneration?.[PROBLEM_DEFINITION_STEP1_ARTIFACT]?.generation_id || "";
        if (generationId && currentGenerationId && currentGenerationId !== generationId) {
          setActivityMessage("초기화 이후 도착한 이전 문제정의 실패 응답을 무시했습니다.");
          return;
        }
        try {
          await commitSharedProblemDefinitionGeneration({
            generationId,
            status: "failed",
            error: message,
          });
        } catch (commitError) {
          const failedArtifactGeneration = finishSharedArtifactGeneration(
            PROBLEM_DEFINITION_STEP1_ARTIFACT,
            "failed",
            generationId,
            message,
          );
          if (meetingId) {
            void saveCanvasWorkspacePatch({
              meeting_id: meetingId,
              artifact_generation: failedArtifactGeneration,
            }).catch((saveError) => {
              console.error("Failed to save failed problem taxonomy generation state:", saveError);
            });
          }
          console.error("Failed to commit failed problem taxonomy generation state:", commitError);
        }
        setActivityMessage(`문제 정의 생성 실패: ${message}`);
      } finally {
        setProblemDefinitionStagePending(false);
        setBusy(false);
      }
    },
    [
      buildExistingGroupsPayload,
      buildUtterances,
      commitSharedProblemDefinitionGeneration,
      forceBroadcastSharedCanvas,
      hydrateProblemGroups,
      latestSharedWorkspaceRef,
      meetingId,
      meetingTopicForAi,
      nodePositions,
      persistedSharedImportedState,
      problemGroups,
      selectedProblemGroupId,
      serializeSharedProblemGroups,
      setActivityMessage,
      setBusy,
      setCollapsedProblemGroupIds,
      setEditingProblemGroupId,
      setNodePositions,
      setProblemDefinitionMode,
      setProblemDefinitionPhase,
      setProblemDefinitionStagePending,
      setProblemGroups,
      setProblemGroupingRationaleById,
      setProblemGroupingRationaleOpenGroupId,
      setProblemGroupingRationalePendingId,
      setProblemStructureGroups,
      setProblemStructureNodes,
      setProblemStructurePending,
      setProblemStructureSetupOpen,
      setSelectedNodeId,
      setSelectedProblemGroupId,
      setSelectedProblemSourceNodeId,
      setStage,
      sharedSyncEnabled,
      startSharedArtifactGeneration,
      finishSharedArtifactGeneration,
      transcripts,
    ],
  );

  const handleRegenerateProblemDefinition = useCallback(async () => {
    if (busy || problemDefinitionStagePending) {
      setActivityMessage("현재 문제정의 1단계를 재생성 중입니다. 완료되면 자동으로 반영됩니다.");
      return;
    }
    setActivityMessage("문제정의 1단계를 재생성 중입니다. 기존 결과는 유지되고 완료되면 자동으로 반영됩니다.");
    await handleGenerateProblemDefinition({ force: true });
  }, [busy, handleGenerateProblemDefinition, problemDefinitionStagePending, setActivityMessage]);

  const handleDebugRegenerateProblemDefinition = useCallback(async () => {
    if (busy || problemDefinitionStagePending) {
      setActivityMessage("문제정의 생성 작업이 이미 진행 중입니다.");
      return;
    }
    const ok = window.confirm("디버깅용으로 기존 문제정의 노드와 해결책 결과를 비우고 STT 기반으로 다시 생성할까요?");
    if (!ok) return;
    await handleGenerateProblemDefinition({ force: true });
  }, [busy, handleGenerateProblemDefinition, problemDefinitionStagePending, setActivityMessage]);

  const handleRefreshProblemChunkSummaries = useCallback(async () => {
    if (busy || problemDefinitionStagePending) {
      setActivityMessage("문제정의 생성 작업이 이미 진행 중입니다.");
      return;
    }
    const ok = window.confirm(
      "디버깅용으로 chunk summary 캐시까지 새로 만들고 문제정의 노드를 다시 생성할까요?",
    );
    if (!ok) return;
    await handleGenerateProblemDefinition({ force: true, refreshChunkSummaries: true });
  }, [busy, handleGenerateProblemDefinition, problemDefinitionStagePending, setActivityMessage]);

  return {
    handleDebugRegenerateProblemDefinition,
    handleGenerateProblemDefinition,
    handleRegenerateProblemDefinition,
    handleRefreshProblemChunkSummaries,
  };
}
