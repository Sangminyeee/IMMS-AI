"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
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
  setArmedCanvasTool: (value: null) => void;
  setCanvasPlacementPreview: (value: null) => void;
  setPendingProblemGroupLinkId: Dispatch<SetStateAction<string>>;
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
  setArmedCanvasTool,
  setCanvasPlacementPreview,
  setPendingProblemGroupLinkId,
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
      setProblemStructurePending(true);
      setActivityMessage(`${problemStructureMethodLabel(method)} 기준으로 AI가 노드를 묶고 있습니다.`);

      try {
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
          setActivityMessage(result.warning || "AI가 유효한 구조화 그룹을 만들지 못했습니다.");
          return;
        }

        setProblemDefinitionMode("ai");
        setProblemStructureMethod(method);
        setProblemStructureNodes(structureNodes);
        setProblemStructureGroups(nextGroups);
        setActivityMessage(
          result.warning ||
            `${result.used_llm ? "AI" : "로컬 fallback"}가 ${structureNodes.length}개 노드를 ${nextGroups.length}개 그룹으로 묶었습니다.`,
        );
      } catch (error) {
        if (problemStructureRequestSeqRef.current !== requestSeq) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
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
    ],
  );

  const handleStartProblemStructure = useCallback(async () => {
    if (problemGroups.length === 0) {
      setActivityMessage("구조화할 문제정의 노드가 아직 없습니다.");
      return;
    }
    const nextMode = problemStructureDraftMode || "manual";
    setProblemStructureMethod(problemStructureDraftMethod);
    setProblemDefinitionMode(nextMode);
    const nextNodes = syncProblemStructureNodesFromDefinition();
    setProblemDefinitionPhase("structure");
    setProblemStructureSetupOpen(false);
    setArmedCanvasTool(null);
    setCanvasPlacementPreview(null);
    setPendingProblemGroupLinkId("");
    setSelectedNodeId("");
    setSelectedProblemGroupId("");
    setProblemGroupingRationaleOpenGroupId("");
    setActivityMessage(
      `${problemStructureMethodLabel(problemStructureDraftMethod)} · ${problemDefinitionModeLabel(nextMode)} 방식으로 정의 2단계를 시작했습니다. 노드 ${nextNodes.length}개를 가져왔습니다.`,
    );
    if (nextMode === "ai") {
      await runProblemStructureGrouping({
        nodes: nextNodes,
        method: problemStructureDraftMethod,
      });
    }
  }, [
    problemGroups.length,
    problemStructureDraftMethod,
    problemStructureDraftMode,
    runProblemStructureGrouping,
    setActivityMessage,
    setArmedCanvasTool,
    setCanvasPlacementPreview,
    setPendingProblemGroupLinkId,
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

  const handleRefreshProblemStructureNodes = useCallback(() => {
    const nextNodes = syncProblemStructureNodesFromDefinition();
    setActivityMessage(`정의 1단계의 현재 노드 ${nextNodes.length}개를 다시 가져왔습니다.`);
  }, [setActivityMessage, syncProblemStructureNodesFromDefinition]);

  return {
    handleBackToProblemDefinitionExplore,
    handleOpenProblemStructureSetup,
    handleRefreshProblemStructureNodes,
    handleStartProblemStructure,
    runProblemStructureGrouping,
    syncProblemStructureNodesFromDefinition,
  };
}
