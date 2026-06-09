import { Position } from "@xyflow/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
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
const IDEATION_DEMO_ORBIT_ARC_MS = 1900;
const IDEATION_DEMO_ORBIT_RADIAL_MS = 1400;
const IDEATION_DEMO_ORBIT_TRANSFER_MS = 1800;
const IDEATION_DEMO_ORBIT_ENTER_MS = 820;
const IDEATION_DEMO_ORBIT_EXIT_MS = 620;
const IDEATION_DEMO_ORBIT_GHOST_MS = 840;
const IDEATION_DEMO_ORBIT_RAIL_PADDING = 14;

type DemoOrbitMotionPhase = "ghost-exit" | "delayed-enter" | "moving" | "settling" | "idle";
type DemoOrbitMotionType = "enter" | "arc" | "radial" | "orbit-transfer" | "exit" | "static";
type DemoOrbitVisualPhase = "ghost-exit" | "delayed-enter" | "moving" | "idle";

type DemoOrbitVisualBubble = IdeationKeywordBubbleVisual & {
  demoVisualPhase?: DemoOrbitVisualPhase;
  demoRemovedAt?: number;
};

type DemoOrbitPreparedMotion = {
  id: string;
  bubble: DemoOrbitVisualBubble;
  motionType: DemoOrbitMotionType;
  phase: DemoOrbitMotionPhase;
  retargeted: boolean;
  fromAngle?: number;
  toAngle?: number;
  angleDelta?: number;
  direction?: "counterclockwise" | "clockwise" | "shortest" | "direct";
  gateBlocked?: boolean;
};

type DemoOrbitMotionRecord = {
  id: string;
  bubble: DemoOrbitVisualBubble;
  currentX: number;
  currentY: number;
  targetX: number;
  targetY: number;
  currentScale: number;
  targetScale: number;
  currentOpacity: number;
  targetOpacity: number;
  motionType: DemoOrbitMotionType;
  phase: DemoOrbitVisualPhase;
  orbitCenterId?: string;
  orbitRing?: number;
  orbitSlotIndex?: number;
  previousOrbitSlotIndex?: number;
  targetOrbitSlotIndex?: number;
  orbitCenterX?: number;
  orbitCenterY?: number;
  currentAngle?: number;
  targetAngle?: number;
  currentRadius?: number;
  targetRadius?: number;
  orbitAngleDirection?: "counterclockwise" | "clockwise" | "shortest" | "direct";
  removedAt?: number;
};

type DemoOrbitRingFlowState = {
  offset: number;
  velocity: number;
};

function uniqueOrbitRadii(values: number[]) {
  return [...new Set(
    values
      .map((value) => Math.round(value))
      .filter((value) => Number.isFinite(value) && value >= 96 && value <= 360),
  )].sort((left, right) => left - right);
}

function demoHashString(value: string) {
  return Array.from(value || "demo").reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) >>> 0, 2166136261);
}

function demoOrbitRailPalette(sideIsB: boolean) {
  return sideIsB
    ? {
        stroke: "rgba(255,101,68,0.28)",
        flow: "rgba(255,101,68,0.44)",
        fill: "rgba(255,216,201,0.028)",
      }
    : {
        stroke: "rgba(35,108,243,0.3)",
        flow: "rgba(35,108,243,0.46)",
        fill: "rgba(157,229,255,0.03)",
      };
}

function isDemoOrbitGuideBubble(bubble: IdeationKeywordBubbleVisual) {
  const state = bubble.displayState || "active";
  return (
    (state === "active" || state === "dimmed")
    && bubble.role !== "center"
    && bubble.role !== "dot"
    && bubble.emphasis !== "primary"
    && Number.isFinite(Number(bubble.orbitRadius))
    && Number(bubble.orbitRadius) >= 96
  );
}

function buildDemoOrbitGuideRadii(centerId: string, bubbles: IdeationKeywordBubbleVisual[]) {
  const candidates = bubbles.filter((bubble) => bubble.orbitCenterId === centerId && isDemoOrbitGuideBubble(bubble));
  const activeSatelliteCount = candidates.length;
  const groups = new Map<number, { radius: number; count: number; minRing: number }>();
  candidates.forEach((bubble) => {
    const radius = Math.round(Number(bubble.orbitRadius || 0));
    const ring = Math.max(1, Math.round(Number(bubble.orbitRing || 1)));
    if (activeSatelliteCount <= 8 && ring > 1) return;
    const existing = groups.get(radius);
    if (existing) {
      existing.count += 1;
      existing.minRing = Math.min(existing.minRing, ring);
      return;
    }
    groups.set(radius, { radius, count: 1, minRing: ring });
  });

  return [...groups.values()]
    .sort((left, right) => {
      const ringDelta = left.minRing - right.minRing;
      if (ringDelta !== 0) return ringDelta;
      return left.radius - right.radius;
    })
    .reduce<Array<{ radius: number; count: number; minRing: number }>>((guides, guide) => {
      const closeIndex = guides.findIndex((item) => Math.abs(item.radius - guide.radius) < 64);
      if (closeIndex < 0) {
        guides.push(guide);
        return guides;
      }
      const existing = guides[closeIndex];
      if (guide.count > existing.count || (guide.count === existing.count && guide.minRing < existing.minRing)) {
        guides[closeIndex] = guide;
      }
      return guides;
    }, []);
}

function demoOrbitRailFlowStyle(centerId: string, radius: number, sideIsB: boolean): React.CSSProperties {
  const hash = demoHashString(`${centerId}:${Math.round(radius)}:${sideIsB ? "b" : "a"}`);
  const duration = 18000 + (hash % 8000);
  const dashOffset = sideIsB ? -84 : 84;
  return {
    "--demo-rail-flow-duration": `${duration}ms`,
    "--demo-rail-flow-offset": `${dashOffset}px`,
  } as React.CSSProperties;
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

const DEMO_ORBIT_TAU = Math.PI * 2;
const DEMO_ORBIT_ANGLE_EPSILON = 0.0008;

function unwrapDemoOrbitAngleNear(reference: number | undefined, angle: number) {
  if (!Number.isFinite(angle)) return 0;
  if (!Number.isFinite(reference)) return angle;
  const safeReference = Number(reference);
  return safeReference + shortestDemoOrbitAngleDelta(safeReference, angle);
}

function counterclockwiseDemoOrbitAngleDelta(from: number, to: number) {
  const shortest = shortestDemoOrbitAngleDelta(from, to);
  if (Math.abs(shortest) < DEMO_ORBIT_ANGLE_EPSILON) return 0;
  const positiveDelta = ((to - from) % DEMO_ORBIT_TAU + DEMO_ORBIT_TAU) % DEMO_ORBIT_TAU;
  if (positiveDelta < DEMO_ORBIT_ANGLE_EPSILON || Math.abs(positiveDelta - DEMO_ORBIT_TAU) < DEMO_ORBIT_ANGLE_EPSILON) {
    return 0;
  }
  return positiveDelta - DEMO_ORBIT_TAU;
}

function clockwiseDemoOrbitAngleDelta(from: number, to: number) {
  const shortest = shortestDemoOrbitAngleDelta(from, to);
  if (Math.abs(shortest) < DEMO_ORBIT_ANGLE_EPSILON) return 0;
  const positiveDelta = ((to - from) % DEMO_ORBIT_TAU + DEMO_ORBIT_TAU) % DEMO_ORBIT_TAU;
  return positiveDelta;
}

function demoOrbitAngleDelta(record: DemoOrbitMotionRecord) {
  const currentAngle = record.currentAngle ?? 0;
  const targetAngle = record.targetAngle ?? 0;
  if (record.orbitAngleDirection === "counterclockwise") {
    return counterclockwiseDemoOrbitAngleDelta(currentAngle, targetAngle);
  }
  if (record.orbitAngleDirection === "clockwise") {
    return clockwiseDemoOrbitAngleDelta(currentAngle, targetAngle);
  }
  if (record.orbitAngleDirection === "shortest") {
    return shortestDemoOrbitAngleDelta(currentAngle, targetAngle);
  }
  return 0;
}

function demoOrbitDirectionForBubble(
  bubble: IdeationKeywordBubbleVisual,
  fallback: "counterclockwise" | "shortest" | "direct",
): DemoOrbitMotionRecord["orbitAngleDirection"] {
  if (bubble.motionReason === "relayout_transfer") return "direct";
  if (bubble.motionReason === "relayout") return "shortest";
  if (bubble.motionDirection === "counterclockwise" || bubble.motionDirection === "clockwise") return "shortest";
  if (bubble.motionDirection === "nearest" || bubble.motionDirection === "nearest_arc" || bubble.motionDirection === "orbit_radial_arc") return "shortest";
  if (bubble.motionDirection === "direct") return "direct";
  if (bubble.motionReason === "insert_push" || bubble.motionReason === "ring_overflow" || bubble.motionReason === "gap_fill") return "shortest";
  if (bubble.motionReason === "affinity_transfer" || bubble.motionReason === "content_update") return "direct";
  return fallback;
}

function sanitizeExistingDemoOrbitMotionBubble(bubble: IdeationKeywordBubbleVisual) {
  if (bubble.motionReason !== "gate_enter") return bubble;
  return {
    ...bubble,
    motionReason: "content_update",
    motionDirection: "direct",
  };
}

function shouldBlockDemoOrbitGateCrossing(
  record: DemoOrbitMotionRecord,
  bubble: IdeationKeywordBubbleVisual,
) {
  void record;
  void bubble;
  return false;
}

function demoBubbleTopLeftToCenter(bubble: Pick<IdeationKeywordBubbleVisual, "targetX" | "targetY" | "size">) {
  return {
    x: bubble.targetX + bubble.size / 2,
    y: bubble.targetY + bubble.size / 2,
  };
}

function demoOrbitNow() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function demoBubbleOpacityForState(bubble: IdeationKeywordBubbleVisual) {
  return bubble.displayState === "exiting" ? 0 : bubble.opacity ?? 1;
}

function demoOrbitMotionDuration(motionType: DemoOrbitMotionType) {
  if (motionType === "enter") return IDEATION_DEMO_ORBIT_ENTER_MS;
  if (motionType === "exit") return IDEATION_DEMO_ORBIT_EXIT_MS;
  if (motionType === "arc") return IDEATION_DEMO_ORBIT_ARC_MS;
  if (motionType === "radial") return IDEATION_DEMO_ORBIT_RADIAL_MS;
  if (motionType === "orbit-transfer") return IDEATION_DEMO_ORBIT_TRANSFER_MS;
  return 0;
}

function demoOrbitMotionPhase(motionType: DemoOrbitMotionType): DemoOrbitMotionPhase {
  if (motionType === "enter") return "delayed-enter";
  if (motionType === "exit") return "ghost-exit";
  if (motionType === "static") return "idle";
  return "moving";
}

function logDemoOrbitMotionBatch(
  lastDebugAtRef: MutableRefObject<number>,
  batchId: number,
  graphVersion: number,
  motions: DemoOrbitPreparedMotion[],
) {
  if (process.env.NODE_ENV === "production") return;
  const now = Date.now();
  if (now - lastDebugAtRef.current < 900) return;
  lastDebugAtRef.current = now;
  const sampled = motions.slice(0, 12).map((motion) => ({
    bubble_id: motion.id,
    motion_type: motion.motionType,
    phase: motion.phase,
    from_angle: motion.fromAngle,
    to_angle: motion.toAngle,
    angle_delta: motion.angleDelta,
    direction: motion.direction,
    reason: motion.bubble.motionReason,
    plan: motion.bubble.motionPlanId,
    from_slot: motion.bubble.fromSlotIndex,
    to_slot: motion.bubble.toSlotIndex,
    move_cost: motion.bubble.moveCost,
    planned_angle_delta: motion.bubble.moveAngleDelta,
    arc_cost: motion.bubble.arcCost,
    radius_cost: motion.bubble.radiusCost,
    gate_blocked: motion.gateBlocked || motion.bubble.gateBlocked,
    ring: motion.bubble.orbitRing,
    slot: motion.bubble.orbitSlotIndex,
    order: motion.bubble.orbitOrderKey,
    retargeted: motion.retargeted,
  }));
  console.debug("[Bubble][DemoOrbitMotion]", {
    motion_batch_id: batchId,
    graph_version: graphVersion,
    motion_count: motions.length,
    ghost_count: motions.filter((motion) => motion.phase === "ghost-exit").length,
    entering_count: motions.filter((motion) => motion.phase === "delayed-enter").length,
    retargeted_count: motions.filter((motion) => motion.retargeted).length,
    motions: sampled,
  });
}

function demoOrbitFiniteNumber(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function isDemoOrbitRingFlowEligible(record: DemoOrbitMotionRecord) {
  const state = record.bubble.displayState || "active";
  return (
    record.phase === "idle"
    && record.motionType === "static"
    && state !== "exiting"
    && record.bubble.demoVisualPhase !== "ghost-exit"
    && record.bubble.role !== "center"
    && record.bubble.role !== "dot"
    && record.bubble.emphasis !== "primary"
    && Number.isFinite(record.orbitCenterX)
    && Number.isFinite(record.orbitCenterY)
    && Number.isFinite(record.currentAngle)
    && Number.isFinite(record.currentRadius)
    && Number(record.currentRadius) > 0
  );
}

function demoOrbitRingFlowKey(record: DemoOrbitMotionRecord) {
  if (!record.orbitCenterId || !Number.isFinite(record.orbitRing)) return "";
  return `${record.orbitCenterId}:${Math.round(Number(record.orbitRing))}`;
}

function makeDemoOrbitRingFlowState(key: string, record: DemoOrbitMotionRecord): DemoOrbitRingFlowState {
  const hash = demoHashString(`${key}:${record.bubble.choiceAffinity || "a"}`);
  const ring = Math.max(1, Math.round(Number(record.orbitRing) || 1));
  const sideIsB = String(record.bubble.choiceAffinity || "").toLowerCase() === "b";
  const direction = (sideIsB ? 1 : -1) * (ring % 2 === 0 ? -1 : 1);
  const degreesPerSecond = 0.38 + ((hash % 11) * 0.018);
  return {
    offset: 0,
    velocity: direction * (degreesPerSecond * Math.PI / 180) / 1000,
  };
}

function demoOrbitVisualPosition(record: DemoOrbitMotionRecord, ringFlowOffset = 0) {
  if (!ringFlowOffset || !isDemoOrbitRingFlowEligible(record)) {
    return { x: record.currentX, y: record.currentY };
  }
  const centerX = Number(record.orbitCenterX);
  const centerY = Number(record.orbitCenterY);
  const radius = Number(record.currentRadius);
  const angle = Number(record.currentAngle) + ringFlowOffset;
  return {
    x: centerX + Math.cos(angle) * radius - record.bubble.size / 2,
    y: centerY + Math.sin(angle) * radius - record.bubble.size / 2,
  };
}

function demoOrbitRecordTransform(record: DemoOrbitMotionRecord, ringFlowOffset = 0) {
  const visualPosition = demoOrbitVisualPosition(record, ringFlowOffset);
  return `translate3d(${Math.round(visualPosition.x * 100) / 100}px, ${Math.round(visualPosition.y * 100) / 100}px, 0) scale(${Math.round(record.currentScale * 1000) / 1000})`;
}

function applyDemoOrbitRecordStyle(element: HTMLElement, record: DemoOrbitMotionRecord, ringFlowOffset = 0) {
  element.style.transform = demoOrbitRecordTransform(record, ringFlowOffset);
  element.style.opacity = String(Math.max(0, Math.min(1, record.currentOpacity)));
}

function foldDemoOrbitRingFlowIntoRecord(record: DemoOrbitMotionRecord, ringFlowOffset = 0) {
  if (!ringFlowOffset || !isDemoOrbitRingFlowEligible(record)) return;
  const visualPosition = demoOrbitVisualPosition(record, ringFlowOffset);
  record.currentX = visualPosition.x;
  record.currentY = visualPosition.y;
  syncDemoOrbitRecordPolar(record, record.bubble);
}

function demoOrbitCenterForTarget(bubble: IdeationKeywordBubbleVisual) {
  const angle = Number(bubble.orbitAngle);
  const radius = Number(bubble.orbitRadius);
  if (!Number.isFinite(angle) || !Number.isFinite(radius) || radius <= 0) return null;
  const center = demoBubbleTopLeftToCenter(bubble);
  return {
    x: center.x - Math.cos(angle) * radius,
    y: center.y - Math.sin(angle) * radius,
    angle,
    radius,
  };
}

function syncDemoOrbitRecordPolar(record: DemoOrbitMotionRecord, bubble: IdeationKeywordBubbleVisual) {
  const orbit = demoOrbitCenterForTarget(bubble);
  if (!orbit) {
    record.orbitCenterX = undefined;
    record.orbitCenterY = undefined;
    record.currentAngle = undefined;
    record.targetAngle = undefined;
    record.currentRadius = undefined;
    record.targetRadius = undefined;
    return false;
  }

  const currentCenterX = record.currentX + bubble.size / 2;
  const currentCenterY = record.currentY + bubble.size / 2;
  const rawCurrentAngle = Math.atan2(currentCenterY - orbit.y, currentCenterX - orbit.x);
  const currentAngle = unwrapDemoOrbitAngleNear(record.currentAngle, rawCurrentAngle);
  record.orbitCenterX = orbit.x;
  record.orbitCenterY = orbit.y;
  record.currentAngle = currentAngle;
  record.currentRadius = Math.hypot(currentCenterX - orbit.x, currentCenterY - orbit.y);
  record.targetAngle = unwrapDemoOrbitAngleNear(currentAngle, orbit.angle);
  record.targetRadius = orbit.radius;
  return true;
}

function makeDemoOrbitMotionRecord(bubble: IdeationKeywordBubbleVisual): DemoOrbitMotionRecord {
  const targetOpacity = demoBubbleOpacityForState(bubble);
  const record: DemoOrbitMotionRecord = {
    id: bubble.id,
    bubble: { ...bubble, demoVisualPhase: "delayed-enter" },
    currentX: bubble.targetX,
    currentY: bubble.targetY,
    targetX: bubble.targetX,
    targetY: bubble.targetY,
    currentScale: 0.72,
    targetScale: 1,
    currentOpacity: 0,
    targetOpacity,
    motionType: "enter",
    phase: "delayed-enter",
    orbitCenterId: bubble.orbitCenterId,
    orbitRing: demoOrbitFiniteNumber(bubble.orbitRing, 0),
    orbitSlotIndex: demoOrbitFiniteNumber(bubble.orbitSlotIndex, 0),
    previousOrbitSlotIndex: demoOrbitFiniteNumber(bubble.orbitSlotIndex, 0),
    targetOrbitSlotIndex: demoOrbitFiniteNumber(bubble.orbitSlotIndex, 0),
    orbitAngleDirection: demoOrbitDirectionForBubble(bubble, "shortest"),
  };
  syncDemoOrbitRecordPolar(record, bubble);
  return record;
}

function demoOrbitMotionTypeForTarget(
  record: DemoOrbitMotionRecord,
  next: IdeationKeywordBubbleVisual,
): DemoOrbitMotionType {
  if (next.displayState === "exiting") return "exit";
  const distance = Math.hypot(record.currentX - next.targetX, record.currentY - next.targetY);
  const opacityDelta = Math.abs(record.currentOpacity - demoBubbleOpacityForState(next));
  const sizeDelta = Math.abs(record.bubble.size - next.size);
  if (distance < 0.5 && opacityDelta < 0.01 && sizeDelta < 0.5) return "static";
  const nextOrbitCenterId = next.orbitCenterId || "";
  const previousOrbitCenterId = record.orbitCenterId || "";
  const sameOrbit = previousOrbitCenterId && previousOrbitCenterId === nextOrbitCenterId;
  if (next.motionReason === "relayout_transfer") return "orbit-transfer";
  if (next.motionReason === "relayout" && sameOrbit && Number(record.orbitRing ?? -1) === Number(next.orbitRing ?? -2)) return "arc";
  if (next.motionReason === "relayout" && sameOrbit) return "radial";
  if (sameOrbit && Number(record.orbitRing ?? -1) === Number(next.orbitRing ?? -2)) return "arc";
  if (sameOrbit) return "radial";
  return "orbit-transfer";
}

function retargetDemoOrbitRecord(record: DemoOrbitMotionRecord, bubble: IdeationKeywordBubbleVisual) {
  const motionBubble = sanitizeExistingDemoOrbitMotionBubble(bubble);
  const gateBlocked = shouldBlockDemoOrbitGateCrossing(record, motionBubble);
  const effectiveBubble = gateBlocked
    ? {
        ...motionBubble,
        targetX: record.currentX,
        targetY: record.currentY,
        motionReason: "content_update",
        motionDirection: "direct",
      }
    : motionBubble;
  const previousOrbitSlotIndex = demoOrbitFiniteNumber(record.orbitSlotIndex, -1);
  const nextOrbitRing = demoOrbitFiniteNumber(effectiveBubble.orbitRing, 0);
  const nextOrbitSlotIndex = demoOrbitFiniteNumber(effectiveBubble.orbitSlotIndex, 0);
  const motionType = demoOrbitMotionTypeForTarget(record, effectiveBubble);
  const targetOpacity = demoBubbleOpacityForState(effectiveBubble);
  record.targetX = effectiveBubble.targetX;
  record.targetY = effectiveBubble.targetY;
  record.targetScale = 1;
  record.targetOpacity = targetOpacity;
  record.motionType = motionType;
  record.phase = motionType === "static" ? "idle" : "moving";
  record.removedAt = undefined;
  record.orbitCenterId = effectiveBubble.orbitCenterId;
  record.orbitRing = nextOrbitRing;
  record.orbitSlotIndex = nextOrbitSlotIndex;
  record.previousOrbitSlotIndex = previousOrbitSlotIndex;
  record.targetOrbitSlotIndex = nextOrbitSlotIndex;
  record.bubble = { ...effectiveBubble, demoVisualPhase: record.phase };

  if (motionType === "arc" || motionType === "radial" || motionType === "static") {
    syncDemoOrbitRecordPolar(record, effectiveBubble);
    record.orbitAngleDirection = demoOrbitDirectionForBubble(
      effectiveBubble,
      "shortest",
    );
  } else {
    record.orbitCenterX = undefined;
    record.orbitCenterY = undefined;
    record.currentAngle = undefined;
    record.targetAngle = undefined;
    record.currentRadius = undefined;
    record.targetRadius = undefined;
    record.orbitAngleDirection = demoOrbitDirectionForBubble(
      effectiveBubble,
      motionType === "orbit-transfer" ? "direct" : "shortest",
    );
  }
}

function markDemoOrbitRecordExiting(record: DemoOrbitMotionRecord, now: number) {
  if (record.phase === "ghost-exit") return;
  record.phase = "ghost-exit";
  record.motionType = "exit";
  record.removedAt = now;
  record.targetX = record.currentX;
  record.targetY = record.currentY;
  record.targetScale = 0.82;
  record.targetOpacity = 0;
  record.bubble = {
    ...record.bubble,
    displayState: "exiting",
    opacity: Math.max(record.currentOpacity, record.bubble.opacity ?? 1),
    demoVisualPhase: "ghost-exit",
    demoRemovedAt: now,
  };
}

function demoOrbitFrameAlpha(deltaMs: number, durationMs: number) {
  const tau = Math.max(48, durationMs / 3.2);
  return 1 - Math.exp(-Math.max(0, deltaMs) / tau);
}

function demoOrbitDistanceToTarget(record: DemoOrbitMotionRecord) {
  return Math.hypot(record.currentX - record.targetX, record.currentY - record.targetY);
}

function stepDemoOrbitRecord(record: DemoOrbitMotionRecord, deltaMs: number) {
  const moveAlpha = demoOrbitFrameAlpha(deltaMs, demoOrbitMotionDuration(record.motionType) || IDEATION_DEMO_ORBIT_ARC_MS);
  if (
    (record.motionType === "arc" || record.motionType === "radial")
    && record.orbitAngleDirection !== "direct"
    && Number.isFinite(record.orbitCenterX)
    && Number.isFinite(record.orbitCenterY)
    && Number.isFinite(record.currentAngle)
    && Number.isFinite(record.targetAngle)
    && Number.isFinite(record.currentRadius)
    && Number.isFinite(record.targetRadius)
  ) {
    const centerX = record.orbitCenterX ?? 0;
    const centerY = record.orbitCenterY ?? 0;
    const angleDelta = demoOrbitAngleDelta(record);
    record.currentAngle = (record.currentAngle ?? 0) + angleDelta * moveAlpha;
    record.currentRadius = (record.currentRadius ?? 0) + ((record.targetRadius ?? 0) - (record.currentRadius ?? 0)) * moveAlpha;
    record.currentX = centerX + Math.cos(record.currentAngle) * record.currentRadius - record.bubble.size / 2;
    record.currentY = centerY + Math.sin(record.currentAngle) * record.currentRadius - record.bubble.size / 2;
  } else {
    record.currentX += (record.targetX - record.currentX) * moveAlpha;
    record.currentY += (record.targetY - record.currentY) * moveAlpha;
  }

  const scaleAlpha = demoOrbitFrameAlpha(deltaMs, record.motionType === "enter" ? IDEATION_DEMO_ORBIT_ENTER_MS : 520);
  const opacityAlpha = demoOrbitFrameAlpha(deltaMs, record.motionType === "exit" ? IDEATION_DEMO_ORBIT_EXIT_MS : 360);
  record.currentScale += (record.targetScale - record.currentScale) * scaleAlpha;
  record.currentOpacity += (record.targetOpacity - record.currentOpacity) * opacityAlpha;

  const closeEnough = demoOrbitDistanceToTarget(record) < 0.35
    && Math.abs(record.currentScale - record.targetScale) < 0.006
    && Math.abs(record.currentOpacity - record.targetOpacity) < 0.01;
  if (closeEnough) {
    record.currentX = record.targetX;
    record.currentY = record.targetY;
    record.currentScale = record.targetScale;
    record.currentOpacity = record.targetOpacity;
    if (record.phase !== "ghost-exit") {
      record.phase = "idle";
      record.motionType = "static";
      record.bubble = { ...record.bubble, demoVisualPhase: "idle" };
      syncDemoOrbitRecordPolar(record, record.bubble);
    }
  }

  return !closeEnough || record.phase === "ghost-exit";
}

function useDemoOrbitMotion(bubbles: IdeationKeywordBubbleVisual[], graphVersion: number) {
  const bubbleRefs = useRef(new Map<string, HTMLDivElement>());
  const previousGraphByIdRef = useRef(new Map<string, IdeationKeywordBubbleVisual>());
  const recordsRef = useRef(new Map<string, DemoOrbitMotionRecord>());
  const ringFlowRef = useRef(new Map<string, DemoOrbitRingFlowState>());
  const visualBubblesRef = useRef<DemoOrbitVisualBubble[]>(
    bubbles.map((bubble) => ({ ...bubble, demoVisualPhase: "delayed-enter" })),
  );
  const frameRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef<number | null>(null);
  const batchIdRef = useRef(0);
  const lastDebugAtRef = useRef(0);
  const [visualBubbles, setVisualBubbles] = useState<DemoOrbitVisualBubble[]>(() => visualBubblesRef.current);

  if (recordsRef.current.size === 0 && bubbles.length > 0) {
    const records = new Map<string, DemoOrbitMotionRecord>();
    bubbles.forEach((bubble) => {
      const record = makeDemoOrbitMotionRecord(bubble);
      record.currentScale = 1;
      record.currentOpacity = demoBubbleOpacityForState(bubble);
      record.phase = "idle";
      record.motionType = "static";
      record.bubble = { ...bubble, demoVisualPhase: "idle" };
      records.set(bubble.id, record);
    });
    recordsRef.current = records;
    visualBubblesRef.current = [...records.values()].map((record) => record.bubble);
  }

  const inputSignature = bubbles
    .map((bubble) => [
      bubble.id,
      bubble.text,
      bubble.count,
      bubble.activity,
      bubble.emphasis,
      bubble.choiceAffinity,
      bubble.targetX,
      bubble.targetY,
      bubble.size,
      bubble.orbitCenterId,
      bubble.orbitRing,
      bubble.orbitAngle,
      bubble.orbitRadius,
      bubble.orbitSlotIndex,
      bubble.motionReason,
      bubble.motionDirection,
      bubble.motionPlanId,
      bubble.fromSlotIndex,
      bubble.toSlotIndex,
      bubble.moveCost,
      bubble.moveAngleDelta,
      bubble.arcCost,
      bubble.radiusCost,
      bubble.gateBlocked,
      bubble.enterSequence,
      bubble.enterDelayMs,
      bubble.gateAngle,
      bubble.displayState,
      bubble.opacity,
    ].join(":"))
    .join("|");

  const syncVisualBubblesFromRecords = useCallback(() => {
    const nextVisualBubbles = [...recordsRef.current.values()].map((record) => record.bubble);
    visualBubblesRef.current = nextVisualBubbles;
    setVisualBubbles(nextVisualBubbles);
  }, []);

  const scheduleFrame = useCallback(() => {
    if (frameRef.current !== null || typeof window === "undefined") return;
    frameRef.current = window.requestAnimationFrame((frameTime) => {
      frameRef.current = null;
      const previousFrameAt = lastFrameAtRef.current ?? frameTime;
      const deltaMs = Math.min(64, Math.max(8, frameTime - previousFrameAt));
      lastFrameAtRef.current = frameTime;
      const records = recordsRef.current;
      const reduced = prefersReducedDemoOrbitMotion();
      const ringFlows = ringFlowRef.current;
      const activeFlowKeys = new Set<string>();
      let hasActiveMotion = false;
      let removedGhost = false;

      if (reduced) {
        ringFlows.clear();
      } else {
        records.forEach((record) => {
          if (!isDemoOrbitRingFlowEligible(record)) return;
          const key = demoOrbitRingFlowKey(record);
          if (!key) return;
          const flow = ringFlows.get(key) ?? makeDemoOrbitRingFlowState(key, record);
          flow.offset = (flow.offset + flow.velocity * deltaMs) % DEMO_ORBIT_TAU;
          ringFlows.set(key, flow);
          activeFlowKeys.add(key);
        });
        ringFlows.forEach((flow, key) => {
          if (activeFlowKeys.has(key)) return;
          flow.offset *= 0.9;
          if (Math.abs(flow.offset) < 0.0001) {
            ringFlows.delete(key);
          }
        });
      }

      records.forEach((record, id) => {
        const element = bubbleRefs.current.get(id);
        if (record.phase === "ghost-exit" && record.removedAt != null && frameTime - record.removedAt >= IDEATION_DEMO_ORBIT_GHOST_MS) {
          records.delete(id);
          removedGhost = true;
          return;
        }

        if (reduced) {
          record.currentX = record.targetX;
          record.currentY = record.targetY;
          record.currentScale = record.targetScale;
          record.currentOpacity = record.targetOpacity;
          if (record.phase !== "ghost-exit") {
            record.phase = "idle";
            record.motionType = "static";
          }
        } else if (stepDemoOrbitRecord(record, deltaMs)) {
          hasActiveMotion = true;
        }

        if (element) {
          const flowKey = demoOrbitRingFlowKey(record);
          const ringFlowOffset = !reduced && activeFlowKeys.has(flowKey)
            ? ringFlows.get(flowKey)?.offset ?? 0
            : 0;
          applyDemoOrbitRecordStyle(element, record, ringFlowOffset);
          element.dataset.motionType = record.motionType;
          element.dataset.motionPhase = record.phase;
          element.dataset.ringFlow = ringFlowOffset ? "active" : "none";
        }

        if (record.phase === "ghost-exit") {
          hasActiveMotion = true;
        }
      });

      if (removedGhost) {
        syncVisualBubblesFromRecords();
      }

      if (hasActiveMotion || activeFlowKeys.size > 0) {
        scheduleFrame();
      } else {
        lastFrameAtRef.current = null;
      }
    });
  }, [syncVisualBubblesFromRecords]);

  useLayoutEffect(() => {
    const now = demoOrbitNow();
    const records = recordsRef.current;
    const previousGraphById = previousGraphByIdRef.current;
    const nextGraphById = new Map(bubbles.map((bubble) => [bubble.id, bubble] as const));
    const ringFlowOffsets = new Map([...ringFlowRef.current.entries()].map(([key, flow]) => [key, flow.offset] as const));

    if (ringFlowOffsets.size > 0) {
      records.forEach((record) => {
        const offset = ringFlowOffsets.get(demoOrbitRingFlowKey(record)) ?? 0;
        foldDemoOrbitRingFlowIntoRecord(record, offset);
      });
      ringFlowRef.current.forEach((flow) => {
        flow.offset = 0;
      });
    }

    bubbles.forEach((bubble) => {
      const record = records.get(bubble.id);
      if (record) {
        retargetDemoOrbitRecord(record, bubble);
      } else {
        records.set(bubble.id, makeDemoOrbitMotionRecord(bubble));
      }
    });

    previousGraphById.forEach((_, id) => {
      if (nextGraphById.has(id)) return;
      const record = records.get(id);
      if (record) {
        markDemoOrbitRecordExiting(record, now);
      }
    });

    previousGraphByIdRef.current = nextGraphById;
    const batchId = batchIdRef.current + 1;
    batchIdRef.current = batchId;
    const debugMotions: DemoOrbitPreparedMotion[] = [...records.values()].map((record) => ({
      id: record.id,
      bubble: record.bubble,
      motionType: record.motionType,
      phase: demoOrbitMotionPhase(record.motionType),
      keyframes: [],
      duration: demoOrbitMotionDuration(record.motionType),
      delay: 0,
      retargeted: record.phase === "moving",
      fromAngle: record.currentAngle,
      toAngle: record.targetAngle,
      angleDelta: Number.isFinite(record.currentAngle) && Number.isFinite(record.targetAngle)
        ? demoOrbitAngleDelta(record)
        : undefined,
      direction: record.orbitAngleDirection,
      gateBlocked: Boolean(record.bubble.gateBlocked),
      staggerMs: 0,
    }));
    logDemoOrbitMotionBatch(lastDebugAtRef, batchId, graphVersion, debugMotions);

    syncVisualBubblesFromRecords();
    scheduleFrame();
  }, [graphVersion, inputSignature, scheduleFrame, syncVisualBubblesFromRecords]);

  useEffect(() => () => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const setBubbleRef = useCallback((id: string) => (element: HTMLDivElement | null) => {
    if (element) {
      bubbleRefs.current.set(id, element);
      const record = recordsRef.current.get(id);
      if (record) {
        const flowOffset = ringFlowRef.current.get(demoOrbitRingFlowKey(record))?.offset ?? 0;
        applyDemoOrbitRecordStyle(element, record, isDemoOrbitRingFlowEligible(record) ? flowOffset : 0);
        element.dataset.motionType = record.motionType;
        element.dataset.motionPhase = record.phase;
      }
      scheduleFrame();
    } else {
      bubbleRefs.current.delete(id);
    }
  }, [scheduleFrame]);

  return { setBubbleRef, visualBubbles };
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
  layoutRevision,
}: {
  bubbles: IdeationKeywordBubbleVisual[];
  layoutRevision: number;
}) {
  const { setBubbleRef, visualBubbles } = useDemoOrbitMotion(bubbles, layoutRevision);

  const guideGroups = [...new Map(
    bubbles
      .filter((bubble) => bubble.role === "center" || bubble.emphasis === "primary")
      .map((bubble) => [bubble.id, bubble] as const),
  ).values()];

  return (
    <div className="relative h-full w-full overflow-visible" aria-hidden="true">
      <style>
        {`
          @keyframes ideation-demo-orbit-rail-flow {
            from { stroke-dashoffset: 0; }
            to { stroke-dashoffset: var(--demo-rail-flow-offset, 84px); }
          }
          .ideation-demo-orbit-bubble-content {
            transform: translate3d(0, 0, 0);
          }
          .ideation-demo-orbit-rail-flow {
            animation: ideation-demo-orbit-rail-flow var(--demo-rail-flow-duration, 22000ms) linear infinite;
          }
          @media (prefers-reduced-motion: reduce) {
            .ideation-demo-orbit-rail-flow {
              animation: none !important;
            }
          }
        `}
      </style>
      {guideGroups.flatMap((centerBubble) => {
        const centerX = centerBubble.targetX + centerBubble.size / 2;
        const centerY = centerBubble.targetY + centerBubble.size / 2;
        const railPalette = demoOrbitRailPalette(centerBubble.choiceAffinity === "b");
        const guides = buildDemoOrbitGuideRadii(centerBubble.id, bubbles);
        return guides.map((guide, index) => {
          const { radius } = guide;
          const sideIsB = centerBubble.choiceAffinity === "b";
          const railSize = radius * 2 + IDEATION_DEMO_ORBIT_RAIL_PADDING * 2;
          const railOpacity = guide.count > 0 ? 0.82 : 0;
          return (
            <svg
              key={`${centerBubble.id}-guide-${index}-${radius}`}
              className="pointer-events-none absolute overflow-visible"
              viewBox={`0 0 ${railSize} ${railSize}`}
              style={{
                left: centerX - radius - IDEATION_DEMO_ORBIT_RAIL_PADDING,
                top: centerY - radius - IDEATION_DEMO_ORBIT_RAIL_PADDING,
                width: railSize,
                height: railSize,
                opacity: railOpacity,
                transition: IDEATION_ORBIT_GUIDE_TRANSITION,
              }}
            >
              <circle
                cx={railSize / 2}
                cy={railSize / 2}
                r={radius}
                fill={railPalette.fill}
              />
              <circle
                cx={railSize / 2}
                cy={railSize / 2}
                r={radius}
                fill="none"
                stroke={railPalette.stroke}
                strokeWidth={1.7}
              />
              <circle
                className="ideation-demo-orbit-rail-flow"
                cx={railSize / 2}
                cy={railSize / 2}
                r={radius}
                fill="none"
                stroke={railPalette.flow}
                strokeWidth={1.45}
                strokeLinecap="round"
                strokeDasharray="18 56"
                opacity={0.34}
                style={demoOrbitRailFlowStyle(centerBubble.id, radius, sideIsB)}
              />
            </svg>
          );
        });
      })}
      {visualBubbles.map((bubble) => (
        <div
          key={bubble.id}
          ref={setBubbleRef(bubble.id)}
          className="ideation-demo-orbit-bubble absolute origin-center will-change-transform"
          style={{
            left: 0,
            top: 0,
            width: bubble.size,
            height: bubble.size,
            zIndex: bubble.role === "center" || bubble.emphasis === "primary" ? 20 : bubble.role === "dot" ? 6 : 12,
          }}
          data-bubble-id={bubble.id}
          data-orbit-ring={bubble.orbitRing ?? ""}
          data-orbit-slot={bubble.orbitSlotIndex ?? ""}
          data-motion-reason={bubble.motionReason ?? ""}
          data-motion-direction={bubble.motionDirection ?? ""}
          data-motion-plan={bubble.motionPlanId ?? ""}
          data-from-slot={bubble.fromSlotIndex ?? ""}
          data-to-slot={bubble.toSlotIndex ?? ""}
          data-move-cost={bubble.moveCost ?? ""}
          data-angle-delta={bubble.moveAngleDelta ?? ""}
          data-arc-cost={bubble.arcCost ?? ""}
          data-radius-cost={bubble.radiusCost ?? ""}
          data-gate-blocked={bubble.gateBlocked ? "true" : "false"}
          data-visual-phase={bubble.demoVisualPhase ?? ""}
          data-choice-affinity={bubble.choiceAffinity ?? ""}
        >
          <div className="ideation-demo-orbit-bubble-content h-full w-full">
            {makeIdeationKeywordBubbleNodeLabel(bubble, bubble.size)}
          </div>
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
          bubble.choiceAffinity,
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
            label: <IdeationDemoOrbitLayer bubbles={bubbles} layoutRevision={layoutRevision} />,
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
