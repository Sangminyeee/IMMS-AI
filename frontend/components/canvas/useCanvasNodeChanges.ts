"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { applyNodeChanges, type Node, type NodeChange } from "@xyflow/react";
import { normalizeCanvasNodePositionsForComputedIdeation } from "@/components/canvas/canvasWorkspaceSerialization";
import type { CanvasNodePositionsByStage } from "@/lib/types";

type CanvasStage = "ideation" | "problem-definition" | "solution";

type UseCanvasNodeChangesOptions = {
  applyingRemoteSharedSyncRef: MutableRefObject<boolean>;
  liveNodePositionsRef: MutableRefObject<CanvasNodePositionsByStage>;
  localNodeOverridesRef: MutableRefObject<Record<CanvasStage, Set<string>>>;
  scheduleNodePreview: (nodeId: string, position: { x: number; y: number }) => void;
  setNodePositions: Dispatch<SetStateAction<CanvasNodePositionsByStage>>;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  sharedSyncEnabled: boolean;
  stage: CanvasStage;
  workspaceHydratingRef: MutableRefObject<boolean>;
  workspaceLoadedRef: MutableRefObject<boolean>;
};

export function useCanvasNodeChanges({
  applyingRemoteSharedSyncRef,
  liveNodePositionsRef,
  localNodeOverridesRef,
  scheduleNodePreview,
  setNodePositions,
  setNodes,
  sharedSyncEnabled,
  stage,
  workspaceHydratingRef,
  workspaceLoadedRef,
}: UseCanvasNodeChangesOptions) {
  return useCallback(
    (changes: NodeChange[]) => {
      if (!workspaceLoadedRef.current || workspaceHydratingRef.current || applyingRemoteSharedSyncRef.current) {
        setNodes((current) => applyNodeChanges(changes, current));
        return;
      }

      setNodes((current) => applyNodeChanges(changes, current));
      let livePositionsChanged = false;
      let nextLiveStagePositions = { ...(liveNodePositionsRef.current[stage] || {}) };

      changes.forEach((change) => {
        if (change.type !== "position" || !("position" in change) || !change.position) {
          return;
        }
        if (stage === "ideation" && !change.id.startsWith("agenda-")) {
          return;
        }

        const nextPosition = {
          x: Number(change.position.x || 0),
          y: Number(change.position.y || 0),
        };
        const previousPosition = nextLiveStagePositions[change.id];
        if (previousPosition?.x === nextPosition.x && previousPosition.y === nextPosition.y) {
          return;
        }

        scheduleNodePreview(change.id, nextPosition);
        nextLiveStagePositions = {
          ...nextLiveStagePositions,
          [change.id]: nextPosition,
        };
        livePositionsChanged = true;
      });

      if (livePositionsChanged) {
        const nextLivePositions = normalizeCanvasNodePositionsForComputedIdeation({
          ...liveNodePositionsRef.current,
          [stage]: nextLiveStagePositions,
        });
        liveNodePositionsRef.current = nextLivePositions;
      }

      setNodePositions((prev) => {
        const stagePositions = { ...(prev[stage] || {}) };
        let changed = false;

        changes.forEach((change) => {
          if (change.type === "remove" && stagePositions[change.id]) {
            delete stagePositions[change.id];
            changed = true;
          }
        });

        if (!changed) {
          return prev;
        }

        if (!sharedSyncEnabled) {
          changes.forEach((change) => {
            if (change.type === "remove") {
              localNodeOverridesRef.current[stage].delete(change.id);
            }
          });
        }

        return {
          ...prev,
          [stage]: stagePositions,
        };
      });
    },
    [
      applyingRemoteSharedSyncRef,
      liveNodePositionsRef,
      localNodeOverridesRef,
      scheduleNodePreview,
      setNodePositions,
      setNodes,
      sharedSyncEnabled,
      stage,
      workspaceHydratingRef,
      workspaceLoadedRef,
    ],
  );
}
