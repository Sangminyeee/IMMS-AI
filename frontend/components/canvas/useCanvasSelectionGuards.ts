"use client";

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Node } from "@xyflow/react";
import type {
  CanvasProblemDefinitionGroup,
  CanvasWorkspaceItem,
} from "@/lib/types";

type CanvasStage = "ideation" | "problem-definition" | "solution";
type ProblemDefinitionPhase = "explore" | "structure";
type LocalNodeOverrideMap = Record<CanvasStage, Set<string>>;

function createLocalNodeOverrideMap(): LocalNodeOverrideMap {
  return {
    ideation: new Set<string>(),
    "problem-definition": new Set<string>(),
    solution: new Set<string>(),
  };
}

type ProblemGroupModel = Pick<CanvasProblemDefinitionGroup, "group_id">;

type UseCanvasSelectionGuardsOptions<TGroup extends ProblemGroupModel, TRationale> = {
  canvasItems: CanvasWorkspaceItem[];
  localNodeOverridesRef: MutableRefObject<LocalNodeOverrideMap>;
  nodes: Node[];
  problemDefinitionPhase: ProblemDefinitionPhase;
  problemGroups: TGroup[];
  selectedCanvasItemId: string;
  selectedNodeId: string;
  selectedProblemGroupId: string;
  setCollapsedProblemGroupIds: Dispatch<SetStateAction<Set<string>>>;
  setEditingProblemGroupId: Dispatch<SetStateAction<string>>;
  setProblemGroupingRationaleById: Dispatch<SetStateAction<Record<string, TRationale>>>;
  setProblemGroupingRationaleOpenGroupId: Dispatch<SetStateAction<string>>;
  setProblemGroupingRationalePendingId: Dispatch<SetStateAction<string>>;
  setSelectedCanvasItemId: Dispatch<SetStateAction<string>>;
  setSelectedNodeId: Dispatch<SetStateAction<string>>;
  setSelectedProblemGroupId: Dispatch<SetStateAction<string>>;
  sharedSyncEnabled: boolean;
  stage: CanvasStage;
};

export function useCanvasSelectionGuards<TGroup extends ProblemGroupModel, TRationale>({
  canvasItems,
  localNodeOverridesRef,
  nodes,
  problemDefinitionPhase,
  problemGroups,
  selectedCanvasItemId,
  selectedNodeId,
  selectedProblemGroupId,
  setCollapsedProblemGroupIds,
  setEditingProblemGroupId,
  setProblemGroupingRationaleById,
  setProblemGroupingRationaleOpenGroupId,
  setProblemGroupingRationalePendingId,
  setSelectedCanvasItemId,
  setSelectedNodeId,
  setSelectedProblemGroupId,
  sharedSyncEnabled,
  stage,
}: UseCanvasSelectionGuardsOptions<TGroup, TRationale>) {
  useEffect(() => {
    if (problemGroups.length === 0) {
      setSelectedProblemGroupId("");
      setEditingProblemGroupId("");
      return;
    }

    if (problemDefinitionPhase === "structure") {
      return;
    }

    if (!selectedProblemGroupId || !problemGroups.some((group) => group.group_id === selectedProblemGroupId)) {
      setSelectedProblemGroupId(problemGroups[0].group_id);
    }
  }, [
    problemDefinitionPhase,
    problemGroups,
    selectedProblemGroupId,
    setEditingProblemGroupId,
    setSelectedProblemGroupId,
  ]);

  useEffect(() => {
    const validGroupIds = new Set(problemGroups.map((group) => group.group_id));
    setCollapsedProblemGroupIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((groupId) => {
        if (validGroupIds.has(groupId)) {
          next.add(groupId);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    setProblemGroupingRationaleById((prev) => {
      const nextEntries = Object.entries(prev).filter(([groupId]) => validGroupIds.has(groupId));
      if (nextEntries.length === Object.keys(prev).length) return prev;
      return Object.fromEntries(nextEntries) as Record<string, TRationale>;
    });
    setProblemGroupingRationaleOpenGroupId((prev) => (prev && !validGroupIds.has(prev) ? "" : prev));
    setProblemGroupingRationalePendingId((prev) => (prev && !validGroupIds.has(prev) ? "" : prev));
  }, [
    problemGroups,
    setCollapsedProblemGroupIds,
    setProblemGroupingRationaleById,
    setProblemGroupingRationaleOpenGroupId,
    setProblemGroupingRationalePendingId,
  ]);

  useEffect(() => {
    if (canvasItems.length === 0) {
      setSelectedCanvasItemId("");
      return;
    }

    if (!selectedCanvasItemId || !canvasItems.some((item) => item.id === selectedCanvasItemId)) {
      setSelectedCanvasItemId("");
    }
  }, [canvasItems, selectedCanvasItemId, setSelectedCanvasItemId]);

  useEffect(() => {
    if (!selectedNodeId) return;
    if (!nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId("");
    }
  }, [nodes, selectedNodeId, setSelectedNodeId]);

  useEffect(() => {
    if (stage !== "problem-definition") {
      setEditingProblemGroupId("");
    }
  }, [stage, setEditingProblemGroupId]);

  useEffect(() => {
    if (sharedSyncEnabled) {
      localNodeOverridesRef.current = createLocalNodeOverrideMap();
    }
  }, [localNodeOverridesRef, sharedSyncEnabled]);
}
