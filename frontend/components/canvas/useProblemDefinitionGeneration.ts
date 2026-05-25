"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { ProblemDefinitionMode, ProblemDefinitionPhase } from "@/components/canvas/problemStructureModel";
import { generateCanvasProblemTaxonomy, saveCanvasWorkspacePatch } from "@/lib/api";
import type {
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
  transcripts,
}: UseProblemDefinitionGenerationOptions<TGroup, TTranscript, TRationale, TStructureNode, TStructureGroup>) {
  const handleGenerateProblemDefinition = useCallback(
    async (options?: { force?: boolean; refreshChunkSummaries?: boolean }) => {
      const forceRegenerate = Boolean(options?.force);
      const refreshChunkSummaries = Boolean(options?.refreshChunkSummaries);
      setProblemDefinitionStagePending(true);
      setBusy(true);
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

        const utterances = buildUtterances(transcripts);
        if (utterances.length === 0) {
          if (forceRegenerate) {
            setProblemGroups([]);
            setProblemGroupingRationaleById({});
            setProblemGroupingRationaleOpenGroupId("");
            setProblemGroupingRationalePendingId("");
            setProblemDefinitionPhase("explore");
            setProblemStructureSetupOpen(false);
            setProblemStructureNodes([]);
            setProblemStructureGroups([]);
            setProblemStructurePending(false);
          }
          setProblemDefinitionMode("");
          setSelectedProblemGroupId("");
          setSelectedNodeId("");
          setActivityMessage("문제정의를 만들 STT 발화가 아직 없습니다.");
          return;
        }

        const nextNodePositionsSnapshot = forceRegenerate
          ? {
              ...nodePositions,
              "problem-definition": {},
            }
          : nodePositions;
        if (forceRegenerate) {
          setProblemGroups([]);
          setNodePositions(nextNodePositionsSnapshot);
          setProblemDefinitionPhase("explore");
          setProblemStructureSetupOpen(false);
          setProblemStructureNodes([]);
          setProblemStructureGroups([]);
          setProblemStructurePending(false);
          setSelectedProblemGroupId("");
          setSelectedProblemSourceNodeId("");
          setSelectedNodeId("");
          setCollapsedProblemGroupIds(new Set());
          setProblemGroupingRationaleById({});
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
        const nextGroups = hydrateProblemGroups(result.groups || [], []).map(
          (group) =>
            ({
              ...group,
              parent_group_id: group.parent_group_id || "",
              depth: group.depth || 0,
              status: "draft",
            }) as TGroup,
        );

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
          stage: "problem-definition",
          problemGroups: nextGroups,
          nodePositions: nextNodePositionsSnapshot,
          importedState: persistedSharedImportedState,
        };

        if (sharedSyncEnabled) {
          forceBroadcastSharedCanvas({
            stage: "problem-definition",
            problemGroups: nextGroups,
            nodePositions: nextNodePositionsSnapshot,
          });
          if (meetingId) {
            void saveCanvasWorkspacePatch({
              meeting_id: meetingId,
              stage: "problem-definition",
              problem_groups: serializeSharedProblemGroups(nextGroups),
              solution_topics: [],
              node_positions: nextNodePositionsSnapshot,
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
        setActivityMessage(`문제 정의 생성 실패: ${message}`);
      } finally {
        setProblemDefinitionStagePending(false);
        setBusy(false);
      }
    },
    [
      buildExistingGroupsPayload,
      buildUtterances,
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
      transcripts,
    ],
  );

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
    handleRefreshProblemChunkSummaries,
  };
}
