"use client";

export function extractCanvasItemIdFromNodeId(nodeId: string) {
  return nodeId.startsWith("canvas-item-") ? nodeId.slice("canvas-item-".length) : "";
}

function rectIntersectionArea(left: DOMRect, right: DOMRect) {
  const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
  const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
  return width * height;
}

export function getReactFlowCanvasRect(container: HTMLElement | null) {
  if (!container) {
    return null;
  }

  const flowElement = container.querySelector<HTMLElement>(".react-flow");
  return (flowElement || container).getBoundingClientRect();
}

export function pointInRect(clientX: number, clientY: number, rect: DOMRect | null) {
  return Boolean(
    rect &&
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom,
  );
}

function getReactFlowNodeElement(nodeId: string) {
  if (typeof document === "undefined" || !nodeId) {
    return null;
  }
  return Array.from(document.querySelectorAll<HTMLElement>(".react-flow__node"))
    .find((element) => element.getAttribute("data-id") === nodeId) || null;
}

export type ProblemSourceDropTarget = {
  groupId: string;
  nodeId: string;
  nodeKind: "topic" | "idea";
  nodeLabel: string;
  element: HTMLElement;
};

function makeProblemSourceDropTarget(candidate: HTMLElement): ProblemSourceDropTarget | null {
  const nodeKind = candidate.dataset.problemSourceNodeKind;
  if (nodeKind !== "topic" && nodeKind !== "idea") {
    return null;
  }

  return {
    groupId: candidate.dataset.problemSourceGroupId || "",
    nodeId: candidate.dataset.problemSourceNodeId || "",
    nodeKind,
    nodeLabel: candidate.dataset.problemSourceNodeLabel || "",
    element: candidate,
  };
}

export function findProblemSourceDropTarget(
  clientX: number,
  clientY: number,
  draggedNodeId?: string,
): ProblemSourceDropTarget | null {
  if (typeof document === "undefined" || !Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    return null;
  }

  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>("[data-problem-source-node-id][data-problem-source-group-id]"),
  );

  const draggedElement = draggedNodeId ? getReactFlowNodeElement(draggedNodeId) : null;
  if (draggedElement) {
    const draggedRect = draggedElement.getBoundingClientRect();
    const best = candidates
      .map((candidate) => ({
        candidate,
        area: rectIntersectionArea(draggedRect, candidate.getBoundingClientRect()),
      }))
      .filter((entry) => entry.area >= 900)
      .sort((left, right) => right.area - left.area)[0];
    if (best) {
      return makeProblemSourceDropTarget(best.candidate);
    }
  }

  for (const candidate of candidates) {
    const rect = candidate.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      continue;
    }

    return makeProblemSourceDropTarget(candidate);
  }

  return null;
}
