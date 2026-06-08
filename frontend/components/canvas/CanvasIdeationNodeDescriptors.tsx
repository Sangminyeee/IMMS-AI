import { Position } from "@xyflow/react";
import { makeIdeationKeywordBubbleNodeLabel } from "@/components/canvas/CanvasNodeLabels";
import {
  CANVAS_IDEATION_BUBBLE_PLANE_WIDTH,
  CANVAS_IDEATION_BUBBLE_LABEL_TRANSITION,
  CANVAS_IDEATION_BUBBLE_TRANSITION,
  type IdeationKeywordBubbleVisual,
} from "@/components/canvas/CanvasIdeationBubbles";
import {
  buildNodeContentSignature,
  type CanvasGraphBlueprint,
  type CanvasNodeDescriptor,
} from "@/components/canvas/CanvasGraphTypes";

const IDEATION_ORBIT_GUIDE_TRANSITION = "transform 2800ms cubic-bezier(0.22, 1, 0.36, 1), opacity 720ms ease";

function uniqueOrbitRadii(values: number[]) {
  return [...new Set(
    values
      .map((value) => Math.round(value))
      .filter((value) => Number.isFinite(value) && value >= 96 && value <= 360),
  )].sort((left, right) => left - right);
}

function makeOrbitGuideLabel(radius: number, dotSeed: string, dimmed = false) {
  const dotAngles = [0.12, 1.42, 2.72, 3.76, 4.98].map((angle, index) => (
    angle + ((dotSeed.charCodeAt(index % dotSeed.length) || 31) % 18) / 100
  ));
  return (
    <div
      className="relative h-full w-full rounded-full border border-dashed"
      style={{
        borderColor: dimmed ? "rgba(1,163,255,0.1)" : "rgba(1,163,255,0.18)",
        background: "radial-gradient(circle, rgba(157,229,255,0.04) 0%, rgba(1,163,255,0) 66%)",
      }}
    >
      {dotAngles.map((angle, index) => {
        const dotSize = index === 0 ? 8 : 5;
        return (
          <span
            key={`${dotSeed}-${index}`}
            className="absolute left-1/2 top-1/2 rounded-full bg-[#9de5ff]/55 shadow-[0_0_12px_rgba(91,173,255,0.18)]"
            style={{
              width: dotSize,
              height: dotSize,
              transform: `translate(-50%, -50%) translate(${Math.cos(angle) * radius}px, ${Math.sin(angle) * radius}px)`,
            }}
          />
        );
      })}
    </div>
  );
}

function buildEmptyOrbitGuideDescriptors(): CanvasNodeDescriptor[] {
  const emptyGuides = [
    { id: "ideation-orbit-idle-primary-outer", centerX: CANVAS_IDEATION_BUBBLE_PLANE_WIDTH / 2 - 180, centerY: 410, radius: 273 },
    { id: "ideation-orbit-idle-primary-inner", centerX: CANVAS_IDEATION_BUBBLE_PLANE_WIDTH / 2 - 180, centerY: 410, radius: 180 },
    { id: "ideation-orbit-idle-secondary-outer", centerX: CANVAS_IDEATION_BUBBLE_PLANE_WIDTH / 2 + 260, centerY: 595, radius: 250 },
    { id: "ideation-orbit-idle-secondary-inner", centerX: CANVAS_IDEATION_BUBBLE_PLANE_WIDTH / 2 + 260, centerY: 595, radius: 166 },
  ];
  return emptyGuides.map((guide) => ({
    id: guide.id,
    position: { x: guide.centerX - guide.radius, y: guide.centerY - guide.radius },
    positionSource: "computed" as const,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    className: "pointer-events-none !border-0 !bg-transparent !p-0 !shadow-none",
    style: {
      width: guide.radius * 2,
      height: guide.radius * 2,
      padding: 0,
      opacity: 0.8,
      transition: IDEATION_ORBIT_GUIDE_TRANSITION,
    },
    draggable: false,
    selectable: false,
    zIndex: -10,
    data: {
      contentSignature: buildNodeContentSignature(["ideation-orbit-idle", guide.id, guide.radius]),
      label: makeOrbitGuideLabel(guide.radius, guide.id, true),
    },
  }));
}

function buildOrbitGuideDescriptors(bubbles: IdeationKeywordBubbleVisual[]): CanvasNodeDescriptor[] {
  if (bubbles.length === 0) return buildEmptyOrbitGuideDescriptors();

  const grouped = new Map<string, IdeationKeywordBubbleVisual[]>();
  bubbles.forEach((bubble) => {
    const groupId = bubble.clusterId || bubble.orbitCenterId || bubble.id;
    grouped.set(groupId, [...(grouped.get(groupId) || []), bubble]);
  });

  return [...grouped.entries()].flatMap(([groupId, group]) => {
    const centerBubble = group.find((bubble) => bubble.role === "center")
      || group.find((bubble) => bubble.emphasis === "primary")
      || [...group].sort((left, right) => right.size - left.size)[0];
    if (!centerBubble) return [];

    const centerX = centerBubble.targetX + centerBubble.size / 2;
    const centerY = centerBubble.targetY + centerBubble.size / 2;
    const radii = uniqueOrbitRadii(
      group
        .filter((bubble) => bubble.id !== centerBubble.id)
        .map((bubble) => Number(bubble.orbitRadius || 0)),
    );
    const guideRadii = radii.length > 0
      ? radii
      : [Math.max(142, Math.round(centerBubble.size * 0.86 + 84))];

    return guideRadii.slice(0, 2).map((radius, index) => ({
      id: `ideation-orbit-guide-${groupId}-${index}`,
      position: { x: centerX - radius, y: centerY - radius },
      positionSource: "computed" as const,
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      className: "pointer-events-none !border-0 !bg-transparent !p-0 !shadow-none",
      style: {
        width: radius * 2,
        height: radius * 2,
        padding: 0,
        opacity: 0.86,
        transition: IDEATION_ORBIT_GUIDE_TRANSITION,
      },
      draggable: false,
      selectable: false,
      zIndex: -10,
      data: {
        contentSignature: buildNodeContentSignature([
          "ideation-orbit-guide",
          groupId,
          index,
          radius,
          centerX,
          centerY,
        ]),
        label: makeOrbitGuideLabel(radius, `${groupId}-${index}`),
      },
    }));
  });
}

export function buildIdeationKeywordBubbleBlueprint(input: {
  bubbles: IdeationKeywordBubbleVisual[];
  debugGrowthById: Record<string, number>;
  layoutRevision: number;
  stage: string;
}): CanvasGraphBlueprint {
  const { bubbles, debugGrowthById, layoutRevision, stage } = input;
  const orbitGuideDescriptors = buildOrbitGuideDescriptors(bubbles);
  const bubbleDescriptors: CanvasNodeDescriptor[] = bubbles.length > 0
      ? bubbles.map((bubble) => {
        const debugGrowth = debugGrowthById[bubble.id] || 1;
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
          zIndex: bubble.role === "center" || bubble.emphasis === "primary" ? 20 : bubble.role === "dot" ? 6 : 12,
          data: {
            contentSignature: buildNodeContentSignature([
              "ideation-keyword-bubble",
              bubble.text,
              bubble.count,
              bubble.weight,
              debugGrowth,
              bubble.activity,
              bubble.opacity,
              bubble.displayState,
              bubble.lifecycleState,
              bubble.visualScale,
              bubble.entering,
              bubble.durable,
              bubble.emphasis,
              bubble.kind,
              bubble.role,
              bubble.orbitCenterId,
              bubble.orbitRing,
              bubble.orbitAngle,
              bubble.orbitRadius,
              bubble.offTopic,
              bubble.offTopicReason,
              ...bubble.related,
            ]),
            label: (
              <div
                className="h-full w-full origin-center"
                style={{
                  opacity: 1,
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
    : [];

  return {
    layoutSignature: buildNodeContentSignature([
      stage,
      "keyword-bubbles-orbit",
      layoutRevision,
      ...bubbles.flatMap((bubble) => [
        bubble.text,
        bubble.count,
        bubble.activity,
        bubble.opacity,
        bubble.displayState,
        bubble.lifecycleState,
        bubble.visualScale,
        bubble.entering,
        bubble.durable,
        bubble.emphasis,
        bubble.targetX,
        bubble.targetY,
        bubble.size,
        bubble.kind,
        bubble.role,
        bubble.orbitCenterId,
        bubble.orbitRing,
        bubble.orbitRadius,
        bubble.offTopic,
        debugGrowthById[bubble.id] || 1,
        ...bubble.related,
      ]),
    ]),
    nodeDescriptors: [...orbitGuideDescriptors, ...bubbleDescriptors],
  };
}
