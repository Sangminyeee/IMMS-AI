"use client";

import { useEffect, useMemo, useState } from "react";
import { normalizeCanvasDemoConfig, isDemoBalanceConfig } from "@/lib/demoMode";
import type { CanvasDemoConfig, CanvasIdeationBubbleGraph } from "@/lib/types";
import { buildIdeationKeywordBubbles, type IdeationKeywordBubble } from "@/components/canvas/CanvasIdeationBubbles";
import { createEmptyIdeationBubbleGraph, normalizeIdeationBubbleGraphForWorkspace } from "@/components/canvas/canvasWorkspaceSerialization";

type CanvasStage = "ideation" | "problem-definition" | "solution";

type IdeationTranscript = {
  id: string;
  speaker: string;
  text: string;
  timestamp: string;
  canvas_stage?: CanvasStage | string;
  canvas_target_id?: string;
};

type IdeationKeywordUtterance = {
  id: string;
  speaker: string;
  text: string;
  timestamp: string;
};

const IDEATION_KEYWORD_MAX_TOTAL_BUBBLES = 16;
const DEMO_BALANCE_KEYWORD_MAX_TOTAL_BUBBLES = 32;

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function stripLeadingTimestamp(text: string) {
  return text
    .replace(
      /^\s*\[?\s*(?:\d{4}-\d{2}-\d{2}[T\s]\d{1,2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?|\d{1,2}:\d{2}(?::\d{2})?)\s*\]?\s*/,
      "",
    )
    .trim();
}

function buildIdeationKeywordUtterances(transcripts: IdeationTranscript[]): IdeationKeywordUtterance[] {
  return transcripts
    .map((row, index) => ({
      id: row.id || `${row.timestamp || "turn"}-${index}`,
      speaker: row.speaker || "",
      text: row.text || "",
      timestamp: row.timestamp || "",
      canvas_stage: row.canvas_stage || "ideation",
    }))
    .filter((row) => (!row.canvas_stage || row.canvas_stage === "ideation") && stripLeadingTimestamp(row.text).trim())
    .slice(-180)
    .map((row) => ({
      id: row.id,
      speaker: row.speaker || "참가자",
      text: stripLeadingTimestamp(row.text),
      timestamp: row.timestamp || "",
    }));
}

function normalizeIdeationKeywordBubbleKind(value: unknown): IdeationKeywordBubble["kind"] {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "entity" || normalized === "topic" || normalized === "relation" || normalized === "action" || normalized === "off_topic") {
    return normalized;
  }
  return "topic";
}

function deferStateUpdate(update: () => void) {
  window.queueMicrotask(update);
}

function graphToIdeationKeywordBubbles(graph: CanvasIdeationBubbleGraph, demoBalanceMode = false): IdeationKeywordBubble[] {
  const normalizedGraph = normalizeIdeationBubbleGraphForWorkspace(graph);
  const maxVisibleBubbles = demoBalanceMode ? DEMO_BALANCE_KEYWORD_MAX_TOTAL_BUBBLES : IDEATION_KEYWORD_MAX_TOTAL_BUBBLES;
  const isDemoHiddenNeutralBubble = (bubble: (typeof normalizedGraph.bubbles)[number]) => (
    demoBalanceMode
    && (
      bubble.id === "demo-balance-anchor-neutral"
      || bubble.choice_affinity === "neutral"
      || bubble.label === "미분류"
      || bubble.canonical_label === "미분류"
    )
  );
  const activeBubbles = normalizedGraph.bubbles
    .filter((bubble) => !isDemoHiddenNeutralBubble(bubble) && bubble.display_state !== "archived" && bubble.display_state !== "exiting")
    .slice(0, maxVisibleBubbles);
  const exitingBubbles = normalizedGraph.bubbles
    .filter((bubble) => !isDemoHiddenNeutralBubble(bubble) && bubble.display_state === "exiting")
    .slice(0, demoBalanceMode ? 12 : 4);
  const visibleBubbles = [...activeBubbles, ...exitingBubbles];
  const displayLabelForBubble = (bubble: (typeof visibleBubbles)[number]) => bubble.canonical_label || bubble.label;
  const labelById = new Map(visibleBubbles.map((bubble) => [bubble.id, displayLabelForBubble(bubble)] as const));
  const maxCount = Math.max(1, ...visibleBubbles.map((bubble) => Number(bubble.count || 1)));

  return visibleBubbles.map((bubble) => {
    const displayLabel = displayLabelForBubble(bubble);
    const kind = normalizeIdeationKeywordBubbleKind(bubble.kind);
    const relevance = clampNumber(Number(bubble.relevance ?? 1), 0, 1);
    const activity = clampNumber(Number(bubble.activity ?? (bubble.display_state === "dimmed" ? 0.22 : 0.72)), 0, 1);
    const layoutZone = bubble.layout_zone || (bubble.display_state === "dimmed" ? "peripheral" : "default");
    const emphasis = bubble.emphasis === "primary" ? "primary" : "default";
    const opacity = Number(bubble.opacity);
    const layoutX = Number(bubble.x);
    const layoutY = Number(bubble.y);
    const layoutSize = Number(bubble.size);
    return {
      id: bubble.id,
      text: displayLabel,
      canonicalLabel: bubble.canonical_label || "",
      aliases: Array.isArray(bubble.aliases) ? bubble.aliases : [],
      count: Math.max(1, Number(bubble.count || 1)),
      weight: Math.max(1, Number(bubble.count || 1)) / maxCount,
      related: (bubble.related_ids || [])
        .map((id) => labelById.get(id) || "")
        .filter((label) => label && label !== displayLabel)
        .slice(0, 6),
      kind: bubble.off_topic || kind === "off_topic" ? "off_topic" : kind,
      importance: clampNumber(Number(bubble.importance ?? 0.6), 0, 1),
      relevance,
      offTopic: Boolean(bubble.off_topic || kind === "off_topic"),
      offTopicReason: bubble.off_topic_reason || "",
      anchorText: labelById.get(bubble.anchor_id || "") || "",
      choiceAffinity: bubble.choice_affinity === "a" || bubble.choice_affinity === "b" ? bubble.choice_affinity : undefined,
      layoutX: Number.isFinite(layoutX) ? layoutX : undefined,
      layoutY: Number.isFinite(layoutY) ? layoutY : undefined,
      layoutSize: Number.isFinite(layoutSize) && layoutSize > 0 ? layoutSize : undefined,
      clusterId: bubble.cluster_id || "",
      role: bubble.role || "satellite",
      orbitCenterId: bubble.orbit_center_id || "",
      orbitRing: Number.isFinite(Number(bubble.orbit_ring)) ? Number(bubble.orbit_ring) : undefined,
      orbitAngle: Number.isFinite(Number(bubble.orbit_angle)) ? Number(bubble.orbit_angle) : undefined,
      orbitRadius: Number.isFinite(Number(bubble.orbit_radius)) ? Number(bubble.orbit_radius) : undefined,
      orbitOrderKey: Number.isFinite(Number(bubble.orbit_order_key)) ? Number(bubble.orbit_order_key) : undefined,
      orbitSlotIndex: Number.isFinite(Number(bubble.orbit_slot_index)) ? Number(bubble.orbit_slot_index) : undefined,
      motionReason: bubble.motion_reason || "",
      motionDirection: bubble.motion_direction || "",
      motionPlanId: bubble.motion_plan_id || "",
      fromSlotIndex: Number.isFinite(Number(bubble.from_slot_index)) ? Number(bubble.from_slot_index) : undefined,
      toSlotIndex: Number.isFinite(Number(bubble.to_slot_index)) ? Number(bubble.to_slot_index) : undefined,
      moveCost: Number.isFinite(Number(bubble.move_cost)) ? Number(bubble.move_cost) : undefined,
      moveAngleDelta: Number.isFinite(Number(bubble.move_angle_delta)) ? Number(bubble.move_angle_delta) : undefined,
      arcCost: Number.isFinite(Number(bubble.arc_cost)) ? Number(bubble.arc_cost) : undefined,
      radiusCost: Number.isFinite(Number(bubble.radius_cost)) ? Number(bubble.radius_cost) : undefined,
      gateBlocked: Boolean(bubble.gate_blocked),
      enterSequence: Number.isFinite(Number(bubble.enter_sequence)) ? Number(bubble.enter_sequence) : undefined,
      enterDelayMs: Number.isFinite(Number(bubble.enter_delay_ms)) ? Number(bubble.enter_delay_ms) : undefined,
      gateAngle: Number.isFinite(Number(bubble.gate_angle)) ? Number(bubble.gate_angle) : undefined,
      activity,
      opacity: Number.isFinite(opacity) ? clampNumber(opacity, 0, 1) : undefined,
      displayState: bubble.display_state || "active",
      lifecycleState: bubble.lifecycle_state || "active",
      layoutZone,
      durable: Boolean(bubble.durable) || emphasis === "primary",
      emphasis,
    };
  });
}

export function useIdeationKeywordBubbles(options: {
  transcripts: IdeationTranscript[];
  meetingId: string;
  meetingTopic: string;
  meetingGoal?: string;
  meetingGoalContext?: string;
  demoConfig?: CanvasDemoConfig;
  bubbleGraph?: CanvasIdeationBubbleGraph;
  onBubbleGraphChange?: (graph: CanvasIdeationBubbleGraph) => void;
  stage: CanvasStage;
  updatesEnabled?: boolean;
}) {
  const {
    transcripts,
    meetingId,
    demoConfig,
    bubbleGraph,
    stage,
    updatesEnabled = true,
  } = options;
  const [statusMessage, setStatusMessage] = useState("");
  const normalizedDemoConfig = useMemo(() => normalizeCanvasDemoConfig(demoConfig), [demoConfig]);
  const demoBalanceMode = isDemoBalanceConfig(normalizedDemoConfig);

  const normalizedBubbleGraph = useMemo(
    () => normalizeIdeationBubbleGraphForWorkspace(bubbleGraph || createEmptyIdeationBubbleGraph()),
    [bubbleGraph],
  );
  const ideationKeywordUtterances = useMemo(() => buildIdeationKeywordUtterances(transcripts), [transcripts]);
  const localBubbles = useMemo(
    () => buildIdeationKeywordBubbles(transcripts).slice(0, IDEATION_KEYWORD_MAX_TOTAL_BUBBLES),
    [transcripts],
  );
  const graphBubbles = useMemo(
    () => graphToIdeationKeywordBubbles(normalizedBubbleGraph, demoBalanceMode),
    [normalizedBubbleGraph, demoBalanceMode],
  );

  useEffect(() => {
    if (!meetingId || stage !== "ideation" || !updatesEnabled) {
      deferStateUpdate(() => setStatusMessage(""));
      return;
    }

    const processedIds = new Set(normalizedBubbleGraph.processed_utterance_ids || []);
    const pendingUtteranceCount = ideationKeywordUtterances.filter((row) => !processedIds.has(row.id)).length;
    if (pendingUtteranceCount <= 0) {
      deferStateUpdate(() => setStatusMessage(""));
      return;
    }

    deferStateUpdate(() => setStatusMessage(
      demoBalanceMode
        ? "현재 STT 전사 및 A/B 키워드 추출 중입니다."
        : "현재 STT 전사 및 키워드 추출 중입니다.",
    ));
  }, [
    ideationKeywordUtterances,
    meetingId,
    demoBalanceMode,
    normalizedBubbleGraph,
    stage,
    updatesEnabled,
  ]);

  return {
    keywordBubbles: meetingId ? graphBubbles : localBubbles,
    statusMessage,
  };
}
