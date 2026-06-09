"use client";

import "@xyflow/react/dist/style.css";
import {
  type Edge,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createCanvasFinalReportShare,
  finishCanvasArtifactGeneration,
  getCanvasProblemDiscussionWorkspaceJob,
  logCanvasBubbleDebugEvent,
  resetMeetingRoomRuntimeState,
  saveCanvasWorkspacePatch,
  startCanvasArtifactGeneration,
  startCanvasProblemDiscussionWorkspace,
} from "@/lib/api";
import { isDemoBalanceConfig, normalizeCanvasDemoConfig } from "@/lib/demoMode";
import { CanvasEndMeetingDialogs } from "@/components/canvas/CanvasEndMeetingDialogs";
import { useCanvasEndMeetingDialogModels } from "@/components/canvas/useCanvasEndMeetingDialogModels";
import { useCanvasHeaderActions } from "@/components/canvas/useCanvasHeaderActions";
import { useCanvasHeaderModels } from "@/components/canvas/useCanvasHeaderModels";
import {
  CanvasWorkspacePanels,
  type CanvasDebugResetScope,
  type CanvasWorkspaceParticipant,
} from "@/components/canvas/CanvasWorkspacePanels";
import type { CanvasSttFeedItem } from "@/components/canvas/CanvasSurface";
import {
  MobileMeetingReadOnlyView,
  type MobileMeetingViewStage,
} from "@/components/canvas/MobileMeetingReadOnlyView";
import { useCanvasWorkspacePanelModels } from "@/components/canvas/useCanvasWorkspacePanelModels";
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
  CANVAS_IDEATION_BUBBLE_PLANE_HEIGHT,
  CANVAS_IDEATION_BUBBLE_PLANE_WIDTH,
  buildStableIdeationBubbleVisuals,
  getIdeationBubbleArcMotionSettleDelayMs,
  getIdeationBubbleEnterSettleDelayMs,
  settleEnteringIdeationBubbleVisuals,
  type IdeationBubbleLayoutAnchor,
  type IdeationKeywordBubbleVisual,
} from "@/components/canvas/CanvasIdeationBubbles";
import {
  buildProblemStructureStatePayload,
  createDefaultProblemStructureArtifactMeta,
  createDefaultProblemStructureState,
  getSummaryEligibleStructureGroups,
  hydrateProblemStructureState,
  problemStructureMethodLabel,
  type ProblemStructureArtifactMeta,
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
import { useCanvasPersonalNotePanelActions } from "@/components/canvas/useCanvasPersonalNotePanelActions";
import { usePersonalNoteCanvasLinking } from "@/components/canvas/usePersonalNoteCanvasLinking";
import { useCanvasSurfaceInteractionHandlers } from "@/components/canvas/useCanvasSurfaceInteractionHandlers";
import { useSummaryDocumentActions } from "@/components/canvas/useSummaryDocumentActions";
import { useSharedCanvasBroadcast } from "@/components/canvas/useSharedCanvasBroadcast";
import { useSharedCanvasIncomingSync } from "@/components/canvas/useSharedCanvasIncomingSync";
import { useCanvasPersistence } from "@/components/canvas/useCanvasPersistence";
import { useCanvasNodePreviewSync } from "@/components/canvas/useCanvasNodePreviewSync";
import { useCanvasNodeChanges } from "@/components/canvas/useCanvasNodeChanges";
import { useCanvasNodeDragCommit } from "@/components/canvas/useCanvasNodeDragCommit";
import { useCanvasWorkspaceLoader } from "@/components/canvas/useCanvasWorkspaceLoader";
import { useCanvasSelectionGuards } from "@/components/canvas/useCanvasSelectionGuards";
import {
  buildMeetingStateSignature,
  createDemoBalanceAnchoredIdeationBubbleGraph,
  buildWorkspaceProblemGroupsPayload,
  createEmptyIdeationBubbleGraph,
  createWorkspaceFieldSignatures,
  normalizeCanvasItemStatus,
  normalizeCanvasNodePositionsForComputedIdeation,
  normalizeIdeationBubbleGraphForWorkspace,
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
import { useIdeationKeywordBubbles } from "@/components/canvas/useIdeationKeywordBubbles";
import {
  PROBLEM_DEFINITION_STEP1_ARTIFACT,
  PROBLEM_DEFINITION_STEP2_ARTIFACT,
  SUMMARY_DOCUMENT_ARTIFACT,
  isCanvasArtifactGenerationStale,
  isCanvasArtifactGenerating,
  normalizeArtifactGenerationStatus,
  normalizeCanvasArtifactGeneration,
  setCanvasArtifactGenerationState,
} from "@/components/canvas/canvasArtifactGeneration";
import type {
  AgendaActionItemDetail,
  AgendaDecisionDetail,
  CanvasArtifactGenerationKey,
  CanvasArtifactGenerationMap,
  CanvasArtifactGenerationState,
  CanvasArtifactGenerationStatus,
  CanvasCustomGroup,
  CanvasDemoBalanceClassification,
  CanvasDemoConfig,
  CanvasEditPresencePayload,
  CanvasFinalSolutionSummary,
  CanvasIdeationBubbleGraph,
  CanvasNodePreviewPayload,
  CanvasNodePositionsByStage,
  CanvasProblemDefinitionGroup,
  CanvasProblemStructureState,
  CanvasRealtimeSyncPayload,
  CanvasSummaryDocumentBlock,
  CanvasProblemDiscussionItem,
  CanvasWorkspaceStateResponse,
  CanvasWorkspaceItem,
  MeetingState,
  TranscriptUtterance,
} from "@/lib/types";
import type { LiveSpeechPreview } from "@/app/page";
import { useRouter, useSearchParams } from "next/navigation";

export type MeetingTranscript = {
  id: string;
  speaker: string;
  text: string;
  timestamp: string;
  canvas_stage?: CanvasStage | string;
  canvas_target_id?: string;
  transcript_status?: "final" | "processing" | string;
  persisted?: boolean;
  persistence_status?: "saving" | "retrying" | "persisted" | "persist_failed" | string;
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
  | "structure-add-group";
type LeftPanelTab = "detail";
type ProblemGroupStatus = "draft" | "review" | "final";
const CANVAS_DEBUG_RESET_ENABLED =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_ENABLE_CANVAS_DEBUG_TOOLS === "true";
const PROBLEM_DEFINITION_LLM_CACHE_RESET_PREFIXES = [
  "problem_taxonomy",
  "problem_taxonomy_outline",
  "problem_taxonomy_chunk_summary:",
  "problem_taxonomy_overview_summary:",
  "problem_grouping_rationale:",
  "problem_structure",
];
const SUMMARY_DOCUMENT_LLM_CACHE_RESET_PREFIXES = [
  "summary_document",
  "summary_conclusion",
];
const CANVAS_LLM_FAILURE_RETRY_DELAY_MS = 60_000;
const CANVAS_LLM_SILENCE_FLUSH_MS = 8_000;
const COMPOSER_PERSONAL_NOTE_LINK_ID = "__composer_personal_note__";

function buildDebugResetArtifactGeneration(
  current: CanvasArtifactGenerationMap,
  artifactKeys: CanvasArtifactGenerationKey[],
  now: string,
  userLabel: string,
  nonce: string,
) {
  const next = normalizeCanvasArtifactGeneration(current);
  artifactKeys.forEach((artifactKey) => {
    const previous = next[artifactKey];
    next[artifactKey] = {
      artifact_key: artifactKey,
      status: "idle",
      generation_id: `${artifactKey}:debug-reset:${nonce}`,
      started_by: userLabel,
      started_at: now,
      updated_at: now,
      finished_at: now,
      error: "",
      version: Number(previous?.version || 0) + 1,
      input_transcript_revision: Number(previous?.input_transcript_revision || 0),
    };
  });
  return normalizeCanvasArtifactGeneration(next);
}

function buildMeetingShareUrl(meetingId: string) {
  if (typeof window === "undefined" || !meetingId) return "";
  const url = new URL("/", window.location.origin);
  url.searchParams.set("meeting_id", meetingId);
  return url.toString();
}

function buildFinalReportShareUrl(meetingId: string, token: string) {
  if (typeof window === "undefined" || !meetingId || !token) return "";
  return new URL(
    `/final-report/${encodeURIComponent(meetingId)}/${encodeURIComponent(token)}`,
    window.location.origin,
  ).toString();
}

function toMobileViewedStage(stage: CanvasStage, phase: ProblemDefinitionPhase): MobileMeetingViewStage {
  if (stage === "ideation") return "ideation";
  if (stage === "solution") return "summary";
  return phase === "structure" ? "problem-structure" : "problem-explore";
}

async function copyTextToClipboard(text: string) {
  if (!text) return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the selection-based copy path for browsers that block Clipboard API.
  }

  if (typeof document === "undefined") return false;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
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
  userEmail?: string | null;
  meetingId: string;
  meetingTitle: string;
  meetingGoal: string;
  meetingGoalContext: string;
  onMeetingTitleSave?: (title: string) => void | Promise<void>;
  onMeetingGoalChange: (goal: string) => void;
  onMeetingGoalContextChange: (context: string) => void;
  onMeetingGoalSync?: (goal: string, context?: string) => void;
  transcripts: MeetingTranscript[];
  agendas: MeetingAgenda[];
  analysisState: MeetingState | null;
  meetingStatus?: string;
  ideationBubbleUpdatesEnabled?: boolean;
  incomingSharedCanvasSync: CanvasRealtimeSyncPayload | null;
  onSharedCanvasSync: (payload: CanvasRealtimeSyncPayload) => void;
  incomingNodePreview: CanvasNodePreviewPayload | null;
  onNodePreviewSync: (payload: CanvasNodePreviewPayload) => void;
  incomingEditPresence: CanvasEditPresencePayload | null;
  onEditPresenceSync: (payload: CanvasEditPresencePayload) => void;
  liveSpeechPreview: LiveSpeechPreview | null;
  isRecording?: boolean;
  recordingStartedAtMs?: number | null;
  meetingTimerStartedAtMs?: number | null;
  meetingTimerEndedAtMs?: number | null;
  onToggleRecording?: () => void | Promise<void>;
  onEndMeeting?: () => void | Promise<void>;
  onStopRecording?: () => void | Promise<void>;
  onMeetingTranscriptReset?: () => void;
  onCanvasStageContextChange?: (context: {
    stage: CanvasStage;
    targetId?: string;
    selectedNodeId?: string;
    demoBalanceMode?: boolean;
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

function stripLeadingTimestamp(text: string) {
  return text
    .replace(
      /^\s*\[?\s*(?:\d{4}-\d{2}-\d{2}[T\s]\d{1,2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?|\d{1,2}:\d{2}(?::\d{2})?)\s*\]?\s*/,
      "",
    )
    .trim();
}

function normalizeSttFeedText(text: string) {
  return stripLeadingTimestamp(text).replace(/\s+/g, " ").trim();
}

function transcriptTimeValue(timestamp: string) {
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildCanvasSttFeedItems(transcripts: MeetingTranscript[], limit = 4): CanvasSttFeedItem[] {
  const seen = new Set<string>();
  return [...transcripts]
    .map((row) => ({
      row,
      text: normalizeSttFeedText(row.text || ""),
      timeValue: transcriptTimeValue(row.timestamp || ""),
    }))
    .filter(({ row, text }) => {
      if (!text) return false;
      if (row.transcript_status && row.transcript_status !== "final") return false;
      if (row.persistence_status === "persist_failed") return false;
      return true;
    })
    .sort((left, right) => right.timeValue - left.timeValue)
    .reduce<CanvasSttFeedItem[]>((items, { row, text }) => {
      if (items.length >= limit) return items;
      const id = row.id || `${row.timestamp}:${row.speaker}:${text}`;
      if (seen.has(id)) return items;
      seen.add(id);
      items.push({
        id,
        text,
        speaker: row.speaker || "",
        timestamp: row.timestamp || "",
        canvasStage: row.canvas_stage || "ideation",
      });
      return items;
    }, [])
    .slice(0, limit);
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
  userEmail,
  meetingId,
  meetingTitle,
  meetingGoal,
  meetingGoalContext,
  onMeetingTitleSave,
  onMeetingGoalChange,
  onMeetingGoalContextChange,
  onMeetingGoalSync,
  transcripts,
  agendas,
  analysisState,
  meetingStatus = "",
  ideationBubbleUpdatesEnabled = false,
  incomingSharedCanvasSync,
  onSharedCanvasSync,
  incomingNodePreview,
  onNodePreviewSync,
  incomingEditPresence,
  onEditPresenceSync,
  isRecording = false,
  recordingStartedAtMs = null,
  meetingTimerStartedAtMs = null,
  meetingTimerEndedAtMs = null,
  onToggleRecording,
  onEndMeeting,
  onStopRecording,
  onMeetingTranscriptReset,
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
  const [mobileViewedStage, setMobileViewedStage] = useState<MobileMeetingViewStage>("ideation");
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
  const [problemStructureArtifactMeta, setProblemStructureArtifactMeta] = useState<ProblemStructureArtifactMeta>(
    createDefaultProblemStructureArtifactMeta,
  );
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
    handleUpdateProblemStructureNodeStatus,
    problemStructureDrag,
    problemStructureGroupDraftTitle,
    problemStructureNodeDraftTitle,
    resetProblemStructureEditorState,
    setProblemStructureGroupDraftTitle,
    setProblemStructureNodeDraftTitle,
  } = useProblemStructureEditor({
    fallbackProblemGroups: problemGroups,
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
  const [artifactGeneration, setArtifactGeneration] = useState<CanvasArtifactGenerationMap>({});
  const [ideationBubbleGraph, setIdeationBubbleGraph] = useState<CanvasIdeationBubbleGraph>(() =>
    createEmptyIdeationBubbleGraph(),
  );
  const [demoConfig, setDemoConfig] = useState<CanvasDemoConfig>({
    enabled: false,
    mode: "normal",
    option_a: "",
    option_b: "",
    instruction: "",
  });
  const [demoBalanceClassification, setDemoBalanceClassification] = useState<CanvasDemoBalanceClassification>({});
  const [summaryDocumentEditMode, setSummaryDocumentEditMode] = useState(false);
  const [summaryDocumentDraftBlocks, setSummaryDocumentDraftBlocks] = useState<CanvasSummaryDocumentBlock[]>([]);
  const [summaryDocumentDraftMarkdown, setSummaryDocumentDraftMarkdown] = useState("");
  const [summaryDocumentDraftDirty, setSummaryDocumentDraftDirty] = useState(false);
  const [summaryEvidenceOpenGroupIds, setSummaryEvidenceOpenGroupIds] = useState<Set<string>>(() => new Set());
  const [ideationBubbleVisuals, setIdeationBubbleVisuals] = useState<IdeationKeywordBubbleVisual[]>([]);
  const ideationBubbleLayoutAnchorRef = useRef<IdeationBubbleLayoutAnchor | null>(null);
  const autoSolutionRecordingStopRequestedRef = useRef(false);
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
  const [, setProblemGroupDraftInsight] = useState("");
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
  const [debugResetBusy, setDebugResetBusy] = useState(false);
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
    viewportModeReady,
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
  const [finalReportQrOpen, setFinalReportQrOpen] = useState(false);
  const [finalReportQrLoading, setFinalReportQrLoading] = useState(false);
  const [finalReportQrUrl, setFinalReportQrUrl] = useState("");
  const [finalReportQrImageDataUrl, setFinalReportQrImageDataUrl] = useState("");
  const [finalReportQrError, setFinalReportQrError] = useState("");
  const [finalReportQrCopied, setFinalReportQrCopied] = useState(false);
  const composerBodyRef = useRef<HTMLTextAreaElement | null>(null);
  const { canvasSurfaceRef, flowRef } = useCanvasFlowRefs();
  const ideationViewportCenteredKeyRef = useRef("");
  const mobileViewedStageInitializedRef = useRef(false);
  const autoProblemDefinitionRef = useRef(false);
  const problemConclusionEntryHandledRef = useRef(false);
  const workspaceLoadedRef = useRef(false);
  const workspaceHydratingRef = useRef(false);
  const lastWorkspaceFieldSignaturesRef = useRef<WorkspaceFieldSignatures>(createWorkspaceFieldSignatures());
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
  const finalReportQrCopiedTimerRef = useRef<number | null>(null);
  const localNodeOverridesRef = useRef(createLocalNodeOverrideMap());

  useEffect(() => () => {
    if (finalReportQrCopiedTimerRef.current !== null) {
      window.clearTimeout(finalReportQrCopiedTimerRef.current);
      finalReportQrCopiedTimerRef.current = null;
    }
  }, []);

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
        editingProblemStructureNodeId === localEditPresenceTarget.targetId) ||
      (localEditPresenceTarget.targetType === "summary_document" &&
        summaryDocumentEditMode &&
        localEditPresenceTarget.targetId === "final");

    if (!stillEditing) {
      setLocalEditPresenceTarget(null);
    }
  }, [
    editingProblemGroupId,
    editingProblemStructureGroupId,
    editingProblemStructureNodeId,
    localEditPresenceTarget,
    summaryDocumentEditMode,
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
  const latestSharedWorkspaceRef = useRef<{
    meetingGoal: string;
    meetingGoalContext: string;
    demoConfig: CanvasDemoConfig;
    demoBalanceClassification: CanvasDemoBalanceClassification;
    stage: CanvasStage;
    agendaOverrides: Record<string, AgendaOverride>;
    canvasItems: CanvasItemViewModel[];
    customGroups: CustomGroupViewModel[];
    problemGroups: ProblemGroupViewModel[];
    problemStructure: CanvasProblemStructureState;
    finalSolutionSummary: CanvasFinalSolutionSummary;
    artifactGeneration: CanvasArtifactGenerationMap;
    ideationBubbleGraph: CanvasIdeationBubbleGraph;
    nodePositions: CanvasNodePositionsByStage;
    importedState: MeetingState | null;
  }>({
    meetingGoal: "",
    meetingGoalContext: "",
    demoConfig: { enabled: false, mode: "normal", option_a: "", option_b: "", instruction: "" },
    demoBalanceClassification: {},
    stage: "ideation",
    agendaOverrides: {},
    canvasItems: [],
    customGroups: [],
    problemGroups: [],
    problemStructure: createDefaultProblemStructureState(),
    finalSolutionSummary: createEmptyFinalSolutionSummary(),
    artifactGeneration: {},
    ideationBubbleGraph: createEmptyIdeationBubbleGraph(),
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
  const activeMeetingGoalContext = meetingGoalContextDraft.trim();
  const normalizedDemoConfig = useMemo(() => normalizeCanvasDemoConfig(demoConfig), [demoConfig]);
  const demoBalanceMode = isDemoBalanceConfig(normalizedDemoConfig);
  const analysisMeetingGoal = activeMeetingGoal || (effectiveState?.meeting_goal || "").trim();
  const ideationKeywordMeetingTopic = analysisMeetingGoal || "회의 주제";
  const meetingTopicForAi = analysisMeetingGoal || meetingTitle.trim() || "회의 주제";
  const handleIdeationBubbleGraphChange = useCallback((nextGraph: CanvasIdeationBubbleGraph) => {
    setIdeationBubbleGraph(normalizeIdeationBubbleGraphForWorkspace(nextGraph));
  }, []);
  const {
    keywordBubbles: ideationKeywordBubbles,
    statusMessage: ideationKeywordStatusMessage,
  } = useIdeationKeywordBubbles({
    transcripts,
    meetingId,
    meetingTopic: ideationKeywordMeetingTopic,
    meetingGoal: activeMeetingGoal,
    meetingGoalContext: activeMeetingGoalContext,
    bubbleGraph: ideationBubbleGraph,
    onBubbleGraphChange: handleIdeationBubbleGraphChange,
    demoConfig: normalizedDemoConfig,
    stage,
    updatesEnabled: meetingStatus !== "completed" && ideationBubbleUpdatesEnabled,
  });
  useEffect(() => {
    ideationBubbleUpdateTickRef.current = 0;
    setIdeationBubbleVisuals([]);
    ideationBubbleLayoutAnchorRef.current = null;
    setIdeationBubbleDebugGrowthById({});
  }, [ideationBubbleUpdateTickRef, meetingId]);
  useEffect(() => {
    const tick = ideationBubbleUpdateTickRef.current + 1;
    ideationBubbleUpdateTickRef.current = tick;
    setIdeationBubbleVisuals((current) => {
      if (ideationKeywordBubbles.length === 0) return current.length === 0 ? current : [];
      return buildStableIdeationBubbleVisuals(
        current,
        ideationKeywordBubbles,
        ideationBubbleDebugGrowthById,
        tick,
        ideationBubbleLayoutAnchorRef.current,
      );
    });
  }, [
    ideationBubbleDebugGrowthById,
    ideationBubbleUpdateTickRef,
    ideationKeywordBubbles,
  ]);
  const ideationKeywordBubbleSignature = useMemo(
    () =>
      ideationKeywordBubbles
        .map((bubble) => `${bubble.id}:${bubble.text}:${bubble.count}:${bubble.displayState}:${bubble.anchorText || ""}`)
        .join("|"),
    [ideationKeywordBubbles],
  );
  useEffect(() => {
    if (!meetingId || stage !== "ideation") return;
    logCanvasBubbleDebugEvent({
      meeting_id: meetingId,
      user_id: userId,
      event: "keyword_bubbles_built",
      data: {
        graph_cycle: ideationBubbleGraph.update_cycle,
        graph_bubbles: ideationBubbleGraph.bubbles.length,
        keyword_bubbles: ideationKeywordBubbles.length,
        labels: ideationKeywordBubbles.slice(0, 24).map((bubble) => ({
          id: bubble.id,
          text: bubble.text,
          count: bubble.count,
          state: bubble.displayState,
          lifecycle: bubble.lifecycleState,
          anchor: bubble.anchorText,
          target: {
            x: bubble.layoutX,
            y: bubble.layoutY,
            size: bubble.layoutSize,
            ring: bubble.orbitRing,
            slot: bubble.orbitSlotIndex,
            order: bubble.orbitOrderKey,
            angle: bubble.orbitAngle,
          },
        })),
      },
    });
  }, [
    ideationBubbleGraph.bubbles.length,
    ideationBubbleGraph.update_cycle,
    ideationKeywordBubbleSignature,
    ideationKeywordBubbles,
    meetingId,
    stage,
    userId,
  ]);
  useEffect(() => {
    const enteringIds = new Set(ideationBubbleVisuals.filter((bubble) => bubble.entering).map((bubble) => bubble.id));
    const arcMotionIds = new Set(ideationBubbleVisuals.filter((bubble) => bubble.arcMotion).map((bubble) => bubble.id));
    if (enteringIds.size === 0 && arcMotionIds.size === 0) {
      return undefined;
    }

    const timers: number[] = [];
    if (enteringIds.size > 0) {
      timers.push(window.setTimeout(() => {
        setIdeationBubbleVisuals((current) => settleEnteringIdeationBubbleVisuals(current, enteringIds));
      }, getIdeationBubbleEnterSettleDelayMs()));
    }
    if (arcMotionIds.size > 0) {
      timers.push(window.setTimeout(() => {
        setIdeationBubbleVisuals((current) => settleEnteringIdeationBubbleVisuals(current, arcMotionIds));
      }, getIdeationBubbleArcMotionSettleDelayMs()));
    }

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [ideationBubbleVisuals]);
  const ideationBubbleVisualIdSignature = useMemo(
    () => ideationBubbleVisuals.map((bubble) => bubble.id).join("|"),
    [ideationBubbleVisuals],
  );
  const ideationBubbleVisualIds = useMemo(
    () => (ideationBubbleVisualIdSignature ? ideationBubbleVisualIdSignature.split("|") : []),
    [ideationBubbleVisualIdSignature],
  );
  useEffect(() => {
    if (!meetingId || stage !== "ideation") return;
    logCanvasBubbleDebugEvent({
      meeting_id: meetingId,
      user_id: userId,
      event: "bubble_visuals_rendered",
      data: {
        graph_cycle: ideationBubbleGraph.update_cycle,
        keyword_bubbles: ideationKeywordBubbles.length,
        visual_bubbles: ideationBubbleVisuals.length,
        labels: ideationBubbleVisuals.slice(0, 24).map((bubble) => ({
          id: bubble.id,
          text: bubble.text,
          count: bubble.count,
          state: bubble.displayState,
          lifecycle: bubble.lifecycleState,
          anchor: bubble.anchorText,
          x: Math.round(bubble.targetX),
          y: Math.round(bubble.targetY),
          size: Math.round(bubble.size),
          opacity: Number(bubble.opacity.toFixed(3)),
          entering: Boolean(bubble.entering),
          arc_motion: Boolean(bubble.arcMotion),
          arc_key: bubble.arcMotionPath?.key,
          arc_previous_angle: bubble.arcMotionPath?.previousAngle,
          arc_next_angle: bubble.arcMotionPath?.nextAngle,
          demo_motion_type: bubble.demoMotionType,
          demo_previous_angle: bubble.demoPreviousAngle,
          demo_next_angle: bubble.demoNextAngle,
          ring: bubble.orbitRing,
          slot: bubble.orbitSlotIndex,
          order: bubble.orbitOrderKey,
          angle: bubble.orbitAngle,
        })),
      },
    });
  }, [
    ideationBubbleGraph.update_cycle,
    ideationBubbleVisualIdSignature,
    ideationBubbleVisuals,
    ideationKeywordBubbles.length,
    meetingId,
    stage,
    userId,
  ]);
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
        revision: problemStructureArtifactMeta.revision,
        sourceGenerationId: problemStructureArtifactMeta.sourceGenerationId,
        basedOnTranscriptRevision: problemStructureArtifactMeta.basedOnTranscriptRevision,
        updatedAt: problemStructureArtifactMeta.updatedAt,
      }),
    [
      problemDefinitionMode,
      problemDefinitionPhase,
      problemStructureArtifactMeta,
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
      demoBalanceMode,
    });
  }, [
    agendaModels,
    demoBalanceMode,
    onCanvasStageContextChange,
    selectedAgendaId,
    selectedNodeId,
    selectedProblemGroupId,
    stage,
  ]);

  useEffect(() => {
    if (stage !== "solution") {
      autoSolutionRecordingStopRequestedRef.current = false;
      return;
    }
    if (!isRecording || !onStopRecording || autoSolutionRecordingStopRequestedRef.current) return;
    autoSolutionRecordingStopRequestedRef.current = true;
    void onStopRecording();
  }, [isRecording, onStopRecording, stage]);

  useEffect(() => {
    if (isDesktopLayout || !viewportModeReady || mobileViewedStageInitializedRef.current) return;
    if (!workspaceLoadedRef.current) return;

    mobileViewedStageInitializedRef.current = true;
    setMobileViewedStage(toMobileViewedStage(stage, problemDefinitionPhase));
  }, [isDesktopLayout, problemDefinitionPhase, stage, viewportModeReady]);

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
      demoConfig: { enabled: false, mode: "normal", option_a: "", option_b: "", instruction: "" },
      demoBalanceClassification: {},
      stage: "ideation",
      agendaOverrides: {},
      canvasItems: [],
      customGroups: [],
      problemGroups: [],
      problemStructure: createDefaultProblemStructureState(),
      finalSolutionSummary: createEmptyFinalSolutionSummary(),
      artifactGeneration: {},
      ideationBubbleGraph: createEmptyIdeationBubbleGraph(),
      nodePositions: {},
      importedState: null,
    };
    latestSharedSyncEnabledRef.current = true;
    mobileViewedStageInitializedRef.current = false;
    setMobileViewedStage("ideation");
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
    setArtifactGeneration({});
    setIdeationBubbleGraph(createEmptyIdeationBubbleGraph());
    setDemoConfig({ enabled: false, mode: "normal", option_a: "", option_b: "", instruction: "" });
    setDemoBalanceClassification({});
    setProblemStructureArtifactMeta(createDefaultProblemStructureArtifactMeta());
    setSummaryDocumentEditMode(false);
    setSummaryEvidenceOpenGroupIds(new Set());
    setSelectedProblemSourceNodeId("");
    setProblemDiscussionStatus("");
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
      demoConfig: normalizedDemoConfig,
      demoBalanceClassification,
      stage,
      agendaOverrides,
      canvasItems,
      customGroups,
      problemGroups,
      problemStructure: problemStructureStatePayload,
      finalSolutionSummary: finalSummaryDocument,
      artifactGeneration,
      ideationBubbleGraph,
      nodePositions: normalizeCanvasNodePositionsForComputedIdeation(nodePositions),
      importedState: persistedSharedImportedState,
    };
    latestSharedSyncEnabledRef.current = sharedSyncEnabled;
  }, [
    agendaOverrides,
    canvasItems,
    customGroups,
    artifactGeneration,
    meetingGoalContextDraft,
    meetingGoalDraft,
    normalizedDemoConfig,
    demoBalanceClassification,
    ideationBubbleGraph,
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
    setArtifactGeneration,
    setIdeationBubbleGraph,
    setImportedState,
    setImportOverrideActive,
    setLoadingProblemGroupIds,
    setMeetingGoalDrafts,
    setDemoConfig,
    setDemoBalanceClassification,
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
    setProblemStructureArtifactMeta,
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

  useCanvasSelectionGuards({
    canvasItems,
    localNodeOverridesRef,
    nodes,
    problemDefinitionPhase,
    problemGroups,
    selectedCanvasItemId,
    selectedNodeId,
    selectedProblemGroupId,
    setCollapsedProblemGroupIds,
    setEditingProblemGroupId,
    setProblemGroupingRationaleById,
    setProblemGroupingRationaleOpenGroupId,
    setProblemGroupingRationalePendingId,
    setSelectedCanvasItemId,
    setSelectedNodeId,
    setSelectedProblemGroupId,
    sharedSyncEnabled,
    stage,
  });

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
    canvasItems,
    customGroups,
    demoConfig: normalizedDemoConfig,
    demoBalanceClassification,
    finalSummaryDocument,
    artifactGeneration,
    ideationBubbleGraph,
    importedState: persistedSharedImportedState,
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
    stage,
    userId,
    workspaceHydratingRef,
    workspaceLoadedRef,
  });

  const applyArtifactGenerationState = useCallback(
    (generation: CanvasArtifactGenerationState) => {
      const nextArtifactGeneration = setCanvasArtifactGenerationState(
        latestSharedWorkspaceRef.current.artifactGeneration || artifactGeneration,
        generation,
      );
      latestSharedWorkspaceRef.current = {
        ...latestSharedWorkspaceRef.current,
        artifactGeneration: nextArtifactGeneration,
      };
      setArtifactGeneration(nextArtifactGeneration);
      if (sharedSyncEnabled) {
        forceBroadcastSharedCanvas({
          artifactGeneration: nextArtifactGeneration,
        });
      }
      return nextArtifactGeneration;
    },
    [artifactGeneration, forceBroadcastSharedCanvas, latestSharedWorkspaceRef, sharedSyncEnabled],
  );

  const startSharedArtifactGeneration = useCallback(
    async (
      artifactKey: CanvasArtifactGenerationKey,
      force = false,
      meta?: { phase?: string; detail?: string; retryable?: boolean },
    ) => {
      const result = await startCanvasArtifactGeneration({
        meeting_id: meetingId,
        artifact_key: artifactKey,
        user_id: userEmail || userId,
        force,
        phase: meta?.phase || "",
        detail: meta?.detail || "",
        retryable: Boolean(meta?.retryable),
      });
      const nextArtifactGeneration = normalizeCanvasArtifactGeneration(
        result.workspace?.artifact_generation ||
          setCanvasArtifactGenerationState(
            latestSharedWorkspaceRef.current.artifactGeneration || artifactGeneration,
            result.generation,
          ),
      );
      latestSharedWorkspaceRef.current = {
        ...latestSharedWorkspaceRef.current,
        artifactGeneration: nextArtifactGeneration,
      };
      setArtifactGeneration(nextArtifactGeneration);
      if (sharedSyncEnabled) {
        forceBroadcastSharedCanvas({
          artifactGeneration: nextArtifactGeneration,
        });
      }
      return {
        acquired: result.acquired,
        generation: result.generation,
        artifactGeneration: nextArtifactGeneration,
      };
    },
    [
      artifactGeneration,
      forceBroadcastSharedCanvas,
      latestSharedWorkspaceRef,
      meetingId,
      sharedSyncEnabled,
      userEmail,
      userId,
    ],
  );

  const finishSharedArtifactGeneration = useCallback(
    (
      artifactKey: CanvasArtifactGenerationKey,
      status: "ready" | "failed",
      generationId?: string,
      error?: string,
      meta?: { phase?: string; detail?: string; retryable?: boolean },
    ) => {
      const current = latestSharedWorkspaceRef.current.artifactGeneration?.[artifactKey] || artifactGeneration[artifactKey];
      const now = new Date().toISOString();
      return applyArtifactGenerationState({
        artifact_key: artifactKey,
        status,
        generation_id: generationId || current?.generation_id || "",
        started_by: current?.started_by || "",
        started_at: current?.started_at || "",
        updated_at: now,
        finished_at: now,
        error: status === "failed" ? (error || "생성 실패") : "",
        phase: status === "failed" ? (meta?.phase || current?.phase || "") : "",
        detail: status === "failed" ? (meta?.detail || current?.detail || "") : "",
        retryable: status === "failed" ? Boolean(meta?.retryable || current?.retryable) : false,
        version: status === "ready" ? Number(current?.version || 0) + 1 : Number(current?.version || 0),
      });
    },
    [applyArtifactGenerationState, artifactGeneration, latestSharedWorkspaceRef],
  );

  const updateSharedArtifactGenerationPhase = useCallback(
    (
      artifactKey: CanvasArtifactGenerationKey,
      generationId: string,
      phase: string,
      detail: string,
      options?: { notify?: boolean; retryable?: boolean },
    ) => {
      const current = latestSharedWorkspaceRef.current.artifactGeneration?.[artifactKey] || artifactGeneration[artifactKey];
      if (!current || normalizeArtifactGenerationStatus(current.status) !== "generating") return null;
      if (generationId && current.generation_id && current.generation_id !== generationId) return null;
      const now = new Date().toISOString();
      const nextGeneration: CanvasArtifactGenerationState = {
        ...current,
        artifact_key: artifactKey,
        status: "generating",
        generation_id: generationId || current.generation_id || "",
        updated_at: now,
        phase,
        detail,
        retryable: Boolean(options?.retryable),
      };
      const nextArtifactGeneration = applyArtifactGenerationState(nextGeneration);
      if (meetingId) {
        void saveCanvasWorkspacePatch({
          meeting_id: meetingId,
          artifact_generation: nextArtifactGeneration,
        }).catch((error) => {
          console.error("Failed to save artifact generation phase:", error);
        });
      }
      if (options?.notify) {
        setActivityMessage(detail || phase);
      }
      return nextArtifactGeneration;
    },
    [applyArtifactGenerationState, artifactGeneration, latestSharedWorkspaceRef, meetingId, setActivityMessage],
  );

  const commitSharedProblemDefinitionGeneration = useCallback(
    async (payload: {
      generationId: string;
      status: "ready" | "failed";
      error?: string;
      phase?: string;
      detail?: string;
      retryable?: boolean;
    }) => {
      const result = await finishCanvasArtifactGeneration({
        meeting_id: meetingId,
        artifact_key: PROBLEM_DEFINITION_STEP1_ARTIFACT,
        user_id: userEmail || userId,
        generation_id: payload.generationId,
        status: payload.status,
        error: payload.error || "",
        phase: payload.phase || "",
        detail: payload.detail || "",
        retryable: Boolean(payload.retryable),
      });
      const nextArtifactGeneration = normalizeCanvasArtifactGeneration(
        result.workspace?.artifact_generation ||
          setCanvasArtifactGenerationState(
            latestSharedWorkspaceRef.current.artifactGeneration || artifactGeneration,
            result.generation,
          ),
      );
      latestSharedWorkspaceRef.current = {
        ...latestSharedWorkspaceRef.current,
        artifactGeneration: nextArtifactGeneration,
      };
      setArtifactGeneration(nextArtifactGeneration);
      if (sharedSyncEnabled) {
        forceBroadcastSharedCanvas({
          artifactGeneration: nextArtifactGeneration,
        });
      }
      return {
        applied: result.applied,
        artifactGeneration: nextArtifactGeneration,
      };
    },
    [
      artifactGeneration,
      forceBroadcastSharedCanvas,
      latestSharedWorkspaceRef,
      meetingId,
      sharedSyncEnabled,
      userEmail,
      userId,
    ],
  );

  const commitSharedSummaryDocumentGeneration = useCallback(
    async (payload: {
      generationId: string;
      status: "ready" | "failed";
      error?: string;
      phase?: string;
      detail?: string;
      retryable?: boolean;
    }) => {
      const result = await finishCanvasArtifactGeneration({
        meeting_id: meetingId,
        artifact_key: SUMMARY_DOCUMENT_ARTIFACT,
        user_id: userEmail || userId,
        generation_id: payload.generationId,
        status: payload.status,
        error: payload.error || "",
        phase: payload.phase || "",
        detail: payload.detail || "",
        retryable: Boolean(payload.retryable),
      });
      const nextArtifactGeneration = normalizeCanvasArtifactGeneration(
        result.workspace?.artifact_generation ||
          setCanvasArtifactGenerationState(
            latestSharedWorkspaceRef.current.artifactGeneration || artifactGeneration,
            result.generation,
          ),
      );
      latestSharedWorkspaceRef.current = {
        ...latestSharedWorkspaceRef.current,
        artifactGeneration: nextArtifactGeneration,
      };
      setArtifactGeneration(nextArtifactGeneration);
      if (sharedSyncEnabled) {
        forceBroadcastSharedCanvas({
          artifactGeneration: nextArtifactGeneration,
        });
      }
      return {
        applied: result.applied,
        artifactGeneration: nextArtifactGeneration,
      };
    },
    [
      artifactGeneration,
      forceBroadcastSharedCanvas,
      latestSharedWorkspaceRef,
      meetingId,
      sharedSyncEnabled,
      userEmail,
      userId,
    ],
  );

  useCanvasPersistence({
    agendaOverrides,
    applyingRemoteSharedSyncRef,
    buildCurrentWorkspacePatchPayload,
    captureStageOverride,
    canvasItems,
    conclusionBatchBusy,
    customGroups,
    finalSummaryDocument,
    artifactGeneration,
    ideationBubbleGraph,
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
    problemStructurePending:
      problemStructurePending || isCanvasArtifactGenerating(artifactGeneration, PROBLEM_DEFINITION_STEP2_ARTIFACT),
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
      const nextArtifactGeneration = normalizeCanvasArtifactGeneration(workspace.artifact_generation || artifactGeneration);
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
      setProblemStructureArtifactMeta({
        revision: nextProblemStructure.revision,
        sourceGenerationId: nextProblemStructure.sourceGenerationId,
        basedOnTranscriptRevision: nextProblemStructure.basedOnTranscriptRevision,
        updatedAt: nextProblemStructure.updatedAt,
      });
      setProblemStructurePending(false);
      setArtifactGeneration(nextArtifactGeneration);
      setNodePositions(nextNodePositions);
      latestSharedWorkspaceRef.current = {
        ...latestSharedWorkspaceRef.current,
        problemGroups: nextProblemGroups,
        problemStructure: nextProblemStructurePayload,
        artifactGeneration: nextArtifactGeneration,
        nodePositions: nextNodePositions,
        importedState: persistedSharedImportedState,
      };

      if (sharedSyncEnabled) {
        writeSharedWorkspaceSessionCache(
          meetingId,
          buildCurrentWorkspacePatchPayload({
            problemGroups: nextProblemGroups,
            problemStructure: nextProblemStructurePayload,
            artifactGeneration: nextArtifactGeneration,
            nodePositions: nextNodePositions,
          }),
        );
        forceBroadcastSharedCanvas({
          problemGroups: nextProblemGroups,
          problemStructure: nextProblemStructurePayload,
          artifactGeneration: nextArtifactGeneration,
          nodePositions: nextNodePositions,
        });
      }
    },
    [
      buildCurrentWorkspacePatchPayload,
      artifactGeneration,
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

  const commitSharedProblemStructureGeneration = useCallback(
    async (payload: {
      generationId: string;
      status: "ready" | "failed";
      error?: string;
      problemStructure?: ReturnType<typeof buildProblemStructureStatePayload>;
    }) => {
      const result = await finishCanvasArtifactGeneration({
        meeting_id: meetingId,
        artifact_key: PROBLEM_DEFINITION_STEP2_ARTIFACT,
        user_id: userEmail || userId,
        generation_id: payload.generationId,
        status: payload.status,
        error: payload.error || "",
        problem_structure: payload.problemStructure,
      });
      const nextArtifactGeneration = normalizeCanvasArtifactGeneration(
        result.workspace?.artifact_generation ||
          setCanvasArtifactGenerationState(
            latestSharedWorkspaceRef.current.artifactGeneration || artifactGeneration,
            result.generation,
          ),
      );
      latestSharedWorkspaceRef.current = {
        ...latestSharedWorkspaceRef.current,
        artifactGeneration: nextArtifactGeneration,
      };
      setArtifactGeneration(nextArtifactGeneration);
      if (result.workspace) {
        applyServerProblemWorkspace(result.workspace);
      } else if (sharedSyncEnabled) {
        forceBroadcastSharedCanvas({
          artifactGeneration: nextArtifactGeneration,
        });
      }
      return {
        applied: result.applied,
        artifactGeneration: nextArtifactGeneration,
      };
    },
    [
      applyServerProblemWorkspace,
      artifactGeneration,
      forceBroadcastSharedCanvas,
      latestSharedWorkspaceRef,
      meetingId,
      sharedSyncEnabled,
      userEmail,
      userId,
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
    setAgendaOverrides,
    setCanvasItems,
    setCustomGroups,
    setFinalSummaryDocument,
    setArtifactGeneration,
    setIdeationBubbleGraph,
    setImportedState,
    setImportOverrideActive,
    setMeetingGoalDrafts,
    setDemoConfig,
    setDemoBalanceClassification,
    setNodePositions,
    setProblemDefinitionMode,
    setProblemDefinitionPhase,
    setProblemGroups,
    setProblemStructureArtifactMeta,
    setProblemStructureGroups,
    setProblemStructureMethod,
    setProblemStructureNodes,
    setProblemStructurePending,
    setStage,
    setSummaryDocumentDraftDirty,
    setSummaryDocumentDraftMarkdown,
    setSummaryDocumentEditMode,
    sharedSyncEnabled,
    stage,
    userId,
    workspaceHydratingRef,
    workspaceLoadedRef,
  });

  useEffect(() => {
    if (
      !incomingSharedCanvasSync ||
      incomingSharedCanvasSync.meeting_id !== meetingId ||
      incomingSharedCanvasSync.sync_scope !== "meeting_room_reset" ||
      incomingSharedCanvasSync.updated_by === userId
    ) {
      return;
    }
    setMobileViewedStage("ideation");
    mobileViewedStageInitializedRef.current = false;
    setSelectedNodeId("");
    setSelectedProblemGroupId("");
    setSelectedProblemSourceNodeId("");
  }, [incomingSharedCanvasSync, meetingId, userId]);

  const problemDefinitionArtifactGeneration = artifactGeneration[PROBLEM_DEFINITION_STEP1_ARTIFACT];
  const problemStructureArtifactGeneration = artifactGeneration[PROBLEM_DEFINITION_STEP2_ARTIFACT];
  const summaryArtifactGeneration = artifactGeneration[SUMMARY_DOCUMENT_ARTIFACT];
  const problemDefinitionGenerationStatus: CanvasArtifactGenerationStatus =
    normalizeArtifactGenerationStatus(problemDefinitionArtifactGeneration?.status);
  const problemStructureGenerationStatus: CanvasArtifactGenerationStatus =
    normalizeArtifactGenerationStatus(problemStructureArtifactGeneration?.status);
  const summaryDocumentGenerationStatus: CanvasArtifactGenerationStatus =
    normalizeArtifactGenerationStatus(summaryArtifactGeneration?.status);
  const problemDefinitionGenerationError = problemDefinitionArtifactGeneration?.error || "";
  const problemStructureGenerationError = problemStructureArtifactGeneration?.error || "";
  const summaryDocumentGenerationError = summaryArtifactGeneration?.error || "";
  const problemDefinitionGenerationDetail = problemDefinitionArtifactGeneration?.detail || "";
  const problemDefinitionGenerationPhase = problemDefinitionArtifactGeneration?.phase || "";
  const problemDefinitionGenerationRetryable = Boolean(problemDefinitionArtifactGeneration?.retryable);
  const summaryDocumentGenerationDetail = summaryArtifactGeneration?.detail || "";
  const summaryDocumentGenerationPhase = summaryArtifactGeneration?.phase || "";
  const summaryDocumentGenerationRetryable = Boolean(summaryArtifactGeneration?.retryable);
  const sharedProblemDefinitionGenerating = isCanvasArtifactGenerating(
    artifactGeneration,
    PROBLEM_DEFINITION_STEP1_ARTIFACT,
  );
  const sharedProblemStructureGenerating = isCanvasArtifactGenerating(
    artifactGeneration,
    PROBLEM_DEFINITION_STEP2_ARTIFACT,
  );
  const currentArtifactGenerationUser = (userEmail || userId || "").trim();
  const summaryArtifactGenerationStartedBy = (summaryArtifactGeneration?.started_by || "").trim();
  const summaryArtifactGenerationStartedByCurrentUser =
    Boolean(currentArtifactGenerationUser) && summaryArtifactGenerationStartedBy === currentArtifactGenerationUser;
  const summaryArtifactGenerationStale = isCanvasArtifactGenerationStale(summaryArtifactGeneration);
  const sharedSummaryGenerating = isCanvasArtifactGenerating(
    artifactGeneration,
    SUMMARY_DOCUMENT_ARTIFACT,
  );
  const effectiveProblemDefinitionStagePending =
    problemDefinitionStagePending ||
    (stage === "problem-definition" && problemDefinitionPhase !== "structure" && sharedProblemDefinitionGenerating);
  const effectiveProblemStructurePending =
    problemStructurePending ||
    (stage === "problem-definition" && problemDefinitionPhase === "structure" && sharedProblemStructureGenerating);
  const effectiveSummaryDocumentPending = summaryDocumentPending || (stage === "solution" && sharedSummaryGenerating);

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
    generationLocked: effectiveProblemDefinitionStagePending,
    problemGroupDraftConclusion,
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
    handleRegenerateProblemStructure,
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
    startSharedArtifactGeneration,
    commitProblemStructureGeneration: commitSharedProblemStructureGeneration,
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
          onCancelProblemStructureGroupEdit: handleCancelProblemStructureGroupEdit,
          onCancelProblemStructureNodeEdit: handleCancelProblemStructureNodeEdit,
          onDeleteProblemStructureGroup: handleDeleteProblemStructureGroup,
          onProblemStructureGroupDragOver: handleProblemStructureGroupDragOver,
          onProblemStructureGroupDrop: handleProblemStructureGroupDrop,
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
          onUpdateProblemStructureNodeStatus: handleUpdateProblemStructureNodeStatus,
          demoStructureLayout: demoBalanceMode,
          hideStatusControls: demoBalanceMode,
          problemStructureDrag,
          problemStructureGroupDraftTitle,
          problemStructureGroups,
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
      demoBalanceMode,
    });
  }, [
    stage,
    demoBalanceMode,
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
    handleUpdateProblemStructureNodeStatus,
    handleQuickEditProblemGroup,
    handleSaveProblemGroupEdit,
    handleShowProblemGroupingRationale,
    handleToggleProblemChildren,
    loadingProblemGroupIds,
    nodePositions,
    problemChildGenerationPendingId,
    problemDefinitionPhase,
    problemExploreLayout,
    problemGroupDraftConclusion,
    problemGroupDraftTopic,
    problemGroupingRationaleById,
    problemGroupingRationalePendingId,
    problemGroups,
    problemStructureDrag,
    editingProblemStructureGroupId,
    editingProblemStructureNodeId,
    problemStructureGroupDraftTitle,
    problemStructureGroups,
    problemStructureNodeDraftTitle,
    problemStructureNodes,
    remoteEditPresenceByKey,
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
    () => getSummaryEligibleStructureGroups(problemStructureGroups, problemStructureNodes),
    [problemStructureGroups, problemStructureNodes],
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
    handleRegenerateProblemDefinition,
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
    demoConfig: normalizedDemoConfig,
    nodePositions,
    persistedSharedImportedState,
    problemDefinitionStagePending,
    problemGroups,
    selectedProblemGroupId,
    serializeSharedProblemGroups: buildWorkspaceProblemGroupsPayload,
    setActivityMessage,
    setBusy,
    setCollapsedProblemGroupIds,
    setDemoBalanceClassification,
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
    startSharedArtifactGeneration,
    updateSharedArtifactGenerationPhase,
    commitSharedProblemDefinitionGeneration,
    finishSharedArtifactGeneration,
    transcripts,
  });

  const {
    handleCopyFinalSolutionMarkdown,
    handleGenerateSummaryDocument,
    handleRegenerateSummaryDocument,
    handleRefreshSummaryCache,
    handleSaveSummaryDocument,
    handleSetSummaryDocumentEditMode,
    handleSummaryDocumentBlocksChange,
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
    demoConfig: normalizedDemoConfig,
    demoBalanceClassification,
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
    setSummaryDocumentDraftBlocks,
    setSummaryDocumentDraftMarkdown,
    setSummaryDocumentEditMode,
    setSummaryDocumentPending,
    setSummaryEvidenceOpenGroupIds,
    setLocalEditPresenceTarget,
    sharedSyncEnabled,
    startSharedArtifactGeneration,
    updateSharedArtifactGenerationPhase,
    commitSharedSummaryDocumentGeneration,
    finishSharedArtifactGeneration,
    summaryDocumentDraftBlocks,
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
        if (summaryEligibleStructureGroups.length === 0) {
          setSummaryDocumentPending(false);
          setStage("solution");
          setSelectedProblemGroupId("");
          setSelectedNodeId("");
          setLeftPanelTab("detail");
          setActivityMessage(
            demoBalanceMode
              ? "문제 정의 단계에서 A/B 의견 정리가 먼저 필요합니다."
              : "문제정의 2단계에서 확정된 분류가 있어야 요약 및 정리 문서를 생성할 수 있습니다.",
          );
          return;
        }

        if (sharedSummaryGenerating && !summaryArtifactGenerationStartedByCurrentUser && !summaryArtifactGenerationStale) {
          setStage("solution");
          setSelectedProblemGroupId("");
          setSelectedNodeId("");
          setLeftPanelTab("detail");
          setActivityMessage("요약 및 정리 문서 생성 요청이 이미 진행 중입니다. 완료되면 자동으로 반영됩니다.");
          return;
        }

        if (busy || summaryDocumentPending) {
          setActivityMessage(
            summaryDocumentPending
              ? "요약 문서를 생성하는 중이라 잠시 후 다시 시도해 주세요."
              : "다른 작업이 진행 중이라 아직 요약 단계로 전환할 수 없습니다.",
          );
          return;
        }

        const hasExistingSummaryDocument =
          (finalSummaryDocument.markdown.trim() || (finalSummaryDocument.document_blocks || []).length > 0) &&
          (finalSummaryDocument.sections || []).length > 0;
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
      if (sharedProblemDefinitionGenerating) {
        setStage("problem-definition");
        setLeftPanelTab("detail");
        setActivityMessage("다른 참가자가 문제정의를 생성 중입니다. 완료되면 자동으로 반영됩니다.");
        return;
      }
      autoProblemDefinitionRef.current = true;
      await handleGenerateProblemDefinition();
      setLeftPanelTab("detail");
      return;
    },
    [
      busy,
      clearProblemStructureDrag,
      conclusionBatchBusy,
      finalSummaryDocument.markdown,
      finalSummaryDocument.document_blocks,
      finalSummaryDocument.sections,
      demoBalanceMode,
      flushProblemDiscussionBuffer,
      handleGenerateProblemDefinition,
      handleGenerateSummaryDocument,
      sharedProblemDefinitionGenerating,
      sharedSummaryGenerating,
      summaryArtifactGenerationStartedByCurrentUser,
      summaryArtifactGenerationStale,
      summaryEligibleStructureGroups.length,
      summaryDocumentPending,
      stage,
    ],
  );

  const {
    handleAddPersonalNote,
    handleDeletePersonalNote,
    handleStartPersonalNoteEdit,
    handleCancelPersonalNoteEdit,
    handleSavePersonalNoteEdit,
    handlePersonalNoteDragEnd,
  } = useCanvasPersonalNotePanelActions<PersonalNote>({
    meetingId,
    composerTitle,
    composerBody,
    projectPersonalNoteCount: projectPersonalNotes.length,
    composerPersonalNoteLinkId: COMPOSER_PERSONAL_NOTE_LINK_ID,
    pendingPersonalNoteLinkId,
    editingPersonalNoteId,
    personalNoteDraftTitle,
    personalNoteDraftBody,
    setActivityMessage,
    setComposerTitle,
    setComposerBody,
    setComposerLinkedCanvasItemId,
    setComposerLinkedCanvasItemTitle,
    setPendingPersonalNoteLinkId,
    setPersonalNotes,
    setEditingPersonalNoteId,
    setPersonalNoteDraftAgendaId,
    setPersonalNoteDraftTitle,
    setPersonalNoteDraftBody,
    setDraggingPersonalNoteId,
    setDropProblemGroupId,
  });

  const isProblemDefinitionExploreStage = stage === "problem-definition" && problemDefinitionPhase !== "structure";
  const problemCanvasToolbarActions = useMemo<ProblemCanvasToolbarAction[]>(
    () =>
      demoBalanceMode
        ? []
        : problemDefinitionPhase === "structure"
        ? ["structure-back", "structure-ai-group", "structure-add-group"]
        : [],
    [demoBalanceMode, problemDefinitionPhase],
  );

  const problemToolbarActionLabel = useCallback((action: ProblemCanvasToolbarAction) => {
    if (action === "structure-start") return "구조화 시작";
    if (action === "structure-back") return "정의 1단계";
    if (action === "structure-ai-group") return effectiveProblemStructurePending ? "AI 묶는 중" : "AI 자동묶음";
    return "그룹 추가";
  }, [effectiveProblemStructurePending]);

  const isProblemToolbarActionActive = useCallback((action: ProblemCanvasToolbarAction) => {
    if (action === "structure-start") return problemDefinitionPhase === "structure" || problemStructureSetupOpen;
    if (action === "structure-ai-group") return effectiveProblemStructurePending;
    return false;
  }, [effectiveProblemStructurePending, problemDefinitionPhase, problemStructureSetupOpen]);

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

  useEffect(() => {
    if (stage !== "problem-definition") {
      autoProblemDefinitionRef.current = false;
      return;
    }
    if (
      problemGroups.length > 0 ||
      busy ||
      sharedProblemDefinitionGenerating ||
      agendaModels.length === 0 ||
      autoProblemDefinitionRef.current
    ) {
      return;
    }

    autoProblemDefinitionRef.current = true;
    void handleGenerateProblemDefinition();
  }, [
    agendaModels.length,
    busy,
    handleGenerateProblemDefinition,
    problemGroups.length,
    sharedProblemDefinitionGenerating,
    stage,
  ]);

  const handleStopRecordingClick = useCallback(async () => {
    await onStopRecording?.();
    await flushProblemDiscussionBuffer("manual");
  }, [flushProblemDiscussionBuffer, onStopRecording]);

  const getEndingFinalSummaryDocumentSnapshot = useCallback(() => {
    const latestSummary = normalizeFinalSolutionSummaryPayload(latestSharedWorkspaceRef.current.finalSolutionSummary);
    if (latestSummary.markdown.trim() || (latestSummary.sections || []).length > 0 || latestSummary.final_count > 0) {
      return latestSummary;
    }
    return finalSummaryDocument;
  }, [finalSummaryDocument, latestSharedWorkspaceRef]);

  const handleEndMeetingClick = useCallback(async () => {
    await flushProblemDiscussionBuffer("stage-change");

    const finalSolutionSummary = buildFinalSolutionSummaryPayload(getEndingFinalSummaryDocumentSnapshot());
    openEndMeetingConfirm({
      finalCount: finalSolutionSummary.final_count,
      topicCount: finalSolutionSummary.sections?.length || finalSolutionSummary.topics.length,
    });
  }, [flushProblemDiscussionBuffer, getEndingFinalSummaryDocumentSnapshot, openEndMeetingConfirm]);

  const handleDownloadEndMeetingSummaryPdf = () => {
    if (!endMeetingSummaryPreviewMarkdown.trim()) return;
    const printStarted = openPrintableSummaryDocumentPdf(endMeetingSummaryPreviewMarkdown);
    if (!printStarted) {
      alert("PDF 저장 화면을 열 수 없습니다. 브라우저 인쇄 메뉴에서 직접 PDF로 저장해 주세요.");
    }
  };

  const handleCloseFinalReportQr = useCallback(() => {
    setFinalReportQrOpen(false);
    setFinalReportQrError("");
    setFinalReportQrCopied(false);
  }, []);

  const handleCopyFinalReportQrUrl = useCallback(async () => {
    if (!finalReportQrUrl) return;
    const copied = await copyTextToClipboard(finalReportQrUrl);
    if (!copied) {
      setFinalReportQrError("링크를 복사할 수 없습니다. 주소를 직접 선택해 복사해 주세요.");
      return;
    }

    setFinalReportQrCopied(true);
    if (finalReportQrCopiedTimerRef.current !== null) {
      window.clearTimeout(finalReportQrCopiedTimerRef.current);
    }
    finalReportQrCopiedTimerRef.current = window.setTimeout(() => {
      setFinalReportQrCopied(false);
      finalReportQrCopiedTimerRef.current = null;
    }, 1600);
  }, [finalReportQrUrl]);

  const handleCreateFinalReportQr = useCallback(async () => {
    if (!meetingId) {
      setFinalReportQrOpen(true);
      setFinalReportQrError("회의 정보를 찾을 수 없어 QR코드를 생성할 수 없습니다.");
      return;
    }

    const finalSummarySnapshot = getEndingFinalSummaryDocumentSnapshot();
    const finalSolutionSummary = buildFinalSolutionSummaryPayload(finalSummarySnapshot);
    if (!finalSolutionSummary.markdown.trim() && !(finalSolutionSummary.document_blocks || []).length) {
      setFinalReportQrOpen(true);
      setFinalReportQrError("공유할 최종 정리 문서가 없습니다.");
      return;
    }

    setFinalReportQrOpen(true);
    setFinalReportQrLoading(true);
    setFinalReportQrError("");
    setFinalReportQrCopied(false);

    try {
      await saveCanvasWorkspacePatch({
        meeting_id: meetingId,
        final_solution_summary: finalSolutionSummary,
        imported_state: persistedSharedImportedState,
      });
      const share = await createCanvasFinalReportShare({ meeting_id: meetingId });
      const reportUrl = buildFinalReportShareUrl(share.meeting_id, share.token);
      if (!reportUrl) {
        throw new Error("공유 링크를 만들 수 없습니다.");
      }

      const { toDataURL } = await import("qrcode");
      const imageDataUrl = await toDataURL(reportUrl, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 248,
        color: {
          dark: "#181818",
          light: "#ffffff",
        },
      });

      setFinalReportQrUrl(reportUrl);
      setFinalReportQrImageDataUrl(imageDataUrl);
    } catch (error) {
      console.error("Failed to create final report QR:", error);
      const message = error instanceof Error ? error.message : "QR코드 생성에 실패했습니다.";
      setFinalReportQrError(message);
    } finally {
      setFinalReportQrLoading(false);
    }
  }, [getEndingFinalSummaryDocumentSnapshot, meetingId, persistedSharedImportedState]);

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

  const rawCanvasStatusMessage = activityMessage || ideationKeywordStatusMessage || recordingStatusText;
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

  const {
    handleCanvasNodeClick,
    handleCanvasPaneClick,
  } = useCanvasSurfaceInteractionHandlers({
    stage,
    problemDefinitionPhase,
    canvasItemById,
    linkPendingPersonalNoteToCanvasItem,
    openRightDrawer,
    closeRightDrawer,
    setSelectedNodeId,
    setLeftPanelTab,
    setSelectedCanvasItemId,
    setSelectedProblemGroupId,
    setSelectedProblemSourceNodeId,
    setEditingProblemGroupId,
    setSelectedAgendaId,
  });

  const centerIdeationViewportOnce = useCallback((instance: ReactFlowInstance<Node, Edge>) => {
    if (stage !== "ideation") return;
    const viewportKey = `${meetingId}:ideation`;
    if (ideationViewportCenteredKeyRef.current === viewportKey) return;
    ideationViewportCenteredKeyRef.current = viewportKey;

    window.requestAnimationFrame(() => {
      const bounds = canvasSurfaceRef.current?.getBoundingClientRect();
      if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;
      const zoom = Math.min(
        1,
        Math.max(
          0.45,
          Math.min(
            bounds.width / (CANVAS_IDEATION_BUBBLE_PLANE_WIDTH + 160),
            bounds.height / (CANVAS_IDEATION_BUBBLE_PLANE_HEIGHT + 120),
          ),
        ),
      );
      const viewport = {
        x: Math.round(bounds.width / 2 - (CANVAS_IDEATION_BUBBLE_PLANE_WIDTH / 2) * zoom),
        y: Math.round(bounds.height / 2 - (CANVAS_IDEATION_BUBBLE_PLANE_HEIGHT / 2) * zoom),
        zoom,
      };
      const centerX = (bounds.width / 2 - viewport.x) / zoom;
      const centerY = (bounds.height / 2 - viewport.y) / zoom;
      const visibleWorldHeight = bounds.height / zoom;
      const spawnOffsetY = Math.min(280, Math.max(180, visibleWorldHeight * 0.24));
      ideationBubbleLayoutAnchorRef.current = {
        centerX: Math.round(centerX),
        centerY: Math.round(centerY),
        spawnX: Math.round(centerX),
        spawnY: Math.round(centerY + spawnOffsetY),
      };
      void instance.setViewport(viewport, { duration: 0 });
    });
  }, [canvasSurfaceRef, meetingId, stage]);

  const handleFlowInitStable = useStableEvent((instance: ReactFlowInstance<Node, Edge>) => {
    flowRef.current = instance;
    centerIdeationViewportOnce(instance);
  });
  useEffect(() => {
    if (!flowRef.current) return;
    centerIdeationViewportOnce(flowRef.current);
  }, [centerIdeationViewportOnce, flowRef]);
  const handleCanvasNodeClickStable = useStableEvent(handleCanvasNodeClick);
  const handleCanvasPaneClickStable = useStableEvent(handleCanvasPaneClick);
  const handleNodesChangeStable = useStableEvent(onNodesChange);
  const handleNodeDragStartStable = useStableEvent(onNodeDragStart);
  const handleNodeDragStable = useStableEvent(onNodeDrag);
  const handleNodeDragStopStable = useStableEvent(onNodeDragStop);

  const handleProblemToolbarAction = useCallback((action: ProblemCanvasToolbarAction) => {
    if (action === "structure-start") {
      handleOpenProblemStructureSetup();
      return;
    }

    if (action === "structure-back") {
      handleBackToProblemDefinitionExplore();
      return;
    }

    if (action === "structure-ai-group") {
      void handleRegenerateProblemStructure();
      return;
    }

    if (action === "structure-add-group") {
      handleAddProblemStructureGroup();
    }
  }, [
    handleAddProblemStructureGroup,
    handleBackToProblemDefinitionExplore,
    handleOpenProblemStructureSetup,
    handleRegenerateProblemStructure,
  ]);
  const handleCloseProblemStructureSetup = useCallback(() => {
    setProblemStructureSetupOpen(false);
  }, [setProblemStructureSetupOpen]);
  const handleProblemStructureMethodChange = useCallback((method: ProblemStructureMethod) => {
    setProblemStructureMethod(method);
    setActivityMessage(`${problemStructureMethodLabel(method)} 방식으로 시각 표현을 바꿨습니다. 기존 그룹은 유지됩니다.`);
  }, [setActivityMessage, setProblemStructureMethod]);
  const handleProblemDefinitionModeChange = useCallback((mode: Exclude<ProblemDefinitionMode, "">) => {
    setProblemDefinitionMode(mode);
    if (mode === "ai") {
      void runProblemStructureGrouping();
      return;
    }
    setActivityMessage("직접 구성 모드로 표시했습니다.");
  }, [runProblemStructureGrouping, setActivityMessage, setProblemDefinitionMode]);
  const handleProblemDefinitionPhaseSelect = useCallback((phase: ProblemDefinitionPhase) => {
    if (phase === "structure" && problemStructureGroups.length === 0) {
      void handleStartProblemStructure();
      return;
    }
    setProblemDefinitionPhase(phase);
    if (phase === "structure") {
      setSelectedProblemGroupId("");
      setSelectedNodeId("");
      setActivityMessage("문제정의 2단계로 이동했습니다.");
      return;
    }
    const nextGroupId = selectedProblemGroupId || problemGroups[0]?.group_id || "";
    setSelectedProblemGroupId(nextGroupId);
    setSelectedNodeId(nextGroupId ? `problem-${nextGroupId}` : "");
    setActivityMessage(demoBalanceMode ? "문제정의로 이동했습니다." : "문제정의 1단계로 이동했습니다.");
  }, [
    demoBalanceMode,
    problemGroups,
    problemStructureGroups.length,
    selectedProblemGroupId,
    setActivityMessage,
    setProblemDefinitionPhase,
    setSelectedNodeId,
    setSelectedProblemGroupId,
    handleStartProblemStructure,
  ]);
  const handleCloseProblemGroupingRationale = useCallback(() => {
    setProblemGroupingRationaleOpenGroupId("");
  }, [setProblemGroupingRationaleOpenGroupId]);
  const handleToggleRightDrawerNotesCollapsed = useCallback(() => {
    setRightDrawerNotesCollapsed((prev) => !prev);
  }, [setRightDrawerNotesCollapsed]);
  const handleCloseQuickAsk = useCallback(() => {
    setQuickAskOpen(false);
  }, [setQuickAskOpen]);
  const handleShareMeetingLink = useCallback(async () => {
    const shareUrl = buildMeetingShareUrl(meetingId);
    if (!shareUrl) {
      setActivityMessage("복사할 회의 링크가 없습니다.");
      return false;
    }

    const copied = await copyTextToClipboard(shareUrl);
    setActivityMessage(
      copied
        ? "회의 링크를 복사했습니다."
        : "브라우저 권한 문제로 회의 링크 복사에 실패했습니다.",
    );
    return copied;
  }, [meetingId, setActivityMessage]);
  const handleSaveMeetingTitle = useCallback(async (title: string) => {
    const nextTitle = title.trim();
    if (!nextTitle) {
      setActivityMessage("회의 제목을 입력해 주세요.");
      return false;
    }
    if (nextTitle === meetingTitle.trim()) {
      return true;
    }
    if (!onMeetingTitleSave) {
      setActivityMessage("회의 제목 저장 기능을 사용할 수 없습니다.");
      return false;
    }

    try {
      await onMeetingTitleSave(nextTitle);
      setActivityMessage("회의 제목을 수정했습니다.");
      return true;
    } catch (error) {
      console.error("Failed to save meeting title:", error);
      setActivityMessage("회의 제목 저장에 실패했습니다.");
      return false;
    }
  }, [meetingTitle, onMeetingTitleSave, setActivityMessage]);
  const handleDebugResetWorkspace = useCallback(async (scope: CanvasDebugResetScope) => {
    if (!CANVAS_DEBUG_RESET_ENABLED) return;
    if (debugResetBusy) return;
    if (!meetingId) {
      setActivityMessage("초기화할 회의 정보가 없습니다.");
      return;
    }
    if (stage !== "ideation") {
      setActivityMessage("디버그 초기화는 아이디어 단계에서만 사용할 수 있습니다.");
      return;
    }

    const resetRoom = scope === "room";
    const resetProblem = scope === "problem" || scope === "all" || resetRoom;
    const resetSummary = scope === "summary" || scope === "all" || resetProblem;
    const scopeLabel =
      scope === "problem"
        ? "문제정의 이후 데이터"
        : scope === "summary"
          ? "요약 및 정리 데이터"
          : scope === "room"
            ? "회의실 STT와 생성 데이터"
            : "문제정의와 요약 및 정리 데이터";
    const confirmed = window.confirm(
      resetRoom
        ? `[Debug] ${scopeLabel}를 초기화할까요?\n전사, 버블, 문제정의, 요약 데이터를 삭제합니다.\n회의 제목, 목표, 데모 설정, 개인 메모는 유지됩니다.`
        : `[Debug] ${scopeLabel}를 초기화할까요?\nSTT, 버블, 개인 메모는 유지됩니다.`,
    );
    if (!confirmed) return;

    setDebugResetBusy(true);
    setActivityMessage(`[Debug] ${scopeLabel}를 초기화하는 중입니다.`);

    const now = new Date().toISOString();
    const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const artifactKeys: CanvasArtifactGenerationKey[] = [
      ...(resetProblem ? [PROBLEM_DEFINITION_STEP1_ARTIFACT, PROBLEM_DEFINITION_STEP2_ARTIFACT] : []),
      ...(resetSummary ? [SUMMARY_DOCUMENT_ARTIFACT] : []),
    ];
    const nextArtifactGeneration = buildDebugResetArtifactGeneration(
      latestSharedWorkspaceRef.current.artifactGeneration || artifactGeneration,
      artifactKeys,
      now,
      userEmail || userId || "debug",
      nonce,
    );
    const nextProblemGroups = resetProblem ? [] : problemGroups;
    const nextProblemStructureArtifactMeta: ProblemStructureArtifactMeta = resetProblem
      ? {
          revision: Number(problemStructureArtifactMeta.revision || 0) + 1,
          sourceGenerationId: `debug-reset:${nonce}`,
          basedOnTranscriptRevision: 0,
          updatedAt: now,
        }
      : problemStructureArtifactMeta;
    const nextProblemStructure = resetProblem
      ? buildProblemStructureStatePayload({
          phase: "explore",
          method: "affinity",
          mode: "",
          nodes: [],
          groups: [],
          revision: nextProblemStructureArtifactMeta.revision,
          sourceGenerationId: nextProblemStructureArtifactMeta.sourceGenerationId,
          basedOnTranscriptRevision: nextProblemStructureArtifactMeta.basedOnTranscriptRevision,
          updatedAt: nextProblemStructureArtifactMeta.updatedAt,
        })
      : problemStructureStatePayload;
    const nextFinalSummaryDocument = resetSummary ? createEmptyFinalSolutionSummary() : finalSummaryDocument;
    const nextDemoBalanceClassification = resetProblem ? {} : demoBalanceClassification;
    const currentIdeationBubbleGraph = normalizeIdeationBubbleGraphForWorkspace(
      latestSharedWorkspaceRef.current.ideationBubbleGraph || ideationBubbleGraph,
    );
    const nextIdeationBubbleGraph = resetRoom
      ? createDemoBalanceAnchoredIdeationBubbleGraph(normalizedDemoConfig, {
          updateCycle: Number(currentIdeationBubbleGraph.update_cycle || 0) + 1,
          layoutRevision: Number(currentIdeationBubbleGraph.layout_revision || 0) + 1,
          updatedAt: now,
        })
      : ideationBubbleGraph;
    const nextImportedState = resetRoom ? null : persistedSharedImportedState;
    const nextNodePositions = resetRoom
      ? normalizeCanvasNodePositionsForComputedIdeation({
          ideation: {},
          "problem-definition": {},
          solution: {},
        })
      : resetProblem
        ? normalizeCanvasNodePositionsForComputedIdeation({
            ...nodePositions,
            "problem-definition": {},
            solution: {},
          })
        : nodePositions;
    const llmCacheResetPrefixes = [
      ...(resetProblem ? PROBLEM_DEFINITION_LLM_CACHE_RESET_PREFIXES : []),
      ...(resetSummary ? SUMMARY_DOCUMENT_LLM_CACHE_RESET_PREFIXES : []),
    ];

    try {
      if (resetRoom && isRecording) {
        await onStopRecording?.();
      }
      const fullPatchPayload = {
        ...buildCurrentWorkspacePatchPayload({
          stage: "ideation",
          problemGroups: nextProblemGroups,
          problemStructure: nextProblemStructure,
          demoBalanceClassification: nextDemoBalanceClassification,
          finalSolutionSummary: nextFinalSummaryDocument,
          artifactGeneration: nextArtifactGeneration,
          ideationBubbleGraph: nextIdeationBubbleGraph,
          nodePositions: nextNodePositions,
          importedState: nextImportedState,
        }),
        llm_cache_reset_prefixes: llmCacheResetPrefixes,
      };
      const patchPayload = { ...fullPatchPayload, stage: undefined };
      if (resetRoom) {
        onSharedCanvasSync({
          sync_id: `meeting-room-reset-${nonce}`,
          meeting_id: meetingId,
          sync_scope: "meeting_room_reset",
          updated_by: userId,
          updated_at: now,
          meeting_goal: fullPatchPayload.meeting_goal || "",
          meeting_goal_context: fullPatchPayload.meeting_goal_context || "",
          demo_config: fullPatchPayload.demo_config,
          demo_balance_classification: fullPatchPayload.demo_balance_classification,
          stage: "ideation",
          agenda_overrides: fullPatchPayload.agenda_overrides,
          canvas_items: fullPatchPayload.canvas_items,
          custom_groups: fullPatchPayload.custom_groups,
          problem_groups: fullPatchPayload.problem_groups,
          problem_structure: fullPatchPayload.problem_structure,
          solution_topics: fullPatchPayload.solution_topics,
          final_solution_summary: fullPatchPayload.final_solution_summary,
          artifact_generation: fullPatchPayload.artifact_generation,
          ideation_bubble_graph: fullPatchPayload.ideation_bubble_graph,
          node_positions: fullPatchPayload.node_positions,
          imported_state: fullPatchPayload.imported_state,
        });
      }
      if (resetRoom) {
        await resetMeetingRoomRuntimeState({
          meeting_id: meetingId,
          user_id: userId,
        });
      }
      await saveCanvasWorkspacePatch(patchPayload);
      writeSharedWorkspaceSessionCache(meetingId, fullPatchPayload);

      if (resetProblem) {
        problemStructureRequestSeqRef.current += 1;
        processedProblemUtteranceIdsRef.current = new Set();
        failedProblemDiscussionRef.current = null;
        problemDiscussionInFlightRef.current = false;
        if (problemDiscussionFlushTimerRef.current) {
          window.clearTimeout(problemDiscussionFlushTimerRef.current);
          problemDiscussionFlushTimerRef.current = null;
        }
        resetProblemStructureEditorState();
        setProblemGroups([]);
        setProblemDefinitionMode("");
        setProblemDefinitionPhase("explore");
        setProblemStructureMethod("affinity");
        setProblemStructureDraftMethod("affinity");
        setProblemStructureDraftMode("ai");
        setProblemStructureSetupOpen(false);
        setProblemStructureNodes([]);
        setProblemStructureGroups([]);
        setProblemStructureArtifactMeta(nextProblemStructureArtifactMeta);
        setProblemStructurePending(false);
        setProblemDefinitionStagePending(false);
        setProblemDiscussionStatus("");
        setLoadingProblemGroupIds([]);
        setCollapsedProblemGroupIds(new Set());
        setEditingProblemGroupId("");
        setProblemGroupDraftTopic("");
        setProblemGroupDraftInsight("");
        setProblemGroupDraftConclusion("");
        setProblemGroupingRationaleById({});
        setProblemGroupingRationalePendingId("");
        setProblemGroupingRationaleOpenGroupId("");
        setSelectedProblemGroupId("");
        setSelectedProblemSourceNodeId("");
        setSelectedNodeId("");
        setNodePositions(nextNodePositions);
        setDemoBalanceClassification(nextDemoBalanceClassification);
      }

      if (resetSummary) {
        setFinalSummaryDocument(nextFinalSummaryDocument);
        setSummaryDocumentDraftBlocks([]);
        setSummaryDocumentDraftMarkdown("");
        setSummaryDocumentDraftDirty(false);
        setSummaryDocumentEditMode(false);
        setSummaryDocumentPending(false);
        setSummaryEvidenceOpenGroupIds(new Set());
        setLocalEditPresenceTarget(null);
      }

      if (resetRoom) {
        setIdeationBubbleGraph(nextIdeationBubbleGraph);
        setIdeationBubbleVisuals([]);
        setIdeationBubbleDebugGrowthById({});
        setIdeationBubbleLayoutRevision((current) => current + 1);
        setImportedState(null);
        setImportOverrideActive(false);
        setMobileViewedStage("ideation");
        mobileViewedStageInitializedRef.current = false;
        onMeetingTranscriptReset?.();
      }

      setArtifactGeneration(nextArtifactGeneration);
      setBusy(false);
      setStage("ideation");
      latestSharedWorkspaceRef.current = {
        ...latestSharedWorkspaceRef.current,
        problemGroups: nextProblemGroups,
        problemStructure: nextProblemStructure,
        demoBalanceClassification: nextDemoBalanceClassification,
        finalSolutionSummary: nextFinalSummaryDocument,
        artifactGeneration: nextArtifactGeneration,
        ideationBubbleGraph: nextIdeationBubbleGraph,
        nodePositions: nextNodePositions,
        importedState: nextImportedState,
      };
      if (sharedSyncEnabled) {
        if (!resetRoom) {
          forceBroadcastSharedCanvas({
            problemGroups: nextProblemGroups,
            problemStructure: nextProblemStructure,
            demoBalanceClassification: nextDemoBalanceClassification,
            finalSolutionSummary: nextFinalSummaryDocument,
            artifactGeneration: nextArtifactGeneration,
            nodePositions: nextNodePositions,
            importedState: nextImportedState,
          });
        }
      }
      setActivityMessage(`[Debug] ${scopeLabel}를 초기화했습니다.`);
    } catch (error) {
      console.error("Failed to reset canvas workspace debug data:", error);
      const message = error instanceof Error ? error.message : String(error);
      setActivityMessage(`[Debug] 초기화 실패: ${message}`);
    } finally {
      setDebugResetBusy(false);
    }
  }, [
    artifactGeneration,
    buildCurrentWorkspacePatchPayload,
    debugResetBusy,
    demoBalanceClassification,
    finalSummaryDocument,
    forceBroadcastSharedCanvas,
    ideationBubbleGraph,
    isRecording,
    latestSharedWorkspaceRef,
    meetingId,
    nodePositions,
    onMeetingTranscriptReset,
    onSharedCanvasSync,
    onStopRecording,
    persistedSharedImportedState,
    problemGroups,
    problemStructureArtifactMeta,
    problemStructureStatePayload,
    resetProblemStructureEditorState,
    setActivityMessage,
    setArtifactGeneration,
    setBusy,
    setCollapsedProblemGroupIds,
    setDemoBalanceClassification,
    setEditingProblemGroupId,
    setFinalSummaryDocument,
    setIdeationBubbleDebugGrowthById,
    setIdeationBubbleGraph,
    setIdeationBubbleLayoutRevision,
    setIdeationBubbleVisuals,
    setImportedState,
    setImportOverrideActive,
    setLocalEditPresenceTarget,
    setLoadingProblemGroupIds,
    setNodePositions,
    setProblemDefinitionMode,
    setProblemDefinitionPhase,
    setProblemDefinitionStagePending,
    setProblemDiscussionStatus,
    setProblemGroups,
    setProblemGroupingRationaleById,
    setProblemGroupingRationaleOpenGroupId,
    setProblemGroupingRationalePendingId,
    setProblemGroupDraftConclusion,
    setProblemGroupDraftInsight,
    setProblemGroupDraftTopic,
    setProblemStructureArtifactMeta,
    setProblemStructureDraftMethod,
    setProblemStructureDraftMode,
    setProblemStructureGroups,
    setProblemStructureMethod,
    setProblemStructureNodes,
    setProblemStructurePending,
    setProblemStructureSetupOpen,
    setSelectedNodeId,
    setSelectedProblemGroupId,
    setSelectedProblemSourceNodeId,
    setStage,
    setSummaryDocumentDraftBlocks,
    setSummaryDocumentDraftDirty,
    setSummaryDocumentDraftMarkdown,
    setSummaryDocumentEditMode,
    setSummaryDocumentPending,
    setSummaryEvidenceOpenGroupIds,
    sharedSyncEnabled,
    stage,
    userEmail,
    userId,
  ]);
  const handleRightDrawerResizeStart = useMemo(
    () => startPanelResize("right"),
    [startPanelResize],
  );
  const headerHandlers = useCanvasHeaderActions({
    router,
    isRecording,
    onToggleRecording,
    onStopRecordingClick: handleStopRecordingClick,
    onEndMeetingClick: handleEndMeetingClick,
    onRefreshProblemChunkSummaries: handleRefreshProblemChunkSummaries,
    onDebugRegenerateProblemDefinition: handleDebugRegenerateProblemDefinition,
    onSaveMeetingGoalEdit: handleSaveMeetingGoalEdit,
    onSaveMeetingTitle: handleSaveMeetingTitle,
    onStageSelect: handleStageSelect,
    onOpenMeetingGoalEditor: handleOpenMeetingGoalEditor,
    onCancelMeetingGoalEdit: handleCancelMeetingGoalEdit,
    setMeetingGoalEditorDraft,
    setMeetingGoalContextEditorDraft,
    setIdeationBubbleLayoutRevision,
    setIdeationBubbleDebugEnabled,
    setActivityMessage,
  });

  const headerProps = useCanvasHeaderModels({
    view: {
      meetingTitle,
      isRecording: Boolean(isRecording),
      recordingStartedAtMs,
      meetingTimerStartedAtMs,
      meetingTimerEndedAtMs,
      endMeetingSaving,
      stage,
      busy,
      problemDefinitionStagePending: effectiveProblemDefinitionStagePending,
      isProblemDefinitionExploreStage,
      ideationBubbleDebugEnabled,
      summaryDocumentGenerationDetail,
      summaryDocumentGenerationPhase,
      summaryDocumentGenerationRetryable,
    },
    meetingGoal: {
      meetingGoalDraft,
      meetingGoalContextDraft,
      meetingGoalEditorOpen,
      meetingGoalEditorDraft,
      meetingGoalContextEditorDraft,
      meetingGoalSaving,
    },
    handlers: headerHandlers,
  });
  const canvasKeywordSummary = useMemo(
    () => ideationBubbleVisuals.slice(0, 5).map((bubble) => bubble.text).join(", "),
    [ideationBubbleVisuals],
  );
  const canvasParticipants = useMemo<CanvasWorkspaceParticipant[]>(() => {
    const candidates = [
      userEmail || "",
      ...transcripts
        .map((transcript) => transcript.speaker)
        .filter((speaker) => speaker && speaker !== "알 수 없음"),
    ];
    const seen = new Set<string>();
    const participants: CanvasWorkspaceParticipant[] = [];

    candidates.forEach((candidate) => {
      const normalized = candidate.trim().toLowerCase();
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      const participant = makeCanvasParticipant(candidate, participants.length);
      if (participant) participants.push(participant);
    });

    return participants.length > 0
      ? participants
      : [{ id: userId || "current-user", label: "M", title: userEmail || "현재 사용자" }];
  }, [transcripts, userEmail, userId]);
  const sttFeedItems = useMemo(
    () => buildCanvasSttFeedItems(transcripts, 4),
    [transcripts],
  );

  const workspacePanelProps = useCanvasWorkspacePanelModels({
    header: headerProps,
    keywordSummary: canvasKeywordSummary,
    participants: canvasParticipants,
    isDesktopLayout,
    workspaceGridColumns,
    canvasSurfaceRef,
    surfaceView: {
      stage,
      nodes,
      problemSplitLeftEdges: problemSplitEdges.left,
      busy,
      canvasStatusMessage,
    },
    surfaceSolution: {
      meetingTitle,
      meetingGoal: meetingGoalDraft.trim(),
      participants: canvasParticipants,
      finalSummaryDocument,
      summaryDocumentDraftBlocks,
      summaryDocumentDraftMarkdown,
      summaryDocumentDraftDirty,
      summaryEligibleStructureGroups,
      summaryDocumentSectionByGroupId,
      problemStructureNodeById,
      summaryEvidenceOpenGroupIds,
      remoteEditPresenceByKey,
      summaryDocumentEditMode,
      summaryDocumentPending: effectiveSummaryDocumentPending,
      summaryDocumentGenerationStatus,
      summaryDocumentGenerationError,
      summaryDocumentGenerationDetail,
      summaryDocumentGenerationPhase,
      summaryDocumentGenerationRetryable,
      summaryDocumentSaving,
      solutionRightPaneRef,
    },
    surfaceProblem: {
      demoBalanceMode,
      problemGroupsCount: problemGroups.length,
      problemStructureNodesCount: problemStructureNodes.length,
      problemDefinitionStagePending: effectiveProblemDefinitionStagePending,
      problemDefinitionGenerationStatus,
      problemDefinitionGenerationError,
      problemDefinitionGenerationDetail,
      problemDefinitionGenerationPhase,
      problemDefinitionGenerationRetryable,
      problemStructureSetupOpen,
      problemStructureDraftMethod,
      problemStructureDraftMode,
      problemStructurePending: effectiveProblemStructurePending,
      problemStructureGenerationStatus,
      problemStructureGenerationError,
      problemDefinitionPhase,
      problemStructureMethod,
      problemDefinitionMode,
      activeProblemGroupingRationale,
      activeProblemGroupingRationaleTitle: activeProblemGroupingRationaleGroup?.topic || "",
      problemCanvasToolbarActions,
      selectedProblemStatus: selectedProblemGroup?.status || "",
    },
    surfaceFlowHandlers: {
      onFlowInit: handleFlowInitStable,
      onNodeClick: handleCanvasNodeClickStable,
      onPaneClick: handleCanvasPaneClickStable,
      onNodesChange: handleNodesChangeStable,
      onNodeDragStart: handleNodeDragStartStable,
      onNodeDrag: handleNodeDragStable,
      onNodeDragStop: handleNodeDragStopStable,
    },
    surfaceSolutionHandlers: {
      onToggleSummaryEvidence: handleToggleSummaryEvidence,
      onSetSummaryDocumentEditMode: handleSetSummaryDocumentEditMode,
      onRegenerateSummaryDocument: handleRegenerateSummaryDocument,
      onRefreshSummaryCache: handleRefreshSummaryCache,
      onCopyFinalSolutionMarkdown: handleCopyFinalSolutionMarkdown,
      onSaveSummaryDocument: handleSaveSummaryDocument,
      onSummaryDocumentBlocksChange: handleSummaryDocumentBlocksChange,
      onSummaryDocumentMarkdownChange: handleSummaryDocumentMarkdownChange,
    },
    surfaceProblemHandlers: {
      onCloseProblemStructureSetup: handleCloseProblemStructureSetup,
      onProblemStructureDraftMethodChange: setProblemStructureDraftMethod,
      onProblemStructureDraftModeChange: setProblemStructureDraftMode,
      onStartProblemStructure: handleStartProblemStructure,
      onRegenerateProblemStructure: handleRegenerateProblemStructure,
      onRegenerateProblemDefinition: handleRegenerateProblemDefinition,
      onProblemStructureMethodChange: handleProblemStructureMethodChange,
      onProblemDefinitionModeChange: handleProblemDefinitionModeChange,
      onProblemDefinitionPhaseSelect: handleProblemDefinitionPhaseSelect,
      onCloseProblemGroupingRationale: handleCloseProblemGroupingRationale,
      getProblemToolbarActionLabel: problemToolbarActionLabel,
      isProblemToolbarActionActive,
      onProblemToolbarAction: handleProblemToolbarAction,
      onSetProblemGroupStatus: handleSetProblemGroupStatus,
    },
    renderSummaryMarkdownPreview,
    sttFeedItems,
    rightDrawerLayout: {
      collapsed: rightDrawerCollapsed,
      contentVisible: rightDrawerContentVisible,
      notesCollapsed: rightDrawerNotesCollapsed,
      expandedWidth: rightDrawerExpandedWidth,
      isDesktopLayout,
    },
    rightDrawerComposer: {
      title: composerTitle,
      body: composerBody,
      bodyRef: composerBodyRef,
    },
    rightDrawerNotesState: {
      notes: projectPersonalNotes,
      stage,
      editingPersonalNoteId,
      draggingPersonalNoteId,
      personalNoteDraftTitle,
      personalNoteDraftBody,
    },
    rightDrawerLayoutHandlers: {
      onToggleDrawer: toggleRightDrawer,
      onStartResize: handleRightDrawerResizeStart,
      onToggleNotesCollapsed: handleToggleRightDrawerNotesCollapsed,
    },
    rightDrawerComposerHandlers: {
      onTitleChange: setComposerTitle,
      onBodyChange: setComposerBody,
      onSave: handleAddPersonalNote,
    },
    rightDrawerNoteHandlers: {
      onDragStart: setDraggingPersonalNoteId,
      onDragEnd: handlePersonalNoteDragEnd,
      onDraftTitleChange: setPersonalNoteDraftTitle,
      onDraftBodyChange: setPersonalNoteDraftBody,
      onCancelEdit: handleCancelPersonalNoteEdit,
      onSaveEdit: handleSavePersonalNoteEdit,
      onStartEdit: handleStartPersonalNoteEdit,
      onDelete: handleDeletePersonalNote,
    },
    quickAskState: {
      open: quickAskOpen,
      messages: quickAskMessages,
      draft: quickAskDraft,
      unreadCount: quickAskUnreadCount,
      pendingCount: quickAskPendingCount,
      scrollRef: quickAskScrollRef,
    },
    quickAskHandlers: {
      onClose: handleCloseQuickAsk,
      onToggle: handleToggleQuickAsk,
      onDraftChange: setQuickAskDraft,
      onSubmit: handleSubmitQuickAsk,
    },
    onShareMeetingLink: handleShareMeetingLink,
    onDebugResetWorkspace: CANVAS_DEBUG_RESET_ENABLED ? handleDebugResetWorkspace : undefined,
    debugResetBusy,
  });
  const endMeetingDialogProps = useCanvasEndMeetingDialogModels({
    view: {
      confirmOpen: endMeetingConfirmOpen,
      saving: endMeetingSaving,
      preview: endMeetingPreview,
      summaryPreviewMarkdown: endMeetingSummaryPreviewMarkdown,
      summaryPreviewHtml: endMeetingSummaryPreviewHtml,
      finalReportQrOpen,
      finalReportQrLoading,
      finalReportQrUrl,
      finalReportQrImageDataUrl,
      finalReportQrError,
      finalReportQrCopied,
    },
    onCancel: handleCancelEndMeeting,
    onConfirm: handleConfirmEndMeeting,
    onDownloadPdf: handleDownloadEndMeetingSummaryPdf,
    onCreateFinalReportQr: handleCreateFinalReportQr,
    onCloseFinalReportQr: handleCloseFinalReportQr,
    onCopyFinalReportQrUrl: handleCopyFinalReportQrUrl,
    onBackToConfirm: handleBackToEndMeetingConfirm,
    onSaveAndEnd: handleSaveAndEndMeeting,
    getFinalSummarySnapshot: getEndingFinalSummaryDocumentSnapshot,
  });

  if (!viewportModeReady) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-[#f8fbff] text-[#526070]">
        <div className="rounded-[22px] border border-[#d8e3f0] bg-white px-6 py-5 text-center shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-[3px] border-[#dceeff] border-t-[#236cf3]" />
          <p className="mt-3 text-[13px] font-semibold leading-6 tracking-[-0.03px]">화면을 준비하는 중입니다.</p>
        </div>
      </div>
    );
  }

  if (!isDesktopLayout) {
    return (
      <div className="h-full min-h-0 bg-[#f8fbff] text-black">
        <MobileMeetingReadOnlyView
          actualStage={stage}
          actualProblemPhase={problemDefinitionPhase}
          demoBalanceMode={demoBalanceMode}
          finalSummaryDocument={finalSummaryDocument}
          ideationBubbleVisuals={ideationBubbleVisuals}
          meetingStatus={meetingStatus}
          meetingTimerEndedAtMs={meetingTimerEndedAtMs}
          meetingTimerStartedAtMs={meetingTimerStartedAtMs}
          meetingTitle={meetingTitle}
          onViewedStageChange={setMobileViewedStage}
          problemDefinitionPending={problemDefinitionStagePending || sharedProblemDefinitionGenerating}
          problemGroups={problemGroups}
          problemStructureGroups={problemStructureGroups}
          problemStructureNodes={problemStructureNodes}
          problemStructurePending={problemStructurePending || sharedProblemStructureGenerating}
          summaryDocumentPending={summaryDocumentPending || sharedSummaryGenerating}
          viewedStage={mobileViewedStage}
        />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 bg-[#f9f9f9] text-black">
      <section className="flex h-full min-h-0 flex-col bg-[#f9f9f9]">
        <CanvasWorkspacePanels {...workspacePanelProps} />
      </section>

      <CanvasEndMeetingDialogs {...endMeetingDialogProps} />
    </div>
  );
}

function normalizeParticipantLabel(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const first = trimmed.replace(/^["'<({\[]+/, "").charAt(0);
  return first ? first.toUpperCase() : "";
}

function makeCanvasParticipant(value: string, index: number): CanvasWorkspaceParticipant | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const label = normalizeParticipantLabel(trimmed);
  if (!label) return null;
  return {
    id: `${trimmed.toLowerCase()}:${index}`,
    label,
    title: trimmed,
  };
}
