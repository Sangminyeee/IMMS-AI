"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { PROBLEM_DEFINITION_STEP2_ARTIFACT } from "@/components/canvas/canvasArtifactGeneration";
import {
  buildProblemStructureNodesFromGroups,
  normalizeProblemStructureGroupsFromResponse,
  problemDefinitionModeLabel,
  problemStructureMethodLabel,
  pruneProblemStructureGroups,
  type ProblemDefinitionMode,
  type ProblemDefinitionPhase,
  type ProblemStructureGroupViewModel,
  type ProblemStructureMethod,
  type ProblemStructureNodeViewModel,
  type ProblemStructureSourceGroup,
} from "@/components/canvas/problemStructureModel";
import { generateProblemStructure } from "@/lib/api";
import type {
  CanvasArtifactGenerationKey,
  CanvasArtifactGenerationMap,
  CanvasArtifactGenerationState,
} from "@/lib/types";

type UseProblemStructureGenerationOptions<TProblemGroup extends ProblemStructureSourceGroup> = {
  meetingId: string;
  meetingTopicForAi: string;
  problemDefinitionMode: ProblemDefinitionMode;
  problemGroups: TProblemGroup[];
  problemStructureDraftMethod: ProblemStructureMethod;
  problemStructureDraftMode: ProblemDefinitionMode;
  problemStructureGroups: ProblemStructureGroupViewModel[];
  problemStructureMethod: ProblemStructureMethod;
  problemStructureNodes: ProblemStructureNodeViewModel[];
  problemStructureRequestSeqRef: MutableRefObject<number>;
  selectedProblemGroupId: string;
  setActivityMessage: (message: string) => void;
  setProblemDefinitionMode: Dispatch<SetStateAction<ProblemDefinitionMode>>;
  setProblemDefinitionPhase: Dispatch<SetStateAction<ProblemDefinitionPhase>>;
  setProblemGroupingRationaleOpenGroupId: Dispatch<SetStateAction<string>>;
  setProblemStructureDraftMethod: Dispatch<SetStateAction<ProblemStructureMethod>>;
  setProblemStructureDraftMode: Dispatch<SetStateAction<ProblemDefinitionMode>>;
  setProblemStructureGroups: Dispatch<SetStateAction<ProblemStructureGroupViewModel[]>>;
  setProblemStructureMethod: Dispatch<SetStateAction<ProblemStructureMethod>>;
  setProblemStructureNodes: Dispatch<SetStateAction<ProblemStructureNodeViewModel[]>>;
  setProblemStructurePending: Dispatch<SetStateAction<boolean>>;
  setProblemStructureSetupOpen: Dispatch<SetStateAction<boolean>>;
  setSelectedNodeId: Dispatch<SetStateAction<string>>;
  setSelectedProblemGroupId: Dispatch<SetStateAction<string>>;
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
};

export function useProblemStructureGeneration<TProblemGroup extends ProblemStructureSourceGroup>({
  meetingId,
  meetingTopicForAi,
  problemDefinitionMode,
  problemGroups,
  problemStructureDraftMethod,
  problemStructureDraftMode,
  problemStructureGroups,
  problemStructureMethod,
  problemStructureNodes,
  problemStructureRequestSeqRef,
  selectedProblemGroupId,
  setActivityMessage,
  setProblemDefinitionMode,
  setProblemDefinitionPhase,
  setProblemGroupingRationaleOpenGroupId,
  setProblemStructureDraftMethod,
  setProblemStructureDraftMode,
  setProblemStructureGroups,
  setProblemStructureMethod,
  setProblemStructureNodes,
  setProblemStructurePending,
  setProblemStructureSetupOpen,
  setSelectedNodeId,
  setSelectedProblemGroupId,
  startSharedArtifactGeneration,
  finishSharedArtifactGeneration,
}: UseProblemStructureGenerationOptions<TProblemGroup>) {
  const syncProblemStructureNodesFromDefinition = useCallback(() => {
    const nextNodes = buildProblemStructureNodesFromGroups(problemGroups);
    setProblemStructureNodes(nextNodes);
    setProblemStructureGroups((prev) => pruneProblemStructureGroups(prev, nextNodes));
    return nextNodes;
  }, [problemGroups, setProblemStructureGroups, setProblemStructureNodes]);

  const handleOpenProblemStructureSetup = useCallback(() => {
    if (problemGroups.length === 0) {
      setActivityMessage("구조화할 문제정의 노드가 아직 없습니다.");
      return;
    }
    setProblemStructureDraftMethod(problemStructureMethod);
    setProblemStructureDraftMode(problemDefinitionMode || "ai");
    setProblemStructureSetupOpen(true);
  }, [
    problemDefinitionMode,
    problemGroups.length,
    problemStructureMethod,
    setActivityMessage,
    setProblemStructureDraftMethod,
    setProblemStructureDraftMode,
    setProblemStructureSetupOpen,
  ]);

  const runProblemStructureGrouping = useCallback(
    async (options?: { nodes?: ProblemStructureNodeViewModel[]; method?: ProblemStructureMethod }) => {
      const structureNodes =
        options?.nodes && options.nodes.length > 0
          ? options.nodes
          : problemStructureNodes.length > 0
            ? problemStructureNodes
            : buildProblemStructureNodesFromGroups(problemGroups);
      if (structureNodes.length === 0) {
        setActivityMessage("AI가 묶을 문제정의 노드가 아직 없습니다.");
        return;
      }

      const requestSeq = problemStructureRequestSeqRef.current + 1;
      problemStructureRequestSeqRef.current = requestSeq;
      const method = options?.method || problemStructureMethod;
      let generationId = "";
      setProblemStructurePending(true);
      setActivityMessage(`${problemStructureMethodLabel(method)} 기준으로 AI가 노드를 묶고 있습니다.`);

      try {
        const generationStart = await startSharedArtifactGeneration(PROBLEM_DEFINITION_STEP2_ARTIFACT, false);
        generationId = generationStart.generation.generation_id || "";
        if (!generationStart.acquired) {
          setActivityMessage("다른 참가자가 정의 2단계를 생성 중입니다. 완료되면 자동으로 반영됩니다.");
          return;
        }

        const result = await generateProblemStructure({
          meeting_id: meetingId,
          meeting_topic: meetingTopicForAi,
          method,
          nodes: structureNodes.map((node) => ({
            id: node.id,
            title: node.title,
            body: node.body,
            status: node.status,
            depth: node.depth,
          })),
          existing_groups: problemStructureGroups.map((group) => ({
            id: group.id,
            title: group.title,
            node_ids: group.nodeIds,
            rationale: group.rationale,
          })),
          max_groups: Math.min(8, Math.max(1, Math.ceil(structureNodes.length / 2))),
        });
        if (problemStructureRequestSeqRef.current !== requestSeq) {
          return;
        }

        const nextGroups = normalizeProblemStructureGroupsFromResponse(result.groups || [], structureNodes);
        if (nextGroups.length === 0) {
          finishSharedArtifactGeneration(
            PROBLEM_DEFINITION_STEP2_ARTIFACT,
            "failed",
            generationId,
            result.warning || "유효한 구조화 그룹 없음",
          );
          setActivityMessage(result.warning || "AI가 유효한 구조화 그룹을 만들지 못했습니다.");
          return;
        }

        setProblemDefinitionMode("ai");
        setProblemStructureMethod(method);
        setProblemStructureNodes(structureNodes);
        setProblemStructureGroups(nextGroups);
        finishSharedArtifactGeneration(PROBLEM_DEFINITION_STEP2_ARTIFACT, "ready", generationId);
        setActivityMessage(
          result.warning ||
            `${result.used_llm ? "AI" : "로컬 fallback"}가 ${structureNodes.length}개 노드를 ${nextGroups.length}개 그룹으로 묶었습니다.`,
        );
      } catch (error) {
        if (problemStructureRequestSeqRef.current !== requestSeq) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        finishSharedArtifactGeneration(PROBLEM_DEFINITION_STEP2_ARTIFACT, "failed", generationId, message);
        setActivityMessage(`AI 구조화 실패: ${message}`);
      } finally {
        if (problemStructureRequestSeqRef.current === requestSeq) {
          setProblemStructurePending(false);
        }
      }
    },
    [
      meetingId,
      meetingTopicForAi,
      problemGroups,
      problemStructureGroups,
      problemStructureMethod,
      problemStructureNodes,
      problemStructureRequestSeqRef,
      setActivityMessage,
      setProblemDefinitionMode,
      setProblemStructureGroups,
      setProblemStructureMethod,
      setProblemStructureNodes,
      setProblemStructurePending,
      startSharedArtifactGeneration,
      finishSharedArtifactGeneration,
    ],
  );

  const handleStartProblemStructure = useCallback(async () => {
    if (problemGroups.length === 0) {
      setActivityMessage("구조화할 문제정의 노드가 아직 없습니다.");
      return;
    }
    const nextMode = problemStructureDraftMode || "manual";
    if (problemStructureNodes.length > 0 || problemStructureGroups.length > 0) {
      setProblemDefinitionPhase("structure");
      setProblemStructureSetupOpen(false);
      setSelectedNodeId("");
      setSelectedProblemGroupId("");
      setProblemGroupingRationaleOpenGroupId("");
      setActivityMessage("기존 정의 2단계 구조화를 유지했습니다. 다시 만들려면 AI 묶기를 사용해 주세요.");
      return;
    }
    setProblemStructureMethod(problemStructureDraftMethod);
    setProblemDefinitionMode(nextMode);
    const nextNodes = syncProblemStructureNodesFromDefinition();
    setProblemDefinitionPhase("structure");
    setProblemStructureSetupOpen(false);
    setSelectedNodeId("");
    setSelectedProblemGroupId("");
    setProblemGroupingRationaleOpenGroupId("");
    setActivityMessage(
      `${problemStructureMethodLabel(problemStructureDraftMethod)} · ${problemDefinitionModeLabel(nextMode)} 방식으로 정의 2단계를 시작했습니다. 노드 ${nextNodes.length}개를 준비했습니다.`,
    );
    if (nextMode === "ai") {
      await runProblemStructureGrouping({
        nodes: nextNodes,
        method: problemStructureDraftMethod,
      });
    }
  }, [
    problemGroups.length,
    problemStructureGroups.length,
    problemStructureNodes.length,
    problemStructureDraftMethod,
    problemStructureDraftMode,
    runProblemStructureGrouping,
    setActivityMessage,
    setProblemDefinitionMode,
    setProblemDefinitionPhase,
    setProblemGroupingRationaleOpenGroupId,
    setProblemStructureMethod,
    setProblemStructureSetupOpen,
    setSelectedNodeId,
    setSelectedProblemGroupId,
    syncProblemStructureNodesFromDefinition,
  ]);

  const handleBackToProblemDefinitionExplore = useCallback(() => {
    setProblemDefinitionPhase("explore");
    const nextGroupId = selectedProblemGroupId || problemGroups[0]?.group_id || "";
    setSelectedProblemGroupId(nextGroupId);
    setSelectedNodeId(nextGroupId ? `problem-${nextGroupId}` : "");
    setActivityMessage("정의 1단계 캔버스로 돌아왔습니다.");
  }, [
    problemGroups,
    selectedProblemGroupId,
    setActivityMessage,
    setProblemDefinitionPhase,
    setSelectedNodeId,
    setSelectedProblemGroupId,
  ]);

  return {
    handleBackToProblemDefinitionExplore,
    handleOpenProblemStructureSetup,
    handleStartProblemStructure,
    runProblemStructureGrouping,
    syncProblemStructureNodesFromDefinition,
  };
}
