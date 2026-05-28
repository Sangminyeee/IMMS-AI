"use client";

import { useCallback, type Dispatch, type MouseEvent as ReactMouseEvent, type SetStateAction } from "react";
import type { Node } from "@xyflow/react";
import type { CanvasWorkspaceItem } from "@/lib/types";

type CanvasStage = "ideation" | "problem-definition" | "solution";
type ProblemDefinitionPhase = "explore" | "structure";

type UseCanvasSurfaceInteractionHandlersOptions = {
  stage: CanvasStage;
  problemDefinitionPhase: ProblemDefinitionPhase;
  canvasItemById: Map<string, CanvasWorkspaceItem>;
  linkPendingPersonalNoteToCanvasItem: (canvasItem: CanvasWorkspaceItem) => boolean;
  openRightDrawer: () => void;
  closeRightDrawer: () => void;
  setSelectedNodeId: Dispatch<SetStateAction<string>>;
  setLeftPanelTab: Dispatch<SetStateAction<"detail">>;
  setSelectedCanvasItemId: Dispatch<SetStateAction<string>>;
  setSelectedProblemGroupId: Dispatch<SetStateAction<string>>;
  setSelectedProblemSourceNodeId: Dispatch<SetStateAction<string>>;
  setEditingProblemGroupId: Dispatch<SetStateAction<string>>;
  setSelectedAgendaId: Dispatch<SetStateAction<string>>;
};

function extractAgendaIdFromNodeId(nodeId: string) {
  if (nodeId.startsWith("agenda-")) return nodeId.slice("agenda-".length);
  const summaryMatch = nodeId.match(/^summary-(.+)-(\d+)$/);
  if (summaryMatch) return summaryMatch[1];
  return "";
}

export function useCanvasSurfaceInteractionHandlers({
  stage,
  problemDefinitionPhase,
  canvasItemById,
  linkPendingPersonalNoteToCanvasItem,
  openRightDrawer,
  closeRightDrawer,
  setSelectedNodeId,
  setLeftPanelTab,
  setSelectedCanvasItemId,
  setSelectedProblemGroupId,
  setSelectedProblemSourceNodeId,
  setEditingProblemGroupId,
  setSelectedAgendaId,
}: UseCanvasSurfaceInteractionHandlersOptions) {
  const handleCanvasNodeClick = useCallback((event: ReactMouseEvent, node: Node) => {
    if (node.id.startsWith("ideation-keyword-")) {
      event.stopPropagation();
      return;
    }

    setSelectedNodeId(node.id);
    setLeftPanelTab("detail");
    if (stage !== "problem-definition") {
      openRightDrawer();
    }

    const agendaId = extractAgendaIdFromNodeId(node.id);
    if (node.id.startsWith("canvas-item-")) {
      const canvasItemId = node.id.slice("canvas-item-".length);
      const canvasItem = canvasItemById.get(canvasItemId) || null;
      if (canvasItem && linkPendingPersonalNoteToCanvasItem(canvasItem)) {
        return;
      }
      setSelectedCanvasItemId(canvasItemId);
      setSelectedProblemGroupId("");
      setEditingProblemGroupId("");
      if (canvasItem?.agenda_id) {
        setSelectedAgendaId(canvasItem.agenda_id);
      }
    } else {
      setSelectedCanvasItemId("");
    }

    if (stage === "problem-definition" && problemDefinitionPhase === "structure") {
      setSelectedProblemGroupId("");
      setSelectedProblemSourceNodeId("");
      setEditingProblemGroupId("");
      return;
    }

    const clickedProblemGroupId = node.id.startsWith("problem-") ? node.id.slice("problem-".length) : "";
    if (clickedProblemGroupId) {
      setSelectedProblemGroupId(clickedProblemGroupId);
      setSelectedProblemSourceNodeId("");
      setSelectedCanvasItemId("");
      setEditingProblemGroupId("");
    }
    if (agendaId) {
      setSelectedAgendaId(agendaId);
    }
  }, [
    canvasItemById,
    linkPendingPersonalNoteToCanvasItem,
    openRightDrawer,
    problemDefinitionPhase,
    setEditingProblemGroupId,
    setLeftPanelTab,
    setSelectedAgendaId,
    setSelectedCanvasItemId,
    setSelectedNodeId,
    setSelectedProblemGroupId,
    setSelectedProblemSourceNodeId,
    stage,
  ]);

  const handleCanvasPaneClick = useCallback(() => {
    closeRightDrawer();
    if (stage === "ideation") {
      setSelectedCanvasItemId("");
      setSelectedNodeId("");
      setLeftPanelTab("detail");
    }
  }, [
    closeRightDrawer,
    setLeftPanelTab,
    setSelectedCanvasItemId,
    setSelectedNodeId,
    stage,
  ]);

  return {
    handleCanvasNodeClick,
    handleCanvasPaneClick,
  };
}
