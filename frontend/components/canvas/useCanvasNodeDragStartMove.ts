"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Node } from "@xyflow/react";
import { CANVAS_ITEM_NODE_WIDTH } from "@/components/canvas/CanvasNodeLabels";
import { findProblemSourceDropTarget, type ProblemSourceDropTarget } from "@/components/canvas/canvasInteractionDom";
import type {
  AgendaDragPreviewState,
  IdeationDropPreviewState,
  IdeationDropTargetElement,
  PendingIdeationDragFrame,
  StableIdeationDragState,
} from "@/components/canvas/useCanvasRuntimeState";
import type { CanvasNodePositionsByStage } from "@/lib/types";

type CanvasStage = "ideation" | "problem-definition" | "solution";

type IdeationDragGhostState = {
  itemId: string;
  x: number;
  y: number;
} | null;

type UseCanvasNodeDragStartMoveOptions = {
  agendaDragPreviewRef: MutableRefObject<AgendaDragPreviewState | null>;
  cancelPendingIdeationDragFrame: () => void;
  collectIdeationDropTargetElements: (draggedNodeId: string) => IdeationDropTargetElement[];
  dragIdByNodeIdRef: MutableRefObject<Record<string, string>>;
  getStableIdeationDragPosition: (event: React.MouseEvent, node: Node) => { x: number; y: number };
  ideationDropPreviewRef: MutableRefObject<IdeationDropPreviewState | null>;
  ideationDropTargetElementsRef: MutableRefObject<IdeationDropTargetElement[]>;
  localDraggingNodeIdsRef: MutableRefObject<Set<string>>;
  meetingId: string;
  nodePositions: CanvasNodePositionsByStage;
  queueIdeationDragFrame: (pendingFrame: PendingIdeationDragFrame) => void;
  setAgendaDragPreview: Dispatch<SetStateAction<AgendaDragPreviewState | null>>;
  setIdeationDragGhost: Dispatch<SetStateAction<IdeationDragGhostState>>;
  setIdeationDropPreview: Dispatch<SetStateAction<IdeationDropPreviewState | null>>;
  setIdeationNodeDragActive: Dispatch<SetStateAction<boolean>>;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setProblemDropHighlight: (target: ProblemSourceDropTarget | null) => void;
  stableIdeationDragRef: MutableRefObject<StableIdeationDragState | null>;
  stage: CanvasStage;
  userId: string;
};

export function useCanvasNodeDragStartMove({
  agendaDragPreviewRef,
  cancelPendingIdeationDragFrame,
  collectIdeationDropTargetElements,
  dragIdByNodeIdRef,
  getStableIdeationDragPosition,
  ideationDropPreviewRef,
  ideationDropTargetElementsRef,
  localDraggingNodeIdsRef,
  meetingId,
  nodePositions,
  queueIdeationDragFrame,
  setAgendaDragPreview,
  setIdeationDragGhost,
  setIdeationDropPreview,
  setIdeationNodeDragActive,
  setNodes,
  setProblemDropHighlight,
  stableIdeationDragRef,
  stage,
  userId,
}: UseCanvasNodeDragStartMoveOptions) {
  const onNodeDrag = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (stage === "ideation" && node.id.startsWith("canvas-item-")) {
        event.stopPropagation();
        const stablePosition = getStableIdeationDragPosition(event, node);
        queueIdeationDragFrame({
          node,
          itemId: node.id.slice("canvas-item-".length),
          clientX: event.clientX,
          clientY: event.clientY,
          position: stablePosition,
        });
        return;
      }

      if (stage !== "problem-definition" || !node.id.startsWith("problem-discussion-")) {
        setProblemDropHighlight(null);
        ideationDropPreviewRef.current = null;
        setIdeationDropPreview(null);
        setIdeationDragGhost(null);
        return;
      }

      setProblemDropHighlight(findProblemSourceDropTarget(event.clientX, event.clientY, node.id));
    },
    [
      getStableIdeationDragPosition,
      ideationDropPreviewRef,
      queueIdeationDragFrame,
      setIdeationDragGhost,
      setIdeationDropPreview,
      setProblemDropHighlight,
      stage,
    ],
  );

  const onNodeDragStart = useCallback(
    (event: React.MouseEvent, node: Node) => {
      localDraggingNodeIdsRef.current.add(node.id);
      dragIdByNodeIdRef.current[node.id] =
        `${meetingId}:${userId}:${node.id}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
      ideationDropPreviewRef.current = null;
      setIdeationDropPreview(null);
      cancelPendingIdeationDragFrame();
      ideationDropTargetElementsRef.current = [];

      if (stage === "ideation" && node.id.startsWith("canvas-item-")) {
        event.stopPropagation();
        ideationDropTargetElementsRef.current = collectIdeationDropTargetElements(node.id);
        setIdeationNodeDragActive(true);
        setIdeationDragGhost({
          itemId: node.id.slice("canvas-item-".length),
          x: event.clientX,
          y: event.clientY,
        });
        stableIdeationDragRef.current = {
          nodeId: node.id,
          anchor: {
            x: CANVAS_ITEM_NODE_WIDTH / 2,
            y: 64,
          },
        };
        const stablePosition = getStableIdeationDragPosition(event, node);
        setNodes((current) =>
          current.map((item) =>
            item.id === node.id
              ? {
                  ...item,
                  position: stablePosition,
                }
              : item,
          ),
        );
        agendaDragPreviewRef.current = null;
        setAgendaDragPreview(null);
        return;
      }

      stableIdeationDragRef.current = null;
      setIdeationNodeDragActive(false);
      setIdeationDragGhost(null);

      if (stage !== "ideation" || !node.id.startsWith("agenda-")) {
        agendaDragPreviewRef.current = null;
        setAgendaDragPreview(null);
        return;
      }

      const agendaId = node.id.slice("agenda-".length);
      const nextPreview = {
        agendaId,
        originPosition: nodePositions.ideation?.[node.id] || node.position,
      };
      agendaDragPreviewRef.current = nextPreview;
      setAgendaDragPreview(nextPreview);
    },
    [
      agendaDragPreviewRef,
      cancelPendingIdeationDragFrame,
      collectIdeationDropTargetElements,
      dragIdByNodeIdRef,
      getStableIdeationDragPosition,
      ideationDropPreviewRef,
      ideationDropTargetElementsRef,
      localDraggingNodeIdsRef,
      meetingId,
      nodePositions,
      setAgendaDragPreview,
      setIdeationDragGhost,
      setIdeationDropPreview,
      setIdeationNodeDragActive,
      setNodes,
      stableIdeationDragRef,
      stage,
      userId,
    ],
  );

  return {
    onNodeDrag,
    onNodeDragStart,
  };
}
