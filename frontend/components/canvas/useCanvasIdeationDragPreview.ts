"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { Edge, Node, ReactFlowInstance } from "@xyflow/react";
import {
  CANVAS_IDEATION_DROP_ZONE_VERTICAL_PADDING,
  CANVAS_ITEM_NODE_WIDTH,
  CANVAS_TOPIC_CHILD_GAP_X,
  getCanvasItemDescendantIds,
  getCanvasItemTopLevelAncestorId,
  getTopicDirectChildIds,
  getTopicFlattenedIdeaChildIds,
  isTopicCanvasItem,
  makeIdeationMergeDropPreview,
} from "@/components/canvas/CanvasNodeLabels";
import {
  extractCanvasItemIdFromNodeId,
  getReactFlowCanvasRect,
  pointInRect,
  type ProblemSourceDropTarget,
} from "@/components/canvas/canvasInteractionDom";
import type {
  IdeationDropPreviewState,
  IdeationDropTargetElement,
  PendingIdeationDragFrame,
  StableIdeationDragState,
} from "@/components/canvas/useCanvasRuntimeState";
import type { CanvasWorkspaceItem } from "@/lib/types";

type CanvasStage = "ideation" | "problem-definition" | "solution";

function positionsEqual(
  left?: { x: number; y: number },
  right?: { x: number; y: number },
) {
  return (left?.x ?? 0) === (right?.x ?? 0) && (left?.y ?? 0) === (right?.y ?? 0);
}

type IdeationDragGhostState = {
  itemId: string;
  x: number;
  y: number;
} | null;

type UseCanvasIdeationDragPreviewOptions = {
  canvasItemById: Map<string, CanvasWorkspaceItem>;
  canvasItems: CanvasWorkspaceItem[];
  flowNodeById: Map<string, Node>;
  flowRef: MutableRefObject<ReactFlowInstance<Node, Edge> | null>;
  hoveredProblemDropTargetElementRef: MutableRefObject<HTMLElement | null>;
  ideationDragFrameRef: MutableRefObject<number | null>;
  ideationDropPreviewRef: MutableRefObject<IdeationDropPreviewState | null>;
  ideationDropTargetElementsRef: MutableRefObject<IdeationDropTargetElement[]>;
  ideationLeftFlowRef: MutableRefObject<ReactFlowInstance<Node, Edge> | null>;
  ideationLeftPaneRef: MutableRefObject<HTMLDivElement | null>;
  ideationRightFlowRef: MutableRefObject<ReactFlowInstance<Node, Edge> | null>;
  ideationRightPaneRef: MutableRefObject<HTMLDivElement | null>;
  pendingIdeationDragFrameRef: MutableRefObject<PendingIdeationDragFrame | null>;
  scheduleNodePreview: (nodeId: string, position: { x: number; y: number }) => void;
  selectedAgendaForDrop: string;
  selectedCanvasItemId: string;
  setIdeationDragGhost: Dispatch<SetStateAction<IdeationDragGhostState>>;
  setIdeationDropPreview: Dispatch<SetStateAction<IdeationDropPreviewState | null>>;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  stableIdeationDragRef: MutableRefObject<StableIdeationDragState | null>;
  stage: CanvasStage;
};

export function useCanvasIdeationDragPreview({
  canvasItemById,
  canvasItems,
  flowNodeById,
  flowRef,
  hoveredProblemDropTargetElementRef,
  ideationDragFrameRef,
  ideationDropPreviewRef,
  ideationDropTargetElementsRef,
  ideationLeftFlowRef,
  ideationLeftPaneRef,
  ideationRightFlowRef,
  ideationRightPaneRef,
  pendingIdeationDragFrameRef,
  scheduleNodePreview,
  selectedAgendaForDrop,
  selectedCanvasItemId,
  setIdeationDragGhost,
  setIdeationDropPreview,
  setNodes,
  stableIdeationDragRef,
  stage,
}: UseCanvasIdeationDragPreviewOptions) {
  const setProblemDropHighlight = useCallback(
    (target: ProblemSourceDropTarget | null) => {
      const previousElement = hoveredProblemDropTargetElementRef.current;
      if (previousElement && previousElement !== target?.element) {
        previousElement.classList.remove("imms-problem-source-drop-active");
      }

      if (target?.element) {
        target.element.classList.add("imms-problem-source-drop-active");
        hoveredProblemDropTargetElementRef.current = target.element;
        if (typeof document !== "undefined") {
          document.body.style.cursor = "copy";
        }
        return;
      }

      hoveredProblemDropTargetElementRef.current = null;
      if (typeof document !== "undefined") {
        document.body.style.cursor = "";
      }
    },
    [hoveredProblemDropTargetElementRef],
  );

  const getStableIdeationDragPosition = useCallback(
    (event: React.MouseEvent, node: Node) => {
      const dragState = stableIdeationDragRef.current;
      if (!flowRef.current || !dragState || dragState.nodeId !== node.id) {
        return node.position;
      }

      const pointerPosition = flowRef.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      return {
        x: pointerPosition.x - dragState.anchor.x,
        y: pointerPosition.y - dragState.anchor.y,
      };
    },
    [flowRef, stableIdeationDragRef],
  );

  const getIdeationDropPlaceholderPosition = useCallback(
    (pane: "left" | "right", clientX: number, clientY: number, fallback: { x: number; y: number }) => {
      const instance = pane === "left" ? ideationLeftFlowRef.current : ideationRightFlowRef.current;
      if (!instance) {
        return fallback;
      }

      const flowPosition = instance.screenToFlowPosition({ x: clientX, y: clientY });
      return {
        x: flowPosition.x - CANVAS_ITEM_NODE_WIDTH / 2,
        y: flowPosition.y - 64,
      };
    },
    [ideationLeftFlowRef, ideationRightFlowRef],
  );

  const collectIdeationDropTargetElements = useCallback((draggedNodeId: string): IdeationDropTargetElement[] => {
    if (typeof document === "undefined") {
      return [];
    }

    return Array.from(document.querySelectorAll<HTMLElement>(".react-flow__node"))
      .map((element) => {
        const nodeId = element.getAttribute("data-id") || "";
        const itemId = extractCanvasItemIdFromNodeId(nodeId);
        return {
          element,
          nodeId,
          itemId,
        };
      })
      .filter(
        (candidate) =>
          candidate.nodeId &&
          candidate.itemId &&
          candidate.nodeId !== draggedNodeId &&
          candidate.nodeId !== "ideation-drop-placeholder",
      );
  }, []);

  const findIdeationLeftGroupDropTarget = useCallback(
    (clientX: number, clientY: number, draggedItem: CanvasWorkspaceItem) => {
      if (stage !== "ideation") {
        return null;
      }

      const leftPane = ideationLeftPaneRef.current;
      if (!leftPane) {
        return null;
      }

      const draggedRootId = getCanvasItemTopLevelAncestorId(canvasItems, draggedItem.id);
      const draggedDescendantIds = new Set(getCanvasItemDescendantIds(canvasItems, draggedItem.id));
      const candidates =
        ideationDropTargetElementsRef.current.length > 0
          ? ideationDropTargetElementsRef.current
          : collectIdeationDropTargetElements(`canvas-item-${draggedItem.id}`);
      let bestTarget: {
        nodeId: string;
        targetItem: CanvasWorkspaceItem;
        targetNode: Node | null;
        isCurrentRoot: boolean;
        distance: number;
      } | null = null;

      for (const { element, nodeId, itemId } of candidates) {
        if (!leftPane.contains(element)) {
          continue;
        }
        const targetItem = canvasItemById.get(itemId) || null;
        if (!targetItem) {
          continue;
        }

        const rect = element.getBoundingClientRect();
        const inside =
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom;
        if (!inside) {
          continue;
        }

        if (
          targetItem.parent_topic_id ||
          targetItem.agenda_id !== selectedAgendaForDrop ||
          targetItem.id === draggedItem.id ||
          draggedDescendantIds.has(targetItem.id)
        ) {
          continue;
        }

        const target = {
          nodeId,
          targetItem,
          targetNode: flowNodeById.get(nodeId) || null,
          isCurrentRoot: targetItem.id === draggedRootId,
          distance: Math.hypot(clientX - (rect.left + rect.width / 2), clientY - (rect.top + rect.height / 2)),
        };
        if (!bestTarget || target.distance < bestTarget.distance) {
          bestTarget = target;
        }
      }

      return bestTarget;
    },
    [
      canvasItemById,
      canvasItems,
      collectIdeationDropTargetElements,
      flowNodeById,
      ideationDropTargetElementsRef,
      ideationLeftPaneRef,
      selectedAgendaForDrop,
      stage,
    ],
  );

  const resolveIdeationDropPreview = useCallback(
    (clientX: number, clientY: number, node: Node): IdeationDropPreviewState | null => {
      if (stage !== "ideation" || !node.id.startsWith("canvas-item-")) {
        return null;
      }

      const draggedItemId = node.id.slice("canvas-item-".length);
      const draggedItem = canvasItemById.get(draggedItemId) || null;
      if (!draggedItem) {
        return null;
      }

      const draggedRootId = getCanvasItemTopLevelAncestorId(canvasItems, draggedItem.id);
      const draggedDescendantIds = getCanvasItemDescendantIds(canvasItems, draggedItem.id);
      const splitLeftDropTarget = findIdeationLeftGroupDropTarget(clientX, clientY, draggedItem);
      const pointerInsideLeftPane = pointInRect(
        clientX,
        clientY,
        getReactFlowCanvasRect(ideationLeftPaneRef.current),
      );
      const pointerInsideRightPane = pointInRect(
        clientX,
        clientY,
        getReactFlowCanvasRect(ideationRightPaneRef.current),
      );

      if (draggedItem.parent_topic_id && pointerInsideLeftPane) {
        if (splitLeftDropTarget && splitLeftDropTarget.targetNode && !splitLeftDropTarget.isCurrentRoot) {
          return {
            draggedItemId,
            targetId: splitLeftDropTarget.targetItem.id,
            mode: "topic",
            agendaId: splitLeftDropTarget.targetItem.agenda_id || draggedItem.agenda_id,
            position: splitLeftDropTarget.targetNode.position,
            label: "이 그룹으로 이동",
            hint: `"${splitLeftDropTarget.targetItem.title || "그룹"}" 상세 캔버스로 이동합니다.`,
          };
        }

        return {
          draggedItemId,
          targetId: selectedAgendaForDrop || draggedItem.agenda_id,
          mode: "detach",
          agendaId: selectedAgendaForDrop || draggedItem.agenda_id,
          position: getIdeationDropPlaceholderPosition("left", clientX, clientY, node.position),
          label: "왼쪽에 추가",
          hint: "마우스를 놓으면 현재 그룹분류의 1차 노드로 추가합니다.",
        };
      }

      if (splitLeftDropTarget && splitLeftDropTarget.targetNode) {
        if (!draggedItem.parent_topic_id && !splitLeftDropTarget.isCurrentRoot) {
          return makeIdeationMergeDropPreview(
            draggedItem,
            splitLeftDropTarget.targetItem,
            splitLeftDropTarget.targetNode.position,
          );
        }
      }

      if (!draggedItem.parent_topic_id && pointerInsideRightPane) {
        const selectedRootIdForDrop = selectedCanvasItemId
          ? getCanvasItemTopLevelAncestorId(canvasItems, selectedCanvasItemId)
          : "";
        const selectedRootItemForDrop = selectedRootIdForDrop
          ? canvasItemById.get(selectedRootIdForDrop) || null
          : null;

        if (
          selectedRootItemForDrop &&
          selectedRootItemForDrop.id !== draggedItem.id &&
          selectedRootItemForDrop.agenda_id === selectedAgendaForDrop
        ) {
          return makeIdeationMergeDropPreview(
            draggedItem,
            selectedRootItemForDrop,
            getIdeationDropPlaceholderPosition("right", clientX, clientY, node.position),
          );
        }
      }

      if (pointerInsideLeftPane || (!draggedItem.parent_topic_id && !pointerInsideRightPane)) {
        return null;
      }

      if (draggedItem.parent_topic_id && pointerInsideRightPane) {
        return null;
      }

      const candidateElements =
        ideationDropTargetElementsRef.current.length > 0
          ? ideationDropTargetElementsRef.current
          : collectIdeationDropTargetElements(node.id);
      let candidateDropTarget: {
        nodeId: string;
        targetItem: CanvasWorkspaceItem;
        targetNode: Node;
        childCount: number;
        directAction: "group-move" | "group-merge" | "";
        distance: number;
      } | null = null;

      for (const { element, nodeId, itemId } of candidateElements) {
        if (!nodeId.startsWith("canvas-item-")) {
          continue;
        }
        const targetItem = canvasItemById.get(itemId) || null;
        const targetNode = flowNodeById.get(nodeId) || null;
        if (!targetItem || !targetNode || targetItem.id === draggedItem.id) {
          continue;
        }

        const rect = element.getBoundingClientRect();
        const insideNodeRect =
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom;
        const canDropOnSplitGroup =
          insideNodeRect &&
          Boolean(draggedItem.parent_topic_id) &&
          !targetItem.parent_topic_id &&
          targetItem.agenda_id === selectedAgendaForDrop &&
          targetItem.id !== draggedRootId &&
          !draggedDescendantIds.includes(targetItem.id);
        if (canDropOnSplitGroup) {
          const target = {
            nodeId,
            targetItem,
            targetNode,
            childCount: 0,
            directAction: "group-move" as const,
            distance: Math.hypot(clientX - (rect.left + rect.width / 2), clientY - (rect.top + rect.height / 2)),
          };
          if (!candidateDropTarget || target.distance < candidateDropTarget.distance) {
            candidateDropTarget = target;
          }
          continue;
        }
        const canMergeSplitGroups =
          insideNodeRect &&
          !draggedItem.parent_topic_id &&
          !targetItem.parent_topic_id &&
          targetItem.agenda_id === selectedAgendaForDrop &&
          targetItem.id !== draggedItem.id &&
          !draggedDescendantIds.includes(targetItem.id);
        if (canMergeSplitGroups) {
          const target = {
            nodeId,
            targetItem,
            targetNode,
            childCount: 0,
            directAction: "group-merge" as const,
            distance: Math.hypot(clientX - (rect.left + rect.width / 2), clientY - (rect.top + rect.height / 2)),
          };
          if (!candidateDropTarget || target.distance < candidateDropTarget.distance) {
            candidateDropTarget = target;
          }
          continue;
        }

        const screenGap = Math.max(10, rect.width * 0.045);
        const childCount =
          isTopicCanvasItem(targetItem) && !isTopicCanvasItem(draggedItem)
            ? getTopicDirectChildIds(canvasItems, targetItem.id).filter((childId) => childId !== draggedItem.id).length
            : 0;
        const dropLeft = rect.right + screenGap + childCount * (rect.width + screenGap);
        const dropRight = dropLeft + rect.width;
        const dropTop = rect.top - CANVAS_IDEATION_DROP_ZONE_VERTICAL_PADDING;
        const dropBottom = rect.bottom + CANVAS_IDEATION_DROP_ZONE_VERTICAL_PADDING;
        const insideDropZone =
          clientX >= dropLeft &&
          clientX <= dropRight &&
          clientY >= dropTop &&
          clientY <= dropBottom;
        if (!insideDropZone) {
          continue;
        }

        const target = {
          nodeId,
          targetItem,
          targetNode,
          childCount,
          directAction: "" as const,
          distance: Math.hypot(clientX - dropLeft, clientY - (rect.top + rect.height / 2)),
        };
        if (!candidateDropTarget || target.distance < candidateDropTarget.distance) {
          candidateDropTarget = target;
        }
      }

      const candidateNodeId = candidateDropTarget?.nodeId || "";

      if (candidateNodeId.startsWith("canvas-item-")) {
        const targetItem = candidateDropTarget?.targetItem || null;
        const targetNode = candidateDropTarget?.targetNode || null;
        if (!targetItem || !targetNode) {
          return null;
        }
        const placeholderPosition = {
          x: targetNode.position.x + CANVAS_ITEM_NODE_WIDTH + CANVAS_TOPIC_CHILD_GAP_X + (candidateDropTarget?.childCount || 0) * (CANVAS_ITEM_NODE_WIDTH + CANVAS_TOPIC_CHILD_GAP_X),
          y: targetNode.position.y,
        };

        if (candidateDropTarget?.directAction === "group-merge") {
          return makeIdeationMergeDropPreview(draggedItem, targetItem, targetNode.position);
        }

        if (candidateDropTarget?.directAction === "group-move") {
          return {
            draggedItemId,
            targetId: targetItem.id,
            mode: "topic",
            agendaId: targetItem.agenda_id || draggedItem.agenda_id,
            position: targetNode.position,
            label: "이 그룹으로 이동",
            hint: `"${targetItem.title || "그룹"}" 상세 캔버스로 이동합니다.`,
          };
        }

        if (isTopicCanvasItem(targetItem)) {
          if (isTopicCanvasItem(draggedItem)) {
            return {
              draggedItemId,
              targetId: targetItem.id,
              mode: "topic-merge",
              agendaId: targetItem.agenda_id || draggedItem.agenda_id,
              position: placeholderPosition,
              label: "토픽 통합",
              hint: `"${targetItem.title || "토픽"}"과 합쳐 새 토픽으로 재구성합니다.`,
            };
          }

          return {
            draggedItemId,
            targetId: targetItem.id,
            mode: "topic",
            agendaId: targetItem.agenda_id || draggedItem.agenda_id,
            position: placeholderPosition,
            label: "이 토픽에 추가",
            hint: `"${targetItem.title || "토픽"}"의 하위 아이디어로 이동합니다.`,
          };
        }

        if (isTopicCanvasItem(draggedItem)) {
          const draggedTopicChildIds = getTopicFlattenedIdeaChildIds(canvasItems, draggedItem.id);
          if (draggedTopicChildIds.includes(targetItem.id)) {
            return null;
          }

          return {
            draggedItemId,
            targetId: targetItem.id,
            mode: "topic-idea-merge",
            agendaId: targetItem.agenda_id || draggedItem.agenda_id,
            position: placeholderPosition,
            label: "새 토픽으로 통합",
            hint: `"${targetItem.title || "대상 노드"}"와 토픽을 새 주제로 묶습니다.`,
          };
        }

        return {
          draggedItemId,
          targetId: targetItem.id,
          mode: "merge",
          agendaId: targetItem.agenda_id || draggedItem.agenda_id,
          position: placeholderPosition,
          label: "새 토픽으로 묶기",
          hint: `"${targetItem.title || "대상 노드"}"와 함께 새 토픽을 만듭니다.`,
        };
      }

      return null;
    },
    [
      canvasItemById,
      canvasItems,
      collectIdeationDropTargetElements,
      findIdeationLeftGroupDropTarget,
      flowNodeById,
      getIdeationDropPlaceholderPosition,
      ideationDropTargetElementsRef,
      ideationLeftPaneRef,
      ideationRightPaneRef,
      selectedAgendaForDrop,
      selectedCanvasItemId,
      stage,
    ],
  );

  const cancelPendingIdeationDragFrame = useCallback(() => {
    if (ideationDragFrameRef.current !== null) {
      window.cancelAnimationFrame(ideationDragFrameRef.current);
      ideationDragFrameRef.current = null;
    }
    pendingIdeationDragFrameRef.current = null;
  }, [ideationDragFrameRef, pendingIdeationDragFrameRef]);

  const applyPendingIdeationDragFrame = useCallback(() => {
    ideationDragFrameRef.current = null;
    const pendingFrame = pendingIdeationDragFrameRef.current;
    pendingIdeationDragFrameRef.current = null;
    if (!pendingFrame) {
      return;
    }

    const { node, itemId, clientX, clientY, position } = pendingFrame;
    setIdeationDragGhost((current) =>
      current?.itemId === itemId && current.x === clientX && current.y === clientY
        ? current
        : {
            itemId,
            x: clientX,
            y: clientY,
          },
    );
    scheduleNodePreview(node.id, position);
    setNodes((current) => {
      const targetNode = current.find((item) => item.id === node.id);
      if (!targetNode || positionsEqual(targetNode.position, position)) {
        return current;
      }

      return current.map((item) =>
        item.id === node.id
          ? {
              ...item,
              position,
            }
          : item,
      );
    });

    const dragNode = {
      ...node,
      position,
    };
    const nextPreview = resolveIdeationDropPreview(clientX, clientY, dragNode);
    ideationDropPreviewRef.current = nextPreview;
    setIdeationDropPreview((current) =>
      current?.draggedItemId === nextPreview?.draggedItemId &&
      current?.targetId === nextPreview?.targetId &&
      current?.mode === nextPreview?.mode &&
      current?.agendaId === nextPreview?.agendaId &&
      current?.position.x === nextPreview?.position.x &&
      current?.position.y === nextPreview?.position.y
        ? current
        : nextPreview,
    );
    setProblemDropHighlight(null);
  }, [
    ideationDragFrameRef,
    ideationDropPreviewRef,
    pendingIdeationDragFrameRef,
    resolveIdeationDropPreview,
    scheduleNodePreview,
    setIdeationDragGhost,
    setIdeationDropPreview,
    setNodes,
    setProblemDropHighlight,
  ]);

  const queueIdeationDragFrame = useCallback(
    (pendingFrame: PendingIdeationDragFrame) => {
      pendingIdeationDragFrameRef.current = pendingFrame;
      if (ideationDragFrameRef.current !== null) {
        return;
      }

      ideationDragFrameRef.current = window.requestAnimationFrame(applyPendingIdeationDragFrame);
    },
    [applyPendingIdeationDragFrame, ideationDragFrameRef, pendingIdeationDragFrameRef],
  );

  return {
    cancelPendingIdeationDragFrame,
    collectIdeationDropTargetElements,
    getStableIdeationDragPosition,
    resolveIdeationDropPreview,
    queueIdeationDragFrame,
    setProblemDropHighlight,
  };
}
