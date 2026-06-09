import { Position } from "@xyflow/react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { makeIdeationKeywordBubbleNodeLabel } from "@/components/canvas/CanvasNodeLabels";
import {
  CANVAS_IDEATION_BUBBLE_PLANE_HEIGHT,
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
const IDEATION_BUBBLE_ARC_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const IDEATION_DEMO_ORBIT_LAYER_ID = "ideation-demo-orbit-layer";
const IDEATION_DEMO_ORBIT_MOTION_MS = 3200;
const IDEATION_DEMO_ORBIT_ENTER_MS = 840;
const IDEATION_DEMO_ORBIT_EXIT_MS = 920;

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

function prefersReducedDemoOrbitMotion() {
  return (
    typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function shortestDemoOrbitAngleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function demoBubbleTopLeftToCenter(bubble: Pick<IdeationKeywordBubbleVisual, "targetX" | "targetY" | "size">) {
  return {
    x: bubble.targetX + bubble.size / 2,
    y: bubble.targetY + bubble.size / 2,
  };
}

function demoBubbleTransformFromDelta(dx: number, dy: number, scale = 1) {
  return `translate(${Math.round(dx * 100) / 100}px, ${Math.round(dy * 100) / 100}px) scale(${scale})`;
}

function demoBubbleOpacityForState(bubble: IdeationKeywordBubbleVisual) {
  return bubble.displayState === "exiting" ? 0 : bubble.opacity ?? 1;
}

function buildDemoBubbleArcKeyframes(previous: IdeationKeywordBubbleVisual, next: IdeationKeywordBubbleVisual) {
  const previousAngle = Number(previous.orbitAngle);
  const nextAngle = Number(next.orbitAngle);
  const previousRadius = Number(previous.orbitRadius);
  const nextRadius = Number(next.orbitRadius);
  if (
    !Number.isFinite(previousAngle)
    || !Number.isFinite(nextAngle)
    || !Number.isFinite(previousRadius)
    || !Number.isFinite(nextRadius)
    || previousRadius <= 0
    || nextRadius <= 0
  ) {
    return null;
  }

  const nextCenter = demoBubbleTopLeftToCenter(next);
  const orbitCenter = {
    x: nextCenter.x - Math.cos(nextAngle) * nextRadius,
    y: nextCenter.y - Math.sin(nextAngle) * nextRadius,
  };
  const delta = shortestDemoOrbitAngleDelta(previousAngle, nextAngle);
  const keyframeOffsets = [0, 0.24, 0.5, 0.76, 1];
  return keyframeOffsets.map((offset) => {
    const angle = previousAngle + delta * offset;
    const radius = previousRadius + (nextRadius - previousRadius) * offset;
    const center = {
      x: orbitCenter.x + Math.cos(angle) * radius,
      y: orbitCenter.y + Math.sin(angle) * radius,
    };
    return {
      transform: demoBubbleTransformFromDelta(center.x - nextCenter.x, center.y - nextCenter.y),
      opacity: demoBubbleOpacityForState(next),
      offset,
    };
  });
}

function buildDemoBubbleTransferKeyframes(previous: IdeationKeywordBubbleVisual, next: IdeationKeywordBubbleVisual) {
  const previousCenter = demoBubbleTopLeftToCenter(previous);
  const nextCenter = demoBubbleTopLeftToCenter(next);
  const fromX = previousCenter.x - nextCenter.x;
  const fromY = previousCenter.y - nextCenter.y;
  const curveX = fromX * 0.54;
  const curveY = fromY * 0.54 - Math.min(96, Math.hypot(fromX, fromY) * 0.16);
  return [
    { transform: demoBubbleTransformFromDelta(fromX, fromY), opacity: previous.opacity ?? 1, offset: 0 },
    { transform: demoBubbleTransformFromDelta(curveX, curveY), opacity: 1, offset: 0.52 },
    { transform: demoBubbleTransformFromDelta(0, 0), opacity: demoBubbleOpacityForState(next), offset: 1 },
  ];
}

function buildDemoBubbleMotionKeyframes(previous: IdeationKeywordBubbleVisual | undefined, next: IdeationKeywordBubbleVisual) {
  if (!previous) {
    return [
      { transform: demoBubbleTransformFromDelta(0, 0, 0.65), opacity: 0, offset: 0 },
      { transform: demoBubbleTransformFromDelta(0, 0, 1.08), opacity: demoBubbleOpacityForState(next), offset: 0.72 },
      { transform: demoBubbleTransformFromDelta(0, 0, 1), opacity: demoBubbleOpacityForState(next), offset: 1 },
    ];
  }

  if (next.displayState === "exiting") {
    return [
      { transform: demoBubbleTransformFromDelta(0, 0, 1), opacity: previous.opacity ?? 1, offset: 0 },
      { transform: demoBubbleTransformFromDelta(0, 0, 0.86), opacity: 0, offset: 1 },
    ];
  }

  const sameOrbit = previous.orbitCenterId && previous.orbitCenterId === next.orbitCenterId;
  const sameRing = Number(previous.orbitRing ?? -1) === Number(next.orbitRing ?? -2);
  if (sameOrbit && sameRing && Number(next.orbitRing ?? 0) > 0) {
    const arcKeyframes = buildDemoBubbleArcKeyframes(previous, next);
    if (arcKeyframes) return arcKeyframes;
  }

  return buildDemoBubbleTransferKeyframes(previous, next);
}

function demoBubbleMotionType(previous: IdeationKeywordBubbleVisual | undefined, next: IdeationKeywordBubbleVisual) {
  if (!previous) return "enter";
  if (next.displayState === "exiting") return "exit";
  const sameOrbit = previous.orbitCenterId && previous.orbitCenterId === next.orbitCenterId;
  if (sameOrbit && Number(previous.orbitRing ?? -1) === Number(next.orbitRing ?? -2)) return "arc";
  if (sameOrbit) return "radial";
  return "orbit-transfer";
}

function IdeationBubbleAnimatedLabel({
  bubble,
}: {
  bubble: IdeationKeywordBubbleVisual;
}) {
  const labelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = labelRef.current;
    const path = bubble.arcMotionPath;
    if (!element || !path || typeof element.animate !== "function") return undefined;

    const animation = element.animate(
      [
        {
          transform: `translate(${path.fromX}px, ${path.fromY}px) scale(${bubble.visualScale ?? 1})`,
        },
        {
          transform: `translate(${path.midX}px, ${path.midY}px) scale(${bubble.visualScale ?? 1})`,
          offset: 0.52,
        },
        {
          transform: `translate(0px, 0px) scale(${bubble.visualScale ?? 1})`,
        },
      ],
      {
        duration: path.durationMs,
        easing: IDEATION_BUBBLE_ARC_EASING,
        fill: "both",
      },
    );

    return () => animation.cancel();
  }, [
    bubble.arcMotionPath?.key,
    bubble.arcMotionPath?.durationMs,
    bubble.visualScale,
  ]);

  const fallbackTransform = bubble.arcMotionPath
    ? `translate(${bubble.arcMotionPath.fromX}px, ${bubble.arcMotionPath.fromY}px) scale(${bubble.visualScale ?? 1})`
    : `scale(${bubble.visualScale ?? 1})`;

  return (
    <div
      ref={labelRef}
      className="h-full w-full origin-center"
      style={{
        opacity: 1,
        transform: fallbackTransform,
        transition: bubble.arcMotionPath ? "opacity 720ms ease" : CANVAS_IDEATION_BUBBLE_LABEL_TRANSITION,
      }}
    >
      {makeIdeationKeywordBubbleNodeLabel(bubble, bubble.size)}
    </div>
  );
}

function IdeationDemoOrbitLayer({
  bubbles,
}: {
  bubbles: IdeationKeywordBubbleVisual[];
}) {
  const bubbleRefs = useRef(new Map<string, HTMLDivElement>());
  const previousByIdRef = useRef(new Map<string, IdeationKeywordBubbleVisual>());
  const signature = bubbles
    .map((bubble) => [
      bubble.id,
      bubble.targetX,
      bubble.targetY,
      bubble.size,
      bubble.orbitCenterId,
      bubble.orbitRing,
      bubble.orbitAngle,
      bubble.orbitRadius,
      bubble.orbitSlotIndex,
      bubble.displayState,
    ].join(":"))
    .join("|");

  useLayoutEffect(() => {
    const previousById = previousByIdRef.current;
    const nextById = new Map(bubbles.map((bubble) => [bubble.id, bubble] as const));
    const reduced = prefersReducedDemoOrbitMotion();

    bubbles.forEach((bubble) => {
      const element = bubbleRefs.current.get(bubble.id);
      if (!element) return;
      element.getAnimations().forEach((animation) => animation.cancel());
      const previous = previousById.get(bubble.id);
      const motionType = demoBubbleMotionType(previous, bubble);
      element.dataset.motionType = motionType;

      if (reduced || typeof element.animate !== "function") {
        element.style.opacity = String(demoBubbleOpacityForState(bubble));
        element.style.transform = "translate(0px, 0px) scale(1)";
        return;
      }

      const keyframes = buildDemoBubbleMotionKeyframes(previous, bubble);
      const duration = motionType === "enter"
        ? IDEATION_DEMO_ORBIT_ENTER_MS
        : motionType === "exit"
          ? IDEATION_DEMO_ORBIT_EXIT_MS
          : IDEATION_DEMO_ORBIT_MOTION_MS;
      element.animate(keyframes, {
        duration,
        easing: IDEATION_BUBBLE_ARC_EASING,
        fill: "both",
      });
    });

    previousById.forEach((previous, id) => {
      if (nextById.has(id)) return;
      const element = bubbleRefs.current.get(id);
      if (!element || reduced || typeof element.animate !== "function") return;
      element.animate(
        [
          { transform: "translate(0px, 0px) scale(1)", opacity: previous.opacity ?? 1 },
          { transform: "translate(0px, 0px) scale(0.82)", opacity: 0 },
        ],
        {
          duration: IDEATION_DEMO_ORBIT_EXIT_MS,
          easing: IDEATION_BUBBLE_ARC_EASING,
          fill: "both",
        },
      );
    });

    previousByIdRef.current = nextById;
  }, [bubbles, signature]);

  const setBubbleRef = (id: string) => (element: HTMLDivElement | null) => {
    if (element) {
      bubbleRefs.current.set(id, element);
    } else {
      bubbleRefs.current.delete(id);
    }
  };

  const guideGroups = [...new Map(
    bubbles
      .filter((bubble) => bubble.role === "center" || bubble.emphasis === "primary")
      .map((bubble) => [bubble.id, bubble] as const),
  ).values()];

  return (
    <div className="relative h-full w-full overflow-visible" aria-hidden="true">
      {guideGroups.flatMap((centerBubble) => {
        const centerX = centerBubble.targetX + centerBubble.size / 2;
        const centerY = centerBubble.targetY + centerBubble.size / 2;
        const radii = uniqueOrbitRadii(
          bubbles
            .filter((bubble) => bubble.orbitCenterId === centerBubble.id)
            .map((bubble) => Number(bubble.orbitRadius || 0)),
        );
        return radii.map((radius, index) => (
          <div
            key={`${centerBubble.id}-guide-${index}-${radius}`}
            className="absolute rounded-full border border-dashed border-[#01a3ff]/20 bg-[radial-gradient(circle,rgba(157,229,255,0.045)_0%,rgba(1,163,255,0)_66%)]"
            style={{
              left: centerX - radius,
              top: centerY - radius,
              width: radius * 2,
              height: radius * 2,
              transition: IDEATION_ORBIT_GUIDE_TRANSITION,
            }}
          />
        ));
      })}
      {bubbles.map((bubble) => (
        <div
          key={bubble.id}
          ref={setBubbleRef(bubble.id)}
          className="absolute origin-center will-change-transform"
          style={{
            left: bubble.targetX,
            top: bubble.targetY,
            width: bubble.size,
            height: bubble.size,
            opacity: demoBubbleOpacityForState(bubble),
            transform: "translate(0px, 0px) scale(1)",
            zIndex: bubble.role === "center" || bubble.emphasis === "primary" ? 20 : bubble.role === "dot" ? 6 : 12,
          }}
          data-bubble-id={bubble.id}
          data-orbit-ring={bubble.orbitRing ?? ""}
          data-orbit-slot={bubble.orbitSlotIndex ?? ""}
        >
          {makeIdeationKeywordBubbleNodeLabel(bubble, bubble.size)}
        </div>
      ))}
    </div>
  );
}

export function buildIdeationKeywordBubbleBlueprint(input: {
  bubbles: IdeationKeywordBubbleVisual[];
  debugGrowthById: Record<string, number>;
  layoutRevision: number;
  stage: string;
  demoBalanceMode?: boolean;
}): CanvasGraphBlueprint {
  const { bubbles, debugGrowthById, layoutRevision, stage, demoBalanceMode = false } = input;
  if (demoBalanceMode) {
    return {
      layoutSignature: buildNodeContentSignature([
        stage,
        "demo-magnum-orbit-layer",
        layoutRevision,
        ...bubbles.flatMap((bubble) => [
          bubble.id,
          bubble.text,
          bubble.count,
          bubble.activity,
          bubble.opacity,
          bubble.displayState,
          bubble.lifecycleState,
          bubble.targetX,
          bubble.targetY,
          bubble.size,
          bubble.role,
          bubble.orbitCenterId,
          bubble.orbitRing,
          bubble.orbitAngle,
          bubble.orbitRadius,
          bubble.orbitOrderKey,
          bubble.orbitSlotIndex,
          bubble.emphasis,
        ]),
      ]),
      nodeDescriptors: [
        {
          id: IDEATION_DEMO_ORBIT_LAYER_ID,
          position: { x: 0, y: 0 },
          positionSource: "computed",
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
          className: "pointer-events-none !border-0 !bg-transparent !p-0 !shadow-none",
          style: {
            width: CANVAS_IDEATION_BUBBLE_PLANE_WIDTH,
            height: CANVAS_IDEATION_BUBBLE_PLANE_HEIGHT,
            padding: 0,
            opacity: 1,
          },
          draggable: false,
          selectable: false,
          zIndex: 20,
          data: {
            contentSignature: buildNodeContentSignature([
              "demo-magnum-orbit-layer",
              layoutRevision,
              bubbles.length,
              ...bubbles.flatMap((bubble) => [
                bubble.id,
                bubble.text,
                bubble.count,
                bubble.targetX,
                bubble.targetY,
                bubble.size,
                bubble.orbitCenterId,
                bubble.orbitRing,
                bubble.orbitAngle,
                bubble.orbitRadius,
                bubble.orbitOrderKey,
                bubble.orbitSlotIndex,
                bubble.displayState,
                bubble.emphasis,
              ]),
            ]),
            label: <IdeationDemoOrbitLayer bubbles={bubbles} />,
          },
        },
      ],
    };
  }

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
            transition: bubble.arcMotionPath ? "opacity 720ms ease" : CANVAS_IDEATION_BUBBLE_TRANSITION,
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
              bubble.arcOffsetX,
              bubble.arcOffsetY,
              bubble.arcMotion,
              bubble.arcMotionPath?.key,
              bubble.arcMotionPath?.fromX,
              bubble.arcMotionPath?.fromY,
              bubble.arcMotionPath?.midX,
              bubble.arcMotionPath?.midY,
              bubble.arcMotionPath?.previousAngle,
              bubble.arcMotionPath?.nextAngle,
              bubble.entering,
              bubble.durable,
              bubble.emphasis,
              bubble.kind,
              bubble.role,
              bubble.orbitCenterId,
              bubble.orbitRing,
              bubble.orbitAngle,
              bubble.orbitRadius,
              bubble.orbitOrderKey,
              bubble.orbitSlotIndex,
              bubble.offTopic,
              bubble.offTopicReason,
              ...bubble.related,
            ]),
            label: <IdeationBubbleAnimatedLabel bubble={bubble} />,
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
        bubble.arcOffsetX,
        bubble.arcOffsetY,
        bubble.arcMotion,
        bubble.arcMotionPath?.key,
        bubble.arcMotionPath?.fromX,
        bubble.arcMotionPath?.fromY,
        bubble.arcMotionPath?.midX,
        bubble.arcMotionPath?.midY,
        bubble.arcMotionPath?.previousAngle,
        bubble.arcMotionPath?.nextAngle,
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
        bubble.orbitAngle,
        bubble.orbitRadius,
        bubble.orbitOrderKey,
        bubble.orbitSlotIndex,
        bubble.offTopic,
        debugGrowthById[bubble.id] || 1,
        ...bubble.related,
      ]),
    ]),
    nodeDescriptors: [...orbitGuideDescriptors, ...bubbleDescriptors],
  };
}
