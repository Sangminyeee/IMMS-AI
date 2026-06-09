import { Position } from "@xyflow/react";
import { makeIdeationKeywordBubbleNodeLabel } from "@/components/canvas/CanvasNodeLabels";
import {
  CANVAS_IDEATION_BUBBLE_LABEL_TRANSITION,
  CANVAS_IDEATION_BUBBLE_TRANSITION,
  type IdeationKeywordBubbleVisual,
} from "@/components/canvas/CanvasIdeationBubbles";
import {
  buildNodeContentSignature,
  type CanvasGraphBlueprint,
  type CanvasNodeDescriptor,
} from "@/components/canvas/CanvasGraphTypes";

export function buildIdeationKeywordBubbleBlueprint(input: {
  bubbles: IdeationKeywordBubbleVisual[];
  debugGrowthById: Record<string, number>;
  layoutRevision: number;
  stage: string;
}): CanvasGraphBlueprint {
  const { bubbles, debugGrowthById, layoutRevision, stage } = input;
  const bubbleDescriptors: CanvasNodeDescriptor[] = bubbles.length > 0
    ? bubbles.map((bubble) => {
        const debugGrowth = debugGrowthById[bubble.id] || 1;
        const opacityLocked = !bubble.offTopic && bubble.kind !== "off_topic" && (bubble.emphasis === "primary" || bubble.durable);
        return {
          id: bubble.id,
          position: {
            x: bubble.targetX,
            y: bubble.targetY,
          },
          positionSource: "computed",
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
          className: "imms-ideation-keyword-node pointer-events-none !border-0 !bg-transparent !p-0 !shadow-none",
          style: {
            width: bubble.size,
            height: bubble.size,
            padding: 0,
            opacity: bubble.opacity ?? 1,
            transition: CANVAS_IDEATION_BUBBLE_TRANSITION,
          },
          draggable: false,
          selectable: false,
          data: {
            contentSignature: buildNodeContentSignature([
              "ideation-keyword-bubble",
              bubble.text,
              bubble.count,
              bubble.weight,
              debugGrowth,
              bubble.activity,
              bubble.opacity,
              bubble.visualScale,
              bubble.entering,
              bubble.durable,
              bubble.emphasis,
              bubble.kind,
              bubble.offTopic,
              bubble.offTopicReason,
              ...bubble.related,
            ]),
            label: (
              <div
                className="h-full w-full origin-center"
                style={{
                  opacity: bubble.entering && !opacityLocked ? 0.88 : 1,
                  transform: `scale(${bubble.visualScale ?? 1})`,
                  transition: CANVAS_IDEATION_BUBBLE_LABEL_TRANSITION,
                }}
              >
                {makeIdeationKeywordBubbleNodeLabel(bubble, bubble.size)}
              </div>
            ),
          },
        };
      })
    : [
        {
          id: "ideation-keyword-empty",
          position: { x: 320, y: 260 },
          positionSource: "computed",
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
          className: "!border-0 !bg-transparent !p-0 !shadow-none",
          style: { width: 520, minHeight: 180, padding: 0 },
          draggable: false,
          selectable: false,
          data: {
            contentSignature: "ideation-keyword-empty",
            label: (
              <div className="flex min-h-[180px] items-center justify-center rounded-[18px] border border-dashed border-black/10 bg-white/80 px-6 text-center text-sm leading-6 text-[#777]">
                음성이 감지되면 STT 전사 후 핵심 키워드 버블을 생성합니다.
              </div>
            ),
          },
        },
      ];

  return {
    layoutSignature: buildNodeContentSignature([
      stage,
      "keyword-bubbles",
      layoutRevision,
      ...bubbles.flatMap((bubble) => [
        bubble.text,
        bubble.count,
        bubble.activity,
        bubble.opacity,
        bubble.visualScale,
        bubble.entering,
        bubble.durable,
        bubble.emphasis,
        bubble.targetX,
        bubble.targetY,
        bubble.size,
        bubble.kind,
        bubble.offTopic,
        debugGrowthById[bubble.id] || 1,
        ...bubble.related,
      ]),
    ]),
    nodeDescriptors: bubbleDescriptors,
  };
}
