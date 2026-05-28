"use client";

import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Node } from "@xyflow/react";
import { normalizeCanvasNodePositionsForComputedIdeation, type WorkspaceFieldSignatures } from "@/components/canvas/canvasWorkspaceSerialization";
import type { CanvasNodePositionsByStage, CanvasNodePreviewPayload, CanvasRealtimeSyncPayload } from "@/lib/types";

type CanvasStage = "ideation" | "problem-definition" | "solution";

const NODE_PREVIEW_SYNC_THROTTLE_MS = 64;
const NODE_PREVIEW_ANIMATION_LERP = 0.38;
const NODE_PREVIEW_SETTLE_DISTANCE = 0.75;

function getNodePositionUpdateKey(stage: CanvasStage, nodeId: string) {
  return `${stage}:${nodeId}`;
}

function positionsEqual(
  left?: { x: number; y: number },
  right?: { x: number; y: number },
) {
  return (left?.x ?? 0) === (right?.x ?? 0) && (left?.y ?? 0) === (right?.y ?? 0);
}

type UseCanvasNodePreviewSyncOptions = {
  applyingRemoteSharedSyncRef: MutableRefObject<boolean>;
  dragIdByNodeIdRef: MutableRefObject<Record<string, string>>;
  incomingNodePreview: CanvasNodePreviewPayload | null;
  lastNodePositionUpdateMsByKeyRef: MutableRefObject<Record<string, number>>;
  lastNodePreviewFlushAtRef: MutableRefObject<number>;
  lastRemoteNodePreviewSeqRef: MutableRefObject<Record<string, number>>;
  lastWorkspaceFieldSignaturesRef: MutableRefObject<WorkspaceFieldSignatures>;
  latestSharedSyncEnabledRef: MutableRefObject<boolean>;
  localDraggingNodeIdsRef: MutableRefObject<Set<string>>;
  meetingId: string;
  nodePreviewFlushTimerRef: MutableRefObject<number | null>;
  nodePreviewSeqRef: MutableRefObject<number>;
  onNodePreviewSync: (payload: CanvasNodePreviewPayload) => void;
  onSharedCanvasSync: (payload: CanvasRealtimeSyncPayload) => void;
  pendingNodePreviewsRef: MutableRefObject<Record<string, CanvasNodePreviewPayload>>;
  remoteNodePreviewFrameRef: MutableRefObject<number | null>;
  remoteNodePreviewTargetsRef: MutableRefObject<Map<string, { x: number; y: number }>>;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  stage: CanvasStage;
  userId: string;
  workspaceHydratingRef: MutableRefObject<boolean>;
  workspaceLoadedRef: MutableRefObject<boolean>;
};

export function useCanvasNodePreviewSync({
  applyingRemoteSharedSyncRef,
  dragIdByNodeIdRef,
  incomingNodePreview,
  lastNodePositionUpdateMsByKeyRef,
  lastNodePreviewFlushAtRef,
  lastRemoteNodePreviewSeqRef,
  lastWorkspaceFieldSignaturesRef,
  latestSharedSyncEnabledRef,
  localDraggingNodeIdsRef,
  meetingId,
  nodePreviewFlushTimerRef,
  nodePreviewSeqRef,
  onNodePreviewSync,
  onSharedCanvasSync,
  pendingNodePreviewsRef,
  remoteNodePreviewFrameRef,
  remoteNodePreviewTargetsRef,
  setNodes,
  stage,
  userId,
  workspaceHydratingRef,
  workspaceLoadedRef,
}: UseCanvasNodePreviewSyncOptions) {
  const flushPendingNodePreviews = useCallback(() => {
    if (nodePreviewFlushTimerRef.current) {
      window.clearTimeout(nodePreviewFlushTimerRef.current);
    }
    nodePreviewFlushTimerRef.current = null;
    if (
      !meetingId ||
      !userId ||
      !latestSharedSyncEnabledRef.current ||
      !workspaceLoadedRef.current ||
      workspaceHydratingRef.current ||
      applyingRemoteSharedSyncRef.current
    ) {
      pendingNodePreviewsRef.current = {};
      return;
    }

    const pendingPreviews = Object.values(pendingNodePreviewsRef.current);
    pendingNodePreviewsRef.current = {};
    if (pendingPreviews.length === 0) {
      return;
    }

    lastNodePreviewFlushAtRef.current = Date.now();
    pendingPreviews.forEach((preview) => {
      onNodePreviewSync(preview);
    });
  }, [
    applyingRemoteSharedSyncRef,
    lastNodePreviewFlushAtRef,
    latestSharedSyncEnabledRef,
    meetingId,
    nodePreviewFlushTimerRef,
    onNodePreviewSync,
    pendingNodePreviewsRef,
    userId,
    workspaceHydratingRef,
    workspaceLoadedRef,
  ]);

  const scheduleNodePreview = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      if (
        !meetingId ||
        !userId ||
        !nodeId ||
        !latestSharedSyncEnabledRef.current ||
        !workspaceLoadedRef.current ||
        workspaceHydratingRef.current ||
        applyingRemoteSharedSyncRef.current
      ) {
        return;
      }

      const dragId =
        dragIdByNodeIdRef.current[nodeId] ||
        `${meetingId}:${userId}:${nodeId}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
      dragIdByNodeIdRef.current[nodeId] = dragId;
      const preview: CanvasNodePreviewPayload = {
        meeting_id: meetingId,
        stage,
        node_id: nodeId,
        x: Number(position.x || 0),
        y: Number(position.y || 0),
        updated_by: userId,
        updated_at: new Date().toISOString(),
        drag_id: dragId,
        client_seq: ++nodePreviewSeqRef.current,
      };
      pendingNodePreviewsRef.current[`${preview.stage}:${preview.node_id}`] = preview;

      const elapsed = Date.now() - lastNodePreviewFlushAtRef.current;
      const delay = Math.max(0, NODE_PREVIEW_SYNC_THROTTLE_MS - elapsed);
      if (delay === 0) {
        flushPendingNodePreviews();
        return;
      }

      if (!nodePreviewFlushTimerRef.current) {
        nodePreviewFlushTimerRef.current = window.setTimeout(flushPendingNodePreviews, delay);
      }
    },
    [
      applyingRemoteSharedSyncRef,
      dragIdByNodeIdRef,
      flushPendingNodePreviews,
      lastNodePreviewFlushAtRef,
      latestSharedSyncEnabledRef,
      meetingId,
      nodePreviewFlushTimerRef,
      nodePreviewSeqRef,
      pendingNodePreviewsRef,
      stage,
      userId,
      workspaceHydratingRef,
      workspaceLoadedRef,
    ],
  );

  const ensureRemoteNodePreviewAnimation = useCallback(() => {
    if (remoteNodePreviewFrameRef.current !== null) {
      return;
    }

    const animate = () => {
      remoteNodePreviewFrameRef.current = null;
      if (remoteNodePreviewTargetsRef.current.size === 0) {
        return;
      }

      setNodes((current) => {
        const visibleNodeIds = new Set(current.map((node) => node.id));
        remoteNodePreviewTargetsRef.current.forEach((_, nodeId) => {
          if (!visibleNodeIds.has(nodeId) || localDraggingNodeIdsRef.current.has(nodeId)) {
            remoteNodePreviewTargetsRef.current.delete(nodeId);
          }
        });

        let changed = false;
        const nextNodes = current.map((node) => {
          const target = remoteNodePreviewTargetsRef.current.get(node.id);
          if (!target) {
            return node;
          }

          const dx = target.x - node.position.x;
          const dy = target.y - node.position.y;
          const distance = Math.hypot(dx, dy);
          const nextPosition =
            distance <= NODE_PREVIEW_SETTLE_DISTANCE
              ? target
              : {
                  x: node.position.x + dx * NODE_PREVIEW_ANIMATION_LERP,
                  y: node.position.y + dy * NODE_PREVIEW_ANIMATION_LERP,
                };

          if (distance <= NODE_PREVIEW_SETTLE_DISTANCE) {
            remoteNodePreviewTargetsRef.current.delete(node.id);
          }

          if (positionsEqual(node.position, nextPosition)) {
            return node;
          }

          changed = true;
          return {
            ...node,
            position: nextPosition,
          };
        });

        return changed ? nextNodes : current;
      });

      if (remoteNodePreviewTargetsRef.current.size > 0) {
        remoteNodePreviewFrameRef.current = window.requestAnimationFrame(animate);
      }
    };

    remoteNodePreviewFrameRef.current = window.requestAnimationFrame(animate);
  }, [localDraggingNodeIdsRef, remoteNodePreviewFrameRef, remoteNodePreviewTargetsRef, setNodes]);

  const broadcastNodePositionCommit = useCallback(
    (stageKey: CanvasStage, nodeId: string, nextNodePositions: CanvasNodePositionsByStage) => {
      if (
        !meetingId ||
        !userId ||
        !nodeId ||
        !latestSharedSyncEnabledRef.current ||
        !workspaceLoadedRef.current ||
        workspaceHydratingRef.current ||
        applyingRemoteSharedSyncRef.current
      ) {
        return;
      }

      const normalizedNodePositions = normalizeCanvasNodePositionsForComputedIdeation(nextNodePositions);
      const committedPosition = normalizedNodePositions[stageKey]?.[nodeId];
      if (!committedPosition) {
        return;
      }

      const committedAtMs = Date.now();
      lastNodePositionUpdateMsByKeyRef.current[getNodePositionUpdateKey(stageKey, nodeId)] = committedAtMs;
      lastWorkspaceFieldSignaturesRef.current = {
        ...lastWorkspaceFieldSignaturesRef.current,
        node_positions: JSON.stringify(normalizedNodePositions),
      };

      onSharedCanvasSync({
        sync_id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        meeting_id: meetingId,
        sync_scope: "node_positions",
        updated_by: userId,
        updated_at: new Date(committedAtMs).toISOString(),
        stage: stageKey,
        node_positions: {
          [stageKey]: {
            [nodeId]: committedPosition,
          },
        },
      });
    },
    [
      applyingRemoteSharedSyncRef,
      lastNodePositionUpdateMsByKeyRef,
      lastWorkspaceFieldSignaturesRef,
      latestSharedSyncEnabledRef,
      meetingId,
      onSharedCanvasSync,
      userId,
      workspaceHydratingRef,
      workspaceLoadedRef,
    ],
  );

  useEffect(() => {
    if (
      !incomingNodePreview ||
      incomingNodePreview.meeting_id !== meetingId ||
      incomingNodePreview.updated_by === userId ||
      incomingNodePreview.stage !== stage ||
      !workspaceLoadedRef.current ||
      workspaceHydratingRef.current
    ) {
      return;
    }

    const nodeId = incomingNodePreview.node_id;
    if (!nodeId || localDraggingNodeIdsRef.current.has(nodeId)) {
      return;
    }

    const sequenceKey = `${incomingNodePreview.updated_by}:${incomingNodePreview.stage}:${nodeId}`;
    const previousSequence = lastRemoteNodePreviewSeqRef.current[sequenceKey] ?? -1;
    if (incomingNodePreview.client_seq <= previousSequence) {
      return;
    }

    lastRemoteNodePreviewSeqRef.current[sequenceKey] = incomingNodePreview.client_seq;
    remoteNodePreviewTargetsRef.current.set(nodeId, {
      x: incomingNodePreview.x,
      y: incomingNodePreview.y,
    });
    ensureRemoteNodePreviewAnimation();
  }, [
    ensureRemoteNodePreviewAnimation,
    incomingNodePreview,
    lastRemoteNodePreviewSeqRef,
    localDraggingNodeIdsRef,
    meetingId,
    remoteNodePreviewTargetsRef,
    stage,
    userId,
    workspaceHydratingRef,
    workspaceLoadedRef,
  ]);

  return {
    broadcastNodePositionCommit,
    ensureRemoteNodePreviewAnimation,
    flushPendingNodePreviews,
    scheduleNodePreview,
  };
}
