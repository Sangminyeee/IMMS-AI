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
  orbitCenterX?: number;
  orbitCenterY?: number;
  currentAngle?: number;
  targetAngle?: number;
  currentRadius?: number;
  targetRadius?: number;
  removedAt?: number;
};

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
    ring: motion.bubble.orbitRing,
    slot: motion.bubble.orbitSlotIndex,
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

function demoOrbitRecordTransform(record: DemoOrbitMotionRecord) {
  return `translate3d(${Math.round(record.currentX * 100) / 100}px, ${Math.round(record.currentY * 100) / 100}px, 0) scale(${Math.round(record.currentScale * 1000) / 1000})`;
}

function applyDemoOrbitRecordStyle(element: HTMLElement, record: DemoOrbitMotionRecord) {
  element.style.transform = demoOrbitRecordTransform(record);
  element.style.opacity = String(Math.max(0, Math.min(1, record.currentOpacity)));
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
  record.orbitCenterX = orbit.x;
  record.orbitCenterY = orbit.y;
  record.currentAngle = Math.atan2(currentCenterY - orbit.y, currentCenterX - orbit.x);
  record.currentRadius = Math.hypot(currentCenterX - orbit.x, currentCenterY - orbit.y);
  record.targetAngle = orbit.angle;
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
  if (sameOrbit && Number(record.orbitRing ?? -1) === Number(next.orbitRing ?? -2)) return "arc";
  if (sameOrbit) return "radial";
  return "orbit-transfer";
}

function retargetDemoOrbitRecord(record: DemoOrbitMotionRecord, bubble: IdeationKeywordBubbleVisual) {
  const motionType = demoOrbitMotionTypeForTarget(record, bubble);
  const targetOpacity = demoBubbleOpacityForState(bubble);
  record.targetX = bubble.targetX;
  record.targetY = bubble.targetY;
  record.targetScale = 1;
  record.targetOpacity = targetOpacity;
  record.motionType = motionType;
  record.phase = motionType === "static" ? "idle" : "moving";
  record.removedAt = undefined;
  record.orbitCenterId = bubble.orbitCenterId;
  record.orbitRing = demoOrbitFiniteNumber(bubble.orbitRing, 0);
  record.orbitSlotIndex = demoOrbitFiniteNumber(bubble.orbitSlotIndex, 0);
  record.bubble = { ...bubble, demoVisualPhase: record.phase };

  if (motionType === "arc" || motionType === "radial") {
    syncDemoOrbitRecordPolar(record, bubble);
  } else {
    record.orbitCenterX = undefined;
    record.orbitCenterY = undefined;
    record.currentAngle = undefined;
    record.targetAngle = undefined;
    record.currentRadius = undefined;
    record.targetRadius = undefined;
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
    && Number.isFinite(record.orbitCenterX)
    && Number.isFinite(record.orbitCenterY)
    && Number.isFinite(record.currentAngle)
    && Number.isFinite(record.targetAngle)
    && Number.isFinite(record.currentRadius)
    && Number.isFinite(record.targetRadius)
  ) {
    const centerX = record.orbitCenterX ?? 0;
    const centerY = record.orbitCenterY ?? 0;
    const angleDelta = shortestDemoOrbitAngleDelta(record.currentAngle ?? 0, record.targetAngle ?? 0);
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
    }
  }

  return !closeEnough || record.phase === "ghost-exit";
}

function useDemoOrbitMotion(bubbles: IdeationKeywordBubbleVisual[], graphVersion: number) {
  const bubbleRefs = useRef(new Map<string, HTMLDivElement>());
  const previousGraphByIdRef = useRef(new Map<string, IdeationKeywordBubbleVisual>());
  const recordsRef = useRef(new Map<string, DemoOrbitMotionRecord>());
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
      bubble.targetX,
      bubble.targetY,
      bubble.size,
      bubble.orbitCenterId,
      bubble.orbitRing,
      bubble.orbitAngle,
      bubble.orbitRadius,
      bubble.orbitSlotIndex,
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
      let hasActiveMotion = false;
      let removedGhost = false;

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
          applyDemoOrbitRecordStyle(element, record);
          element.dataset.motionType = record.motionType;
          element.dataset.motionPhase = record.phase;
        }

        if (record.phase === "ghost-exit") {
          hasActiveMotion = true;
        }
      });

      if (removedGhost) {
        syncVisualBubblesFromRecords();
      }

      if (hasActiveMotion) {
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
        applyDemoOrbitRecordStyle(element, record);
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
      {visualBubbles.map((bubble) => (
        <div
          key={bubble.id}
          ref={setBubbleRef(bubble.id)}
          className="absolute origin-center will-change-transform"
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
          data-visual-phase={bubble.demoVisualPhase ?? ""}
        >
          <div className="h-full w-full">
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
