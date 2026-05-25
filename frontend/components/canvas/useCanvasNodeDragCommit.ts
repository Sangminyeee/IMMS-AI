"use client";

import { useCallback, type Dispatch, type MouseEvent, type MutableRefObject, type SetStateAction } from "react";
import type { Node } from "@xyflow/react";
import { saveCanvasWorkspacePatch } from "@/lib/api";
import type {
  CanvasNodePositionsByStage,
  CanvasProblemDefinitionGroup,
  CanvasWorkspaceItem,
  MeetingState,
} from "@/lib/types";
import {
  normalizeCanvasNodePositionsForComputedIdeation,
  summarizeNodePositionsForDebug,
  summarizeRenderedNodesForDebug,
  writeSharedWorkspaceSessionCache,
  type buildFullWorkspacePatchPayload,
  type FullWorkspacePatchPayloadOverrides,
} from "@/components/canvas/canvasWorkspaceSerialization";

type CanvasStage = "ideation" | "problem-definition" | "solution";
type FullWorkspacePatchPayload = ReturnType<typeof buildFullWorkspacePatchPayload>;

type ProblemGroupModel = CanvasProblemDefinitionGroup & {
  status?: "draft" | "review" | "final" | string;
};

type SharedWorkspaceModel<TGroup extends ProblemGroupModel> = {
  stage: CanvasStage;
  canvasItems: CanvasWorkspaceItem[];
  problemGroups: TGroup[];
  nodePositions: CanvasNodePositionsByStage;
  importedState: MeetingState | null;
};

type UseCanvasNodeDragCommitOptions<TGroup extends ProblemGroupModel, TWorkspace extends SharedWorkspaceModel<TGroup>> = {
  applyingRemoteSharedSyncRef: MutableRefObject<boolean>;
  broadcastNodePositionCommit: (
    stageKey: CanvasStage,
    nodeId: string,
    nextNodePositions: CanvasNodePositionsByStage,
  ) => void;
  buildCurrentWorkspacePatchPayload: (
    overrides?: FullWorkspacePatchPayloadOverrides,
  ) => FullWorkspacePatchPayload;
  canvasItems: CanvasWorkspaceItem[];
  dragIdByNodeIdRef: MutableRefObject<Record<string, string>>;
  flushPendingNodePreviews: () => void;
  latestSharedWorkspaceRef: MutableRefObject<TWorkspace>;
  liveNodePositionsRef: MutableRefObject<CanvasNodePositionsByStage>;
  localDraggingNodeIdsRef: MutableRefObject<Set<string>>;
  localNodeOverridesRef: MutableRefObject<Record<CanvasStage, Set<string>>>;
  meetingId: string;
  nodePositions: CanvasNodePositionsByStage;
  nodes: Node[];
  persistedSharedImportedState: MeetingState | null;
  problemGroups: TGroup[];
  scheduleNodePreview: (nodeId: string, position: { x: number; y: number }) => void;
  setNodePositions: Dispatch<SetStateAction<CanvasNodePositionsByStage>>;
  sharedSyncEnabled: boolean;
  stage: CanvasStage;
  userId: string;
  workspaceHydratingRef: MutableRefObject<boolean>;
  workspaceLoadedRef: MutableRefObject<boolean>;
};

export function useCanvasNodeDragCommit<TGroup extends ProblemGroupModel, TWorkspace extends SharedWorkspaceModel<TGroup>>({
  applyingRemoteSharedSyncRef,
  broadcastNodePositionCommit,
  buildCurrentWorkspacePatchPayload,
  canvasItems,
  dragIdByNodeIdRef,
  flushPendingNodePreviews,
  latestSharedWorkspaceRef,
  liveNodePositionsRef,
  localDraggingNodeIdsRef,
  localNodeOverridesRef,
  meetingId,
  nodePositions,
  nodes,
  persistedSharedImportedState,
  problemGroups,
  scheduleNodePreview,
  setNodePositions,
  sharedSyncEnabled,
  stage,
  userId,
  workspaceHydratingRef,
  workspaceLoadedRef,
}: UseCanvasNodeDragCommitOptions<TGroup, TWorkspace>) {
  const onNodeDragStart = useCallback(
    (_event: MouseEvent, node: Node) => {
      void _event;
      if (stage !== "problem-definition") return;

      localDraggingNodeIdsRef.current.add(node.id);
      dragIdByNodeIdRef.current[node.id] =
        `${meetingId}:${userId}:${node.id}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    },
    [dragIdByNodeIdRef, localDraggingNodeIdsRef, meetingId, stage, userId],
  );

  const onNodeDrag = useCallback(() => undefined, []);

  const onNodeDragStop = useCallback(
    (_event: MouseEvent, node: Node) => {
      void _event;
      localDraggingNodeIdsRef.current.delete(node.id);
      const clearNodeDragSession = () => {
        delete dragIdByNodeIdRef.current[node.id];
      };

      if (stage !== "problem-definition") {
        clearNodeDragSession();
        return;
      }

      if (!workspaceLoadedRef.current || workspaceHydratingRef.current || applyingRemoteSharedSyncRef.current) {
        clearNodeDragSession();
        return;
      }

      scheduleNodePreview(node.id, node.position);
      flushPendingNodePreviews();
      clearNodeDragSession();

      const currentPosition = nodePositions[stage]?.[node.id];
      if (currentPosition && currentPosition.x === node.position.x && currentPosition.y === node.position.y) {
        return;
      }

      if (!sharedSyncEnabled) {
        localNodeOverridesRef.current[stage].add(node.id);
      }

      const nextPositionsSnapshot = normalizeCanvasNodePositionsForComputedIdeation({
        ...nodePositions,
        [stage]: {
          ...(nodePositions[stage] || {}),
          [node.id]: {
            x: node.position.x,
            y: node.position.y,
          },
        },
      });

      liveNodePositionsRef.current = nextPositionsSnapshot;
      latestSharedWorkspaceRef.current.stage = stage;
      latestSharedWorkspaceRef.current.canvasItems = canvasItems;
      latestSharedWorkspaceRef.current.problemGroups = problemGroups;
      latestSharedWorkspaceRef.current.nodePositions = nextPositionsSnapshot;
      latestSharedWorkspaceRef.current.importedState = persistedSharedImportedState;
      console.info("[canvas drag stop] computed position", {
        meetingId,
        stage,
        nodeId: node.id,
        position: nextPositionsSnapshot[stage]?.[node.id],
        nodePositions: summarizeNodePositionsForDebug(nextPositionsSnapshot),
        renderedNodes: summarizeRenderedNodesForDebug(nodes),
      });
      setNodePositions(nextPositionsSnapshot);

      if (!sharedSyncEnabled) {
        return;
      }

      if (meetingId) {
        writeSharedWorkspaceSessionCache(
          meetingId,
          buildCurrentWorkspacePatchPayload({
            problemGroups,
            nodePositions: nextPositionsSnapshot,
          }),
        );
        void saveCanvasWorkspacePatch({
          meeting_id: meetingId,
          stage,
          node_positions: nextPositionsSnapshot,
          imported_state: persistedSharedImportedState,
        }).catch((error) => {
          console.error("Failed to save shared node positions:", error);
        });
      }

      broadcastNodePositionCommit(stage, node.id, nextPositionsSnapshot);
    },
    [
      applyingRemoteSharedSyncRef,
      broadcastNodePositionCommit,
      buildCurrentWorkspacePatchPayload,
      canvasItems,
      dragIdByNodeIdRef,
      flushPendingNodePreviews,
      latestSharedWorkspaceRef,
      liveNodePositionsRef,
      localDraggingNodeIdsRef,
      localNodeOverridesRef,
      meetingId,
      nodePositions,
      nodes,
      persistedSharedImportedState,
      problemGroups,
      scheduleNodePreview,
      setNodePositions,
      sharedSyncEnabled,
      stage,
      workspaceHydratingRef,
      workspaceLoadedRef,
    ],
  );

  return {
    onNodeDrag,
    onNodeDragStart,
    onNodeDragStop,
  };
}
