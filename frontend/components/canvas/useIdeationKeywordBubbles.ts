"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { extractCanvasIdeationKeywords } from "@/lib/api";
import type { CanvasIdeationKeywordResponse } from "@/lib/types";
import { buildIdeationKeywordBubbles, type IdeationKeywordBubble } from "@/components/canvas/CanvasIdeationBubbles";

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

type IdeationKeywordMergeDirective = {
  sourceText: string;
  targetText: string;
};

type IdeationKeywordOperations = {
  mergeDirectives: IdeationKeywordMergeDirective[];
  removeTexts: string[];
};

const IDEATION_KEYWORD_BATCH_SIZE = 2;
const IDEATION_KEYWORD_CONTEXT_CACHE_MAX_UTTERANCES = 180;
const IDEATION_KEYWORD_CONTEXT_CACHE_MAX_CHARS = 18_000;
const IDEATION_KEYWORD_MAX_TOTAL_BUBBLES = 16;
const IDEATION_KEYWORD_IDLE_FLUSH_MS = 18_000;
const IDEATION_KEYWORD_MAX_KEYWORDS = 3;
const IDEATION_KEYWORD_MAX_NEW_BUBBLES_PER_BATCH = 3;

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

function normalizeIdeationKeywordTextKey(text: string) {
  return text.trim().toLowerCase();
}

function makeIdeationKeywordBubbleId(text: string) {
  return `ideation-keyword-${encodeURIComponent(text)}`;
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

function normalizeIdeationKeywordBubblesFromResponse(
  keywords: CanvasIdeationKeywordResponse["keywords"],
  existingBubbles: IdeationKeywordBubble[] = [],
): IdeationKeywordBubble[] {
  const normalized = keywords
    .map((keyword) => {
      const kind = normalizeIdeationKeywordBubbleKind(keyword.kind);
      return {
        text: String(keyword.text || "").trim(),
        count: Math.max(1, Number(keyword.count || 1)),
        related: (keyword.related || []).map((item) => String(item || "").trim()).filter(Boolean),
        kind,
        importance: clampNumber(Number(keyword.importance ?? 0.65), 0, 1),
        relevance: clampNumber(Number(keyword.relevance ?? 1), 0, 1),
        offTopic: Boolean(keyword.off_topic || kind === "off_topic"),
        offTopicReason: String(keyword.off_topic_reason || "").trim(),
        anchorText: String(keyword.anchor || "").trim(),
      };
    })
    .filter((keyword) => keyword.text.length >= 2);
  const maxCount = Math.max(1, ...normalized.map((keyword) => keyword.count));
  const selectedTexts = new Set(normalized.map((keyword) => keyword.text));
  const relationshipTexts = new Set([...selectedTexts, ...existingBubbles.map((bubble) => bubble.text)]);
  return normalized.map((keyword) => ({
    id: makeIdeationKeywordBubbleId(keyword.text),
    text: keyword.text,
    count: keyword.count,
    weight: keyword.count / maxCount,
    related: keyword.related.filter((item) => relationshipTexts.has(item) && item !== keyword.text).slice(0, 5),
    kind: keyword.offTopic ? "off_topic" : keyword.kind,
    importance: keyword.importance,
    relevance: keyword.relevance,
    offTopic: keyword.offTopic,
    offTopicReason: keyword.offTopicReason,
    anchorText: relationshipTexts.has(keyword.anchorText) && keyword.anchorText !== keyword.text ? keyword.anchorText : "",
  }));
}

function normalizeIdeationKeywordOperations(result: CanvasIdeationKeywordResponse): IdeationKeywordOperations {
  const mergeDirectives = (result.merge_keywords || [])
    .map((item) => ({
      sourceText: String(item.source || "").trim(),
      targetText: String(item.target || "").trim(),
    }))
    .filter((item) => item.sourceText && item.targetText && normalizeIdeationKeywordTextKey(item.sourceText) !== normalizeIdeationKeywordTextKey(item.targetText))
    .slice(0, 8);
  const removeTexts = (result.remove_keywords || [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 8);

  return { mergeDirectives, removeTexts };
}

function mergeIdeationKeywordBubbleBatch(
  currentBubbles: IdeationKeywordBubble[],
  incomingBubbles: IdeationKeywordBubble[],
  operations: IdeationKeywordOperations = { mergeDirectives: [], removeTexts: [] },
) {
  if (incomingBubbles.length === 0 && operations.mergeDirectives.length === 0 && operations.removeTexts.length === 0) {
    return {
      allBubbles: currentBubbles,
      updatedBubbles: [],
      mergedCount: 0,
      removedCount: 0,
    };
  }

  const mergedByText = new Map(currentBubbles.map((bubble) => [normalizeIdeationKeywordTextKey(bubble.text), bubble] as const));
  const updatedTextKeys = new Set<string>();
  const mergeSourceTextKeys = new Set<string>();
  const mergeTargetTextKeys = new Set<string>();
  const incomingByText = new Map(incomingBubbles.map((bubble) => [normalizeIdeationKeywordTextKey(bubble.text), bubble] as const));
  let newBubbleCount = 0;
  let mergedCount = 0;
  let removedCount = 0;

  operations.mergeDirectives.forEach(({ sourceText, targetText }) => {
    const sourceKey = normalizeIdeationKeywordTextKey(sourceText);
    const targetKey = normalizeIdeationKeywordTextKey(targetText);
    const source = mergedByText.get(sourceKey);
    if (!source || !targetKey || sourceKey === targetKey) return;

    const target = mergedByText.get(targetKey) || incomingByText.get(targetKey);
    const resolvedTargetText = target?.text || targetText;
    const related = Array.from(
      new Set([
        ...(target?.related || []),
        ...(source.related || []),
        source.text,
      ]),
    )
      .filter((item) => item && normalizeIdeationKeywordTextKey(item) !== targetKey)
      .slice(0, 8);

    mergedByText.set(targetKey, {
      ...(target || source),
      id: target?.id || makeIdeationKeywordBubbleId(resolvedTargetText),
      text: resolvedTargetText,
      count: Math.max(1, Number(target?.count || 0)) + Math.max(1, Number(source.count || 1)),
      weight: target?.weight || source.weight,
      related,
      kind: target?.kind || source.kind,
      importance: Math.max(Number(target?.importance || 0), Number(source.importance || 0)),
      relevance: Math.max(Number(target?.relevance || 0), Number(source.relevance || 0)),
      offTopic: Boolean(target?.offTopic || source.offTopic),
      offTopicReason: target?.offTopicReason || source.offTopicReason || "",
      anchorText: target?.anchorText || source.anchorText || "",
    });
    mergedByText.delete(sourceKey);
    mergeSourceTextKeys.add(sourceKey);
    mergeTargetTextKeys.add(targetKey);
    updatedTextKeys.add(targetKey);
    mergedCount += 1;
  });

  const rankedIncoming = [...incomingBubbles].sort(
    (left, right) =>
      Number(right.importance || 0) - Number(left.importance || 0) ||
      right.count - left.count ||
      left.text.localeCompare(right.text),
  );

  rankedIncoming.forEach((incoming) => {
    const text = incoming.text.trim();
    if (!text) return;
    const textKey = normalizeIdeationKeywordTextKey(text);
    if (mergeSourceTextKeys.has(textKey)) return;
    const existing = mergedByText.get(textKey);
    if (!existing && newBubbleCount >= IDEATION_KEYWORD_MAX_NEW_BUBBLES_PER_BATCH) return;
    if (!existing) newBubbleCount += 1;
    const related = Array.from(new Set([...(existing?.related || []), ...(incoming.related || [])]))
      .filter((item) => item && item !== text)
      .slice(0, 8);

    mergedByText.set(textKey, {
      ...(existing || incoming),
      ...incoming,
      id: existing?.id || incoming.id,
      text: existing?.text || incoming.text,
      count: Math.max(1, Number(existing?.count || 0)) + Math.max(1, Number(incoming.count || 1)),
      related,
      kind: incoming.kind || existing?.kind,
      importance: Math.max(Number(existing?.importance || 0), Number(incoming.importance || 0)),
      relevance: Math.max(Number(existing?.relevance || 0), Number(incoming.relevance || 0)),
      offTopic: Boolean(existing?.offTopic || incoming.offTopic),
      offTopicReason: incoming.offTopicReason || existing?.offTopicReason || "",
      anchorText: incoming.anchorText || existing?.anchorText || "",
    });
    updatedTextKeys.add(textKey);
  });

  const protectedTextKeys = new Set([...updatedTextKeys, ...mergeTargetTextKeys]);
  operations.removeTexts.forEach((text) => {
    const textKey = normalizeIdeationKeywordTextKey(text);
    if (!textKey || protectedTextKeys.has(textKey) || !mergedByText.has(textKey)) return;
    mergedByText.delete(textKey);
    removedCount += 1;
  });

  const allBubbles = [...mergedByText.values()];
  const maxCount = Math.max(1, ...allBubbles.map((bubble) => bubble.count));
  const normalizedBubbles = allBubbles
    .map((bubble) => ({
      ...bubble,
      weight: bubble.count / maxCount,
    }))
    .sort((left, right) => right.count - left.count || left.text.localeCompare(right.text))
    .slice(0, IDEATION_KEYWORD_MAX_TOTAL_BUBBLES);
  const activeTextKeys = new Set(normalizedBubbles.map((bubble) => normalizeIdeationKeywordTextKey(bubble.text)));

  return {
    allBubbles: normalizedBubbles,
    updatedBubbles: normalizedBubbles.filter((bubble) => {
      const textKey = normalizeIdeationKeywordTextKey(bubble.text);
      return activeTextKeys.has(textKey) && updatedTextKeys.has(textKey);
    }),
    mergedCount,
    removedCount,
  };
}

function buildExistingIdeationKeywordPayload(bubbles: IdeationKeywordBubble[]) {
  return bubbles.slice(0, IDEATION_KEYWORD_MAX_TOTAL_BUBBLES).map((bubble) => ({
    text: bubble.text,
    count: bubble.count,
    related: bubble.related.slice(0, 6),
    kind: bubble.kind,
    importance: bubble.importance,
    relevance: bubble.relevance,
    off_topic: bubble.offTopic,
    anchor: bubble.anchorText,
  }));
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

export function useIdeationKeywordBubbles({
  transcripts,
  meetingId,
  meetingTopic,
  meetingGoal,
  meetingGoalContext,
  stage,
}: {
  transcripts: IdeationTranscript[];
  meetingId: string;
  meetingTopic: string;
  meetingGoal?: string;
  meetingGoalContext?: string;
  stage: CanvasStage;
}) {
  const [llmBubbles, setLlmBubbles] = useState<IdeationKeywordBubble[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const processedIdsRef = useRef<Set<string>>(new Set());
  const requestSeqRef = useRef(0);
  const requestInFlightRef = useRef(false);
  const bubbleStoreRef = useRef<IdeationKeywordBubble[]>([]);

  const ideationKeywordUtterances = useMemo(() => buildIdeationKeywordUtterances(transcripts), [transcripts]);
  const localBubbles = useMemo(
    () => buildIdeationKeywordBubbles(transcripts).slice(0, IDEATION_KEYWORD_MAX_TOTAL_BUBBLES),
    [transcripts],
  );

  useEffect(() => {
    processedIdsRef.current = new Set();
    requestInFlightRef.current = false;
    bubbleStoreRef.current = [];
    deferStateUpdate(() => {
      setLlmBubbles([]);
      setStatusMessage("");
    });
  }, [meetingId]);

  useEffect(() => {
    if (stage !== "ideation") {
      deferStateUpdate(() => setStatusMessage(""));
      return undefined;
    }
    if (!meetingId || ideationKeywordUtterances.length === 0) {
      processedIdsRef.current = new Set();
      bubbleStoreRef.current = [];
      deferStateUpdate(() => {
        setLlmBubbles([]);
        setStatusMessage("");
      });
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
      deferStateUpdate(() => setStatusMessage(""));
      return undefined;
    }

    if (requestInFlightRef.current) {
      deferStateUpdate(() => setStatusMessage("AI가 버블을 정리 중입니다."));
      return undefined;
    }

    const runKeywordRequest = (reason: "batch" | "idle") => {
      const requestUtterances =
        reason === "batch"
          ? pendingUtterances.slice(0, IDEATION_KEYWORD_BATCH_SIZE)
          : pendingUtterances;
      if (requestUtterances.length === 0) return;

      const requestSeq = requestSeqRef.current + 1;
      requestSeqRef.current = requestSeq;
      requestInFlightRef.current = true;
      setStatusMessage("AI가 버블을 정리 중입니다.");

      const keywordRequest: Parameters<typeof extractCanvasIdeationKeywords>[0] = {
        meeting_id: meetingId,
        meeting_topic: meetingTopic,
        utterances: requestUtterances,
        context_cache: buildIdeationKeywordContextCache(ideationKeywordUtterances, requestUtterances),
        existing_keywords: buildExistingIdeationKeywordPayload(bubbleStoreRef.current),
        max_keywords: IDEATION_KEYWORD_MAX_KEYWORDS,
      };
      const cleanMeetingGoal = meetingGoal?.trim() || "";
      const cleanMeetingGoalContext = meetingGoalContext?.trim() || "";
      if (cleanMeetingGoal) {
        keywordRequest.meeting_goal = cleanMeetingGoal;
      }
      if (cleanMeetingGoalContext) {
        keywordRequest.meeting_goal_context = cleanMeetingGoalContext;
      }

      void extractCanvasIdeationKeywords(keywordRequest)
        .then((result) => {
          if (requestSeqRef.current !== requestSeq) return;
          if (!result.used_llm) {
            requestUtterances.forEach((row) => processedIdsRef.current.add(row.id));
            setStatusMessage(result.warning || "LLM 응답이 없어 이번 발화는 버블에 반영하지 않았습니다.");
            return;
          }
          const nextBubbles = normalizeIdeationKeywordBubblesFromResponse(result.keywords || [], bubbleStoreRef.current);
          const operations = normalizeIdeationKeywordOperations(result);
          requestUtterances.forEach((row) => processedIdsRef.current.add(row.id));

          if (nextBubbles.length > 0 || operations.mergeDirectives.length > 0 || operations.removeTexts.length > 0) {
            const merged = mergeIdeationKeywordBubbleBatch(bubbleStoreRef.current, nextBubbles, operations);
            bubbleStoreRef.current = merged.allBubbles;
            setLlmBubbles(merged.updatedBubbles);
            setStatusMessage(
              `버블 ${merged.updatedBubbles.length}개 업데이트, ${merged.mergedCount}개 합병, ${merged.removedCount}개 정리했습니다.`,
            );
            return;
          }

          setStatusMessage("이번 발화에서는 추가할 핵심 버블이 없었습니다.");
        })
        .catch((error) => {
          if (requestSeqRef.current !== requestSeq) return;
          console.error("Failed to extract ideation keyword bubbles:", error);
          setStatusMessage("기존 버블을 유지하고 다음 발화에서 다시 시도합니다.");
        })
        .finally(() => {
          if (requestSeqRef.current !== requestSeq) return;
          requestInFlightRef.current = false;
        });
    };

    if (pendingUtterances.length >= IDEATION_KEYWORD_BATCH_SIZE) {
      runKeywordRequest("batch");
      return undefined;
    }

    deferStateUpdate(() => setStatusMessage(`버블 분석 대기 중 ${pendingUtterances.length}/${IDEATION_KEYWORD_BATCH_SIZE}`));
    const timer = window.setTimeout(() => {
      runKeywordRequest("idle");
    }, IDEATION_KEYWORD_IDLE_FLUSH_MS);

    return () => window.clearTimeout(timer);
  }, [
    ideationKeywordUtterances,
    meetingId,
    meetingGoal,
    meetingGoalContext,
    meetingTopic,
    stage,
  ]);

  return {
    keywordBubbles: meetingId ? llmBubbles : localBubbles,
    statusMessage,
  };
}
