import type { Position } from "@xyflow/react";
import type * as React from "react";

export type CanvasNodeData = {
  label: React.ReactNode;
  contentSignature: string;
};

export type CanvasNodeDescriptor = {
  id: string;
  position: { x: number; y: number };
  positionSource: "persisted" | "computed" | "fallback";
  sourcePosition: Position;
  targetPosition: Position;
  className: string;
  style: React.CSSProperties;
  data: CanvasNodeData;
  draggable?: boolean;
  dragHandle?: string;
  selectable?: boolean;
  zIndex?: number;
};

export type CanvasGraphBlueprint = {
  layoutSignature: string;
  nodeDescriptors: CanvasNodeDescriptor[];
};

export function buildNodeContentSignature(parts: Array<string | number | boolean | undefined>) {
  return parts
    .map((part) => (part === undefined ? "" : String(part)))
    .join("|");
}
