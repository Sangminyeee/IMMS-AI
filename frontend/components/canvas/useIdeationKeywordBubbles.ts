"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { updateCanvasIdeationBubbleGraph } from "@/lib/api";
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

type IdeationKeywordDebugPayload = Record<string, unknown>;

const IDEATION_KEYWORD_BATCH_SIZE = 4;
const IDEATION_KEYWORD_CONTEXT_CACHE_MAX_UTTERANCES = 180;
const IDEATION_KEYWORD_CONTEXT_CACHE_MAX_CHARS = 18_000;
const IDEATION_KEYWORD_MAX_TOTAL_BUBBLES = 16;
const IDEATION_KEYWORD_IDLE_FLUSH_MS = 10_000;
const IDEATION_KEYWORD_MAX_WINDOW_MS = 25_000;
const IDEATION_KEYWORD_MAX_KEYWORDS = 3;
const DEMO_KEYWORD_BATCH_SIZE = 2;
const DEMO_KEYWORD_IDLE_FLUSH_MS = 3_500;
const DEMO_KEYWORD_MAX_WINDOW_MS = 8_500;
const DEMO_KEYWORD_MAX_KEYWORDS = 6;

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

function logIdeationKeywordDebugGroup(title: string, payload: IdeationKeywordDebugPayload) {
  const timestamp = new Date().toISOString();
  console.groupCollapsed(`[Bubble][Debug] ${title} · ${timestamp}`);
  Object.entries(payload).forEach(([key, value]) => {
    console.info(key, value);
  });
  console.groupEnd();
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

function buildIdeationKeywordContextCache(
  utterances: IdeationKeywordUtterance[],
  requestUtterances: IdeationKeywordUtterance[],
) {
  const firstRequestId = requestUtterances[0]?.id || "";
  const firstRequestIndex = firstRequestId ? utterances.findIndex((row) => row.id === firstRequestId) : -1;
  if (firstRequestIndex <= 0) return "";

  const contextRows = utterances
    .slice(0, firstRequestIndex)
    .slice(-IDEATION_KEYWORD_CONTEXT_CACHE_MAX_UTTERANCES);
  const contextText = contextRows
    .map((row, index) => {
      const speaker = row.speaker || "참가자";
      const timestamp = row.timestamp ? ` ${row.timestamp}` : "";
      return `${index + 1}. ${speaker}${timestamp}: ${row.text}`;
    })
    .join("\n");

  if (contextText.length <= IDEATION_KEYWORD_CONTEXT_CACHE_MAX_CHARS) return contextText;
  return contextText.slice(contextText.length - IDEATION_KEYWORD_CONTEXT_CACHE_MAX_CHARS);
}

function deferStateUpdate(update: () => void) {
  window.queueMicrotask(update);
}

function graphToIdeationKeywordBubbles(graph: CanvasIdeationBubbleGraph): IdeationKeywordBubble[] {
  const normalizedGraph = normalizeIdeationBubbleGraphForWorkspace(graph);
  const visibleBubbles = normalizedGraph.bubbles
    .filter((bubble) => bubble.display_state !== "archived")
    .slice(0, IDEATION_KEYWORD_MAX_TOTAL_BUBBLES);
  const labelById = new Map(visibleBubbles.map((bubble) => [bubble.id, bubble.label] as const));
  const maxCount = Math.max(1, ...visibleBubbles.map((bubble) => Number(bubble.count || 1)));

  return visibleBubbles.map((bubble) => {
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
      text: bubble.label,
      count: Math.max(1, Number(bubble.count || 1)),
      weight: Math.max(1, Number(bubble.count || 1)) / maxCount,
      related: (bubble.related_ids || [])
        .map((id) => labelById.get(id) || "")
        .filter((label) => label && label !== bubble.label)
        .slice(0, 6),
      kind: bubble.off_topic || kind === "off_topic" ? "off_topic" : kind,
      importance: clampNumber(Number(bubble.importance ?? 0.6), 0, 1),
      relevance,
      offTopic: Boolean(bubble.off_topic || kind === "off_topic"),
      offTopicReason: bubble.off_topic_reason || "",
      anchorText: labelById.get(bubble.anchor_id || "") || "",
      layoutX: Number.isFinite(layoutX) ? layoutX : undefined,
      layoutY: Number.isFinite(layoutY) ? layoutY : undefined,
      layoutSize: Number.isFinite(layoutSize) && layoutSize > 0 ? layoutSize : undefined,
      clusterId: bubble.cluster_id || "",
      role: bubble.role || "satellite",
      orbitCenterId: bubble.orbit_center_id || "",
      orbitRing: Number.isFinite(Number(bubble.orbit_ring)) ? Number(bubble.orbit_ring) : undefined,
      orbitAngle: Number.isFinite(Number(bubble.orbit_angle)) ? Number(bubble.orbit_angle) : undefined,
      orbitRadius: Number.isFinite(Number(bubble.orbit_radius)) ? Number(bubble.orbit_radius) : undefined,
      activity,
      opacity: Number.isFinite(opacity) ? clampNumber(opacity, 0, 1) : undefined,
      layoutZone,
      durable: emphasis === "primary",
      emphasis,
    };
  });
}

export function useIdeationKeywordBubbles({
  transcripts,
  meetingId,
  meetingTopic,
  meetingGoal,
  meetingGoalContext,
  demoConfig,
  bubbleGraph,
  onBubbleGraphChange,
  stage,
  updatesEnabled = true,
}: {
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
  const [statusMessage, setStatusMessage] = useState("");
  const normalizedDemoConfig = useMemo(() => normalizeCanvasDemoConfig(demoConfig), [demoConfig]);
  const demoBalanceMode = isDemoBalanceConfig(normalizedDemoConfig);
  const batchSize = demoBalanceMode ? DEMO_KEYWORD_BATCH_SIZE : IDEATION_KEYWORD_BATCH_SIZE;
  const idleFlushMs = demoBalanceMode ? DEMO_KEYWORD_IDLE_FLUSH_MS : IDEATION_KEYWORD_IDLE_FLUSH_MS;
  const maxWindowMs = demoBalanceMode ? DEMO_KEYWORD_MAX_WINDOW_MS : IDEATION_KEYWORD_MAX_WINDOW_MS;
  const maxKeywords = demoBalanceMode ? DEMO_KEYWORD_MAX_KEYWORDS : IDEATION_KEYWORD_MAX_KEYWORDS;
  const processedIdsRef = useRef<Set<string>>(new Set());
  const graphProcessedIdsRef = useRef<string[]>([]);
  const requestSeqRef = useRef(0);
  const requestInFlightRef = useRef(false);
  const pendingWindowStartedAtRef = useRef(0);

  const normalizedBubbleGraph = useMemo(
    () => normalizeIdeationBubbleGraphForWorkspace(bubbleGraph || createEmptyIdeationBubbleGraph()),
    [bubbleGraph],
  );
  const graphProcessedSignature = useMemo(
    () => normalizedBubbleGraph.processed_utterance_ids.join("|"),
    [normalizedBubbleGraph.processed_utterance_ids],
  );
  const ideationKeywordUtterances = useMemo(() => buildIdeationKeywordUtterances(transcripts), [transcripts]);
  const localBubbles = useMemo(
    () => buildIdeationKeywordBubbles(transcripts).slice(0, IDEATION_KEYWORD_MAX_TOTAL_BUBBLES),
    [transcripts],
  );
  const graphBubbles = useMemo(
    () => graphToIdeationKeywordBubbles(normalizedBubbleGraph),
    [normalizedBubbleGraph],
  );

  useEffect(() => {
    graphProcessedIdsRef.current = normalizedBubbleGraph.processed_utterance_ids;
    processedIdsRef.current = new Set(graphProcessedIdsRef.current);
  }, [graphProcessedSignature, normalizedBubbleGraph.processed_utterance_ids]);

  useEffect(() => {
    processedIdsRef.current = new Set(graphProcessedIdsRef.current);
    requestInFlightRef.current = false;
    pendingWindowStartedAtRef.current = 0;
    deferStateUpdate(() => setStatusMessage(""));
  }, [meetingId]);

  useEffect(() => {
    if (stage !== "ideation" || !updatesEnabled) {
      processedIdsRef.current = new Set(normalizedBubbleGraph.processed_utterance_ids);
      pendingWindowStartedAtRef.current = 0;
      deferStateUpdate(() => setStatusMessage(""));
      return undefined;
    }
    if (!meetingId || ideationKeywordUtterances.length === 0) {
      processedIdsRef.current = new Set(normalizedBubbleGraph.processed_utterance_ids);
      pendingWindowStartedAtRef.current = 0;
      deferStateUpdate(() => setStatusMessage(""));
      return undefined;
    }

    const knownIds = new Set(ideationKeywordUtterances.map((row) => row.id));
    processedIdsRef.current.forEach((id) => {
      if (!knownIds.has(id)) {
        processedIdsRef.current.delete(id);
      }
    });

    const pendingUtterances = ideationKeywordUtterances.filter((row) => !processedIdsRef.current.has(row.id));
    if (pendingUtterances.length === 0) {
      pendingWindowStartedAtRef.current = 0;
      deferStateUpdate(() => setStatusMessage(""));
      return undefined;
    }
    if (!pendingWindowStartedAtRef.current) {
      pendingWindowStartedAtRef.current = Date.now();
    }

    if (requestInFlightRef.current) {
      deferStateUpdate(() => setStatusMessage(demoBalanceMode ? "현재 STT 전사 및 A/B 키워드 추출 중입니다." : "현재 STT 전사 기반 키워드 버블을 정리 중입니다."));
      return undefined;
    }

    const runKeywordRequest = (reason: "batch" | "idle" | "window") => {
      const requestUtterances =
        reason === "batch"
          ? pendingUtterances.slice(0, batchSize)
          : pendingUtterances;
      if (requestUtterances.length === 0) return;

      const requestSeq = requestSeqRef.current + 1;
      requestSeqRef.current = requestSeq;
      requestInFlightRef.current = true;
      setStatusMessage(demoBalanceMode ? "현재 STT 전사 및 A/B 키워드 추출 중입니다." : "현재 STT 전사 기반 키워드 추출 중입니다.");

      const bubbleGraphRequest: Parameters<typeof updateCanvasIdeationBubbleGraph>[0] = {
        meeting_id: meetingId,
        meeting_topic: meetingTopic,
        utterances: requestUtterances,
        context_cache: buildIdeationKeywordContextCache(ideationKeywordUtterances, requestUtterances),
        max_keywords: maxKeywords,
      };
      if (demoBalanceMode) {
        bubbleGraphRequest.demo_config = normalizedDemoConfig;
      }
      const cleanMeetingGoal = meetingGoal?.trim() || "";
      const cleanMeetingGoalContext = meetingGoalContext?.trim() || "";
      if (cleanMeetingGoal) {
        bubbleGraphRequest.meeting_goal = cleanMeetingGoal;
      }
      if (cleanMeetingGoalContext) {
        bubbleGraphRequest.meeting_goal_context = cleanMeetingGoalContext;
      }

      logIdeationKeywordDebugGroup("server graph request", {
        reason,
        requestSeq,
        meetingId,
        meetingTopic,
        requestUtterances,
        requestPayload: bubbleGraphRequest,
        currentBubbleGraph: normalizedBubbleGraph,
        processedIds: [...processedIdsRef.current],
        pendingUtteranceCount: pendingUtterances.length,
      });

      void updateCanvasIdeationBubbleGraph(bubbleGraphRequest)
        .then((result) => {
          if (requestSeqRef.current !== requestSeq) return;
          logIdeationKeywordDebugGroup("server graph response", {
            requestSeq,
            usedLlm: result.used_llm,
            ok: result.ok,
            warning: result.warning,
            sourceSignature: result.source_signature,
            bubbleGraph: result.bubble_graph,
          });
          if (!result.used_llm) {
            setStatusMessage(result.warning || "LLM 응답이 없어 서버 버블 그래프를 유지했습니다.");
            return;
          }

          const nextGraph = normalizeIdeationBubbleGraphForWorkspace(result.bubble_graph);
          processedIdsRef.current = new Set(nextGraph.processed_utterance_ids);
          pendingWindowStartedAtRef.current = 0;
          onBubbleGraphChange?.(nextGraph);

          const visibleCount = nextGraph.bubbles.filter((bubble) => bubble.display_state !== "archived").length;
          const archivedCount = nextGraph.bubbles.length - visibleCount;
          setStatusMessage(`키워드 버블을 갱신했습니다. 표시 ${visibleCount}개, 보관 ${archivedCount}개`);
        })
        .catch((error) => {
          if (requestSeqRef.current !== requestSeq) return;
          console.error("Failed to update ideation bubble graph:", error);
          logIdeationKeywordDebugGroup("server graph error", {
            requestSeq,
            error,
            requestPayload: bubbleGraphRequest,
            preservedBubbleGraph: normalizedBubbleGraph,
          });
          setStatusMessage("서버 버블 그래프 갱신에 실패했습니다. 다음 발화에서 다시 시도합니다.");
        })
        .finally(() => {
          if (requestSeqRef.current !== requestSeq) return;
          requestInFlightRef.current = false;
        });
    };

    const elapsedMs = Date.now() - pendingWindowStartedAtRef.current;
    if (pendingUtterances.length >= batchSize) {
      runKeywordRequest("batch");
      return undefined;
    }
    if (elapsedMs >= maxWindowMs) {
      runKeywordRequest("window");
      return undefined;
    }

    deferStateUpdate(() => setStatusMessage(demoBalanceMode ? `STT 전사를 모아 A/B 키워드 추출을 준비 중입니다. ${pendingUtterances.length}/${batchSize}` : `STT 전사를 모아 키워드 추출을 준비 중입니다. ${pendingUtterances.length}/${batchSize}`));
    const timeoutMs = Math.max(
      250,
      Math.min(
        idleFlushMs,
        maxWindowMs - elapsedMs,
      ),
    );
    const timer = window.setTimeout(() => {
      runKeywordRequest(timeoutMs >= idleFlushMs ? "idle" : "window");
    }, timeoutMs);

    return () => window.clearTimeout(timer);
  }, [
    ideationKeywordUtterances,
    meetingId,
    batchSize,
    demoBalanceMode,
    idleFlushMs,
    maxKeywords,
    maxWindowMs,
    meetingGoal,
    meetingGoalContext,
    meetingTopic,
    normalizedBubbleGraph,
    normalizedDemoConfig,
    onBubbleGraphChange,
    stage,
    updatesEnabled,
  ]);

  return {
    keywordBubbles: meetingId ? graphBubbles : localBubbles,
    statusMessage,
  };
}
