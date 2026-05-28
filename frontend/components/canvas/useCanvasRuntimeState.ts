"use client";

import { useRef, useState } from "react";
import type { Edge, Node, ReactFlowInstance } from "@xyflow/react";
import type { CanvasNodePositionsByStage, CanvasNodePreviewPayload } from "@/lib/types";

export function useCanvasRuntimeState() {
  const [nodePositions, setNodePositions] = useState<CanvasNodePositionsByStage>({});
  const [nodes, setNodes] = useState<Node[]>([]);
  return {
    nodePositions,
    setNodePositions,
    nodes,
    setNodes,
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
    ideationBubbleUpdateTickRef,
  };
}
