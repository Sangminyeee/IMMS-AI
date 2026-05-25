"use client";

import "@xyflow/react/dist/style.css";
import {
  type Edge,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getCanvasProblemDiscussionWorkspaceJob,
  saveCanvasWorkspacePatch,
  startCanvasProblemDiscussionWorkspace,
  extractCanvasIdeationKeywords,
} from "@/lib/api";
import { CanvasEndMeetingDialogs } from "@/components/canvas/CanvasEndMeetingDialogs";
import { CanvasHeader } from "@/components/canvas/CanvasHeader";
import { CanvasQuickAskPanel } from "@/components/canvas/CanvasQuickAskPanel";
import { CanvasRightDrawer } from "@/components/canvas/CanvasRightDrawer";
import { CanvasSurface } from "@/components/canvas/CanvasSurface";
import {
  buildProblemExploreLayout,
} from "@/components/canvas/CanvasGraphLayouts";
import { buildIdeationKeywordBubbleBlueprint } from "@/components/canvas/CanvasIdeationNodeDescriptors";
import { buildProblemExploreCanvasBlueprint } from "@/components/canvas/CanvasProblemExploreNodeDescriptors";
import { buildProblemExploreEdges } from "@/components/canvas/problemExploreEdges";
import { buildProblemStructureCanvasBlueprint } from "@/components/canvas/CanvasProblemStructureNodeDescriptors";
import {
  buildNodeContentSignature,
  type CanvasNodeData,
  type CanvasNodeDescriptor,
} from "@/components/canvas/CanvasGraphTypes";
import {
  CANVAS_IDEATION_BUBBLE_DEBUG_GROWTH_STEP,
  CANVAS_IDEATION_BUBBLE_DEBUG_INTERVAL_MS,
  CANVAS_IDEATION_BUBBLE_DEBUG_MAX_GROWTH,
  buildIdeationKeywordBubbles,
  buildStableIdeationBubbleVisuals,
} from "@/components/canvas/CanvasIdeationBubbles";
import {
  buildProblemStructureStatePayload,
  createDefaultProblemStructureState,
  getSummaryEligibleStructureGroups,
  hydrateProblemStructureState,
  problemStructureMethodLabel,
  type ProblemDefinitionMode,
  type ProblemDefinitionPhase,
  type ProblemStructureGroupViewModel,
  type ProblemStructureMethod,
  type ProblemStructureNodeViewModel,
} from "@/components/canvas/problemStructureModel";
import {
  useCanvasFlowRefs,
  useCanvasNodeSyncRefs,
  useCanvasRuntimeState,
} from "@/components/canvas/useCanvasRuntimeState";
import { useCanvasEndMeetingState } from "@/components/canvas/useCanvasEndMeetingState";
import { useCanvasMeetingGoalEditor } from "@/components/canvas/useCanvasMeetingGoalEditor";
import { useProblemStructureEditor } from "@/components/canvas/useProblemStructureEditor";
import { useProblemDefinitionGeneration } from "@/components/canvas/useProblemDefinitionGeneration";
import { useProblemStructureGeneration } from "@/components/canvas/useProblemStructureGeneration";
import { useProblemChildGeneration } from "@/components/canvas/useProblemChildGeneration";
import { useProblemGroupActions } from "@/components/canvas/useProblemGroupActions";
import { useProblemGroupingRationale } from "@/components/canvas/useProblemGroupingRationale";
import { useProblemGroupRelationships } from "@/components/canvas/useProblemGroupRelationships";
import { usePersonalNoteCanvasLinking } from "@/components/canvas/usePersonalNoteCanvasLinking";
import { useSummaryDocumentActions } from "@/components/canvas/useSummaryDocumentActions";
import { useSharedCanvasBroadcast } from "@/components/canvas/useSharedCanvasBroadcast";
import { useSharedCanvasIncomingSync } from "@/components/canvas/useSharedCanvasIncomingSync";
import { useCanvasPersistence } from "@/components/canvas/useCanvasPersistence";
import { useCanvasNodePreviewSync } from "@/components/canvas/useCanvasNodePreviewSync";
import { useCanvasNodeChanges } from "@/components/canvas/useCanvasNodeChanges";
import { useCanvasNodeDragCommit } from "@/components/canvas/useCanvasNodeDragCommit";
import { useCanvasWorkspaceLoader } from "@/components/canvas/useCanvasWorkspaceLoader";
import {
  buildMeetingStateSignature,
  buildWorkspaceProblemGroupsPayload,
  createWorkspaceFieldSignatures,
  normalizeCanvasItemStatus,
  normalizeCanvasNodePositionsForComputedIdeation,
  normalizeIdeationSuggestionStatus,
  normalizeRefinedUtterances,
  summarizeNodePositionsForDebug,
  summarizeRenderedNodesForDebug,
  writeSharedWorkspaceSessionCache,
  type AgendaOverride,
  type WorkspaceFieldSignatures,
} from "@/components/canvas/canvasWorkspaceSerialization";
import {
  buildFinalSolutionSummaryPayload,
  buildPrintableSummaryDocumentHtml,
  buildSummaryDocumentFromResponse,
  createEmptyFinalSolutionSummary,
  normalizeFinalSolutionSummaryPayload,
  openPrintableSummaryDocumentPdf,
  renderSummaryMarkdownPreview,
} from "@/components/canvas/summaryDocumentHelpers";
import { useCanvasQuickAsk } from "@/components/canvas/useCanvasQuickAsk";
import { useCanvasUiState } from "@/components/canvas/useCanvasUiState";
import type {
  AgendaActionItemDetail,
  AgendaDecisionDetail,
  CanvasCustomGroup,
  CanvasEditPresencePayload,
  CanvasFinalSolutionSummary,
  CanvasNodePreviewPayload,
  CanvasNodePositionsByStage,
  CanvasProblemDefinitionGroup,
  CanvasProblemStructureState,
  CanvasRealtimeSyncPayload,
  CanvasProblemDiscussionItem,
  CanvasWorkspaceStateResponse,
  CanvasWorkspaceItem,
  MeetingState,
  TranscriptUtterance,
} from "@/lib/types";
import type { LiveSpeechPreview, SttFlowSummaryItem } from "@/app/page";
import { useRouter, useSearchParams } from "next/navigation";

export type MeetingTranscript = {
  id: string;
  speaker: string;
  text: string;
  timestamp: string;
  canvas_stage?: CanvasStage | string;
  canvas_target_id?: string;
};

export type MeetingAgenda = {
  id: string;
  title: string;
  status: string;
};

type CanvasStage = "ideation" | "problem-definition" | "solution";
type ComposerTool = "note" | "comment" | "topic";
type ProblemCanvasToolbarAction =
  | "structure-start"
  | "structure-back"
  | "structure-ai-group"
  | "structure-add-group"
  | "structure-refresh";
type LeftPanelTab = "detail";
type ProblemGroupStatus = "draft" | "review" | "final";
const CANVAS_LLM_FAILURE_RETRY_DELAY_MS = 60_000;
const CANVAS_LLM_SILENCE_FLUSH_MS = 8_000;
const COMPOSER_PERSONAL_NOTE_LINK_ID = "__composer_personal_note__";

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clipClientText(value: unknown, limit: number) {
  const text = String(value || "").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1))}…`;
}

type PersonalNote = {
  id: string;
  projectId: string;
  agendaId: string;
  linkedCanvasItemId?: string;
  linkedCanvasItemTitle?: string;
  kind: ComposerTool;
  title: string;
  body: string;
};

type ProblemGroupViewModel = CanvasProblemDefinitionGroup & {
  status: ProblemGroupStatus;
};

type ProblemGroupingRationaleViewModel = {
  groupId: string;
  rationale: string;
  basisItems: string[];
  usedLlm: boolean;
  warning?: string;
  generatedAt?: string;
};

type ProblemDiscussionViewModel = CanvasProblemDiscussionItem;

type CanvasItemViewModel = CanvasWorkspaceItem;
type CustomGroupViewModel = CanvasCustomGroup;

function buildProblemTaxonomyExistingGroupsPayload(groups: ProblemGroupViewModel[]) {
  return groups.map((group) => ({
    group_id: group.group_id,
    parent_group_id: group.parent_group_id || "",
    depth: group.depth || 0,
    topic: group.topic,
    evidence_utterance_ids: group.evidence_utterance_ids || [],
    source_summary_items: group.source_summary_items || [],
  }));
}

type AgendaViewModel = {
  id: string;
  title: string;
  status: string;
  keywords: string[];
  summaryBullets: string[];
  utterances: Array<TranscriptUtterance & { turnId: number }>;
  decisions: AgendaDecisionDetail[];
  actionItems: AgendaActionItemDetail[];
  isCustom?: boolean;
};

type ProblemGroupDisplayCard = {
  sourceNodeId: string;
  attachable: boolean;
};

type IdeationKeywordBubble = {
  id: string;
  text: string;
  count: number;
  weight: number;
  related: string[];
  kind?: "entity" | "topic" | "relation" | "action" | "off_topic";
  importance?: number;
  relevance?: number;
  offTopic?: boolean;
  offTopicReason?: string;
  anchorText?: string;
  activity?: number;
  opacity?: number;
};

type IdeationKeywordBubbleVisual = IdeationKeywordBubble & {
  activity: number;
  opacity: number;
  size: number;
  targetX: number;
  targetY: number;
  firstSeenTick: number;
  lastSeenTick: number;
};

type LocalEditPresenceTarget = {
  targetType: CanvasEditPresencePayload["target_type"];
  targetId: string;
  noteId?: string;
};

function makeEditPresenceKey(targetType: CanvasEditPresencePayload["target_type"], targetId: string, noteId = "") {
  return `${targetType}:${targetId}:${noteId}`;
}

type MeetingCanvasTabProps = {
  userId: string;
  meetingId: string;
  meetingTitle: string;
  meetingGoal: string;
  meetingGoalContext: string;
  onMeetingGoalChange: (goal: string) => void;
  onMeetingGoalContextChange: (context: string) => void;
  onMeetingGoalSync?: (goal: string, context?: string) => void;
  transcripts: MeetingTranscript[];
  agendas: MeetingAgenda[];
  analysisState: MeetingState | null;
  onSyncFromMeeting: (analyze?: boolean) => Promise<MeetingState | null>;
  incomingSharedCanvasSync: CanvasRealtimeSyncPayload | null;
  onSharedCanvasSync: (payload: CanvasRealtimeSyncPayload) => void;
  incomingNodePreview: CanvasNodePreviewPayload | null;
  onNodePreviewSync: (payload: CanvasNodePreviewPayload) => void;
  incomingEditPresence: CanvasEditPresencePayload | null;
  onEditPresenceSync: (payload: CanvasEditPresencePayload) => void;
  incomingCanvasStateRequestId: string;
  syncStatusText: string;
  autoSyncing: boolean;
  liveSpeechPreview: LiveSpeechPreview | null;
  sttFlowSummaries?: SttFlowSummaryItem[];
  onImportAudioFile: (file: File) => Promise<void>;
  audioImportBusy: boolean;
  audioImportStatusText: string;
  audioImportRevision: number;
  isRecording?: boolean;
  onToggleRecording?: () => void | Promise<void>;
  onEndMeeting?: () => void | Promise<void>;
  onStopRecording?: () => void | Promise<void>;
  sttProgressText?: string;
  onCanvasStageContextChange?: (context: {
    stage: CanvasStage;
    targetId?: string;
    selectedNodeId?: string;
  }) => void;
  recordingStatusText?: string;
};

function stageLabel(stage: CanvasStage) {
  if (stage === "ideation") return "아이디어";
  if (stage === "problem-definition") return "문제정의";
  return "요약";
}

function shouldHideCanvasStatusMessage(message: string) {
  return /websocket|웹소켓|연결\s*안\s*됨|연결되지|오류|에러|실패/i.test(message);
}

function extractAgendaIdFromNodeId(nodeId: string) {
  if (nodeId.startsWith("agenda-")) return nodeId.slice("agenda-".length);
  const summaryMatch = nodeId.match(/^summary-(.+)-(\d+)$/);
  if (summaryMatch) return summaryMatch[1];
  return "";
}

function stripLeadingTimestamp(text: string) {
  return text
    .replace(
      /^\s*\[?\s*(?:\d{4}-\d{2}-\d{2}[T\s]\d{1,2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?|\d{1,2}:\d{2}(?::\d{2})?)\s*\]?\s*/,
      "",
    )
    .trim();
}

function makeProblemSummarySourceNodeId(groupId: string, index: number) {
  return `${groupId}-summary-${index}`;
}

function buildProblemGroupDisplayCards(group: ProblemGroupViewModel): ProblemGroupDisplayCard[] {
  const summaryCards = (group.source_summary_items || []).map((_, index) => {
    const sourceNodeId = makeProblemSummarySourceNodeId(group.group_id, index);
    const hasAttachedDiscussion = (group.discussion_items || []).some(
      (discussion) => discussion.target_node_id === sourceNodeId,
    );

    return {
      sourceNodeId,
      attachable: index === 0 || hasAttachedDiscussion,
    };
  });
  const personalCards = (group.ideas || []).map((idea, index) => ({
    sourceNodeId: idea.id || `${group.group_id}-idea-${index}`,
    attachable: true,
  }));

  if (summaryCards.length === 0 && personalCards.length === 0) {
    return [];
  }

  return [...summaryCards, ...personalCards];
}

function hydrateProblemGroups(
  groups: Array<CanvasProblemDefinitionGroup & { status?: string }>,
  previousGroups: ProblemGroupViewModel[] = [],
): ProblemGroupViewModel[] {
  const previousById = new Map(previousGroups.map((group) => [group.group_id, group]));

  return groups.map((group) => {
    const previous = previousById.get(group.group_id);
    const mergedIdeas = [...(group.ideas || [])];
    const hasIncomingDiscussions = Object.prototype.hasOwnProperty.call(group, "discussion_items");
    const incomingDiscussions = (group.discussion_items || []).filter((item) => item.id || item.title || item.body);
    const mergedDiscussions: ProblemDiscussionViewModel[] = [...incomingDiscussions];

    if (previous) {
      previous.ideas.forEach((idea) => {
        if (!mergedIdeas.some((item) => item.id === idea.id)) {
          mergedIdeas.push(idea);
        }
      });
      if (!hasIncomingDiscussions) {
        (previous.discussion_items || []).forEach((item) => {
          if (!mergedDiscussions.some((candidate) => candidate.id === item.id)) {
            mergedDiscussions.push(item);
          }
        });
      }
    }

    return {
      ...group,
      ideas: mergedIdeas,
      discussion_items: mergedDiscussions,
      insight_user_edited: group.insight_user_edited ?? previous?.insight_user_edited ?? false,
      conclusion_user_edited:
        group.conclusion_user_edited ?? previous?.conclusion_user_edited ?? false,
      source_signature: group.source_signature || previous?.source_signature || "",
      source_agenda_signatures: group.source_agenda_signatures || previous?.source_agenda_signatures || {},
      source_idea_signatures: group.source_idea_signatures || previous?.source_idea_signatures || {},
      linked_group_ids: [
        ...new Set([
          ...(group.linked_group_ids || []),
          ...(previous?.linked_group_ids || []),
        ]),
      ].filter((linkedGroupId) => linkedGroupId && linkedGroupId !== group.group_id),
      status:
        group.status === "review" || group.status === "final" || group.status === "draft"
          ? group.status
          : previous?.status || "draft",
    };
  });
}

function makeStableSignature(value: unknown) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length}:${(hash >>> 0).toString(36)}`;
}

function normalizeTranscriptRows(rows: MeetingTranscript[] | TranscriptUtterance[]) {
  return rows.map((row, index) => ({
    id: "id" in row ? row.id : `${row.timestamp || "turn"}-${index}`,
    speaker: row.speaker,
    text: row.text,
    timestamp: row.timestamp,
    canvas_stage: "canvas_stage" in row ? row.canvas_stage || "ideation" : "ideation",
    canvas_target_id: "canvas_target_id" in row ? row.canvas_target_id || "" : "",
    turnId: index + 1,
  }));
}

function buildProblemTaxonomyUtterances(transcripts: MeetingTranscript[]) {
  return normalizeTranscriptRows(transcripts)
    .filter((row) => (!row.canvas_stage || row.canvas_stage === "ideation") && stripLeadingTimestamp(row.text).trim())
    .map((row) => ({
      id: row.id,
      speaker: row.speaker || "참가자",
      text: stripLeadingTimestamp(row.text),
      timestamp: row.timestamp || "",
    }));
}

function buildIdeationKeywordUtterances(transcripts: MeetingTranscript[]) {
  return normalizeTranscriptRows(transcripts)
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
  keywords: Array<{
    text?: string;
    count?: number;
    related?: string[];
    kind?: string;
    importance?: number;
    relevance?: number;
    off_topic?: boolean;
    offTopic?: boolean;
    off_topic_reason?: string;
    offTopicReason?: string;
    anchor?: string;
    anchor_text?: string;
  }>,
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
        offTopic: Boolean(keyword.off_topic || keyword.offTopic || kind === "off_topic"),
        offTopicReason: String(keyword.off_topic_reason || keyword.offTopicReason || "").trim(),
        anchorText: String(keyword.anchor || keyword.anchor_text || "").trim(),
      };
    })
    .filter((keyword) => keyword.text.length >= 2);
  const maxCount = Math.max(1, ...normalized.map((keyword) => keyword.count));
  const selectedTexts = new Set(normalized.map((keyword) => keyword.text));
  return normalized.map((keyword) => ({
    id: `ideation-keyword-${encodeURIComponent(keyword.text)}`,
    text: keyword.text,
    count: keyword.count,
    weight: keyword.count / maxCount,
    related: keyword.related.filter((item) => selectedTexts.has(item) && item !== keyword.text).slice(0, 5),
    kind: keyword.offTopic ? "off_topic" : keyword.kind,
    importance: keyword.importance,
    relevance: keyword.relevance,
    offTopic: keyword.offTopic,
    offTopicReason: keyword.offTopicReason,
    anchorText: selectedTexts.has(keyword.anchorText) && keyword.anchorText !== keyword.text ? keyword.anchorText : "",
  }));
}

function buildAgendaModels(
  analysisState: MeetingState | null,
  agendas: MeetingAgenda[],
  transcripts: MeetingTranscript[],
): AgendaViewModel[] {
  const transcriptRows = normalizeTranscriptRows((analysisState?.transcript?.length ? analysisState.transcript : transcripts) || []);
  const outcomes = analysisState?.analysis?.agenda_outcomes || [];

  if (outcomes.length > 0) {
    return outcomes.map((outcome, index) => {
      const start = Math.max(1, Number(outcome.start_turn_id || 1));
      const end = Math.max(start, Number(outcome.end_turn_id || transcriptRows.length || start));
      return {
        id: outcome.agenda_id || `agenda-${index + 1}`,
        title: stripLeadingTimestamp(outcome.agenda_title || "") || `안건 ${index + 1}`,
        status: outcome.agenda_state || "PROPOSED",
        keywords: (outcome.agenda_keywords || []).map(stripLeadingTimestamp).filter(Boolean),
        summaryBullets:
          (outcome.agenda_summary_items || []).filter(Boolean).slice(0, 4).length > 0
            ? (outcome.agenda_summary_items || []).filter(Boolean).slice(0, 4).map(stripLeadingTimestamp)
            : [outcome.summary].filter(Boolean).map(stripLeadingTimestamp),
        utterances: transcriptRows.filter((row) => row.turnId >= start && row.turnId <= end),
        decisions: outcome.decision_results || [],
        actionItems: outcome.action_items || [],
      };
    });
  }

  if (agendas.length > 0) {
    return agendas.map((agenda, index) => ({
      id: agenda.id,
      title: agenda.title,
      status: agenda.status || "PROPOSED",
      keywords: [],
      summaryBullets: [],
      utterances: index === 0 ? transcriptRows : [],
      decisions: [],
      actionItems: [],
    }));
  }

  return [
    {
      id: "agenda-fallback",
      title: "현재 회의",
      status: "ACTIVE",
      keywords: [],
      summaryBullets: [],
      utterances: transcriptRows,
      decisions: [],
      actionItems: [],
    },
  ];
}

function hydrateCanvasItems(items: CanvasItemViewModel[] = []): CanvasItemViewModel[] {
  return items.map((item) => {
    const keywords = (item.keywords || []).map((keyword) => keyword.trim()).filter(Boolean);
    const keyEvidence = (item.key_evidence || []).map((value) => value.trim()).filter(Boolean);
    const refinedUtterances = normalizeRefinedUtterances(item.refined_utterances);
    const evidenceUtteranceIds = (item.evidence_utterance_ids || []).map((value) => value.trim()).filter(Boolean);
    const ignoredUtteranceIds = (item.ignored_utterance_ids || []).map((value) => value.trim()).filter(Boolean);
    const mergedChildren = hydrateCanvasItems(item.merged_children || []);
    return {
      ...item,
      keywords: keywords.slice(0, 8),
      key_evidence: keyEvidence.slice(0, 8),
      refined_utterances: refinedUtterances,
      evidence_utterance_ids: evidenceUtteranceIds.slice(0, 400),
      ignored_utterance_ids: ignoredUtteranceIds.slice(0, 400),
      merged_children: mergedChildren,
      compacted_from_ids: (item.compacted_from_ids || []).map((value) => value.trim()).filter(Boolean).slice(0, 400),
      compaction_level: typeof item.compaction_level === "number" ? item.compaction_level : 0,
      parent_topic_id: item.parent_topic_id || "",
      parent_topic_source: item.parent_topic_source || "",
      parent_topic_locked: Boolean(item.parent_topic_locked),
      child_item_ids: (item.child_item_ids || []).map((value) => value.trim()).filter(Boolean).slice(0, 400),
      status: normalizeCanvasItemStatus(item.status),
      topic_collapsed: Boolean(item.topic_collapsed),
      created_by: item.created_by || "",
      manual_position: false,
      ai_generated: Boolean(item.ai_generated),
      user_edited: Boolean(item.user_edited),
      ai_pending: Boolean(item.ai_pending),
      ai_suggestions: (item.ai_suggestions || [])
        .map((suggestion) => ({
          id: (suggestion.id || "").trim(),
          text: (suggestion.text || "").trim(),
          status: normalizeIdeationSuggestionStatus(suggestion.status),
        }))
        .filter((suggestion) => suggestion.id && suggestion.text)
        .slice(0, 8),
      x: undefined,
      y: undefined,
    };
  });
}

function hydrateCustomGroups(groups: CustomGroupViewModel[] = []): CustomGroupViewModel[] {
  return groups
    .map((group) => ({
      id: (group.id || "").trim(),
      title: (group.title || "").trim(),
      description: (group.description || "").trim(),
      keywords: (group.keywords || []).map((keyword) => keyword.trim()).filter(Boolean).slice(0, 8),
      color: (group.color || "").trim(),
      created_by: group.created_by || "",
      created_at: group.created_at || "",
    }))
    .filter((group) => group.id && group.title);
}

function createLocalNodeOverrideMap() {
  return {
    ideation: new Set<string>(),
    "problem-definition": new Set<string>(),
    solution: new Set<string>(),
  };
}

function positionsEqual(
  left?: { x: number; y: number },
  right?: { x: number; y: number },
) {
  return (left?.x ?? 0) === (right?.x ?? 0) && (left?.y ?? 0) === (right?.y ?? 0);
}

function styleSignature(style?: React.CSSProperties) {
  return buildNodeContentSignature([
    style?.width,
    style?.height,
    style?.minHeight,
    style?.borderRadius,
    style?.padding,
  ]);
}

function reconcileNodes(
  currentNodes: Node[],
  descriptors: CanvasNodeDescriptor[],
  preserveNodeIds = new Set<string>(),
) {
  const currentNodeMap = new Map(currentNodes.map((node) => [node.id, node]));
  let changed = currentNodes.length !== descriptors.length;

  const nextNodes = descriptors.map((descriptor, index) => {
    const existingNode = currentNodeMap.get(descriptor.id);
    const nextPosition =
      existingNode && preserveNodeIds.has(descriptor.id)
        ? existingNode.position
        : existingNode && descriptor.positionSource === "fallback"
        ? existingNode.position
        : descriptor.position;
    const nextContentSignature =
      (descriptor.data as CanvasNodeData | undefined)?.contentSignature || "";
    const existingContentSignature =
      ((existingNode?.data as CanvasNodeData | undefined)?.contentSignature) || "";

    const nodeChanged =
      !existingNode ||
      currentNodes[index]?.id !== descriptor.id ||
      !positionsEqual(existingNode.position, nextPosition) ||
      existingNode.className !== descriptor.className ||
      styleSignature(existingNode.style) !== styleSignature(descriptor.style) ||
      existingNode.sourcePosition !== descriptor.sourcePosition ||
      existingNode.targetPosition !== descriptor.targetPosition ||
      existingNode.draggable !== descriptor.draggable ||
      existingNode.dragHandle !== descriptor.dragHandle ||
      existingNode.selectable !== descriptor.selectable ||
      existingNode.zIndex !== descriptor.zIndex ||
      existingContentSignature !== nextContentSignature;

    if (!nodeChanged && existingNode) {
      return existingNode;
    }

    changed = true;

    return {
      ...existingNode,
      ...descriptor,
      position: nextPosition,
      data: descriptor.data,
    };
  });

  return changed ? nextNodes : currentNodes;
}

function useStableEvent<TArgs extends unknown[], TResult>(
  handler: (...args: TArgs) => TResult,
): (...args: TArgs) => TResult {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  return useCallback((...args: TArgs) => handlerRef.current(...args), []);
}

export default function MeetingCanvasTab({
  userId,
  meetingId,
  meetingTitle,
  meetingGoal,
  meetingGoalContext,
  onMeetingGoalChange,
  onMeetingGoalContextChange,
  onMeetingGoalSync,
  transcripts,
  agendas,
  analysisState,
  incomingSharedCanvasSync,
  onSharedCanvasSync,
  incomingNodePreview,
  onNodePreviewSync,
  incomingEditPresence,
  onEditPresenceSync,
  incomingCanvasStateRequestId,
  audioImportStatusText,
  audioImportRevision,
  isRecording = false,
  onToggleRecording,
  onEndMeeting,
  onStopRecording,
  onCanvasStageContextChange,
  recordingStatusText = "",
}: MeetingCanvasTabProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const captureStageParam = searchParams.get("capture_stage");
  const captureStageOverride: CanvasStage | "" =
    captureStageParam === "ideation" || captureStageParam === "problem-definition" || captureStageParam === "solution"
      ? captureStageParam
      : "";
  const captureProblemPhaseParam = searchParams.get("capture_problem_phase");
  const captureProblemPhaseOverride: ProblemDefinitionPhase | "" =
    captureProblemPhaseParam === "explore" || captureProblemPhaseParam === "structure" ? captureProblemPhaseParam : "";
  const [stage, setStage] = useState<CanvasStage>("ideation");
  const [composerAgendaId, setComposerAgendaId] = useState("");
  const [composerTitle, setComposerTitle] = useState("");
  const [composerBody, setComposerBody] = useState("");
  const [, setComposerLinkedCanvasItemId] = useState("");
  const [, setComposerLinkedCanvasItemTitle] = useState("");
  const [pendingPersonalNoteLinkId, setPendingPersonalNoteLinkId] = useState("");
  const [selectedAgendaId, setSelectedAgendaId] = useState("");
  const [activityMessage, setActivityMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [personalNotes, setPersonalNotes] = useState<PersonalNote[]>([]);
  const [agendaOverrides, setAgendaOverrides] = useState<Record<string, AgendaOverride>>({});
  const [canvasItems, setCanvasItems] = useState<CanvasItemViewModel[]>([]);
  const [focusedCanvasItemId, setFocusedCanvasItemId] = useState("");
  const [customGroups, setCustomGroups] = useState<CustomGroupViewModel[]>([]);
  const [localEditPresenceTarget, setLocalEditPresenceTarget] = useState<LocalEditPresenceTarget | null>(null);
  const [remoteEditPresenceByKey, setRemoteEditPresenceByKey] = useState<Record<string, CanvasEditPresencePayload>>({});
  const [editingPersonalNoteId, setEditingPersonalNoteId] = useState("");
  const [, setPersonalNoteDraftAgendaId] = useState("");
  const [personalNoteDraftTitle, setPersonalNoteDraftTitle] = useState("");
  const [personalNoteDraftBody, setPersonalNoteDraftBody] = useState("");
  const [problemGroups, setProblemGroups] = useState<ProblemGroupViewModel[]>([]);
  const [problemDefinitionMode, setProblemDefinitionMode] = useState<ProblemDefinitionMode>("");
  const [problemDefinitionPhase, setProblemDefinitionPhase] = useState<ProblemDefinitionPhase>("explore");
  const [problemStructureMethod, setProblemStructureMethod] = useState<ProblemStructureMethod>("affinity");
  const [problemStructureDraftMethod, setProblemStructureDraftMethod] = useState<ProblemStructureMethod>("affinity");
  const [problemStructureDraftMode, setProblemStructureDraftMode] = useState<ProblemDefinitionMode>("ai");
  const [problemStructureSetupOpen, setProblemStructureSetupOpen] = useState(false);
  const [problemStructureNodes, setProblemStructureNodes] = useState<ProblemStructureNodeViewModel[]>([]);
  const [problemStructureGroups, setProblemStructureGroups] = useState<ProblemStructureGroupViewModel[]>([]);
  const [problemStructurePending, setProblemStructurePending] = useState(false);
  const {
    clearProblemStructureDrag,
    editingProblemStructureGroupId,
    editingProblemStructureNodeId,
    handleAddProblemStructureGroup,
    handleCancelProblemStructureGroupEdit,
    handleCancelProblemStructureNodeEdit,
    handleDeleteProblemStructureGroup,
    handleProblemStructureGroupDragOver,
    handleProblemStructureGroupDrop,
    handleProblemStructureNodeDragEnd,
    handleProblemStructureNodeDragOver,
    handleProblemStructureNodeDragStart,
    handleProblemStructureNodeDrop,
    handleRemoveProblemStructureNode,
    handleSaveProblemStructureGroupEdit,
    handleSaveProblemStructureNodeEdit,
    handleStartProblemStructureGroupEdit,
    handleStartProblemStructureNodeEdit,
    handleUpdateProblemStructureGroupStatus,
    problemStructureDrag,
    problemStructureGroupDraftRationale,
    problemStructureGroupDraftTitle,
    problemStructureNodeDraftTitle,
    resetProblemStructureEditorState,
    setProblemStructureGroupDraftRationale,
    setProblemStructureGroupDraftTitle,
    setProblemStructureNodeDraftTitle,
  } = useProblemStructureEditor({
    problemStructureGroups,
    problemStructureNodes,
    setActivityMessage,
    setLocalEditPresenceTarget,
    setProblemStructureGroups,
    setProblemStructureNodes,
  });
  const [finalSummaryDocument, setFinalSummaryDocument] = useState<CanvasFinalSolutionSummary>(() =>
    createEmptyFinalSolutionSummary(),
  );
  const [summaryDocumentEditMode, setSummaryDocumentEditMode] = useState(false);
  const [summaryDocumentDraftMarkdown, setSummaryDocumentDraftMarkdown] = useState("");
  const [summaryDocumentDraftDirty, setSummaryDocumentDraftDirty] = useState(false);
  const [summaryEvidenceOpenGroupIds, setSummaryEvidenceOpenGroupIds] = useState<Set<string>>(() => new Set());
  const [llmIdeationKeywordBubbles, setLlmIdeationKeywordBubbles] = useState<IdeationKeywordBubble[]>([]);
  const [llmIdeationKeywordSignature, setLlmIdeationKeywordSignature] = useState("");
  const [ideationBubbleVisuals, setIdeationBubbleVisuals] = useState<IdeationKeywordBubbleVisual[]>([]);
  const [ideationBubbleDebugEnabled, setIdeationBubbleDebugEnabled] = useState(false);
  const [ideationBubbleDebugGrowthById, setIdeationBubbleDebugGrowthById] = useState<Record<string, number>>({});
  const [ideationBubbleLayoutRevision, setIdeationBubbleLayoutRevision] = useState(0);
  const [importedState, setImportedState] = useState<MeetingState | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [selectedCanvasItemId, setSelectedCanvasItemId] = useState("");
  const [selectedProblemGroupId, setSelectedProblemGroupId] = useState("");
  const [selectedProblemSourceNodeId, setSelectedProblemSourceNodeId] = useState("");
  const [collapsedProblemGroupIds, setCollapsedProblemGroupIds] = useState<Set<string>>(() => new Set());
  const [problemGroupingRationaleById, setProblemGroupingRationaleById] = useState<Record<string, ProblemGroupingRationaleViewModel>>({});
  const [problemGroupingRationalePendingId, setProblemGroupingRationalePendingId] = useState("");
  const [problemGroupingRationaleOpenGroupId, setProblemGroupingRationaleOpenGroupId] = useState("");
  const [editingProblemGroupId, setEditingProblemGroupId] = useState("");
  const [problemGroupDraftTopic, setProblemGroupDraftTopic] = useState("");
  const [problemGroupDraftInsight, setProblemGroupDraftInsight] = useState("");
  const [problemGroupDraftConclusion, setProblemGroupDraftConclusion] = useState("");
  const [draggingPersonalNoteId, setDraggingPersonalNoteId] = useState("");
  const [dropProblemGroupId, setDropProblemGroupId] = useState("");
  const [, setLeftPanelTab] = useState<LeftPanelTab>("detail");
  const conclusionBatchBusy = false;
  const [problemDefinitionStagePending, setProblemDefinitionStagePending] = useState(false);
  const [summaryDocumentPending, setSummaryDocumentPending] = useState(false);
  const [loadingProblemGroupIds, setLoadingProblemGroupIds] = useState<string[]>([]);
  const [, setProblemDiscussionStatus] = useState("");
  const [sharedSyncEnabled, setSharedSyncEnabled] = useState(true);
  const [importOverrideActive, setImportOverrideActive] = useState(false);
  const {
    nodePositions,
    setNodePositions,
    nodes,
    setNodes,
  } = useCanvasRuntimeState();
  const {
    rightDrawerCollapsed,
    rightDrawerContentVisible,
    rightDrawerNotesCollapsed,
    setRightDrawerNotesCollapsed,
    openRightDrawer,
    closeRightDrawer,
    toggleRightDrawer,
    rightPanelRatio,
    isDesktopLayout,
    startPanelResize,
    solutionRightPaneRef,
  } = useCanvasUiState({
    solutionPaneMeasureKey: stage,
  });
  const {
    endMeetingConfirmOpen,
    endMeetingSaving,
    setEndMeetingSaving,
    endMeetingPreview,
    endMeetingSummaryPreviewMarkdown,
    resetEndMeetingState,
    openEndMeetingConfirm,
    showEndMeetingSummaryPreview,
    handleCancelEndMeeting,
    handleBackToEndMeetingConfirm,
  } = useCanvasEndMeetingState();
  const composerBodyRef = useRef<HTMLTextAreaElement | null>(null);
  const { canvasSurfaceRef, flowRef } = useCanvasFlowRefs();
  const autoProblemDefinitionRef = useRef(false);
  const problemConclusionEntryHandledRef = useRef(false);
  const workspaceLoadedRef = useRef(false);
  const workspaceHydratingRef = useRef(false);
  const lastWorkspaceFieldSignaturesRef = useRef<WorkspaceFieldSignatures>(createWorkspaceFieldSignatures());
  const sharedSyncTimerRef = useRef<number | null>(null);
  const {
    nodePreviewFlushTimerRef,
    liveNodePositionsRef,
    pendingNodePreviewsRef,
    lastNodePreviewFlushAtRef,
    nodePreviewSeqRef,
    lastNodePositionUpdateMsByKeyRef,
    localDraggingNodeIdsRef,
    dragIdByNodeIdRef,
    lastRemoteNodePreviewSeqRef,
    remoteNodePreviewTargetsRef,
    remoteNodePreviewFrameRef,
    ideationBubbleUpdateTickRef,
  } = useCanvasNodeSyncRefs();
  const remoteEditPresenceTimersRef = useRef<Record<string, number>>({});
  const applyingRemoteSharedSyncRef = useRef(false);
  const lastIncomingSharedSyncIdRef = useRef("");
  const lastSharedSyncSignatureRef = useRef("");
  const localNodeOverridesRef = useRef(createLocalNodeOverrideMap());

  useEffect(() => {
    if (!localEditPresenceTarget || !meetingId || !userId) return;

    const target = localEditPresenceTarget;
    const sendPresence = (status: CanvasEditPresencePayload["status"]) => {
      onEditPresenceSync({
        meeting_id: meetingId,
        target_type: target.targetType,
        target_id: target.targetId,
        note_id: target.noteId || "",
        status,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      });
    };

    sendPresence("start");
    const timer = window.setInterval(() => sendPresence("start"), 8_000);
    return () => {
      window.clearInterval(timer);
      sendPresence("stop");
    };
  }, [localEditPresenceTarget, meetingId, onEditPresenceSync, userId]);

  useEffect(() => {
    if (!localEditPresenceTarget) return;
    const stillEditing =
      (localEditPresenceTarget.targetType === "problem_group" &&
        editingProblemGroupId === localEditPresenceTarget.targetId) ||
      (localEditPresenceTarget.targetType === "problem_structure_group" &&
        editingProblemStructureGroupId === localEditPresenceTarget.targetId) ||
      (localEditPresenceTarget.targetType === "problem_structure_node" &&
        editingProblemStructureNodeId === localEditPresenceTarget.targetId);

    if (!stillEditing) {
      setLocalEditPresenceTarget(null);
    }
  }, [
    editingProblemGroupId,
    editingProblemStructureGroupId,
    editingProblemStructureNodeId,
    localEditPresenceTarget,
  ]);

  useEffect(() => {
    if (!incomingEditPresence || incomingEditPresence.meeting_id !== meetingId) return;
    if (incomingEditPresence.updated_by === userId) return;

    const key = makeEditPresenceKey(
      incomingEditPresence.target_type,
      incomingEditPresence.target_id,
      incomingEditPresence.note_id || "",
    );
    if (remoteEditPresenceTimersRef.current[key]) {
      window.clearTimeout(remoteEditPresenceTimersRef.current[key]);
      delete remoteEditPresenceTimersRef.current[key];
    }

    if (incomingEditPresence.status === "stop") {
      setRemoteEditPresenceByKey((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      return;
    }

    setRemoteEditPresenceByKey((current) => ({
      ...current,
      [key]: incomingEditPresence,
    }));
    remoteEditPresenceTimersRef.current[key] = window.setTimeout(() => {
      setRemoteEditPresenceByKey((current) => {
        const currentPresence = current[key];
        if (!currentPresence || currentPresence.updated_at !== incomingEditPresence.updated_at) {
          return current;
        }
        const next = { ...current };
        delete next[key];
        return next;
      });
      delete remoteEditPresenceTimersRef.current[key];
    }, 12_000);
  }, [incomingEditPresence, meetingId, userId]);

  useEffect(
    () => () => {
      Object.values(remoteEditPresenceTimersRef.current).forEach((timer) => window.clearTimeout(timer));
      remoteEditPresenceTimersRef.current = {};
    },
    [],
  );
  const analysisSignatureAtImportRef = useRef("");
  const initialLayoutLogDoneRef = useRef(false);
  const processedProblemUtteranceIdsRef = useRef<Set<string>>(new Set());
  const failedProblemDiscussionRef = useRef<{ signature: string; failedAt: number; detail: string } | null>(null);
  const problemDiscussionFlushTimerRef = useRef<number | null>(null);
  const problemDiscussionInFlightRef = useRef(false);
  const problemStructureRequestSeqRef = useRef(0);
  const ideationKeywordRequestSeqRef = useRef(0);
  const latestSharedWorkspaceRef = useRef<{
    meetingGoal: string;
    meetingGoalContext: string;
    stage: CanvasStage;
    agendaOverrides: Record<string, AgendaOverride>;
    canvasItems: CanvasItemViewModel[];
    customGroups: CustomGroupViewModel[];
    problemGroups: ProblemGroupViewModel[];
    problemStructure: CanvasProblemStructureState;
    finalSolutionSummary: CanvasFinalSolutionSummary;
    nodePositions: CanvasNodePositionsByStage;
    importedState: MeetingState | null;
  }>({
    meetingGoal: "",
    meetingGoalContext: "",
    stage: "ideation",
    agendaOverrides: {},
    canvasItems: [],
    customGroups: [],
    problemGroups: [],
    problemStructure: createDefaultProblemStructureState(),
    finalSolutionSummary: createEmptyFinalSolutionSummary(),
    nodePositions: {},
    importedState: null,
  });
  const latestSharedSyncEnabledRef = useRef(true);

  const persistMeetingGoalEdit = useCallback(
    async (nextGoal: string, nextContext: string) => {
      onMeetingGoalChange(nextGoal);
      onMeetingGoalContextChange(nextContext);
      latestSharedWorkspaceRef.current = {
        ...latestSharedWorkspaceRef.current,
        meetingGoal: nextGoal,
        meetingGoalContext: nextContext,
      };

      await saveCanvasWorkspacePatch({
        meeting_id: meetingId,
        meeting_goal: nextGoal,
        meeting_goal_context: nextContext,
      });

      lastWorkspaceFieldSignaturesRef.current = {
        ...lastWorkspaceFieldSignaturesRef.current,
        meeting_goal: nextGoal,
        meeting_goal_context: nextContext,
      };
      onMeetingGoalSync?.(nextGoal, nextContext);
      setActivityMessage("회의 목표와 관련 맥락을 저장하고 참가자에게 반영했습니다.");
    },
    [meetingId, onMeetingGoalChange, onMeetingGoalContextChange, onMeetingGoalSync],
  );

  const handleMeetingGoalSaveError = useCallback((error: unknown) => {
    console.error("Failed to save meeting goal:", error);
    setActivityMessage("회의 목표 저장에 실패했습니다.");
  }, []);

  const {
    meetingGoalDraft,
    setMeetingGoalDraft,
    meetingGoalContextDraft,
    setMeetingGoalContextDraft,
    meetingGoalEditorDraft,
    setMeetingGoalEditorDraft,
    meetingGoalContextEditorDraft,
    setMeetingGoalContextEditorDraft,
    meetingGoalEditorOpen,
    meetingGoalSaving,
    setMeetingGoalDrafts,
    resetMeetingGoalState,
    handleOpenMeetingGoalEditor,
    handleCancelMeetingGoalEdit,
    handleSaveMeetingGoalEdit,
  } = useCanvasMeetingGoalEditor({
    initialMeetingGoal: meetingGoal,
    initialMeetingGoalContext: meetingGoalContext,
    meetingId,
    onSave: persistMeetingGoalEdit,
    onSaveError: handleMeetingGoalSaveError,
  });

  const analysisStateSignature = useMemo(
    () => buildMeetingStateSignature(analysisState),
    [analysisState],
  );
  const persistedSharedImportedState = useMemo(
    () => (importOverrideActive && importedState ? importedState : analysisState ?? importedState),
    [analysisState, importOverrideActive, importedState],
  );

  const effectiveState = importOverrideActive && importedState ? importedState : analysisState ?? importedState;
  const agendaModels = useMemo(() => {
    const baseModels = buildAgendaModels(effectiveState, agendas, transcripts);
    const hydratedBaseModels = baseModels.map((agenda) => {
      const override = agendaOverrides[agenda.id];
      if (!override) {
        return agenda;
      }

      return {
        ...agenda,
        title: override.title || agenda.title,
        keywords: override.keywords || agenda.keywords,
        summaryBullets: override.summaryBullets || agenda.summaryBullets,
      };
    });

    const customAgendaModels: AgendaViewModel[] = customGroups.map((group) => ({
      id: group.id,
      title: group.title,
      status: "프로젝트 분류",
      keywords: group.keywords || [],
      summaryBullets: [group.description || "프로젝트에서 직접 추가한 그룹 분류입니다."],
      utterances: [],
      decisions: [],
      actionItems: [],
      isCustom: true,
    }));

    return [...hydratedBaseModels, ...customAgendaModels];
  }, [effectiveState, agendas, transcripts, agendaOverrides, customGroups]);
  const canvasItemById = useMemo(
    () => new Map(canvasItems.map((item) => [item.id, item] as const)),
    [canvasItems],
  );
  const flowNodeById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node] as const)),
    [nodes],
  );
  const problemGroupById = useMemo(
    () => new Map(problemGroups.map((group) => [group.group_id, group] as const)),
    [problemGroups],
  );
  const problemStructureNodeById = useMemo(
    () => new Map(problemStructureNodes.map((node) => [node.id, node] as const)),
    [problemStructureNodes],
  );
  const activeMeetingGoal = meetingGoalDraft.trim();
  const meetingTopicForAi = activeMeetingGoal || meetingTitle.trim() || (effectiveState?.meeting_goal || "").trim() || "회의 주제";
  const ideationKeywordUtterances = useMemo(() => buildIdeationKeywordUtterances(transcripts), [transcripts]);
  const localIdeationKeywordBubbles = useMemo(() => buildIdeationKeywordBubbles(transcripts), [transcripts]);
  const ideationKeywordSourceSignature = useMemo(
    () =>
      makeStableSignature({
        version: 2,
        meetingTopic: meetingTopicForAi,
        utterances: ideationKeywordUtterances.map((row) => ({
          id: row.id,
          text: row.text,
        })),
      }),
    [ideationKeywordUtterances, meetingTopicForAi],
  );
  const activeIdeationKeywordBubbles = useMemo(() => {
    if (
      llmIdeationKeywordSignature === ideationKeywordSourceSignature &&
      llmIdeationKeywordBubbles.length > 0
    ) {
      return llmIdeationKeywordBubbles;
    }
    if (!meetingId) {
      return localIdeationKeywordBubbles;
    }
    return [];
  }, [
    ideationKeywordSourceSignature,
    llmIdeationKeywordBubbles,
    llmIdeationKeywordSignature,
    localIdeationKeywordBubbles,
    meetingId,
  ]);
  useEffect(() => {
    ideationBubbleUpdateTickRef.current = 0;
    setIdeationBubbleVisuals([]);
    setIdeationBubbleDebugGrowthById({});
  }, [ideationBubbleUpdateTickRef, meetingId]);
  useEffect(() => {
    if (activeIdeationKeywordBubbles.length === 0) return;
    const tick = ideationBubbleUpdateTickRef.current + 1;
    ideationBubbleUpdateTickRef.current = tick;
    setIdeationBubbleVisuals((current) =>
      buildStableIdeationBubbleVisuals(
        current,
        activeIdeationKeywordBubbles,
        ideationBubbleDebugGrowthById,
        tick,
      ),
    );
  }, [activeIdeationKeywordBubbles, ideationBubbleDebugGrowthById, ideationBubbleUpdateTickRef]);
  const ideationBubbleVisualIdSignature = useMemo(
    () => ideationBubbleVisuals.map((bubble) => bubble.id).join("|"),
    [ideationBubbleVisuals],
  );
  const ideationBubbleVisualIds = useMemo(
    () => (ideationBubbleVisualIdSignature ? ideationBubbleVisualIdSignature.split("|") : []),
    [ideationBubbleVisualIdSignature],
  );
  useEffect(() => {
    if (ideationBubbleVisualIds.length === 0) {
      setIdeationBubbleDebugGrowthById((current) => (Object.keys(current).length === 0 ? current : {}));
      return;
    }
    const activeIds = new Set(ideationBubbleVisualIds);
    setIdeationBubbleDebugGrowthById((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([id]) => activeIds.has(id)));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [ideationBubbleVisualIds]);
  useEffect(() => {
    if (ideationBubbleVisualIds.length === 0) {
      setIdeationBubbleDebugGrowthById((current) => (Object.keys(current).length === 0 ? current : {}));
      return undefined;
    }
    if (!ideationBubbleDebugEnabled || stage !== "ideation") return undefined;

    const activeIds = ideationBubbleVisualIds;
    const selectDebugBubbles = () => {
      const shuffledIds = [...activeIds];
      for (let index = shuffledIds.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffledIds[index], shuffledIds[swapIndex]] = [shuffledIds[swapIndex], shuffledIds[index]];
      }
      const selectedCount = Math.min(shuffledIds.length, Math.random() < 0.58 ? 1 : 2);
      const selectedIds = shuffledIds.slice(0, selectedCount);
      setIdeationBubbleDebugGrowthById((current) => {
        const next = { ...current };
        selectedIds.forEach((id) => {
          next[id] = Math.min(
            CANVAS_IDEATION_BUBBLE_DEBUG_MAX_GROWTH,
            Number(((next[id] || 1) + CANVAS_IDEATION_BUBBLE_DEBUG_GROWTH_STEP).toFixed(3)),
          );
        });
        return next;
      });
    };

    selectDebugBubbles();
    const intervalId = window.setInterval(selectDebugBubbles, CANVAS_IDEATION_BUBBLE_DEBUG_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [ideationBubbleVisualIds, ideationBubbleDebugEnabled, stage]);
  const problemStructureStatePayload = useMemo(
    () =>
      buildProblemStructureStatePayload({
        phase: problemDefinitionPhase,
        method: problemStructureMethod,
        mode: problemDefinitionMode,
        nodes: problemStructureNodes,
        groups: problemStructureGroups,
      }),
    [
      problemDefinitionMode,
      problemDefinitionPhase,
      problemStructureGroups,
      problemStructureMethod,
      problemStructureNodes,
    ],
  );
  const endMeetingSummaryPreviewHtml = useMemo(
    () =>
      endMeetingSummaryPreviewMarkdown
        ? buildPrintableSummaryDocumentHtml(endMeetingSummaryPreviewMarkdown, { includeToolbar: false })
        : "",
    [endMeetingSummaryPreviewMarkdown],
  );
  const buildQuickAskContext = useCallback((): Record<string, unknown> => {
    const sourceTranscriptRows = normalizeTranscriptRows(
      (effectiveState?.transcript?.length ? effectiveState.transcript : transcripts) || [],
    );
    const selectedCanvasNode = flowNodeById.get(selectedNodeId) || null;

    return {
      current_stage: stageLabel(stage),
      meeting_topic: meetingTopicForAi,
      meeting_goal: clipClientText(activeMeetingGoal || meetingGoalDraft || effectiveState?.meeting_goal || "", 600),
      meeting_goal_context: clipClientText(meetingGoalContextDraft || effectiveState?.initial_context || "", 900),
      selected_node_id: selectedNodeId,
      selected_node_label:
        selectedCanvasNode && typeof selectedCanvasNode.data === "object"
          ? clipClientText((selectedCanvasNode.data as { label?: unknown; contentSignature?: unknown }).label || selectedCanvasNode.id, 160)
          : selectedNodeId,
      recent_utterances: sourceTranscriptRows.slice(-32).map((row) => ({
        id: row.id,
        speaker: row.speaker || "참가자",
        text: clipClientText(stripLeadingTimestamp(row.text), 420),
        timestamp: row.timestamp || "",
        canvas_stage: row.canvas_stage || "ideation",
      })),
      canvas_items: canvasItems.slice(0, 30).map((item) => ({
        id: item.id,
        kind: item.kind,
        title: clipClientText(item.title, 120),
        body: clipClientText(item.body, 360),
        status: item.status,
        parent_id: item.parent_topic_id || "",
      })),
      problem_groups: problemGroups.slice(0, 24).map((group) => ({
        id: group.group_id,
        parent_id: group.parent_group_id || "",
        depth: group.depth || 0,
        topic: clipClientText(group.topic, 140),
        conclusion: clipClientText(group.conclusion, 420),
        status: group.status,
        source_summary_items: (group.source_summary_items || []).slice(0, 4).map((item) => clipClientText(item, 180)),
      })),
      problem_structure: {
        phase: problemDefinitionPhase,
        method: problemStructureMethod,
        mode: problemDefinitionMode || "unset",
        groups: problemStructureGroups.slice(0, 20).map((group) => ({
          id: group.id,
          title: clipClientText(group.title, 140),
          status: group.status,
          rationale: clipClientText(group.rationale, 360),
          node_titles: group.nodeIds
            .map((nodeId) => problemStructureNodeById.get(nodeId)?.title || "")
            .filter(Boolean)
            .slice(0, 10),
        })),
      },
      summary_markdown: clipClientText(finalSummaryDocument.markdown, 5000),
    };
  }, [
    activeMeetingGoal,
    canvasItems,
    effectiveState,
    finalSummaryDocument.markdown,
    flowNodeById,
    meetingGoalContextDraft,
    meetingGoalDraft,
    meetingTopicForAi,
    problemDefinitionMode,
    problemDefinitionPhase,
    problemGroups,
    problemStructureGroups,
    problemStructureMethod,
    problemStructureNodeById,
    selectedNodeId,
    stage,
    transcripts,
  ]);
  const {
    quickAskOpen,
    setQuickAskOpen,
    quickAskDraft,
    setQuickAskDraft,
    quickAskMessages,
    quickAskUnreadCount,
    quickAskPendingCount,
    quickAskScrollRef,
    handleToggleQuickAsk,
    handleSubmitQuickAsk,
  } = useCanvasQuickAsk({
    meetingId,
    meetingTopic: meetingTopicForAi,
    stage,
    buildContext: buildQuickAskContext,
  });
  useEffect(() => {
    if (stage !== "ideation") return;
    if (!meetingId || ideationKeywordUtterances.length === 0) {
      setLlmIdeationKeywordBubbles([]);
      setLlmIdeationKeywordSignature("");
      return;
    }
    if (llmIdeationKeywordSignature === ideationKeywordSourceSignature) return;

    const requestSeq = ideationKeywordRequestSeqRef.current + 1;
    ideationKeywordRequestSeqRef.current = requestSeq;
    const timer = window.setTimeout(() => {
      void extractCanvasIdeationKeywords({
        meeting_id: meetingId,
        meeting_topic: meetingTopicForAi,
        utterances: ideationKeywordUtterances,
        max_keywords: 12,
      })
        .then((result) => {
          if (ideationKeywordRequestSeqRef.current !== requestSeq) return;
          if (!result.used_llm) {
            setLlmIdeationKeywordBubbles([]);
            setLlmIdeationKeywordSignature(ideationKeywordSourceSignature);
            return;
          }
          const nextBubbles = normalizeIdeationKeywordBubblesFromResponse(result.keywords || []);
          setLlmIdeationKeywordBubbles(nextBubbles);
          setLlmIdeationKeywordSignature(ideationKeywordSourceSignature);
        })
        .catch((error) => {
          if (ideationKeywordRequestSeqRef.current !== requestSeq) return;
          console.error("Failed to extract ideation keyword bubbles:", error);
        });
    }, 6500);

    return () => window.clearTimeout(timer);
  }, [
    ideationKeywordSourceSignature,
    ideationKeywordUtterances,
    llmIdeationKeywordSignature,
    meetingId,
    meetingTopicForAi,
    stage,
  ]);
  useEffect(() => {
    if (!selectedAgendaId && agendaModels[0]) {
      setSelectedAgendaId(agendaModels[0].id);
    }
  }, [agendaModels, selectedAgendaId]);

  useEffect(() => {
    onCanvasStageContextChange?.({
      stage,
      targetId:
        stage === "problem-definition"
          ? selectedProblemGroupId || ""
          : stage === "ideation"
            ? selectedAgendaId || agendaModels[0]?.id || ""
            : "",
      selectedNodeId,
    });
  }, [
    agendaModels,
    onCanvasStageContextChange,
    selectedAgendaId,
    selectedNodeId,
    selectedProblemGroupId,
    stage,
  ]);

  useEffect(() => {
    autoProblemDefinitionRef.current = false;
    problemConclusionEntryHandledRef.current = false;
    lastIncomingSharedSyncIdRef.current = "";
    lastSharedSyncSignatureRef.current = "";
    applyingRemoteSharedSyncRef.current = false;
    localNodeOverridesRef.current = createLocalNodeOverrideMap();
    lastWorkspaceFieldSignaturesRef.current = createWorkspaceFieldSignatures();
    workspaceLoadedRef.current = false;
    workspaceHydratingRef.current = false;
    analysisSignatureAtImportRef.current = "";
    initialLayoutLogDoneRef.current = false;
    processedProblemUtteranceIdsRef.current = new Set();
    failedProblemDiscussionRef.current = null;
    problemDiscussionInFlightRef.current = false;
    latestSharedWorkspaceRef.current = {
      meetingGoal: "",
      meetingGoalContext: "",
      stage: "ideation",
      agendaOverrides: {},
      canvasItems: [],
      customGroups: [],
      problemGroups: [],
      problemStructure: createDefaultProblemStructureState(),
      finalSolutionSummary: createEmptyFinalSolutionSummary(),
      nodePositions: {},
      importedState: null,
    };
    latestSharedSyncEnabledRef.current = true;
    setImportOverrideActive(false);
    setAgendaOverrides({});
    setCanvasItems([]);
    setCustomGroups([]);
    resetMeetingGoalState();
    resetEndMeetingState();
    onMeetingGoalChange("");
    onMeetingGoalContextChange("");
    setEditingPersonalNoteId("");
    setFinalSummaryDocument(createEmptyFinalSolutionSummary());
    setSummaryDocumentEditMode(false);
    setSummaryEvidenceOpenGroupIds(new Set());
    setSelectedProblemSourceNodeId("");
    setProblemDiscussionStatus("");
    if (sharedSyncTimerRef.current) {
      window.clearTimeout(sharedSyncTimerRef.current);
      sharedSyncTimerRef.current = null;
    }
    if (nodePreviewFlushTimerRef.current) {
      window.clearTimeout(nodePreviewFlushTimerRef.current);
      nodePreviewFlushTimerRef.current = null;
    }
    if (remoteNodePreviewFrameRef.current) {
      window.cancelAnimationFrame(remoteNodePreviewFrameRef.current);
      remoteNodePreviewFrameRef.current = null;
    }
    liveNodePositionsRef.current = {};
    pendingNodePreviewsRef.current = {};
    lastNodePreviewFlushAtRef.current = 0;
    nodePreviewSeqRef.current = 0;
    localDraggingNodeIdsRef.current.clear();
    dragIdByNodeIdRef.current = {};
    lastRemoteNodePreviewSeqRef.current = {};
    remoteNodePreviewTargetsRef.current.clear();
    if (problemDiscussionFlushTimerRef.current) {
      window.clearTimeout(problemDiscussionFlushTimerRef.current);
      problemDiscussionFlushTimerRef.current = null;
    }
  }, [
    dragIdByNodeIdRef,
    lastNodePreviewFlushAtRef,
    lastRemoteNodePreviewSeqRef,
    liveNodePositionsRef,
    localDraggingNodeIdsRef,
    meetingId,
    nodePreviewFlushTimerRef,
    nodePreviewSeqRef,
    onMeetingGoalChange,
    onMeetingGoalContextChange,
    pendingNodePreviewsRef,
    remoteNodePreviewFrameRef,
    remoteNodePreviewTargetsRef,
    resetEndMeetingState,
    resetMeetingGoalState,
  ]);

  useEffect(() => {
    latestSharedWorkspaceRef.current = {
      meetingGoal: meetingGoalDraft.trim(),
      meetingGoalContext: meetingGoalContextDraft.trim(),
      stage,
      agendaOverrides,
      canvasItems,
      customGroups,
      problemGroups,
      problemStructure: problemStructureStatePayload,
      finalSolutionSummary: finalSummaryDocument,
      nodePositions: normalizeCanvasNodePositionsForComputedIdeation(nodePositions),
      importedState: persistedSharedImportedState,
    };
    latestSharedSyncEnabledRef.current = sharedSyncEnabled;
  }, [
    agendaOverrides,
    canvasItems,
    customGroups,
    meetingGoalContextDraft,
    meetingGoalDraft,
    nodePositions,
    persistedSharedImportedState,
    problemGroups,
    problemStructureStatePayload,
    finalSummaryDocument,
    sharedSyncEnabled,
    stage,
  ]);

  useEffect(() => {
    liveNodePositionsRef.current = normalizeCanvasNodePositionsForComputedIdeation(nodePositions);
  }, [liveNodePositionsRef, nodePositions]);

  useEffect(() => {
    remoteNodePreviewTargetsRef.current.clear();
    lastRemoteNodePreviewSeqRef.current = {};
    if (remoteNodePreviewFrameRef.current) {
      window.cancelAnimationFrame(remoteNodePreviewFrameRef.current);
      remoteNodePreviewFrameRef.current = null;
    }
  }, [
    lastRemoteNodePreviewSeqRef,
    remoteNodePreviewFrameRef,
    remoteNodePreviewTargetsRef,
    stage,
  ]);

  useEffect(() => {
    if (!importOverrideActive) {
      return;
    }

    if (!analysisSignatureAtImportRef.current) {
      return;
    }

    if (analysisStateSignature && analysisStateSignature !== analysisSignatureAtImportRef.current) {
      setImportOverrideActive(false);
    }
  }, [analysisStateSignature, importOverrideActive]);

  useEffect(() => {
    if (!workspaceLoadedRef.current || workspaceHydratingRef.current) {
      return;
    }
    if (initialLayoutLogDoneRef.current) {
      return;
    }
    if (stage !== "ideation" || nodes.length === 0) {
      return;
    }

    initialLayoutLogDoneRef.current = true;
    console.info("[canvas initial layout]", {
      meetingId,
      stage,
      nodePositions: summarizeNodePositionsForDebug(nodePositions),
      renderedNodes: summarizeRenderedNodesForDebug(nodes),
    });
  }, [meetingId, nodePositions, nodes, stage]);

  useCanvasWorkspaceLoader({
    analysisSignatureAtImportRef,
    captureProblemPhaseOverride,
    captureStageOverride,
    hydrateCanvasItems,
    hydrateCustomGroups,
    hydrateProblemGroups,
    lastSharedSyncSignatureRef,
    lastWorkspaceFieldSignaturesRef,
    meetingId,
    onMeetingGoalChange,
    onMeetingGoalContextChange,
    resetProblemStructureEditorState,
    setAgendaOverrides,
    setCanvasItems,
    setCollapsedProblemGroupIds,
    setCustomGroups,
    setEditingProblemGroupId,
    setFinalSummaryDocument,
    setImportedState,
    setImportOverrideActive,
    setLoadingProblemGroupIds,
    setMeetingGoalDrafts,
    setNodePositions,
    setPersonalNotes,
    setProblemDefinitionMode,
    setProblemDefinitionPhase,
    setProblemDefinitionStagePending,
    setProblemGroupingRationaleById,
    setProblemGroupingRationaleOpenGroupId,
    setProblemGroupingRationalePendingId,
    setProblemGroups,
    setProblemStructureDraftMethod,
    setProblemStructureDraftMode,
    setProblemStructureGroups,
    setProblemStructureMethod,
    setProblemStructureNodes,
    setProblemStructurePending,
    setProblemStructureSetupOpen,
    setSelectedCanvasItemId,
    setSelectedNodeId,
    setSelectedProblemGroupId,
    setSharedSyncEnabled,
    setStage,
    setSummaryDocumentEditMode,
    setSummaryDocumentPending,
    setSummaryEvidenceOpenGroupIds,
    userId,
    workspaceHydratingRef,
    workspaceLoadedRef,
  });

  useEffect(() => {
    if (audioImportRevision <= 0) {
      return;
    }

    setAgendaOverrides({});
    setCanvasItems([]);
    setImportedState(null);
    setImportOverrideActive(false);
    setProblemGroups([]);
    setNodePositions({});
    setStage("ideation");
    setSelectedProblemGroupId("");
    setSelectedCanvasItemId("");
    setSelectedNodeId("");
    setEditingProblemGroupId("");
    resetProblemStructureEditorState();
    setCollapsedProblemGroupIds(new Set());
    setProblemGroupingRationaleById({});
    setProblemGroupingRationalePendingId("");
    setProblemGroupingRationaleOpenGroupId("");
    setAgendaOverrides({});
    setEditingPersonalNoteId("");
    setLeftPanelTab("detail");
    setActivityMessage("새 오디오 전사를 기준으로 canvas를 초기화했습니다.");
  }, [audioImportRevision, resetProblemStructureEditorState, setNodePositions]);

  useEffect(() => {
    if (problemGroups.length === 0) {
      setSelectedProblemGroupId("");
      setEditingProblemGroupId("");
      return;
    }

    if (problemDefinitionPhase === "structure") {
      return;
    }

    if (!selectedProblemGroupId || !problemGroups.some((group) => group.group_id === selectedProblemGroupId)) {
      setSelectedProblemGroupId(problemGroups[0].group_id);
    }
  }, [problemDefinitionPhase, problemGroups, selectedProblemGroupId]);

  useEffect(() => {
    const validGroupIds = new Set(problemGroups.map((group) => group.group_id));
    setCollapsedProblemGroupIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((groupId) => {
        if (validGroupIds.has(groupId)) {
          next.add(groupId);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    setProblemGroupingRationaleById((prev) => {
      const nextEntries = Object.entries(prev).filter(([groupId]) => validGroupIds.has(groupId));
      if (nextEntries.length === Object.keys(prev).length) return prev;
      return Object.fromEntries(nextEntries);
    });
    setProblemGroupingRationaleOpenGroupId((prev) => (prev && !validGroupIds.has(prev) ? "" : prev));
    setProblemGroupingRationalePendingId((prev) => (prev && !validGroupIds.has(prev) ? "" : prev));
  }, [problemGroups]);

  useEffect(() => {
    if (canvasItems.length === 0) {
      setSelectedCanvasItemId("");
      return;
    }

    if (!selectedCanvasItemId || !canvasItems.some((item) => item.id === selectedCanvasItemId)) {
      setSelectedCanvasItemId("");
    }
  }, [canvasItems, selectedCanvasItemId]);

  useEffect(() => {
    if (!selectedNodeId) return;
    if (!nodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId("");
    }
  }, [nodes, selectedNodeId]);

  useEffect(() => {
    if (stage !== "problem-definition") {
      setEditingProblemGroupId("");
    }
  }, [stage]);

  useEffect(() => {
    if (sharedSyncEnabled) {
      localNodeOverridesRef.current = createLocalNodeOverrideMap();
    }
  }, [sharedSyncEnabled]);

  useEffect(() => {
    setMeetingGoalDraft(meetingGoal);
    if (!meetingGoalEditorOpen) {
      setMeetingGoalEditorDraft(meetingGoal);
    }
  }, [meetingGoal, meetingGoalEditorOpen, setMeetingGoalDraft, setMeetingGoalEditorDraft]);

  useEffect(() => {
    setMeetingGoalContextDraft(meetingGoalContext);
    if (!meetingGoalEditorOpen) {
      setMeetingGoalContextEditorDraft(meetingGoalContext);
    }
  }, [
    meetingGoalContext,
    meetingGoalEditorOpen,
    setMeetingGoalContextDraft,
    setMeetingGoalContextEditorDraft,
  ]);

  const buildProblemGroupingRationalePayload = useCallback(
    (group: ProblemGroupViewModel) => ({
      meeting_id: meetingId,
      meeting_topic: meetingTopicForAi,
      group: {
        group_id: group.group_id,
        topic: group.topic,
        insight_lens: group.insight_lens || "",
        conclusion: group.conclusion || "",
        agenda_titles: group.agenda_titles || [],
        source_summary_items: group.source_summary_items || [],
        evidence_utterance_ids: group.evidence_utterance_ids || [],
        ideas: (group.ideas || []).map((idea) => ({
          id: idea.id,
          kind: idea.kind,
          title: idea.title,
          body: idea.body,
        })),
      },
      child_groups: problemGroups
        .filter((item) => item.parent_group_id === group.group_id)
        .map((item) => ({
          group_id: item.group_id,
          topic: item.topic,
          insight_lens: item.insight_lens || "",
          conclusion: item.conclusion || "",
        })),
    }),
    [meetingId, meetingTopicForAi, problemGroups],
  );

  const {
    buildCurrentWorkspacePatchPayload,
    forceBroadcastSharedCanvas,
  } = useSharedCanvasBroadcast({
    agendaOverrides,
    applyingRemoteSharedSyncRef,
    canvasItems,
    customGroups,
    finalSummaryDocument,
    importedState: persistedSharedImportedState,
    incomingCanvasStateRequestId,
    lastNodePreviewFlushAtRef,
    lastSharedSyncSignatureRef,
    meetingGoalContextDraft,
    meetingGoalDraft,
    meetingId,
    nodePositions,
    nodePreviewFlushTimerRef,
    onSharedCanvasSync,
    pendingNodePreviewsRef,
    problemGroups,
    problemStructureStatePayload,
    sharedSyncEnabled,
    sharedSyncTimerRef,
    stage,
    userId,
    workspaceHydratingRef,
    workspaceLoadedRef,
  });

  useCanvasPersistence({
    agendaOverrides,
    applyingRemoteSharedSyncRef,
    buildCurrentWorkspacePatchPayload,
    captureStageOverride,
    canvasItems,
    conclusionBatchBusy,
    customGroups,
    finalSummaryDocument,
    importOverrideActive,
    lastWorkspaceFieldSignaturesRef,
    latestSharedSyncEnabledRef,
    latestSharedWorkspaceRef,
    meetingGoalContextDraft,
    meetingGoalDraft,
    meetingId,
    nodePositions,
    onMeetingGoalSync,
    persistedSharedImportedState,
    personalNotes,
    problemDefinitionStagePending,
    problemGroups,
    problemStructureStatePayload,
    sharedSyncEnabled,
    stage,
    summaryDocumentPending,
    userId,
    workspaceHydratingRef,
    workspaceLoadedRef,
  });

  const {
    broadcastNodePositionCommit,
    ensureRemoteNodePreviewAnimation,
    flushPendingNodePreviews,
    scheduleNodePreview,
  } = useCanvasNodePreviewSync({
    applyingRemoteSharedSyncRef,
    dragIdByNodeIdRef,
    incomingNodePreview,
    lastNodePositionUpdateMsByKeyRef,
    lastNodePreviewFlushAtRef,
    lastRemoteNodePreviewSeqRef,
    lastWorkspaceFieldSignaturesRef,
    latestSharedSyncEnabledRef,
    localDraggingNodeIdsRef,
    meetingId,
    nodePreviewFlushTimerRef,
    nodePreviewSeqRef,
    onNodePreviewSync,
    onSharedCanvasSync,
    pendingNodePreviewsRef,
    remoteNodePreviewFrameRef,
    remoteNodePreviewTargetsRef,
    setNodes,
    stage,
    userId,
    workspaceHydratingRef,
    workspaceLoadedRef,
  });

  const applyServerProblemWorkspace = useCallback(
    (workspace: CanvasWorkspaceStateResponse | undefined | null) => {
      if (!workspace || workspace.meeting_id !== meetingId) return;

      const nextProblemGroups = hydrateProblemGroups(workspace.problem_groups || [], problemGroups);
      const nextProblemStructure = hydrateProblemStructureState(
        workspace.problem_structure || problemStructureStatePayload,
        nextProblemGroups,
      );
      const nextProblemStructurePayload = buildProblemStructureStatePayload(nextProblemStructure);
      const nextNodePositions = normalizeCanvasNodePositionsForComputedIdeation(workspace.node_positions || nodePositions);
      (workspace.problem_processed_utterance_ids || []).forEach((id) => {
        if (id) processedProblemUtteranceIdsRef.current.add(id);
      });

      setProblemGroups(nextProblemGroups);
      setProblemDefinitionMode(nextProblemStructure.mode);
      setProblemDefinitionPhase(nextProblemStructure.phase);
      setProblemStructureMethod(nextProblemStructure.method);
      setProblemStructureDraftMethod(nextProblemStructure.method);
      setProblemStructureDraftMode(nextProblemStructure.mode || "ai");
      setProblemStructureNodes(nextProblemStructure.nodes);
      setProblemStructureGroups(nextProblemStructure.groups);
      setProblemStructurePending(false);
      setNodePositions(nextNodePositions);
      latestSharedWorkspaceRef.current = {
        ...latestSharedWorkspaceRef.current,
        problemGroups: nextProblemGroups,
        problemStructure: nextProblemStructurePayload,
        nodePositions: nextNodePositions,
        importedState: persistedSharedImportedState,
      };

      if (sharedSyncEnabled) {
        writeSharedWorkspaceSessionCache(
          meetingId,
          buildCurrentWorkspacePatchPayload({
            problemGroups: nextProblemGroups,
            problemStructure: nextProblemStructurePayload,
            nodePositions: nextNodePositions,
          }),
        );
        forceBroadcastSharedCanvas({
          problemGroups: nextProblemGroups,
          problemStructure: nextProblemStructurePayload,
          nodePositions: nextNodePositions,
        });
      }
    },
    [
      buildCurrentWorkspacePatchPayload,
      forceBroadcastSharedCanvas,
      meetingId,
      nodePositions,
      persistedSharedImportedState,
      problemGroups,
      problemStructureStatePayload,
      setNodePositions,
      sharedSyncEnabled,
    ],
  );

  useEffect(() => {
    const evidenceIds = new Set<string>();
    problemGroups.forEach((group) => {
      (group.discussion_items || []).forEach((item) => {
        (item.evidence_utterance_ids || []).forEach((id) => evidenceIds.add(id));
        (item.ignored_utterance_ids || []).forEach((id) => evidenceIds.add(id));
      });
    });
    evidenceIds.forEach((id) => processedProblemUtteranceIdsRef.current.add(id));
  }, [problemGroups]);

  useEffect(() => {
    return () => {
      if (problemDiscussionFlushTimerRef.current) {
        window.clearTimeout(problemDiscussionFlushTimerRef.current);
      }
    };
  }, []);

  const { handleShowProblemGroupingRationale } = useProblemGroupingRationale({
    buildProblemGroupingRationalePayload,
    meetingId,
    problemGroupingRationaleById,
    setActivityMessage,
    setProblemGroupingRationaleById,
    setProblemGroupingRationaleOpenGroupId,
    setProblemGroupingRationalePendingId,
  });

  const { handleAttachPersonalNoteToProblemGroup } = useProblemGroupRelationships({
    buildCurrentWorkspacePatchPayload,
    forceBroadcastSharedCanvas,
    latestSharedWorkspaceRef,
    meetingId,
    persistedSharedImportedState,
    personalNotes,
    problemGroupById,
    problemGroups,
    serializeSharedProblemGroups: buildWorkspaceProblemGroupsPayload,
    sharedSyncEnabled,
    stage,
    writeSharedWorkspaceSessionCache,
    setActivityMessage,
    setCollapsedProblemGroupIds,
    setDraggingPersonalNoteId,
    setDropProblemGroupId,
    setLeftPanelTab,
    setProblemGroups,
    setSelectedNodeId,
    setSelectedProblemGroupId,
  });

  const flushProblemDiscussionBuffer = useCallback(
    async (reason: "timer" | "silence" | "stage-change" | "manual") => {
      if (!meetingId || problemDiscussionInFlightRef.current || problemGroups.length === 0) {
        return;
      }

      const processedIds = processedProblemUtteranceIdsRef.current;
      const normalizedTranscriptRows = normalizeTranscriptRows(transcripts);
      const selectedGroupId = selectedProblemGroupId || problemGroups[0]?.group_id || "";
      const validGroupIds = new Set(problemGroups.map((group) => group.group_id));
      const eligibleRows = normalizedTranscriptRows.filter(
        (row) =>
          row.canvas_stage === "problem-definition" &&
          row.id &&
          row.text.trim() &&
          !processedIds.has(row.id),
      );
      const hasRowsForSelectedGroup = eligibleRows.some(
        (row) => !row.canvas_target_id || row.canvas_target_id === selectedGroupId,
      );
      const fallbackTargetGroupId =
        eligibleRows.find((row) => row.canvas_target_id && validGroupIds.has(row.canvas_target_id))?.canvas_target_id || "";
      const targetGroupId = hasRowsForSelectedGroup ? selectedGroupId : fallbackTargetGroupId || selectedGroupId;
      const targetRows = eligibleRows.filter((row) =>
        row.canvas_target_id ? row.canvas_target_id === targetGroupId : targetGroupId === selectedGroupId,
      );
      const targetTextLength = targetRows.reduce((sum, row) => sum + stripLeadingTimestamp(row.text).length, 0);
      if (targetRows.length === 0 || (reason !== "stage-change" && reason !== "manual" && targetTextLength < 30)) {
        if (eligibleRows.length > 0) {
          setProblemDiscussionStatus(`문제정의 의견 정리 대기 중 · ${eligibleRows.length}개 발화`);
        }
        return;
      }

      const targetSignature = targetRows.map((row) => row.id).join("|");
      const previousFailure = failedProblemDiscussionRef.current;
      if (previousFailure?.signature === targetSignature) {
        const retryAfter = CANVAS_LLM_FAILURE_RETRY_DELAY_MS - (Date.now() - previousFailure.failedAt);
        if (retryAfter > 0) {
          setProblemDiscussionStatus(`같은 문제정의 발화 재요청 대기 중 · ${Math.ceil(retryAfter / 1000)}초`);
          return;
        }
      }

      problemDiscussionInFlightRef.current = true;
      setProblemDiscussionStatus("AI가 문제정의 의견을 정리 중");

      try {
        const firstTargetIndex = transcripts.findIndex((row) => row.id === targetRows[0]?.id);
        const contextRows =
          firstTargetIndex > 0 ? normalizeTranscriptRows(transcripts.slice(Math.max(0, firstTargetIndex - 6), firstTargetIndex)) : [];
        const started = await startCanvasProblemDiscussionWorkspace({
          meeting_id: meetingId,
          meeting_topic: meetingTopicForAi,
          selected_group_id: targetGroupId,
          context_utterances: contextRows.map((row) => ({
            id: row.id,
            speaker: row.speaker || "참가자",
            text: stripLeadingTimestamp(row.text),
            timestamp: row.timestamp || "",
          })),
          target_utterances: targetRows.map((row) => ({
            id: row.id,
            speaker: row.speaker || "참가자",
            text: stripLeadingTimestamp(row.text),
            timestamp: row.timestamp || "",
          })),
        });

        applyServerProblemWorkspace(started.workspace);
        if (started.status !== "processing" || !started.job_id) {
          if (started.status === "error") {
            failedProblemDiscussionRef.current = {
              signature: targetSignature,
              failedAt: Date.now(),
              detail: started.detail || started.warning || "문제정의 의견 정리 실패",
            };
          }
          setProblemDiscussionStatus(started.detail || "문제정의 의견 정리 상태를 확인했습니다.");
          return;
        }

        let finalResult = started;
        for (let attempt = 0; attempt < 90; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 900));
          finalResult = await getCanvasProblemDiscussionWorkspaceJob(meetingId, started.job_id);
          if (finalResult.status !== "processing") {
            applyServerProblemWorkspace(finalResult.workspace);
            break;
          }
        }

        if (finalResult.status === "completed") {
          failedProblemDiscussionRef.current = null;
          targetRows.forEach((row) => processedIds.add(row.id));
          setProblemDiscussionStatus(finalResult.used_llm ? "AI 문제정의 의견 반영됨" : "LLM 응답 없음");
        } else if (finalResult.status === "error") {
          failedProblemDiscussionRef.current = {
            signature: targetSignature,
            failedAt: Date.now(),
            detail: finalResult.detail || finalResult.warning || "문제정의 의견 정리 실패",
          };
          setProblemDiscussionStatus(finalResult.detail || "문제정의 의견 정리 실패");
        } else {
          setProblemDiscussionStatus("문제정의 의견 정리 응답 대기 중");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failedProblemDiscussionRef.current = {
          signature: targetSignature,
          failedAt: Date.now(),
          detail: message,
        };
        setProblemDiscussionStatus(`문제정의 의견 정리 실패: ${message}`);
      } finally {
        problemDiscussionInFlightRef.current = false;
        const hasRemainingRows = normalizeTranscriptRows(transcripts).some(
          (row) =>
            row.canvas_stage === "problem-definition" &&
            row.id &&
            row.text.trim() &&
            !processedProblemUtteranceIdsRef.current.has(row.id),
        );
        if (stage === "problem-definition" && hasRemainingRows) {
          if (problemDiscussionFlushTimerRef.current) {
            window.clearTimeout(problemDiscussionFlushTimerRef.current);
          }
          problemDiscussionFlushTimerRef.current = window.setTimeout(
            () => void flushProblemDiscussionBuffer("timer"),
            1_000,
          );
        }
      }
    },
    [
      applyServerProblemWorkspace,
      meetingId,
      meetingTopicForAi,
      problemGroups,
      selectedProblemGroupId,
      stage,
      transcripts,
    ],
  );

  useEffect(() => {
    if (stage !== "problem-definition" || problemGroups.length === 0) {
      return;
    }

    const normalizedRows = normalizeTranscriptRows(transcripts);
    const hasUnprocessedRows = normalizedRows.some(
      (row) =>
        row.canvas_stage === "problem-definition" &&
        row.id &&
        row.text.trim() &&
        !processedProblemUtteranceIdsRef.current.has(row.id),
    );
    if (!hasUnprocessedRows) {
      return;
    }

    const timer = window.setTimeout(() => {
      void flushProblemDiscussionBuffer("silence");
    }, CANVAS_LLM_SILENCE_FLUSH_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [flushProblemDiscussionBuffer, problemGroups.length, stage, transcripts]);

  useSharedCanvasIncomingSync({
    analysisSignatureAtImportRef,
    applyingRemoteSharedSyncRef,
    ensureRemoteNodePreviewAnimation,
    hydrateCanvasItems,
    hydrateCustomGroups,
    hydrateProblemGroups,
    incomingSharedCanvasSync,
    lastIncomingSharedSyncIdRef,
    lastNodePositionUpdateMsByKeyRef,
    lastSharedSyncSignatureRef,
    lastWorkspaceFieldSignaturesRef,
    latestSharedWorkspaceRef,
    liveNodePositionsRef,
    localDraggingNodeIdsRef,
    localNodeOverridesRef,
    meetingId,
    nodePositions,
    onMeetingGoalChange,
    onMeetingGoalContextChange,
    problemDefinitionMode,
    problemDefinitionPhase,
    problemGroups,
    problemStructureMethod,
    remoteNodePreviewTargetsRef,
    setActivityMessage,
    setAgendaOverrides,
    setCanvasItems,
    setCustomGroups,
    setFinalSummaryDocument,
    setImportedState,
    setImportOverrideActive,
    setMeetingGoalDrafts,
    setNodePositions,
    setProblemGroups,
    setProblemStructureGroups,
    setProblemStructureNodes,
    setProblemStructurePending,
    setSummaryDocumentDraftDirty,
    setSummaryDocumentDraftMarkdown,
    setSummaryDocumentEditMode,
    sharedSyncEnabled,
    stage,
    userId,
    workspaceHydratingRef,
    workspaceLoadedRef,
  });

  const commitProblemGroupsSnapshot = useCallback(
    (nextGroups: ProblemGroupViewModel[], message: string, selectedGroupId?: string) => {
      const resolvedSelectedGroupId = selectedGroupId || selectedProblemGroupId || nextGroups[0]?.group_id || "";
      setProblemGroups(nextGroups);
      setSelectedProblemGroupId(resolvedSelectedGroupId);
      setSelectedNodeId(resolvedSelectedGroupId ? `problem-${resolvedSelectedGroupId}` : "");
      latestSharedWorkspaceRef.current = {
        ...latestSharedWorkspaceRef.current,
        stage,
        problemGroups: nextGroups,
        importedState: persistedSharedImportedState,
      };

      if (sharedSyncEnabled) {
        forceBroadcastSharedCanvas({
          problemGroups: nextGroups,
        });
        if (meetingId) {
          void saveCanvasWorkspacePatch({
            meeting_id: meetingId,
            problem_groups: buildWorkspaceProblemGroupsPayload(nextGroups),
            imported_state: persistedSharedImportedState,
          }).catch((error) => {
            console.error("Failed to save problem groups:", error);
          });
        }
      }

      setActivityMessage(message);
    },
    [
      forceBroadcastSharedCanvas,
      meetingId,
      persistedSharedImportedState,
      selectedProblemGroupId,
      sharedSyncEnabled,
      stage,
    ],
  );

  const { handleGenerateProblemChildren, problemChildGenerationPendingId } = useProblemChildGeneration({
    buildExistingGroupsPayload: buildProblemTaxonomyExistingGroupsPayload,
    commitProblemGroupsSnapshot,
    hydrateProblemGroups,
    meetingId,
    meetingTopicForAi,
    problemGroups,
    setActivityMessage,
    setCollapsedProblemGroupIds,
  });

  const {
    handleCancelProblemGroupEdit,
    handleDeleteProblemGroup,
    handleQuickEditProblemGroup,
    handleSaveProblemGroupEdit,
    handleSetProblemGroupStatus,
    handleToggleProblemChildren,
  } = useProblemGroupActions({
    commitProblemGroupsSnapshot,
    problemGroupDraftConclusion,
    problemGroupDraftInsight,
    problemGroupDraftTopic,
    problemDefinitionPhase,
    problemGroups,
    selectedProblemGroupId,
    setActivityMessage,
    setCollapsedProblemGroupIds,
    setEditingProblemGroupId,
    setLocalEditPresenceTarget,
    setProblemGroupDraftConclusion,
    setProblemGroupDraftInsight,
    setProblemGroupDraftTopic,
    setProblemGroups,
    setSelectedNodeId,
    setSelectedProblemGroupId,
  });

  const {
    handleBackToProblemDefinitionExplore,
    handleOpenProblemStructureSetup,
    handleRefreshProblemStructureNodes,
    handleStartProblemStructure,
    runProblemStructureGrouping,
  } = useProblemStructureGeneration({
    meetingId,
    meetingTopicForAi,
    problemDefinitionMode,
    problemGroups,
    problemStructureDraftMethod,
    problemStructureDraftMode,
    problemStructureGroups,
    problemStructureMethod,
    problemStructureNodes,
    problemStructureRequestSeqRef,
    selectedProblemGroupId,
    setActivityMessage,
    setProblemDefinitionMode,
    setProblemDefinitionPhase,
    setProblemGroupingRationaleOpenGroupId,
    setProblemStructureDraftMethod,
    setProblemStructureDraftMode,
    setProblemStructureGroups,
    setProblemStructureMethod,
    setProblemStructureNodes,
    setProblemStructurePending,
    setProblemStructureSetupOpen,
    setSelectedNodeId,
    setSelectedProblemGroupId,
  });

  const problemExploreLayout = useMemo(
    () =>
      buildProblemExploreLayout({
        collapsedProblemGroupIds,
        problemGroups,
        problemGroupHeightOverrides: editingProblemGroupId ? { [editingProblemGroupId]: 420 } : undefined,
        selectedProblemGroupId,
      }),
    [collapsedProblemGroupIds, editingProblemGroupId, problemGroups, selectedProblemGroupId],
  );

  const graphBlueprint = useMemo(() => {
    if (stage === "problem-definition") {
      if (problemDefinitionPhase === "structure") {
        return buildProblemStructureCanvasBlueprint({
          editingProblemStructureGroupId,
          editingProblemStructureNodeId,
          fallbackProblemGroups: problemGroups,
          nodePositions,
          onCancelProblemStructureGroupEdit: handleCancelProblemStructureGroupEdit,
          onCancelProblemStructureNodeEdit: handleCancelProblemStructureNodeEdit,
          onDeleteProblemStructureGroup: handleDeleteProblemStructureGroup,
          onProblemStructureGroupDragOver: handleProblemStructureGroupDragOver,
          onProblemStructureGroupDrop: handleProblemStructureGroupDrop,
          onProblemStructureGroupDraftRationaleChange: setProblemStructureGroupDraftRationale,
          onProblemStructureGroupDraftTitleChange: setProblemStructureGroupDraftTitle,
          onProblemStructureNodeDragEnd: handleProblemStructureNodeDragEnd,
          onProblemStructureNodeDragOver: handleProblemStructureNodeDragOver,
          onProblemStructureNodeDragStart: handleProblemStructureNodeDragStart,
          onProblemStructureNodeDrop: handleProblemStructureNodeDrop,
          onProblemStructureNodeDraftTitleChange: setProblemStructureNodeDraftTitle,
          onRemoveProblemStructureNode: handleRemoveProblemStructureNode,
          onSaveProblemStructureGroupEdit: handleSaveProblemStructureGroupEdit,
          onSaveProblemStructureNodeEdit: handleSaveProblemStructureNodeEdit,
          onStartProblemStructureGroupEdit: handleStartProblemStructureGroupEdit,
          onStartProblemStructureNodeEdit: handleStartProblemStructureNodeEdit,
          onUpdateProblemStructureGroupStatus: handleUpdateProblemStructureGroupStatus,
          problemDefinitionMode,
          problemDefinitionPhase,
          problemStructureDrag,
          problemStructureGroupDraftRationale,
          problemStructureGroupDraftTitle,
          problemStructureGroups,
          problemStructureMethod,
          problemStructureNodeDraftTitle,
          problemStructureNodes,
          remoteEditPresenceByKey,
          stage,
        });
      }

      return buildProblemExploreCanvasBlueprint({
        collapsedProblemGroupIds,
        dropProblemGroupId,
        getProblemGroupSourceCount: (group) => buildProblemGroupDisplayCards(group).length,
        loadingProblemGroupIds,
        nodePositions,
        onAttachPersonalNoteToProblemGroup: handleAttachPersonalNoteToProblemGroup,
        onCancelProblemGroupEdit: handleCancelProblemGroupEdit,
        onDeleteProblemGroup: handleDeleteProblemGroup,
        onDropProblemGroupChange: setDropProblemGroupId,
        onGenerateProblemChildren: (group) => {
          void handleGenerateProblemChildren(group);
        },
        onProblemGroupDraftConclusionChange: setProblemGroupDraftConclusion,
        onProblemGroupDraftInsightChange: setProblemGroupDraftInsight,
        onProblemGroupDraftTopicChange: setProblemGroupDraftTopic,
        onQuickEditProblemGroup: handleQuickEditProblemGroup,
        onSaveProblemGroupEdit: handleSaveProblemGroupEdit,
        onShowProblemGroupingRationale: (group) => {
          void handleShowProblemGroupingRationale(group);
        },
        onToggleProblemChildren: handleToggleProblemChildren,
        problemChildGenerationPendingId,
        problemExploreLayout,
        editingProblemGroupId,
        problemGroupDraftConclusion,
        problemGroupDraftInsight,
        problemGroupDraftTopic,
        problemGroupingRationaleById,
        problemGroupingRationalePendingId,
        problemGroups,
        remoteEditPresenceByKey,
        stage,
      });
    }

    if (stage === "solution") {
      return {
        layoutSignature: buildNodeContentSignature([stage, "summary-document"]),
        nodeDescriptors: [],
      };
    }

    return buildIdeationKeywordBubbleBlueprint({
      bubbles: ideationBubbleVisuals,
      debugGrowthById: ideationBubbleDebugGrowthById,
      layoutRevision: ideationBubbleLayoutRevision,
      stage,
    });
  }, [
    stage,
    ideationBubbleVisuals,
    ideationBubbleDebugGrowthById,
    ideationBubbleLayoutRevision,
    collapsedProblemGroupIds,
    dropProblemGroupId,
    editingProblemGroupId,
    handleAttachPersonalNoteToProblemGroup,
    handleCancelProblemGroupEdit,
    handleDeleteProblemGroup,
    handleDeleteProblemStructureGroup,
    handleGenerateProblemChildren,
    handleProblemStructureGroupDragOver,
    handleProblemStructureGroupDrop,
    handleProblemStructureNodeDragEnd,
    handleProblemStructureNodeDragOver,
    handleProblemStructureNodeDragStart,
    handleProblemStructureNodeDrop,
    handleRemoveProblemStructureNode,
    handleCancelProblemStructureGroupEdit,
    handleCancelProblemStructureNodeEdit,
    handleSaveProblemStructureGroupEdit,
    handleSaveProblemStructureNodeEdit,
    handleStartProblemStructureGroupEdit,
    handleStartProblemStructureNodeEdit,
    handleUpdateProblemStructureGroupStatus,
    handleQuickEditProblemGroup,
    handleSaveProblemGroupEdit,
    handleShowProblemGroupingRationale,
    handleToggleProblemChildren,
    loadingProblemGroupIds,
    nodePositions,
    problemChildGenerationPendingId,
    problemDefinitionMode,
    problemDefinitionPhase,
    problemExploreLayout,
    problemGroupDraftConclusion,
    problemGroupDraftInsight,
    problemGroupDraftTopic,
    problemGroupingRationaleById,
    problemGroupingRationalePendingId,
    problemGroups,
    problemStructureDrag,
    editingProblemStructureGroupId,
    editingProblemStructureNodeId,
    problemStructureGroupDraftRationale,
    problemStructureGroupDraftTitle,
    problemStructureGroups,
    problemStructureMethod,
    problemStructureNodeDraftTitle,
    problemStructureNodes,
    remoteEditPresenceByKey,
    setProblemStructureGroupDraftRationale,
    setProblemStructureGroupDraftTitle,
    setProblemStructureNodeDraftTitle,
  ]);

  useEffect(() => {
    if (!workspaceLoadedRef.current || workspaceHydratingRef.current) {
      return;
    }

    const stageKey = stage;
    setNodePositions((prev) => {
      const currentStagePositions = prev[stageKey] || {};
      const validNodeIds = new Set(graphBlueprint.nodeDescriptors.map((descriptor) => descriptor.id));
      if (stageKey === "problem-definition") {
        problemGroups.forEach((group) => validNodeIds.add(`problem-${group.group_id}`));
      }
      const nextStageEntries = Object.entries(currentStagePositions).filter(
        ([nodeId]) => validNodeIds.has(nodeId) && (stageKey !== "ideation" || nodeId.startsWith("agenda-")),
      );

      if (nextStageEntries.length === Object.keys(currentStagePositions).length) {
        return prev;
      }

      return normalizeCanvasNodePositionsForComputedIdeation({
        ...prev,
        [stageKey]: Object.fromEntries(nextStageEntries),
      });
    });
  }, [graphBlueprint.layoutSignature, graphBlueprint.nodeDescriptors, problemGroups, setNodePositions, stage]);

  useEffect(() => {
    const preserveNodeIds = new Set<string>([
      ...remoteNodePreviewTargetsRef.current.keys(),
      ...localDraggingNodeIdsRef.current,
    ]);
    setNodes((current) =>
      reconcileNodes(current, graphBlueprint.nodeDescriptors, preserveNodeIds),
    );
  }, [graphBlueprint, localDraggingNodeIdsRef, remoteNodePreviewTargetsRef, setNodes]);

  const projectPersonalNotes = useMemo(
    () => personalNotes.filter((note) => !note.projectId || note.projectId === meetingId),
    [meetingId, personalNotes],
  );
  const selectedProblemGroup = useMemo(
    () =>
      problemDefinitionPhase === "structure"
        ? null
        : problemGroupById.get(selectedProblemGroupId) || problemGroups[0] || null,
    [problemDefinitionPhase, problemGroupById, problemGroups, selectedProblemGroupId],
  );
  const selectedProblemSourceCards = useMemo(
    () => (selectedProblemGroup ? buildProblemGroupDisplayCards(selectedProblemGroup).filter((card) => card.attachable) : []),
    [selectedProblemGroup],
  );
  const summaryDocumentSections = useMemo(
    () => finalSummaryDocument.sections || [],
    [finalSummaryDocument.sections],
  );
  const summaryDocumentSectionByGroupId = useMemo(
    () => new Map(summaryDocumentSections.map((section) => [section.group_id, section])),
    [summaryDocumentSections],
  );
  const summaryEligibleStructureGroups = useMemo(
    () => getSummaryEligibleStructureGroups(problemStructureGroups),
    [problemStructureGroups],
  );

  useEffect(() => {
    if (stage !== "problem-definition" || !selectedProblemGroup) {
      if (selectedProblemSourceNodeId) {
        setSelectedProblemSourceNodeId("");
      }
      return;
    }

    if (!selectedProblemSourceNodeId) {
      return;
    }

    if (!selectedProblemSourceCards.some((card) => card.sourceNodeId === selectedProblemSourceNodeId)) {
      setSelectedProblemSourceNodeId("");
    }
  }, [selectedProblemGroup, selectedProblemSourceCards, selectedProblemSourceNodeId, stage]);

  useEffect(() => {
    if (!focusedCanvasItemId) return;
    const timeoutId = window.setTimeout(() => {
      setFocusedCanvasItemId("");
    }, 4200);

    return () => window.clearTimeout(timeoutId);
  }, [focusedCanvasItemId]);

  const {
    handleDebugRegenerateProblemDefinition,
    handleGenerateProblemDefinition,
    handleRefreshProblemChunkSummaries,
  } = useProblemDefinitionGeneration({
    buildExistingGroupsPayload: buildProblemTaxonomyExistingGroupsPayload,
    buildUtterances: buildProblemTaxonomyUtterances,
    busy,
    forceBroadcastSharedCanvas,
    hydrateProblemGroups,
    latestSharedWorkspaceRef,
    meetingId,
    meetingTopicForAi,
    nodePositions,
    persistedSharedImportedState,
    problemDefinitionStagePending,
    problemGroups,
    selectedProblemGroupId,
    serializeSharedProblemGroups: buildWorkspaceProblemGroupsPayload,
    setActivityMessage,
    setBusy,
    setCollapsedProblemGroupIds,
    setEditingProblemGroupId,
    setNodePositions,
    setProblemDefinitionMode,
    setProblemDefinitionPhase,
    setProblemDefinitionStagePending,
    setProblemGroups,
    setProblemGroupingRationaleById,
    setProblemGroupingRationaleOpenGroupId,
    setProblemGroupingRationalePendingId,
    setProblemStructureGroups,
    setProblemStructureNodes,
    setProblemStructurePending,
    setProblemStructureSetupOpen,
    setSelectedNodeId,
    setSelectedProblemGroupId,
    setSelectedProblemSourceNodeId,
    setStage,
    sharedSyncEnabled,
    transcripts,
  });

  const {
    handleCopyFinalSolutionMarkdown,
    handleGenerateSummaryDocument,
    handleRegenerateSummaryDocument,
    handleSaveSummaryDocument,
    handleSummaryDocumentMarkdownChange,
    handleToggleSummaryEvidence,
    summaryDocumentSaving,
  } = useSummaryDocumentActions({
    buildSummaryDocumentFromResponse,
    busy,
    finalSummaryDocument,
    forceBroadcastSharedCanvas,
    latestSharedWorkspaceRef,
    meetingId,
    meetingTopicForAi,
    normalizeFinalSolutionSummaryPayload,
    persistedSharedImportedState,
    problemStructureGroups,
    problemStructureNodes,
    setActivityMessage,
    setBusy,
    setFinalSummaryDocument,
    setLeftPanelTab,
    setSelectedNodeId,
    setSelectedProblemGroupId,
    setStage,
    setSummaryDocumentDraftDirty,
    setSummaryDocumentDraftMarkdown,
    setSummaryDocumentEditMode,
    setSummaryDocumentPending,
    setSummaryEvidenceOpenGroupIds,
    sharedSyncEnabled,
    summaryDocumentDraftDirty,
    summaryDocumentDraftMarkdown,
    summaryDocumentEditMode,
    summaryDocumentPending,
  });

  const handleStageSelect = useCallback(
    async (nextStage: CanvasStage) => {
      if (stage === "problem-definition" && nextStage !== "problem-definition") {
        await flushProblemDiscussionBuffer("stage-change");
      }

      if (nextStage === "solution") {
        if (busy || summaryDocumentPending) {
          setActivityMessage(
            summaryDocumentPending
              ? "요약 문서를 생성하는 중이라 잠시 후 다시 시도해 주세요."
              : "다른 작업이 진행 중이라 아직 요약 단계로 전환할 수 없습니다.",
          );
          return;
        }

        const hasExistingSummaryDocument =
          finalSummaryDocument.markdown.trim() && (finalSummaryDocument.sections || []).length > 0;
        if (!hasExistingSummaryDocument) {
          await handleGenerateSummaryDocument();
          return;
        }

        setStage("solution");
        setSelectedProblemGroupId("");
        setSelectedNodeId("");
        setLeftPanelTab("detail");
        return;
      }

      if (nextStage !== "problem-definition") {
        setProblemStructureSetupOpen(false);
        setProblemStructurePending(false);
        clearProblemStructureDrag();
        setStage(nextStage);
        return;
      }

      if (busy || conclusionBatchBusy) {
        setActivityMessage(
          conclusionBatchBusy
            ? "문제정의 결론을 생성 중이라 잠시 후 다시 시도해 주세요."
            : "다른 작업이 진행 중이라 아직 문제정의 단계로 전환할 수 없습니다.",
        );
        return;
      }

      setProblemDefinitionMode("");
      setProblemDefinitionPhase("explore");
      setProblemStructureSetupOpen(false);
      setProblemStructurePending(false);
      clearProblemStructureDrag();
      await handleGenerateProblemDefinition();
      setLeftPanelTab("detail");
      return;
    },
    [
      busy,
      clearProblemStructureDrag,
      conclusionBatchBusy,
      finalSummaryDocument.markdown,
      finalSummaryDocument.sections,
      flushProblemDiscussionBuffer,
      handleGenerateProblemDefinition,
      handleGenerateSummaryDocument,
      summaryDocumentPending,
      stage,
    ],
  );

  const handleAddPersonalNote = () => {
    const nextNote: PersonalNote = {
      id: `note-${Date.now()}`,
      projectId: meetingId,
      agendaId: "",
      linkedCanvasItemId: "",
      linkedCanvasItemTitle: "",
      kind: "note",
      title: composerTitle.trim() || `개인 메모 ${projectPersonalNotes.length + 1}`,
      body: composerBody.trim() || "개인 메모를 입력해 두면 나중에 그룹 보드로 이동시킬 수 있습니다.",
    };

    setPersonalNotes((prev) => [nextNote, ...prev]);
    setComposerTitle("");
    setComposerBody("");
    setComposerLinkedCanvasItemId("");
    setComposerLinkedCanvasItemTitle("");
    if (pendingPersonalNoteLinkId === COMPOSER_PERSONAL_NOTE_LINK_ID) {
      setPendingPersonalNoteLinkId("");
    }
    setActivityMessage("개인 메모에 저장했습니다.");
  };

  const isProblemDefinitionExploreStage = stage === "problem-definition" && problemDefinitionPhase !== "structure";
  const problemCanvasToolbarActions: ProblemCanvasToolbarAction[] =
    problemDefinitionPhase === "structure"
      ? ["structure-back", "structure-ai-group", "structure-add-group", "structure-refresh"]
      : ["structure-start"];

  const problemToolbarActionLabel = (action: ProblemCanvasToolbarAction) => {
    if (action === "structure-start") return "구조화 시작";
    if (action === "structure-back") return "정의 1단계";
    if (action === "structure-ai-group") return problemStructurePending ? "AI 묶는 중" : "AI 묶기";
    if (action === "structure-add-group") return "그룹 추가";
    return "다시 가져오기";
  };

  const isProblemToolbarActionActive = (action: ProblemCanvasToolbarAction) => {
    if (action === "structure-start") return problemDefinitionPhase === "structure" || problemStructureSetupOpen;
    if (action === "structure-ai-group") return problemStructurePending;
    return false;
  };

  const onNodesChange = useCanvasNodeChanges({
    applyingRemoteSharedSyncRef,
    liveNodePositionsRef,
    localNodeOverridesRef,
    scheduleNodePreview,
    setNodePositions,
    setNodes,
    sharedSyncEnabled,
    stage,
    workspaceHydratingRef,
    workspaceLoadedRef,
  });

  const { onNodeDrag, onNodeDragStart, onNodeDragStop } = useCanvasNodeDragCommit({
    applyingRemoteSharedSyncRef,
    broadcastNodePositionCommit,
    buildCurrentWorkspacePatchPayload,
    canvasItems,
    dragIdByNodeIdRef,
    flushPendingNodePreviews,
    latestSharedWorkspaceRef,
    liveNodePositionsRef,
    localDraggingNodeIdsRef,
    localNodeOverridesRef,
    meetingId,
    nodePositions,
    nodes,
    persistedSharedImportedState,
    problemGroups,
    scheduleNodePreview,
    setNodePositions,
    sharedSyncEnabled,
    stage,
    userId,
    workspaceHydratingRef,
    workspaceLoadedRef,
  });

  const handleDeletePersonalNote = (noteId: string) => {
    setPersonalNotes((prev) => prev.filter((item) => item.id !== noteId));
    if (pendingPersonalNoteLinkId === noteId) {
      setPendingPersonalNoteLinkId("");
    }
    if (editingPersonalNoteId === noteId) {
      setEditingPersonalNoteId("");
      setPersonalNoteDraftAgendaId("");
      setPersonalNoteDraftTitle("");
      setPersonalNoteDraftBody("");
    }
  };

  const handleStartPersonalNoteEdit = (note: PersonalNote) => {
    setEditingPersonalNoteId(note.id);
    setPersonalNoteDraftAgendaId(note.agendaId);
    setPersonalNoteDraftTitle(note.title);
    setPersonalNoteDraftBody(note.body);
  };

  const handleCancelPersonalNoteEdit = () => {
    setEditingPersonalNoteId("");
    setPersonalNoteDraftAgendaId("");
    setPersonalNoteDraftTitle("");
    setPersonalNoteDraftBody("");
  };

  const handleSavePersonalNoteEdit = (noteId: string) => {
    setPersonalNotes((prev) =>
      prev.map((note) =>
        note.id === noteId
          ? {
              ...note,
              title: personalNoteDraftTitle.trim() || note.title,
              body: personalNoteDraftBody.trim() || note.body,
            }
          : note,
      ),
    );
    setEditingPersonalNoteId("");
    setPersonalNoteDraftAgendaId("");
    setPersonalNoteDraftTitle("");
    setPersonalNoteDraftBody("");
    setActivityMessage("개인 메모를 수정했습니다.");
  };

  useEffect(() => {
    if (stage !== "problem-definition") {
      autoProblemDefinitionRef.current = false;
      return;
    }
    if (problemGroups.length > 0 || busy || agendaModels.length === 0 || autoProblemDefinitionRef.current) {
      return;
    }

    autoProblemDefinitionRef.current = true;
    void handleGenerateProblemDefinition();
  }, [agendaModels.length, busy, handleGenerateProblemDefinition, problemGroups.length, stage]);

  const handleStopRecordingClick = async () => {
    await onStopRecording?.();
    await flushProblemDiscussionBuffer("manual");
  };

  const getEndingFinalSummaryDocumentSnapshot = () => {
    const latestSummary = normalizeFinalSolutionSummaryPayload(latestSharedWorkspaceRef.current.finalSolutionSummary);
    if (latestSummary.markdown.trim() || (latestSummary.sections || []).length > 0 || latestSummary.final_count > 0) {
      return latestSummary;
    }
    return finalSummaryDocument;
  };

  const handleEndMeetingClick = async () => {
    await flushProblemDiscussionBuffer("stage-change");

    const finalSolutionSummary = buildFinalSolutionSummaryPayload(getEndingFinalSummaryDocumentSnapshot());
    openEndMeetingConfirm({
      finalCount: finalSolutionSummary.final_count,
      topicCount: finalSolutionSummary.sections?.length || finalSolutionSummary.topics.length,
    });
  };

  const handleDownloadEndMeetingSummaryPdf = () => {
    if (!endMeetingSummaryPreviewMarkdown.trim()) return;
    const printStarted = openPrintableSummaryDocumentPdf(endMeetingSummaryPreviewMarkdown);
    if (!printStarted) {
      alert("PDF 저장 화면을 열 수 없습니다. 브라우저 인쇄 메뉴에서 직접 PDF로 저장해 주세요.");
    }
  };

  const handleSaveAndEndMeeting = async (finalSummarySnapshot: CanvasFinalSolutionSummary) => {
    setEndMeetingSaving(true);

    if (meetingId) {
      const finalSolutionSummary = buildFinalSolutionSummaryPayload(finalSummarySnapshot);
      try {
        await saveCanvasWorkspacePatch({
          meeting_id: meetingId,
          solution_topics: [],
          final_solution_summary: finalSolutionSummary,
          imported_state: persistedSharedImportedState,
        });
      } catch (error) {
        console.error("Failed to save final solution summary before ending meeting:", error);
        alert("최종 결과 저장에 실패했습니다. 결과 확인에 표시되지 않을 수 있어 회의 종료를 중단했습니다.");
        setEndMeetingSaving(false);
        return;
      }
    }

    try {
      await onEndMeeting?.();
      resetEndMeetingState();
    } catch (error) {
      console.error("Failed to end meeting after final summary save:", error);
      alert("회의 종료에 실패했습니다.");
    } finally {
      setEndMeetingSaving(false);
    }
  };

  const handleConfirmEndMeeting = async () => {
    if (endMeetingSaving) return;
    const finalSummarySnapshot = getEndingFinalSummaryDocumentSnapshot();
    if (finalSummarySnapshot.markdown.trim()) {
      showEndMeetingSummaryPreview(finalSummarySnapshot.markdown);
      return;
    }
    await handleSaveAndEndMeeting(finalSummarySnapshot);
  };

  const rawCanvasStatusMessage = activityMessage || audioImportStatusText || recordingStatusText;
  const canvasStatusMessage = shouldHideCanvasStatusMessage(rawCanvasStatusMessage) ? "" : rawCanvasStatusMessage;
  const activeProblemGroupingRationale = problemGroupingRationaleOpenGroupId
    ? problemGroupingRationaleById[problemGroupingRationaleOpenGroupId] || null
    : null;
  const activeProblemGroupingRationaleGroup = problemGroupingRationaleOpenGroupId
    ? problemGroupById.get(problemGroupingRationaleOpenGroupId) || null
    : null;
  const rightDrawerExpandedWidth = `clamp(17.5rem, ${(rightPanelRatio * 100).toFixed(2)}vw, 23.75rem)`;
  const workspaceGridColumns = rightDrawerCollapsed
    ? "minmax(0, 1fr) clamp(3.5rem, 4.2vw, 4.5rem)"
    : `minmax(0, 1fr) ${rightDrawerExpandedWidth}`;
  const problemSplitEdges = useMemo(
    () =>
      buildProblemExploreEdges({
        collapsedProblemGroupIds,
        problemDefinitionPhase,
        problemGroups,
        stage,
      }),
    [collapsedProblemGroupIds, problemDefinitionPhase, problemGroups, stage],
  );
  const { linkPendingPersonalNoteToCanvasItem } = usePersonalNoteCanvasLinking({
    composerAgendaId,
    composerPersonalNoteLinkId: COMPOSER_PERSONAL_NOTE_LINK_ID,
    pendingPersonalNoteLinkId,
    setActivityMessage,
    setComposerAgendaId,
    setComposerLinkedCanvasItemId,
    setComposerLinkedCanvasItemTitle,
    setFocusedCanvasItemId,
    setPendingPersonalNoteLinkId,
    setPersonalNotes,
    setSelectedCanvasItemId,
    setSelectedNodeId,
  });

  const handleCanvasNodeClick = (event: React.MouseEvent, node: Node) => {
    if (node.id.startsWith("ideation-keyword-")) {
      event.stopPropagation();
      return;
    }
    setSelectedNodeId(node.id);
    setLeftPanelTab("detail");
    if (stage !== "problem-definition") {
      openRightDrawer();
    }
    const agendaId = extractAgendaIdFromNodeId(node.id);
    if (node.id.startsWith("canvas-item-")) {
      const canvasItemId = node.id.slice("canvas-item-".length);
      const canvasItem = canvasItemById.get(canvasItemId) || null;
      if (canvasItem && linkPendingPersonalNoteToCanvasItem(canvasItem)) {
        return;
      }
      setSelectedCanvasItemId(canvasItemId);
      setSelectedProblemGroupId("");
      setEditingProblemGroupId("");
      if (canvasItem?.agenda_id) {
        setSelectedAgendaId(canvasItem.agenda_id);
      }
    } else {
      setSelectedCanvasItemId("");
    }
    if (stage === "problem-definition" && problemDefinitionPhase === "structure") {
      setSelectedProblemGroupId("");
      setSelectedProblemSourceNodeId("");
      setEditingProblemGroupId("");
      return;
    }
    const clickedProblemGroupId =
      node.id.startsWith("problem-")
        ? node.id.slice("problem-".length)
        : "";
    if (clickedProblemGroupId) {
      setSelectedProblemGroupId(clickedProblemGroupId);
      setSelectedProblemSourceNodeId("");
      setSelectedCanvasItemId("");
      setEditingProblemGroupId("");
    }
    if (agendaId) {
      setSelectedAgendaId(agendaId);
    }
  };

  const handleCanvasPaneClick = () => {
    closeRightDrawer();
    if (stage === "ideation") {
      setSelectedCanvasItemId("");
      setSelectedNodeId("");
      setLeftPanelTab("detail");
    }
  };

  const handleFlowInitStable = useStableEvent((instance: ReactFlowInstance<Node, Edge>) => {
    flowRef.current = instance;
  });
  const handleCanvasNodeClickStable = useStableEvent(handleCanvasNodeClick);
  const handleCanvasPaneClickStable = useStableEvent(handleCanvasPaneClick);
  const handleNodesChangeStable = useStableEvent(onNodesChange);
  const handleNodeDragStartStable = useStableEvent(onNodeDragStart);
  const handleNodeDragStable = useStableEvent(onNodeDrag);
  const handleNodeDragStopStable = useStableEvent(onNodeDragStop);

  const handleProblemToolbarAction = (action: ProblemCanvasToolbarAction) => {
    if (action === "structure-start") {
      handleOpenProblemStructureSetup();
      return;
    }

    if (action === "structure-back") {
      handleBackToProblemDefinitionExplore();
      return;
    }

    if (action === "structure-ai-group") {
      void runProblemStructureGrouping();
      return;
    }

    if (action === "structure-add-group") {
      handleAddProblemStructureGroup();
      return;
    }

    if (action === "structure-refresh") {
      handleRefreshProblemStructureNodes();
    }
  };

  return (
    <div className="h-full min-h-0 bg-[#f9f9f9] text-black">
      <section className="flex h-full min-h-0 flex-col bg-[#f9f9f9]">
        <CanvasHeader
          meetingTitle={meetingTitle}
          isRecording={isRecording}
          endMeetingSaving={endMeetingSaving}
          stage={stage}
          busy={busy}
          problemDefinitionStagePending={problemDefinitionStagePending}
          isProblemDefinitionExploreStage={isProblemDefinitionExploreStage}
          ideationBubbleDebugEnabled={ideationBubbleDebugEnabled}
          meetingGoalDraft={meetingGoalDraft}
          meetingGoalContextDraft={meetingGoalContextDraft}
          meetingGoalEditorOpen={meetingGoalEditorOpen}
          meetingGoalEditorDraft={meetingGoalEditorDraft}
          meetingGoalContextEditorDraft={meetingGoalContextEditorDraft}
          meetingGoalSaving={meetingGoalSaving}
          onEndMeetingClick={() => void handleEndMeetingClick()}
          onRecordingToggle={() => {
            if (isRecording) {
              void handleStopRecordingClick();
              return;
            }
            void onToggleRecording?.();
          }}
          onBackToDashboard={() => router.push("/dashboard")}
          onRecomputeIdeationBubbles={() => {
            setIdeationBubbleLayoutRevision((current) => current + 1);
            setActivityMessage("아이디어 버블 배치를 다시 계산했습니다.");
          }}
          onToggleIdeationBubbleDebug={() => setIdeationBubbleDebugEnabled((current) => !current)}
          onRefreshProblemChunkSummaries={() => void handleRefreshProblemChunkSummaries()}
          onDebugRegenerateProblemDefinition={() => void handleDebugRegenerateProblemDefinition()}
          onOpenMeetingGoalEditor={handleOpenMeetingGoalEditor}
          onCancelMeetingGoalEdit={handleCancelMeetingGoalEdit}
          onSaveMeetingGoalEdit={() => void handleSaveMeetingGoalEdit()}
          onMeetingGoalEditorDraftChange={setMeetingGoalEditorDraft}
          onMeetingGoalContextEditorDraftChange={setMeetingGoalContextEditorDraft}
          onStageSelect={(nextStage) => void handleStageSelect(nextStage)}
        />

        <div
          className="imms-workspace-grid grid flex-1 min-h-0 grid-cols-1 overflow-y-auto bg-black/10 xl:grid-rows-[minmax(0,1fr)_minmax(0,1fr)] xl:overflow-hidden xl:gap-[clamp(0.25rem,0.45vw,0.5rem)] xl:border-x xl:border-b xl:border-black/10"
          style={isDesktopLayout ? { gridTemplateColumns: workspaceGridColumns } : undefined}
        >
          <CanvasSurface
            canvasSurfaceRef={canvasSurfaceRef}
            stage={stage}
            nodes={nodes}
            problemSplitLeftEdges={problemSplitEdges.left}
            busy={busy}
            problemGroupsCount={problemGroups.length}
            problemStructureNodesCount={problemStructureNodes.length}
            finalSummaryDocument={finalSummaryDocument}
            summaryDocumentDraftMarkdown={summaryDocumentDraftMarkdown}
            summaryDocumentDraftDirty={summaryDocumentDraftDirty}
            summaryEligibleStructureGroups={summaryEligibleStructureGroups}
            summaryDocumentSectionByGroupId={summaryDocumentSectionByGroupId}
            problemStructureNodeById={problemStructureNodeById}
            summaryEvidenceOpenGroupIds={summaryEvidenceOpenGroupIds}
            remoteEditPresenceByKey={remoteEditPresenceByKey}
            summaryDocumentEditMode={summaryDocumentEditMode}
            summaryDocumentPending={summaryDocumentPending}
            summaryDocumentSaving={summaryDocumentSaving}
            solutionRightPaneRef={solutionRightPaneRef}
            problemDefinitionStagePending={problemDefinitionStagePending}
            problemStructureSetupOpen={problemStructureSetupOpen}
            problemStructureDraftMethod={problemStructureDraftMethod}
            problemStructureDraftMode={problemStructureDraftMode}
            problemStructurePending={problemStructurePending}
            problemDefinitionPhase={problemDefinitionPhase}
            problemStructureMethod={problemStructureMethod}
            problemDefinitionMode={problemDefinitionMode}
            activeProblemGroupingRationale={activeProblemGroupingRationale}
            activeProblemGroupingRationaleTitle={activeProblemGroupingRationaleGroup?.topic || ""}
            canvasStatusMessage={canvasStatusMessage}
            problemCanvasToolbarActions={problemCanvasToolbarActions}
            selectedProblemStatus={selectedProblemGroup?.status || ""}
            onFlowInit={handleFlowInitStable}
            onNodeClick={handleCanvasNodeClickStable}
            onPaneClick={handleCanvasPaneClickStable}
            onNodesChange={handleNodesChangeStable}
            onNodeDragStart={handleNodeDragStartStable}
            onNodeDrag={handleNodeDragStable}
            onNodeDragStop={handleNodeDragStopStable}
            onToggleSummaryEvidence={handleToggleSummaryEvidence}
            onSetSummaryDocumentEditMode={setSummaryDocumentEditMode}
            onRegenerateSummaryDocument={handleRegenerateSummaryDocument}
            onCopyFinalSolutionMarkdown={handleCopyFinalSolutionMarkdown}
            onSaveSummaryDocument={handleSaveSummaryDocument}
            onSummaryDocumentMarkdownChange={handleSummaryDocumentMarkdownChange}
            renderSummaryMarkdownPreview={renderSummaryMarkdownPreview}
            onCloseProblemStructureSetup={() => setProblemStructureSetupOpen(false)}
            onProblemStructureDraftMethodChange={setProblemStructureDraftMethod}
            onProblemStructureDraftModeChange={setProblemStructureDraftMode}
            onStartProblemStructure={handleStartProblemStructure}
            onProblemStructureMethodChange={(method) => {
              setProblemStructureMethod(method);
              setActivityMessage(`${problemStructureMethodLabel(method)} 방식으로 시각 표현을 바꿨습니다. 기존 그룹은 유지됩니다.`);
            }}
            onProblemDefinitionModeChange={(mode) => {
              setProblemDefinitionMode(mode);
              if (mode === "ai") {
                void runProblemStructureGrouping();
                return;
              }
              setActivityMessage("직접 구성 모드로 표시했습니다.");
            }}
            onCloseProblemGroupingRationale={() => setProblemGroupingRationaleOpenGroupId("")}
            getProblemToolbarActionLabel={problemToolbarActionLabel}
            isProblemToolbarActionActive={isProblemToolbarActionActive}
            onProblemToolbarAction={handleProblemToolbarAction}
            onSetProblemGroupStatus={handleSetProblemGroupStatus}
          />

          <CanvasRightDrawer
            collapsed={rightDrawerCollapsed}
            contentVisible={rightDrawerContentVisible}
            notesCollapsed={rightDrawerNotesCollapsed}
            expandedWidth={rightDrawerExpandedWidth}
            isDesktopLayout={isDesktopLayout}
            composerTitle={composerTitle}
            composerBody={composerBody}
            composerBodyRef={composerBodyRef}
            notes={projectPersonalNotes}
            stage={stage}
            editingPersonalNoteId={editingPersonalNoteId}
            draggingPersonalNoteId={draggingPersonalNoteId}
            personalNoteDraftTitle={personalNoteDraftTitle}
            personalNoteDraftBody={personalNoteDraftBody}
            quickAskSlot={
              <CanvasQuickAskPanel
                open={quickAskOpen}
                rightDrawerCollapsed={rightDrawerCollapsed}
                messages={quickAskMessages}
                draft={quickAskDraft}
                unreadCount={quickAskUnreadCount}
                pendingCount={quickAskPendingCount}
                scrollRef={quickAskScrollRef}
                onClose={() => setQuickAskOpen(false)}
                onToggle={handleToggleQuickAsk}
                onDraftChange={setQuickAskDraft}
                onSubmit={handleSubmitQuickAsk}
              />
            }
            onToggleDrawer={toggleRightDrawer}
            onStartResize={startPanelResize("right")}
            onToggleNotesCollapsed={() => setRightDrawerNotesCollapsed((prev) => !prev)}
            onComposerTitleChange={setComposerTitle}
            onComposerBodyChange={setComposerBody}
            onSavePersonalNote={handleAddPersonalNote}
            onDragStartNote={setDraggingPersonalNoteId}
            onDragEndNote={() => {
              setDraggingPersonalNoteId("");
              setDropProblemGroupId("");
            }}
            onPersonalNoteDraftTitleChange={setPersonalNoteDraftTitle}
            onPersonalNoteDraftBodyChange={setPersonalNoteDraftBody}
            onCancelPersonalNoteEdit={handleCancelPersonalNoteEdit}
            onSavePersonalNoteEdit={handleSavePersonalNoteEdit}
            onStartPersonalNoteEdit={handleStartPersonalNoteEdit}
            onDeletePersonalNote={handleDeletePersonalNote}
          />
        </div>
      </section>

      <CanvasEndMeetingDialogs
        confirmOpen={endMeetingConfirmOpen}
        saving={endMeetingSaving}
        preview={endMeetingPreview}
        summaryPreviewMarkdown={endMeetingSummaryPreviewMarkdown}
        summaryPreviewHtml={endMeetingSummaryPreviewHtml}
        onCancel={handleCancelEndMeeting}
        onConfirm={() => void handleConfirmEndMeeting()}
        onDownloadPdf={handleDownloadEndMeetingSummaryPdf}
        onBackToConfirm={handleBackToEndMeetingConfirm}
        onSaveAndEnd={() => void handleSaveAndEndMeeting(getEndingFinalSummaryDocumentSnapshot())}
      />
    </div>
  );
}
