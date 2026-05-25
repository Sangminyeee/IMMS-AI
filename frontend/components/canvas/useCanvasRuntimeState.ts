"use client";

import { useRef, useState } from "react";
import type { Edge, Node, ReactFlowInstance } from "@xyflow/react";
import type { CanvasNodePositionsByStage, CanvasNodePreviewPayload } from "@/lib/types";

export type IdeationDropPreviewState = {
  draggedItemId: string;
  targetId: string;
  mode: "topic" | "merge" | "topic-merge" | "topic-idea-merge" | "detach";
  agendaId: string;
  position: { x: number; y: number };
  label: string;
  hint: string;
};

export type StableIdeationDragState = {
  nodeId: string;
  anchor: { x: number; y: number };
};

export type AgendaDragPreviewState = {
  agendaId: string;
  originPosition: { x: number; y: number };
};

export type IdeationDropTargetElement = {
  element: HTMLElement;
  nodeId: string;
  itemId: string;
};

export type PendingIdeationDragFrame = {
  node: Node;
  itemId: string;
  clientX: number;
  clientY: number;
  position: { x: number; y: number };
};

export type ProblemIdeaDragState = {
  sourceGroupId: string;
  sourceNodeId: string;
  sourceNodeKind: "topic" | "idea" | "summary";
  cardKind: "summary" | "idea";
  sourceIndex: number;
  title: string;
  ideaId?: string;
  summaryText?: string;
};

export type ProblemIdeaDropPreviewState = {
  targetGroupId: string;
  cardKind: "summary" | "idea";
  insertIndex: number;
};

export type ProblemIdeaDragPointState = {
  x: number;
  y: number;
};

export type ProblemIdeaPointerDragState<TCard> = {
  groupId: string;
  card: TCard;
  startX: number;
  startY: number;
  active: boolean;
};

export function useCanvasRuntimeState() {
  const [nodePositions, setNodePositions] = useState<CanvasNodePositionsByStage>({});
  const [nodes, setNodes] = useState<Node[]>([]);
  const [agendaDragPreview, setAgendaDragPreview] = useState<AgendaDragPreviewState | null>(null);
  const [ideationDropPreview, setIdeationDropPreview] = useState<IdeationDropPreviewState | null>(null);
  const [, setIdeationNodeDragActive] = useState(false);
  const [ideationDragGhost, setIdeationDragGhost] = useState<{
    itemId: string;
    x: number;
    y: number;
  } | null>(null);
  const [problemIdeaDrag, setProblemIdeaDrag] = useState<ProblemIdeaDragState | null>(null);
  const [problemIdeaDropPreview, setProblemIdeaDropPreview] = useState<ProblemIdeaDropPreviewState | null>(null);
  const [problemIdeaDragPoint, setProblemIdeaDragPoint] = useState<ProblemIdeaDragPointState | null>(null);

  return {
    nodePositions,
    setNodePositions,
    nodes,
    setNodes,
    agendaDragPreview,
    setAgendaDragPreview,
    ideationDropPreview,
    setIdeationDropPreview,
    setIdeationNodeDragActive,
    ideationDragGhost,
    setIdeationDragGhost,
    problemIdeaDrag,
    setProblemIdeaDrag,
    problemIdeaDropPreview,
    setProblemIdeaDropPreview,
    problemIdeaDragPoint,
    setProblemIdeaDragPoint,
  };
}

export function useCanvasFlowRefs() {
  const canvasSurfaceRef = useRef<HTMLDivElement | null>(null);
  const flowRef = useRef<ReactFlowInstance<Node, Edge> | null>(null);

  return {
    canvasSurfaceRef,
    flowRef,
  };
}

export function useCanvasNodeSyncRefs() {
  const nodePreviewFlushTimerRef = useRef<number | null>(null);
  const liveNodePositionsRef = useRef<CanvasNodePositionsByStage>({});
  const pendingNodePreviewsRef = useRef<Record<string, CanvasNodePreviewPayload>>({});
  const lastNodePreviewFlushAtRef = useRef(0);
  const nodePreviewSeqRef = useRef(0);
  const lastNodePositionUpdateMsByKeyRef = useRef<Record<string, number>>({});
  const localDraggingNodeIdsRef = useRef<Set<string>>(new Set());
  const dragIdByNodeIdRef = useRef<Record<string, string>>({});
  const lastRemoteNodePreviewSeqRef = useRef<Record<string, number>>({});
  const remoteNodePreviewTargetsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const remoteNodePreviewFrameRef = useRef<number | null>(null);
  const pendingIdeationDragFrameRef = useRef<PendingIdeationDragFrame | null>(null);
  const ideationDragFrameRef = useRef<number | null>(null);
  const pendingNodePlacementsRef = useRef<Record<string, { x: number; y: number }>>({});
  const hoveredProblemDropTargetElementRef = useRef<HTMLElement | null>(null);
  const ideationDropTargetElementsRef = useRef<IdeationDropTargetElement[]>([]);
  const ideationBubbleUpdateTickRef = useRef(0);

  return {
    nodePreviewFlushTimerRef,
    liveNodePositionsRef,
    pendingNodePreviewsRef,
    lastNodePreviewFlushAtRef,
    nodePreviewSeqRef,
    lastNodePositionUpdateMsByKeyRef,
    localDraggingNodeIdsRef,
    dragIdByNodeIdRef,
    lastRemoteNodePreviewSeqRef,
    remoteNodePreviewTargetsRef,
    remoteNodePreviewFrameRef,
    pendingIdeationDragFrameRef,
    ideationDragFrameRef,
    pendingNodePlacementsRef,
    hoveredProblemDropTargetElementRef,
    ideationDropTargetElementsRef,
    ideationBubbleUpdateTickRef,
  };
}

export function useCanvasDragRefs<TProblemCard>() {
  const agendaDragPreviewRef = useRef<AgendaDragPreviewState | null>(null);
  const ideationDropPreviewRef = useRef<IdeationDropPreviewState | null>(null);
  const stableIdeationDragRef = useRef<StableIdeationDragState | null>(null);
  const problemIdeaDragRef = useRef<ProblemIdeaDragState | null>(null);
  const problemIdeaPointerDragRef = useRef<ProblemIdeaPointerDragState<TProblemCard> | null>(null);

  return {
    agendaDragPreviewRef,
    ideationDropPreviewRef,
    stableIdeationDragRef,
    problemIdeaDragRef,
    problemIdeaPointerDragRef,
  };
}
