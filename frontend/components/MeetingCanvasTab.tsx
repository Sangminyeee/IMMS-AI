"use client";

import "@xyflow/react/dist/style.css";
import {
  MarkerType,
  Position,
  applyNodeChanges,
  type Edge,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  getCanvasWorkspaceState,
  getCanvasPersonalNotes,
  confirmCanvasPlacement,
  getCanvasIdeaAssimilationWorkspaceJob,
  getCanvasProblemDiscussionWorkspaceJob,
  generateProblemGroupConclusion,
  generateProblemGroupingRationale,
  generateProblemStructure,
  generateCanvasProblemTaxonomy,
  generateCanvasSummaryDocument,
  flushCanvasPersonalNotes,
  flushCanvasWorkspacePatch,
  saveCanvasPersonalNotes,
  saveCanvasWorkspacePatch,
  startCanvasProblemDiscussionWorkspace,
  startCanvasTopicSummaryWorkspace,
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
import {
  buildNodeContentSignature,
  type CanvasNodeData,
  type CanvasNodeDescriptor,
} from "@/components/canvas/CanvasGraphTypes";
import {
  CANVAS_IDEATION_DROP_ZONE_VERTICAL_PADDING,
  CANVAS_ITEM_NODE_WIDTH,
  CANVAS_TOPIC_CHILD_GAP_X,
  buildUserMergedTopicTitle,
  getCanvasItemChangeSignature,
  getCanvasItemDescendantIds,
  getCanvasItemTopLevelAncestorId,
  getTopicDescendantTopicIds,
  getTopicDirectChildIds,
  getTopicFlattenedIdeaChildIds,
  isTopicCanvasItem,
  makeIdeationDragGhostLabel,
  makeIdeationMergeDropPreview,
  solutionTopicFinalNotes,
} from "@/components/canvas/CanvasNodeLabels";
import {
  CANVAS_IDEATION_BUBBLE_DEBUG_GROWTH_STEP,
  CANVAS_IDEATION_BUBBLE_DEBUG_INTERVAL_MS,
  CANVAS_IDEATION_BUBBLE_DEBUG_MAX_GROWTH,
  buildIdeationKeywordBubbles,
  buildStableIdeationBubbleVisuals,
  isDuplicateProblemTaxonomyGroup,
} from "@/components/canvas/CanvasIdeationBubbles";
import {
  useCanvasDragRefs,
  useCanvasFlowRefs,
  useCanvasNodeSyncRefs,
  useCanvasRuntimeState,
  type IdeationDropTargetElement,
  type IdeationDropPreviewState,
  type PendingIdeationDragFrame,
  type ProblemIdeaDropPreviewState,
} from "@/components/canvas/useCanvasRuntimeState";
import { useCanvasEndMeetingState } from "@/components/canvas/useCanvasEndMeetingState";
import { useCanvasMeetingGoalEditor } from "@/components/canvas/useCanvasMeetingGoalEditor";
import { useCanvasQuickAsk } from "@/components/canvas/useCanvasQuickAsk";
import { useCanvasUiState } from "@/components/canvas/useCanvasUiState";
import type {
  AgendaActionItemDetail,
  AgendaDecisionDetail,
  CanvasCustomGroup,
  CanvasEditPresencePayload,
  CanvasFinalSolutionSummary,
  CanvasLocalState,
  CanvasNodePreviewPayload,
  CanvasNodePositionsByStage,
  CanvasProblemDefinitionGroup,
  CanvasProblemStructureState,
  CanvasRealtimeSyncPayload,
  CanvasRefinedUtterance,
  CanvasProblemDiscussionItem,
  CanvasSummaryDocumentSection,
  CanvasSolutionTopicResponse,
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
type CanvasTool = ComposerTool | "group" | "problem-idea";
type ProblemCanvasToolbarAction =
  | "group"
  | "problem-link"
  | "debug-regenerate"
  | "debug-refresh-chunks"
  | "structure-start"
  | "structure-back"
  | "structure-ai-group"
  | "structure-add-group"
  | "structure-refresh"
  | "note"
  | "problem-idea"
  | "adopt";
type LeftPanelTab = "detail";
type ProblemGroupStatus = "draft" | "review" | "final";
type CanvasItemStatus = "discussion" | "confirmed" | "closed";
type SolutionAiSuggestionStatus = "draft" | "selected" | "dismissed";
type SolutionNoteSource = "ai" | "user";
type ProblemDefinitionMode = "" | "manual" | "ai";
type ProblemDefinitionPhase = "explore" | "structure";
type ProblemStructureMethod = "affinity" | "card-sorting";
const CANVAS_STAGES: CanvasStage[] = ["ideation", "problem-definition", "solution"];
const CANVAS_LLM_FAILURE_RETRY_DELAY_MS = 60_000;
const CANVAS_LLM_SILENCE_FLUSH_MS = 8_000;
const NODE_PREVIEW_SYNC_THROTTLE_MS = 64;
const NODE_PREVIEW_ANIMATION_LERP = 0.38;
const NODE_PREVIEW_SETTLE_DISTANCE = 0.75;
const PROBLEM_STRUCTURE_NODE_DRAG_MIME = "application/x-imms-problem-structure-node";
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

type ProblemStructureNodeViewModel = {
  id: string;
  sourceGroupId: string;
  title: string;
  body: string;
  status: ProblemGroupStatus;
  depth: number;
};

type ProblemStructureGroupViewModel = {
  id: string;
  title: string;
  nodeIds: string[];
  rationale: string;
  status: ProblemGroupStatus;
  createdBy: "ai" | "user";
};

type ProblemStructureDragState = {
  nodeId: string;
  overGroupId: string;
  overNodeId: string;
  mode: "group" | "node" | "";
};

type ProblemDiscussionViewModel = CanvasProblemDiscussionItem;

type CanvasItemViewModel = CanvasWorkspaceItem;
type CustomGroupViewModel = CanvasCustomGroup;

type SolutionTopicViewModel = CanvasSolutionTopicResponse & {
  status: ProblemGroupStatus;
  problem_topic: string;
  problem_insight: string;
  problem_conclusion: string;
  problem_keywords: string[];
  agenda_titles: string[];
  ai_suggestions: Array<{
    id: string;
    text: string;
    status: SolutionAiSuggestionStatus;
  }>;
  notes: Array<{
    id: string;
    text: string;
    source: SolutionNoteSource;
    source_ai_id?: string;
    is_final_candidate: boolean;
    final_comment: string;
  }>;
};

type WorkspaceFieldSignatures = {
  meeting_goal: string;
  meeting_goal_context: string;
  stage: string;
  agenda_overrides: string;
  canvas_items: string;
  custom_groups: string;
  problem_groups: string;
  problem_structure: string;
  solution_topics: string;
  final_solution_summary: string;
  node_positions: string;
  imported_state: string;
};

function createWorkspaceFieldSignatures(): WorkspaceFieldSignatures {
  return {
    meeting_goal: "",
    meeting_goal_context: "",
    stage: "",
    agenda_overrides: "",
    canvas_items: "",
    custom_groups: "",
    problem_groups: "",
    problem_structure: "",
    solution_topics: "",
    final_solution_summary: "",
    node_positions: "",
    imported_state: "",
  };
}

function buildWorkspaceProblemGroupsPayload(groups: ProblemGroupViewModel[]) {
  return groups.map((group) => ({
    group_id: group.group_id,
    parent_group_id: group.parent_group_id || "",
    depth: group.depth || 0,
    topic: group.topic,
    insight_lens: group.insight_lens,
    insight_user_edited: group.insight_user_edited,
    keywords: group.keywords,
    agenda_ids: group.agenda_ids,
    agenda_titles: group.agenda_titles,
    ideas: group.ideas,
    source_summary_items: group.source_summary_items,
    discussion_items: group.discussion_items || [],
    linked_group_ids: group.linked_group_ids || [],
    evidence_utterance_ids: group.evidence_utterance_ids || [],
    conclusion: group.conclusion,
    conclusion_user_edited: group.conclusion_user_edited,
    status: group.status,
    source_signature: group.source_signature,
    source_agenda_signatures: group.source_agenda_signatures,
    source_idea_signatures: group.source_idea_signatures,
  }));
}

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

function buildWorkspaceSolutionTopicsPayload(topics: SolutionTopicViewModel[]) {
  return topics.map((topic) => ({
    group_id: topic.group_id,
    topic_no: topic.topic_no,
    topic: topic.topic,
    conclusion: topic.conclusion,
    ideas: topic.ideas,
    status: topic.status,
    problem_topic: topic.problem_topic,
    problem_insight: topic.problem_insight,
    problem_conclusion: topic.problem_conclusion,
    problem_keywords: topic.problem_keywords,
    agenda_titles: topic.agenda_titles,
    ai_suggestions: topic.ai_suggestions,
    notes: topic.notes,
  }));
}

function createEmptyFinalSolutionSummary(): CanvasFinalSolutionSummary {
  return {
    final_count: 0,
    topics: [],
    items: [],
    markdown: "",
    document_status: "empty",
    generated_at: "",
    used_llm: false,
    warning: "",
    source_signature: "",
    sections: [],
  };
}

function normalizeFinalSolutionSummaryPayload(raw?: CanvasFinalSolutionSummary | null): CanvasFinalSolutionSummary {
  const fallback = createEmptyFinalSolutionSummary();
  if (!raw || typeof raw !== "object") return fallback;
  const markdown = typeof raw.markdown === "string" ? raw.markdown : "";
  const sections = Array.isArray(raw.sections)
    ? raw.sections.map((section) => ({
        group_id: section.group_id || "",
        title: section.title || "요약 그룹",
        status: section.status || "draft",
        status_label: section.status_label || (section.status === "review" ? "검토 중" : section.status === "final" ? "확정" : "초안"),
        rationale: section.rationale || "",
        node_titles: Array.isArray(section.node_titles) ? section.node_titles.filter(Boolean) : [],
        evidence: Array.isArray(section.evidence)
          ? section.evidence
              .map((item) => ({
                utterance_id: item.utterance_id || "",
                speaker: item.speaker || "참가자",
                timestamp: item.timestamp || "",
                text: item.text || "",
              }))
              .filter((item) => item.text)
          : [],
      }))
    : [];

  return {
    final_count: Math.max(Number.isFinite(raw.final_count) ? raw.final_count : raw.items?.length || 0, sections.length),
    topics: Array.isArray(raw.topics) ? raw.topics : [],
    items: Array.isArray(raw.items) ? raw.items : [],
    markdown,
    document_status: raw.document_status || (markdown ? "ready" : "empty"),
    generated_at: raw.generated_at || "",
    used_llm: Boolean(raw.used_llm),
    warning: raw.warning || "",
    source_signature: raw.source_signature || "",
    sections,
  };
}

function buildFinalSolutionSummaryPayload(
  topics: SolutionTopicViewModel[],
  summaryDocument?: CanvasFinalSolutionSummary | null,
): CanvasFinalSolutionSummary {
  if (summaryDocument) {
    return normalizeFinalSolutionSummaryPayload(summaryDocument);
  }
  const summaryTopics = topics
    .map((topic) => {
      const finalNotes = solutionTopicFinalNotes(topic).map((note) => ({
        id: `${topic.group_id}::${note.id}`,
        topic_id: topic.group_id,
        topic_no: topic.topic_no,
        topic_title: topic.topic,
        problem_topic: topic.problem_topic || "",
        problem_conclusion: topic.problem_conclusion || "",
        solution_conclusion: topic.conclusion || "",
        note_id: note.id,
        note_text: note.text,
        final_comment: note.final_comment || "",
        source: note.source || "user",
        source_ai_id: note.source_ai_id || "",
        agenda_titles: topic.agenda_titles || [],
      }));

      return {
        topic_id: topic.group_id,
        topic_no: topic.topic_no,
        topic_title: topic.topic,
        problem_topic: topic.problem_topic || "",
        solution_conclusion: topic.conclusion || "",
        final_notes: finalNotes,
      };
    })
    .filter((topic) => topic.final_notes.length > 0);
  const items = summaryTopics.flatMap((topic) => topic.final_notes);
  const markdown = summaryTopics
    .map((topic) => {
      const title = topic.topic_title || `해결책 ${topic.topic_no}`;
      const lines = topic.final_notes.map((note) => {
        const comment = note.final_comment ? `\n  - 설명: ${note.final_comment}` : "";
        return `- ${note.note_text}${comment}`;
      });
      return [`## ${title}`, ...lines].join("\n");
    })
    .join("\n\n");

  return {
    final_count: items.length,
    topics: summaryTopics,
    items,
    markdown,
    document_status: markdown ? "ready" : "empty",
    sections: [],
  };
}

function normalizeRefinedUtterances(
  rows: CanvasRefinedUtterance[] | undefined,
  limit = 120,
): CanvasRefinedUtterance[] {
  const seen = new Set<string>();
  const normalized: CanvasRefinedUtterance[] = [];

  (rows || []).forEach((row, index) => {
    const text = trimText(row.text || "", 72);
    if (!text) return;
    const utteranceId = (row.utterance_id || `refined-${index}`).trim();
    const key = utteranceId || `${row.speaker || ""}:${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push({
      utterance_id: utteranceId,
      speaker: (row.speaker || "참가자").trim(),
      text,
      timestamp: (row.timestamp || "").trim(),
    });
  });

  return normalized.slice(0, limit);
}

function buildWorkspaceCanvasItemsPayload(items: CanvasItemViewModel[]): CanvasWorkspaceItem[] {
  return items.map((item) => ({
    id: item.id,
    agenda_id: item.agenda_id,
    point_id: item.point_id || "",
    kind: item.kind,
    status: normalizeCanvasItemStatus(item.status),
    title: item.title,
    body: item.body,
    keywords: (item.keywords || []).map((keyword) => keyword.trim()).filter(Boolean),
    key_evidence: (item.key_evidence || []).map((value) => value.trim()).filter(Boolean),
    refined_utterances: normalizeRefinedUtterances(item.refined_utterances),
    evidence_utterance_ids: (item.evidence_utterance_ids || []).map((value) => value.trim()).filter(Boolean),
    ignored_utterance_ids: (item.ignored_utterance_ids || []).map((value) => value.trim()).filter(Boolean),
    merged_children: buildWorkspaceCanvasItemsPayload(item.merged_children || []),
    compacted_from_ids: (item.compacted_from_ids || []).map((value) => value.trim()).filter(Boolean),
    compaction_level: typeof item.compaction_level === "number" ? item.compaction_level : 0,
    parent_topic_id: item.parent_topic_id || "",
    parent_topic_source: item.parent_topic_source || "",
    parent_topic_locked: Boolean(item.parent_topic_locked),
    child_item_ids: (item.child_item_ids || []).map((value) => value.trim()).filter(Boolean),
    topic_collapsed: Boolean(item.topic_collapsed),
    created_by: item.created_by || "",
    manual_position: false,
    ai_generated: Boolean(item.ai_generated),
    user_edited: Boolean(item.user_edited),
    ai_pending: Boolean(item.ai_pending),
    ai_suggestions: (item.ai_suggestions || [])
      .map((suggestion) => ({
        id: suggestion.id,
        text: suggestion.text.trim(),
        status: normalizeIdeationSuggestionStatus(suggestion.status),
      }))
      .filter((suggestion) => suggestion.id && suggestion.text)
      .slice(0, 8),
  }));
}

function serializeCustomGroups(groups: CustomGroupViewModel[]) {
  return groups
    .map((group) => ({
      id: group.id,
      title: group.title.trim(),
      description: (group.description || "").trim(),
      keywords: (group.keywords || []).map((keyword) => keyword.trim()).filter(Boolean),
      color: (group.color || "").trim(),
      created_by: group.created_by || "",
      created_at: group.created_at || "",
    }))
    .filter((group) => group.id && group.title);
}

function buildWorkspaceFieldSignatures(input: {
  meetingGoal: string;
  meetingGoalContext: string;
  stage: CanvasStage;
  agendaOverrides: Record<string, AgendaOverride>;
  canvasItems: CanvasItemViewModel[];
  customGroups: CustomGroupViewModel[];
  problemGroups: ProblemGroupViewModel[];
  problemStructure?: CanvasProblemStructureState;
  solutionTopics: SolutionTopicViewModel[];
  finalSolutionSummary?: CanvasFinalSolutionSummary;
  nodePositions: CanvasNodePositionsByStage;
  importedState: MeetingState | null;
}): WorkspaceFieldSignatures {
  return {
    meeting_goal: input.meetingGoal.trim(),
    meeting_goal_context: input.meetingGoalContext.trim(),
    stage: input.stage,
    agenda_overrides: JSON.stringify(serializeAgendaOverrides(input.agendaOverrides)),
    canvas_items: JSON.stringify(buildWorkspaceCanvasItemsPayload(input.canvasItems)),
    custom_groups: JSON.stringify(serializeCustomGroups(input.customGroups)),
    problem_groups: JSON.stringify(buildWorkspaceProblemGroupsPayload(input.problemGroups)),
    problem_structure: JSON.stringify(input.problemStructure || createDefaultProblemStructureState()),
    solution_topics: JSON.stringify(buildWorkspaceSolutionTopicsPayload(input.solutionTopics)),
    final_solution_summary: JSON.stringify(buildFinalSolutionSummaryPayload(input.solutionTopics, input.finalSolutionSummary)),
    node_positions: JSON.stringify(normalizeCanvasNodePositionsForComputedIdeation(input.nodePositions)),
    imported_state: JSON.stringify(input.importedState || null),
  };
}

function buildFullWorkspacePatchPayload(input: {
  meetingId: string;
  meetingGoal: string;
  meetingGoalContext: string;
  stage: CanvasStage;
  agendaOverrides: Record<string, AgendaOverride>;
  canvasItems: CanvasItemViewModel[];
  customGroups: CustomGroupViewModel[];
  problemGroups: ProblemGroupViewModel[];
  problemStructure?: CanvasProblemStructureState;
  solutionTopics: SolutionTopicViewModel[];
  finalSolutionSummary?: CanvasFinalSolutionSummary;
  nodePositions: CanvasNodePositionsByStage;
  importedState: MeetingState | null;
}) {
  return {
    meeting_id: input.meetingId,
    meeting_goal: input.meetingGoal.trim(),
    meeting_goal_context: input.meetingGoalContext.trim(),
    agenda_overrides: serializeAgendaOverrides(input.agendaOverrides),
    canvas_items: serializeSharedCanvasItems(input.canvasItems),
    custom_groups: serializeCustomGroups(input.customGroups),
    problem_groups: buildWorkspaceProblemGroupsPayload(input.problemGroups),
    problem_structure: input.problemStructure || createDefaultProblemStructureState(),
    solution_topics: buildWorkspaceSolutionTopicsPayload(input.solutionTopics),
    final_solution_summary: buildFinalSolutionSummaryPayload(input.solutionTopics, input.finalSolutionSummary),
    node_positions: normalizeCanvasNodePositionsForComputedIdeation(input.nodePositions),
    imported_state: input.importedState,
  };
}

function getSharedWorkspaceSessionStorageKey(meetingId: string) {
  return `imms:canvas-shared-workspace:${meetingId}`;
}

function writeSharedWorkspaceSessionCache(
  meetingId: string,
  snapshot: ReturnType<typeof buildFullWorkspacePatchPayload>,
) {
  if (typeof window === "undefined" || !meetingId) return;
  try {
    window.sessionStorage.setItem(
      getSharedWorkspaceSessionStorageKey(meetingId),
      JSON.stringify({
        ...snapshot,
        cached_at: Date.now(),
      }),
    );
  } catch {
    // ignore sessionStorage errors
  }
}

function readSharedWorkspaceSessionCache(meetingId: string): Partial<ReturnType<typeof buildFullWorkspacePatchPayload>> | null {
  if (typeof window === "undefined" || !meetingId) return null;
  try {
    const raw = window.sessionStorage.getItem(getSharedWorkspaceSessionStorageKey(meetingId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function getTopicCollapseStorageKey(meetingId: string, userId: string) {
  return `imms:canvas-topic-collapse:${meetingId}:${userId || "anonymous"}`;
}

function readTopicCollapseOverrides(meetingId: string, userId: string): Record<string, boolean> {
  if (typeof window === "undefined" || !meetingId) return {};
  try {
    const raw = window.localStorage.getItem(getTopicCollapseStorageKey(meetingId, userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, boolean] => (
        typeof entry[0] === "string" && typeof entry[1] === "boolean"
      )),
    );
  } catch {
    return {};
  }
}

function writeTopicCollapseOverrides(meetingId: string, userId: string, overrides: Record<string, boolean>) {
  if (typeof window === "undefined" || !meetingId) return;
  try {
    window.localStorage.setItem(getTopicCollapseStorageKey(meetingId, userId), JSON.stringify(overrides));
  } catch {
    // ignore localStorage errors
  }
}

function summarizeNodePositionsForDebug(nodePositions: CanvasNodePositionsByStage) {
  const topIdeationNodes = Object.entries(nodePositions.ideation || {})
    .sort((a, b) => {
      const ay = Number(a[1]?.y ?? 0);
      const by = Number(b[1]?.y ?? 0);
      if (ay !== by) return ay - by;
      return Number(a[1]?.x ?? 0) - Number(b[1]?.x ?? 0);
    })
    .slice(0, 4);

  return {
    ideation: Object.keys(nodePositions.ideation || {}).length,
    problemDefinition: Object.keys(nodePositions["problem-definition"] || {}).length,
    solution: Object.keys(nodePositions.solution || {}).length,
    topIdeationNodes,
  };
}

function summarizeRenderedNodesForDebug(nodes: Node[]) {
  const topIdeationNodes = nodes
    .filter((node) => node.id.startsWith("agenda-") || node.id.startsWith("canvas-item-"))
    .sort((a, b) => {
      const ay = Number(a.position?.y ?? 0);
      const by = Number(b.position?.y ?? 0);
      if (ay !== by) return ay - by;
      return Number(a.position?.x ?? 0) - Number(b.position?.x ?? 0);
    })
    .slice(0, 4)
    .map((node) => [node.id, { x: node.position.x, y: node.position.y }] as const);

  return {
    total: nodes.length,
    topIdeationNodes,
  };
}

function normalizeCanvasNodePositionsForComputedIdeation(
  positions: CanvasNodePositionsByStage | undefined,
): CanvasNodePositionsByStage {
  if (!positions) return {};

  const normalized: CanvasNodePositionsByStage = {};
  CANVAS_STAGES.forEach((stageKey) => {
    const stagePositions = positions[stageKey] || {};
    const entries = Object.entries(stagePositions)
      .filter(([nodeId]) => stageKey !== "ideation" || nodeId.startsWith("agenda-"))
      .map(([nodeId, position]) => [
        nodeId,
        {
          x: Number(position?.x || 0),
          y: Number(position?.y || 0),
        },
      ] as const);

    if (entries.length > 0) {
      normalized[stageKey] = Object.fromEntries(entries);
    }
  });

  return normalized;
}

function buildCanvasPersonalNotesPayload(
  meetingId: string,
  userId: string,
  personalNotes: PersonalNote[],
  localCanvasState?: CanvasLocalState | null,
) {
  return {
    meeting_id: meetingId,
    user_id: userId,
    personal_notes: personalNotes.map((note) => ({
      id: note.id,
      project_id: note.projectId || meetingId,
      agenda_id: note.agendaId,
      linked_canvas_item_id: note.linkedCanvasItemId || "",
      linked_canvas_item_title: note.linkedCanvasItemTitle || "",
      kind: note.kind,
      title: note.title,
      body: note.body,
    })),
    local_canvas_state: localCanvasState || null,
  };
}

function buildMeetingStateSignature(state: MeetingState | null) {
  if (!state) {
    return "";
  }

  return JSON.stringify({
    transcript: (state.transcript || []).map((row) => `${row.speaker}\u0001${row.text}\u0001${row.timestamp}`),
    agendas: (state.analysis?.agenda_outcomes || []).map((row) => ({
      id: row.agenda_id,
      title: row.agenda_title,
      start: row.start_turn_id,
      end: row.end_turn_id,
    })),
  });
}

function serializeAgendaOverrides(overrides: Record<string, AgendaOverride>) {
  return Object.fromEntries(
    Object.entries(overrides).flatMap(([agendaId, override]) => {
      const title = (override.title || "").trim();
      const keywords = (override.keywords || []).map((item) => item.trim()).filter(Boolean);
      const summaryBullets = (override.summaryBullets || []).map((item) => item.trim()).filter(Boolean);

      if (!title && keywords.length === 0 && summaryBullets.length === 0) {
        return [];
      }

      return [[agendaId, { title, keywords, summaryBullets }]];
    }),
  );
}

type SolutionAiSuggestionViewModel = SolutionTopicViewModel["ai_suggestions"][number];
type SolutionNoteViewModel = SolutionTopicViewModel["notes"][number];

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

type AgendaOverride = {
  title?: string;
  keywords?: string[];
  summaryBullets?: string[];
};

type ProblemGroupDisplayCard = {
  id: string;
  title: string;
  body: string;
  kind: string;
  sourceNodeId: string;
  sourceNodeKind: "topic" | "idea" | "summary";
  attachable: boolean;
  cardKind: "summary" | "idea";
  sourceIndex: number;
  draggable: boolean;
  ideaId?: string;
  summaryText?: string;
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

function renderEditPresenceBadge(label = "수정중") {
  return (
    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
      {label}
    </span>
  );
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

function isComposerTool(tool: CanvasTool): tool is ComposerTool {
  return tool === "note" || tool === "comment" || tool === "topic";
}

function toolLabel(tool: CanvasTool, stage?: CanvasStage) {
  if (tool === "note") return stage === "problem-definition" ? "의견추가" : "추가";
  if (tool === "problem-idea") return "아이디어 추가";
  if (tool === "comment") return "댓글";
  if (tool === "group") return stage === "problem-definition" ? "문제정의 그룹 추가" : "그룹";
  return "주제";
}

function toolPreviewHint(tool: CanvasTool, stage?: CanvasStage) {
  if (stage === "problem-definition") {
    if (tool === "group") return "새 문제정의 그룹을 만들 위치";
    if (tool === "problem-idea") return "문제정의 그룹에 아이디어를 추가할 위치";
    if (tool === "comment") return "문제정의 댓글을 남길 위치";
    return "문제 의견을 추가할 위치";
  }
  if (tool === "group") return "프로젝트 그룹을 만들 위치";
  if (tool === "topic") return "새 주제를 만들 위치";
  if (tool === "comment") return "코멘트를 남길 위치";
  return "메모를 붙일 위치";
}

function toolPreviewTone(tool: CanvasTool, stage?: CanvasStage) {
  if (stage === "problem-definition") {
    if (tool === "group") return "border-violet-200 bg-violet-50/92 text-violet-700";
    if (tool === "problem-idea") return "border-fuchsia-200 bg-fuchsia-50/92 text-fuchsia-700";
    if (tool === "comment") return "border-sky-200 bg-sky-50/92 text-sky-700";
    return "border-amber-200 bg-amber-50/92 text-amber-700";
  }
  if (tool === "group") return "border-emerald-200 bg-emerald-50/92 text-emerald-700";
  if (tool === "topic") return "border-fuchsia-200 bg-fuchsia-50/92 text-fuchsia-700";
  if (tool === "comment") return "border-sky-200 bg-sky-50/92 text-sky-700";
  return "border-amber-200 bg-amber-50/92 text-amber-700";
}

function extractAgendaIdFromNodeId(nodeId: string) {
  if (nodeId.startsWith("agenda-")) return nodeId.slice("agenda-".length);
  const summaryMatch = nodeId.match(/^summary-(.+)-(\d+)$/);
  if (summaryMatch) return summaryMatch[1];
  return "";
}

function extractCanvasItemIdFromNodeId(nodeId: string) {
  return nodeId.startsWith("canvas-item-") ? nodeId.slice("canvas-item-".length) : "";
}

function extractProblemSourceCanvasNodeInfo(nodeId: string) {
  if (!nodeId.startsWith("problem-source::")) return null;
  const [, encodedGroupId = "", encodedSourceNodeId = ""] = nodeId.split("::");
  try {
    return {
      groupId: decodeURIComponent(encodedGroupId),
      sourceNodeId: decodeURIComponent(encodedSourceNodeId),
    };
  } catch {
    return null;
  }
}

function stripLeadingTimestamp(text: string) {
  return text
    .replace(
      /^\s*\[?\s*(?:\d{4}-\d{2}-\d{2}[T\s]\d{1,2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?|\d{1,2}:\d{2}(?::\d{2})?)\s*\]?\s*/,
      "",
    )
    .trim();
}

function trimText(text: string, maxLength: number) {
  const clean = stripLeadingTimestamp(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function problemGroupStatusLabel(status: ProblemGroupStatus) {
  if (status === "review") return "검토중";
  if (status === "final") return "확정";
  return "초안";
}

function problemGroupStatusTone(status: ProblemGroupStatus) {
  if (status === "review") return "bg-fuchsia-100 text-fuchsia-700";
  if (status === "final") return "bg-emerald-100 text-emerald-700";
  return "bg-slate-100 text-slate-600";
}

function problemStructureMethodLabel(method: ProblemStructureMethod) {
  return method === "card-sorting" ? "Card Sorting" : "Affinity Diagram";
}

function problemDefinitionModeLabel(mode: ProblemDefinitionMode) {
  if (mode === "ai") return "AI 초안";
  if (mode === "manual") return "직접 구성";
  return "미선택";
}

function normalizeCanvasItemStatus(raw: string | undefined): CanvasItemStatus {
  if (raw === "confirmed" || raw === "final") return "confirmed";
  if (raw === "closed") return "closed";
  return "discussion";
}

function normalizeProblemGroupStatus(raw: string | undefined): ProblemGroupStatus {
  if (raw === "review" || raw === "final") return raw;
  return "draft";
}

function normalizeSolutionAiSuggestionStatus(raw: string | undefined): SolutionAiSuggestionStatus {
  if (raw === "selected" || raw === "dismissed") return raw;
  return "draft";
}

function normalizeIdeationSuggestionStatus(raw: string | undefined) {
  if (raw === "selected" || raw === "dismissed") return raw;
  return "draft";
}

function normalizeSolutionNoteSource(raw: string | undefined): SolutionNoteSource {
  if (raw === "ai") return "ai";
  return "user";
}

function makeSolutionAiSuggestion(
  value: {
    id?: string;
    text?: string;
    status?: string;
  },
  fallbackId: string,
): SolutionAiSuggestionViewModel {
  return {
    id: value.id || fallbackId,
    text: value.text || "",
    status: normalizeSolutionAiSuggestionStatus(value.status),
  };
}

function makeSolutionNote(
  value: {
    id?: string;
    text?: string;
    source?: string;
    source_ai_id?: string;
    is_final_candidate?: boolean;
    final_comment?: string;
  },
  fallbackId: string,
): SolutionNoteViewModel {
  return {
    id: value.id || fallbackId,
    text: value.text || "",
    source: normalizeSolutionNoteSource(value.source),
    source_ai_id: value.source_ai_id || "",
    is_final_candidate: Boolean(value.is_final_candidate),
    final_comment: value.final_comment || "",
  };
}

function makeProblemSummarySourceNodeId(groupId: string, index: number) {
  return `${groupId}-summary-${index}`;
}

function makeProblemSummaryTitle(index: number) {
  return `아이디어${index + 1}`;
}

function getProblemSummarySourceNodeKind(index: number): "topic" | "summary" {
  return index === 0 ? "topic" : "summary";
}

type ProblemSummaryEntry = {
  value: string;
  originSourceNodeId: string;
};

function buildProblemSummaryEntries(group: ProblemGroupViewModel): ProblemSummaryEntry[] {
  return (group.source_summary_items || []).map((value, index) => ({
    value,
    originSourceNodeId: makeProblemSummarySourceNodeId(group.group_id, index),
  }));
}

function remapProblemSummaryDiscussionTargets(
  groupId: string,
  discussionItems: ProblemDiscussionViewModel[] | undefined,
  nextSummaryEntries: ProblemSummaryEntry[],
) {
  const summaryTargetMap = new Map<string, {
    nodeId: string;
    label: string;
    kind: "topic" | "summary";
  }>();

  nextSummaryEntries.forEach((entry, index) => {
    summaryTargetMap.set(entry.originSourceNodeId, {
      nodeId: makeProblemSummarySourceNodeId(groupId, index),
      label: makeProblemSummaryTitle(index),
      kind: getProblemSummarySourceNodeKind(index),
    });
  });

  return (discussionItems || []).map((item) => {
    const target = item.target_node_id ? summaryTargetMap.get(item.target_node_id) : undefined;
    if (!target) return item;

    return {
      ...item,
      target_node_id: target.nodeId,
      target_node_label: target.label,
      target_node_kind: target.kind,
    };
  });
}

function buildProblemGroupDisplayCards(group: ProblemGroupViewModel): ProblemGroupDisplayCard[] {
  const summaryCards = (group.source_summary_items || []).map((item, index) => {
    const sourceNodeId = makeProblemSummarySourceNodeId(group.group_id, index);
    const hasAttachedDiscussion = (group.discussion_items || []).some(
      (discussion) => discussion.target_node_id === sourceNodeId,
    );

    return {
      id: sourceNodeId,
      title: makeProblemSummaryTitle(index),
      body: stripLeadingTimestamp(item) || "아직 요약된 아이디어가 없습니다.",
      kind: "summary",
      sourceNodeId,
      sourceNodeKind: getProblemSummarySourceNodeKind(index),
      attachable: index === 0 || hasAttachedDiscussion,
      cardKind: "summary" as const,
      sourceIndex: index,
      draggable: true,
      summaryText: item,
    };
  });
  const personalCards = (group.ideas || []).map((idea, index) => ({
    id: idea.id || `${group.group_id}-idea-${index}`,
    title: idea.title || `메모${index + 1}`,
    body: idea.body || "메모 내용 없음",
    kind: idea.kind || "memo",
    sourceNodeId: idea.id || `${group.group_id}-idea-${index}`,
    sourceNodeKind: "idea" as const,
    attachable: true,
    cardKind: "idea" as const,
    sourceIndex: index,
    draggable: Boolean(idea.id),
    ideaId: idea.id,
  }));

  if (summaryCards.length === 0 && personalCards.length === 0) {
    return [];
  }

  return [...summaryCards, ...personalCards];
}

function makeProblemStructureNode(group: ProblemGroupViewModel): ProblemStructureNodeViewModel {
  const body =
    group.conclusion ||
    group.insight_lens ||
    (group.source_summary_items || []).find(Boolean) ||
    "정의 1단계에서 가져온 노드입니다.";
  return {
    id: group.group_id,
    sourceGroupId: group.group_id,
    title: group.topic || "문제정의 노드",
    body: stripLeadingTimestamp(body),
    status: group.status,
    depth: Math.max(0, group.depth || 0),
  };
}

function buildProblemStructureNodesFromGroups(groups: ProblemGroupViewModel[]) {
  return groups.map(makeProblemStructureNode);
}

function makeProblemStructureGroup(index: number, createdBy: "ai" | "user" = "user"): ProblemStructureGroupViewModel {
  const id = `structure-group-${Date.now()}-${index}-${Math.random().toString(16).slice(2, 6)}`;
  return {
    id,
    title: `구조화 그룹 ${index + 1}`,
    nodeIds: [],
    rationale: "",
    status: "draft",
    createdBy,
  };
}

function makeProblemStructurePairGroupTitle(
  sourceNode: ProblemStructureNodeViewModel,
  targetNode: ProblemStructureNodeViewModel,
) {
  const sourceTitle = sourceNode.title.trim();
  const targetTitle = targetNode.title.trim();
  if (!sourceTitle && !targetTitle) return "새 구조화 그룹";
  return [targetTitle, sourceTitle]
    .filter(Boolean)
    .map((title) => (title.length > 14 ? `${title.slice(0, 14)}...` : title))
    .join(" + ");
}

function pruneProblemStructureGroups(
  groups: ProblemStructureGroupViewModel[],
  nodes: ProblemStructureNodeViewModel[],
) {
  const validNodeIds = new Set(nodes.map((node) => node.id));
  return groups.map((group) => ({
    ...group,
    nodeIds: group.nodeIds.filter((nodeId) => validNodeIds.has(nodeId)),
  }));
}

function normalizeProblemStructureGroupsFromResponse(
  groups: Array<{
    id?: string;
    title?: string;
    node_ids?: string[];
    rationale?: string;
    status?: string;
    created_by?: string;
  }>,
  nodes: ProblemStructureNodeViewModel[],
): ProblemStructureGroupViewModel[] {
  const validNodeIds = new Set(nodes.map((node) => node.id));
  const usedNodeIds = new Set<string>();
  const usedGroupIds = new Set<string>();

  return groups
    .map((group, index) => {
      const nodeIds = (group.node_ids || []).filter((nodeId) => {
        if (!validNodeIds.has(nodeId) || usedNodeIds.has(nodeId)) {
          return false;
        }
        usedNodeIds.add(nodeId);
        return true;
      });
      if (nodeIds.length === 0) {
        return null;
      }
      const baseId = group.id || `structure-ai-group-${index + 1}`;
      let id = baseId;
      let suffix = 2;
      while (usedGroupIds.has(id)) {
        id = `${baseId}-${suffix}`;
        suffix += 1;
      }
      usedGroupIds.add(id);
      return {
        id,
        title: group.title?.trim() || `AI 구조화 그룹 ${index + 1}`,
        nodeIds,
        rationale: group.rationale?.trim() || "",
        status: normalizeProblemGroupStatus(group.status),
        createdBy: group.created_by === "user" ? "user" : "ai",
      } satisfies ProblemStructureGroupViewModel;
    })
    .filter((group): group is ProblemStructureGroupViewModel => Boolean(group));
}

function buildProblemStructureStatePayload(input: {
  phase: ProblemDefinitionPhase;
  method: ProblemStructureMethod;
  mode: ProblemDefinitionMode;
  nodes: ProblemStructureNodeViewModel[];
  groups: ProblemStructureGroupViewModel[];
}): CanvasProblemStructureState {
  return {
    phase: input.phase,
    method: input.method,
    mode: input.mode,
    nodes: input.nodes.map((node) => ({
      id: node.id,
      source_group_id: node.sourceGroupId,
      title: node.title,
      body: node.body,
      status: node.status,
      depth: node.depth,
    })),
    groups: input.groups.map((group) => ({
      id: group.id,
      title: group.title,
      node_ids: group.nodeIds,
      rationale: group.rationale,
      status: group.status,
      created_by: group.createdBy,
    })),
  };
}

function createDefaultProblemStructureState(): CanvasProblemStructureState {
  return buildProblemStructureStatePayload({
    phase: "explore",
    method: "affinity",
    mode: "",
    nodes: [],
    groups: [],
  });
}

function hydrateProblemStructureState(
  raw: CanvasProblemStructureState | null | undefined,
  fallbackProblemGroups: ProblemGroupViewModel[] = [],
): {
  phase: ProblemDefinitionPhase;
  method: ProblemStructureMethod;
  mode: ProblemDefinitionMode;
  nodes: ProblemStructureNodeViewModel[];
  groups: ProblemStructureGroupViewModel[];
} {
  const phase: ProblemDefinitionPhase = raw?.phase === "structure" ? "structure" : "explore";
  const method: ProblemStructureMethod = raw?.method === "card-sorting" ? "card-sorting" : "affinity";
  const mode: ProblemDefinitionMode = raw?.mode === "ai" || raw?.mode === "manual" ? raw.mode : "";
  const nodes = (raw?.nodes || [])
    .map((node) => ({
      id: node.id?.trim() || "",
      sourceGroupId: node.source_group_id?.trim() || node.id?.trim() || "",
      title: node.title?.trim() || "문제정의 노드",
      body: node.body?.trim() || "정의 1단계에서 가져온 노드입니다.",
      status: normalizeProblemGroupStatus(node.status),
      depth: Math.max(0, Number(node.depth || 0)),
    }))
    .filter((node) => node.id && node.title);
  const fallbackNodes = nodes.length > 0 ? nodes : buildProblemStructureNodesFromGroups(fallbackProblemGroups);
  const validNodeIds = new Set(fallbackNodes.map((node) => node.id));
  const groups = (raw?.groups || [])
    .map((group) => ({
      id: group.id?.trim() || "",
      title: group.title?.trim() || "구조화 그룹",
      nodeIds: (group.node_ids || []).filter((nodeId) => validNodeIds.has(nodeId)),
      rationale: group.rationale?.trim() || "",
      status: normalizeProblemGroupStatus(group.status),
      createdBy: group.created_by === "ai" ? ("ai" as const) : ("user" as const),
    }))
    .filter((group) => group.id && (group.title || group.nodeIds.length > 0));

  return {
    phase: fallbackNodes.length > 0 ? phase : "explore",
    method,
    mode,
    nodes: fallbackNodes,
    groups: pruneProblemStructureGroups(groups, fallbackNodes),
  };
}

function getSummaryEligibleStructureGroups(groups: ProblemStructureGroupViewModel[]) {
  return groups.filter((group) => group.status === "final" || group.status === "review");
}

function buildSummaryDocumentSourceSignature(
  groups: ProblemStructureGroupViewModel[],
  nodes: ProblemStructureNodeViewModel[],
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  return JSON.stringify(
    getSummaryEligibleStructureGroups(groups).map((group) => ({
      id: group.id,
      title: group.title,
      status: group.status,
      rationale: group.rationale,
      nodeIds: group.nodeIds,
      nodes: group.nodeIds.map((nodeId) => {
        const node = nodeById.get(nodeId);
        return {
          id: nodeId,
          sourceGroupId: node?.sourceGroupId || "",
          title: node?.title || "",
          body: node?.body || "",
        };
      }),
    })),
  );
}

function buildSummaryDocumentFromResponse(input: {
  markdown: string;
  sections: CanvasSummaryDocumentSection[];
  generatedAt: string;
  usedLlm: boolean;
  warning?: string;
  sourceSignature: string;
}): CanvasFinalSolutionSummary {
  return normalizeFinalSolutionSummaryPayload({
    final_count: input.sections.length,
    topics: [],
    items: [],
    markdown: input.markdown,
    document_status: input.markdown.trim() ? "ready" : "empty",
    generated_at: input.generatedAt,
    used_llm: input.usedLlm,
    warning: input.warning || "",
    source_signature: input.sourceSignature,
    sections: input.sections,
  });
}

function renderSummaryMarkdownInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("`")) {
      nodes.push(
        <code key={`code-${match.index}`} className="rounded-[4px] bg-[#f7ecfb] px-1.5 py-0.5 font-mono text-[0.92em] text-[#a13ab8]">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**")) {
      nodes.push(
        <strong key={`strong-${match.index}`} className="font-semibold text-black">
          {token.slice(2, -2)}
        </strong>,
      );
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

function isMarkdownTableSeparator(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function parseMarkdownTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderSummaryMarkdownPreview(markdown: string, onEdit: () => void) {
  const lines = markdown.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let index = 0;
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={`list-${blocks.length}`} className="my-3 space-y-1.5 pl-5 text-[15px] leading-7 text-[#334155]">
        {listItems.map((item, itemIndex) => (
          <li key={`list-${blocks.length}-${itemIndex}`} className="list-disc">
            {renderSummaryMarkdownInline(item)}
          </li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  while (index < lines.length) {
    const rawLine = lines[index] || "";
    const line = rawLine.trim();

    if (!line) {
      flushList();
      index += 1;
      continue;
    }

    if (line.includes("|") && index + 1 < lines.length && isMarkdownTableSeparator(lines[index + 1] || "")) {
      flushList();
      const headers = parseMarkdownTableRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && (lines[index] || "").includes("|") && (lines[index] || "").trim()) {
        rows.push(parseMarkdownTableRow(lines[index] || ""));
        index += 1;
      }
      blocks.push(
        <div key={`table-${blocks.length}`} className="my-4 overflow-x-auto border border-black/10 bg-white">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-[#f5f6f8] text-black">
              <tr>
                {headers.map((header, headerIndex) => (
                  <th key={`table-head-${headerIndex}`} className="border-b border-black/10 px-3 py-2 font-semibold">
                    {renderSummaryMarkdownInline(header)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`table-row-${rowIndex}`} className="border-b border-black/5 last:border-b-0">
                  {headers.map((_, cellIndex) => (
                    <td key={`table-cell-${rowIndex}-${cellIndex}`} className="px-3 py-2 align-top text-[#334155]">
                      {renderSummaryMarkdownInline(row[cellIndex] || "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = heading[1].length;
      const content = heading[2];
      const className =
        level === 1
          ? "mb-5 mt-1 text-3xl font-semibold leading-tight text-black"
          : level === 2
            ? "mb-3 mt-8 border-t border-black/10 pt-5 text-xl font-semibold leading-8 text-black first:mt-0 first:border-t-0 first:pt-0"
            : "mb-2 mt-5 text-base font-semibold leading-7 text-[#1f2937]";
      const headingContent = renderSummaryMarkdownInline(content);
      if (level === 1) {
        blocks.push(<h1 key={`heading-${index}`} className={className}>{headingContent}</h1>);
      } else if (level === 2) {
        blocks.push(<h2 key={`heading-${index}`} className={className}>{headingContent}</h2>);
      } else if (level === 3) {
        blocks.push(<h3 key={`heading-${index}`} className={className}>{headingContent}</h3>);
      } else {
        blocks.push(<h4 key={`heading-${index}`} className={className}>{headingContent}</h4>);
      }
      index += 1;
      continue;
    }

    const listMatch = line.match(/^[-*]\s+(.+)$/) || line.match(/^\d+[.)]\s+(.+)$/);
    if (listMatch) {
      listItems.push(listMatch[1]);
      index += 1;
      continue;
    }

    flushList();
    blocks.push(
      <p key={`paragraph-${index}`} className="my-3 text-[15px] leading-8 text-[#334155]">
        {renderSummaryMarkdownInline(line)}
      </p>,
    );
    index += 1;
  }

  flushList();

  return (
    <button
      type="button"
      onClick={onEdit}
      className="h-full w-full overflow-y-auto border border-black/10 bg-white px-8 py-7 text-left outline-none transition hover:border-[#a13ab8]/30 focus:border-[#a13ab8]/30 focus:ring-2 focus:ring-[#a13ab8]/10"
    >
      {blocks.length > 0 ? blocks : (
        <p className="text-sm leading-7 text-[#999]">요약 문서가 아직 없습니다.</p>
      )}
    </button>
  );
}

function escapeSummaryHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderSummaryMarkdownInlineHtml(value: string) {
  return escapeSummaryHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function summaryMarkdownToPrintableHtml(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const blocks: string[] = [];
  let index = 0;
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push(`<ul>${listItems.map((item) => `<li>${renderSummaryMarkdownInlineHtml(item)}</li>`).join("")}</ul>`);
    listItems = [];
  };

  while (index < lines.length) {
    const rawLine = lines[index] || "";
    const line = rawLine.trim();

    if (!line) {
      flushList();
      index += 1;
      continue;
    }

    if (line.includes("|") && index + 1 < lines.length && isMarkdownTableSeparator(lines[index + 1] || "")) {
      flushList();
      const headers = parseMarkdownTableRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && (lines[index] || "").includes("|") && (lines[index] || "").trim()) {
        rows.push(parseMarkdownTableRow(lines[index] || ""));
        index += 1;
      }
      blocks.push(`
        <div class="table-wrap">
          <table>
            <thead>
              <tr>${headers.map((header) => `<th>${renderSummaryMarkdownInlineHtml(header)}</th>`).join("")}</tr>
            </thead>
            <tbody>
              ${rows
                .map((row) => `<tr>${headers.map((_, cellIndex) => `<td>${renderSummaryMarkdownInlineHtml(row[cellIndex] || "")}</td>`).join("")}</tr>`)
                .join("")}
            </tbody>
          </table>
        </div>
      `);
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = Math.min(heading[1].length, 4);
      blocks.push(`<h${level}>${renderSummaryMarkdownInlineHtml(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    const listMatch = line.match(/^[-*]\s+(.+)$/) || line.match(/^\d+[.)]\s+(.+)$/);
    if (listMatch) {
      listItems.push(listMatch[1]);
      index += 1;
      continue;
    }

    flushList();
    blocks.push(`<p>${renderSummaryMarkdownInlineHtml(line)}</p>`);
    index += 1;
  }

  flushList();
  return blocks.join("\n") || "<p class=\"empty\">요약 문서가 아직 없습니다.</p>";
}

function buildPrintableSummaryDocumentHtml(markdown: string, options: { includeToolbar?: boolean } = {}) {
  const includeToolbar = options.includeToolbar ?? true;
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>최종 정리 문서</title>
  <style>
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #f5f6f8;
      color: #111;
      font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif;
      line-height: 1.65;
    }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 1px solid rgba(0,0,0,0.1);
      background: rgba(255,255,255,0.94);
      padding: 14px 24px;
      backdrop-filter: blur(12px);
    }
    .toolbar p { margin: 0; color: #4d4d4d; font-size: 13px; }
    .toolbar button {
      border: 1px solid #ead0f2;
      border-radius: 10px;
      background: #f4e8fb;
      color: #6f2b7d;
      padding: 9px 14px;
      font-weight: 700;
      cursor: pointer;
    }
    .document {
      width: min(860px, calc(100% - 40px));
      margin: 32px auto;
      border: 1px solid rgba(0,0,0,0.1);
      background: #fff;
      padding: 44px 50px;
      box-shadow: 0 20px 70px rgba(15,23,42,0.09);
    }
    .document-title {
      margin: 0 0 28px;
      color: #000;
      font-size: 32px;
      font-weight: 750;
      letter-spacing: 0;
      line-height: 1.25;
    }
    h1 { margin: 26px 0 18px; color: #000; font-size: 30px; line-height: 1.25; }
    h2 { margin: 34px 0 14px; border-top: 1px solid rgba(0,0,0,0.1); padding-top: 22px; color: #000; font-size: 22px; line-height: 1.45; }
    h3 { margin: 24px 0 10px; color: #1f2937; font-size: 17px; line-height: 1.55; }
    h4 { margin: 18px 0 8px; color: #1f2937; font-size: 15px; line-height: 1.55; }
    p { margin: 12px 0; color: #334155; font-size: 15px; line-height: 1.85; }
    ul { margin: 12px 0; padding-left: 24px; color: #334155; font-size: 15px; line-height: 1.8; }
    li { margin: 5px 0; }
    strong { font-weight: 750; color: #111827; }
    em { font-style: italic; }
    code { border-radius: 5px; background: #f5f6f8; padding: 1px 5px; color: #6f2b7d; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.92em; }
    .table-wrap { margin: 18px 0; overflow-x: auto; border: 1px solid rgba(0,0,0,0.1); }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { border-bottom: 1px solid rgba(0,0,0,0.1); background: #f5f6f8; padding: 10px 12px; text-align: left; color: #000; }
    td { border-bottom: 1px solid rgba(0,0,0,0.05); padding: 10px 12px; vertical-align: top; color: #334155; }
    tr:last-child td { border-bottom: 0; }
    .empty { color: #999; }
    @media print {
      body { background: #fff; }
      .toolbar { display: none; }
      .document { width: auto; margin: 0; border: 0; padding: 0; box-shadow: none; }
      h2 { break-after: avoid; }
      h1, h2, h3, h4, p, li, tr { break-inside: avoid; }
    }
  </style>
</head>
<body>
  ${
    includeToolbar
      ? `<div class="toolbar">
    <p>인쇄 대화상자에서 PDF로 저장하면 현재 보이는 문서 형식 그대로 저장됩니다.</p>
    <button type="button" onclick="window.print()">PDF로 저장</button>
  </div>`
      : ""
  }
  <main class="document">
    <h1 class="document-title">최종 정리 문서</h1>
    ${summaryMarkdownToPrintableHtml(markdown)}
  </main>
</body>
</html>`;
}

function openPrintableSummaryDocumentPdf(markdown: string) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  const frameDocument = iframe.contentDocument || frameWindow?.document;
  if (!frameWindow || !frameDocument) {
    iframe.remove();
    return false;
  }

  frameDocument.open();
  frameDocument.write(buildPrintableSummaryDocumentHtml(markdown, { includeToolbar: false }));
  frameDocument.close();
  frameWindow.focus();
  frameWindow.print();
  window.setTimeout(() => iframe.remove(), 60000);
  return true;
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


function serializeSharedProblemGroups(groups: ProblemGroupViewModel[]) {
  return groups.map((group) => ({
    group_id: group.group_id,
    parent_group_id: group.parent_group_id || "",
    depth: group.depth || 0,
    topic: group.topic,
    insight_lens: group.insight_lens,
    insight_user_edited: group.insight_user_edited,
    keywords: group.keywords,
    agenda_ids: group.agenda_ids,
    agenda_titles: group.agenda_titles,
    ideas: group.ideas,
    linked_group_ids: group.linked_group_ids || [],
    evidence_utterance_ids: group.evidence_utterance_ids || [],
    source_summary_items: group.source_summary_items,
    discussion_items: group.discussion_items || [],
    conclusion: group.conclusion,
    conclusion_user_edited: group.conclusion_user_edited,
    status: group.status,
    source_signature: group.source_signature,
    source_agenda_signatures: group.source_agenda_signatures,
    source_idea_signatures: group.source_idea_signatures,
  }));
}

function serializeSharedCanvasItems(items: CanvasItemViewModel[]) {
  return buildWorkspaceCanvasItemsPayload(items);
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

function hydrateSolutionTopics(
  topics: CanvasSolutionTopicResponse[],
  problemGroups: ProblemGroupViewModel[],
  previousTopics: SolutionTopicViewModel[] = [],
): SolutionTopicViewModel[] {
  const previousById = new Map(previousTopics.map((topic) => [topic.group_id, topic]));
  const problemById = new Map(problemGroups.map((group) => [group.group_id, group]));

  return topics.map((topic) => {
    const previous = previousById.get(topic.group_id);
    const problemGroup = problemById.get(topic.group_id);
    const ideaTexts = (topic.ideas || []).filter(Boolean);
    const aiSuggestions: SolutionAiSuggestionViewModel[] =
      (topic.ai_suggestions || []).length > 0
        ? (topic.ai_suggestions || [])
            .filter((item) => item?.id || item?.text)
            .map((item, index) =>
              makeSolutionAiSuggestion(item, `${topic.group_id}-ai-${index + 1}`),
            )
        : ideaTexts.map((text, index) =>
            makeSolutionAiSuggestion(
              {
                text,
                status: previous?.ai_suggestions?.find((item) => item.text === text)?.status,
              },
              `${topic.group_id}-ai-${index + 1}`,
            ),
          );
    const notes: SolutionNoteViewModel[] =
      (topic.notes || []).length > 0
        ? (topic.notes || [])
            .filter((item) => item?.id || item?.text)
            .map((item, index) => makeSolutionNote(item, `${topic.group_id}-note-${index + 1}`))
        : previous?.notes || [];

    return {
      ...topic,
      ideas: ideaTexts,
      status:
        topic.status === "review" || topic.status === "final" || topic.status === "draft"
          ? topic.status
          : previous?.status || "draft",
      problem_topic: topic.problem_topic || problemGroup?.topic || previous?.problem_topic || "",
      problem_insight: topic.problem_insight || problemGroup?.insight_lens || previous?.problem_insight || "",
      problem_conclusion:
        topic.problem_conclusion || problemGroup?.conclusion || previous?.problem_conclusion || "",
      problem_keywords:
        (topic.problem_keywords || []).filter(Boolean).length > 0
          ? (topic.problem_keywords || []).filter(Boolean)
          : problemGroup?.keywords || previous?.problem_keywords || [],
      agenda_titles:
        (topic.agenda_titles || []).filter(Boolean).length > 0
          ? (topic.agenda_titles || []).filter(Boolean)
          : problemGroup?.agenda_titles || previous?.agenda_titles || [],
      ai_suggestions: aiSuggestions,
      notes,
    };
  });
}

function serializeSharedSolutionTopics(topics: SolutionTopicViewModel[]) {
  return topics.map((topic) => ({
    group_id: topic.group_id,
    topic_no: topic.topic_no,
    topic: topic.topic,
    conclusion: topic.conclusion,
    ideas: topic.ideas,
    status: topic.status,
    problem_topic: topic.problem_topic,
    problem_insight: topic.problem_insight,
    problem_conclusion: topic.problem_conclusion,
    problem_keywords: topic.problem_keywords,
    agenda_titles: topic.agenda_titles,
    ai_suggestions: topic.ai_suggestions,
    notes: topic.notes,
  }));
}

function buildSharedCanvasSignature(payload: {
  meeting_goal?: string;
  meeting_goal_context?: string;
  stage: CanvasStage;
  agenda_overrides: Record<string, unknown>;
  canvas_items: unknown[];
  custom_groups?: unknown[];
  problem_groups: unknown[];
  problem_structure?: unknown;
  solution_topics: unknown[];
  final_solution_summary?: unknown;
  node_positions?: CanvasNodePositionsByStage;
  imported_state: MeetingState | null;
}) {
  return JSON.stringify({
    meeting_goal: payload.meeting_goal,
    meeting_goal_context: payload.meeting_goal_context,
    agenda_overrides: payload.agenda_overrides,
    canvas_items: payload.canvas_items,
    custom_groups: payload.custom_groups,
    problem_groups: payload.problem_groups,
    problem_structure: payload.problem_structure,
    solution_topics: payload.solution_topics,
    final_solution_summary: payload.final_solution_summary,
    imported_state: payload.imported_state,
  });
}

function createLocalNodeOverrideMap() {
  return {
    ideation: new Set<string>(),
    "problem-definition": new Set<string>(),
    solution: new Set<string>(),
  };
}

function getNodePositionUpdateKey(stage: CanvasStage, nodeId: string) {
  return `${stage}:${nodeId}`;
}

function getSyncUpdatedAtMs(updatedAt: string | undefined) {
  const parsed = updatedAt ? Date.parse(updatedAt) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function positionsEqual(
  left?: { x: number; y: number },
  right?: { x: number; y: number },
) {
  return (left?.x ?? 0) === (right?.x ?? 0) && (left?.y ?? 0) === (right?.y ?? 0);
}

function rectIntersectionArea(left: DOMRect, right: DOMRect) {
  const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
  const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
  return width * height;
}

function getReactFlowCanvasRect(container: HTMLElement | null) {
  if (!container) {
    return null;
  }

  const flowElement = container.querySelector<HTMLElement>(".react-flow");
  return (flowElement || container).getBoundingClientRect();
}

function pointInRect(clientX: number, clientY: number, rect: DOMRect | null) {
  return Boolean(
    rect &&
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom,
  );
}

function getReactFlowNodeElement(nodeId: string) {
  if (typeof document === "undefined" || !nodeId) {
    return null;
  }
  return Array.from(document.querySelectorAll<HTMLElement>(".react-flow__node"))
    .find((element) => element.getAttribute("data-id") === nodeId) || null;
}

type ProblemSourceDropTarget = {
  groupId: string;
  nodeId: string;
  nodeKind: "topic" | "idea";
  nodeLabel: string;
  element: HTMLElement;
};

function makeProblemSourceDropTarget(candidate: HTMLElement): ProblemSourceDropTarget | null {
  const nodeKind = candidate.dataset.problemSourceNodeKind;
  if (nodeKind !== "topic" && nodeKind !== "idea") {
    return null;
  }

  return {
    groupId: candidate.dataset.problemSourceGroupId || "",
    nodeId: candidate.dataset.problemSourceNodeId || "",
    nodeKind,
    nodeLabel: candidate.dataset.problemSourceNodeLabel || "",
    element: candidate,
  };
}

function findProblemSourceDropTarget(clientX: number, clientY: number, draggedNodeId?: string): ProblemSourceDropTarget | null {
  if (typeof document === "undefined" || !Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    return null;
  }

  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>("[data-problem-source-node-id][data-problem-source-group-id]"),
  );

  const draggedElement = draggedNodeId ? getReactFlowNodeElement(draggedNodeId) : null;
  if (draggedElement) {
    const draggedRect = draggedElement.getBoundingClientRect();
    const best = candidates
      .map((candidate) => ({
        candidate,
        area: rectIntersectionArea(draggedRect, candidate.getBoundingClientRect()),
      }))
      .filter((entry) => entry.area >= 900)
      .sort((left, right) => right.area - left.area)[0];
    if (best) {
      return makeProblemSourceDropTarget(best.candidate);
    }
  }

  for (const candidate of candidates) {
    const rect = candidate.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      continue;
    }

    return makeProblemSourceDropTarget(candidate);
  }

  return null;
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
  const [, setComposerTool] = useState<ComposerTool>("note");
  const [armedCanvasTool, setArmedCanvasTool] = useState<CanvasTool | null>(null);
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
  const [, setTopicCollapsedOverrides] = useState<Record<string, boolean>>({});
  const [focusedCanvasItemId, setFocusedCanvasItemId] = useState("");
  const [customGroups, setCustomGroups] = useState<CustomGroupViewModel[]>([]);
  const [customGroupDraftTitle, setCustomGroupDraftTitle] = useState("");
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
  const [problemStructureDrag, setProblemStructureDrag] = useState<ProblemStructureDragState | null>(null);
  const [editingProblemStructureGroupId, setEditingProblemStructureGroupId] = useState("");
  const [problemStructureGroupDraftTitle, setProblemStructureGroupDraftTitle] = useState("");
  const [problemStructureGroupDraftRationale, setProblemStructureGroupDraftRationale] = useState("");
  const [editingProblemStructureNodeId, setEditingProblemStructureNodeId] = useState("");
  const [problemStructureNodeDraftTitle, setProblemStructureNodeDraftTitle] = useState("");
  const [solutionTopics, setSolutionTopics] = useState<SolutionTopicViewModel[]>([]);
  const [finalSummaryDocument, setFinalSummaryDocument] = useState<CanvasFinalSolutionSummary>(() =>
    createEmptyFinalSolutionSummary(),
  );
  const [summaryDocumentEditMode, setSummaryDocumentEditMode] = useState(false);
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
  const [pendingProblemGroupLinkId, setPendingProblemGroupLinkId] = useState("");
  const [editingProblemGroupId, setEditingProblemGroupId] = useState("");
  const [, setProblemGroupDraftTopic] = useState("");
  const [, setProblemGroupDraftInsight] = useState("");
  const [, setProblemGroupDraftConclusion] = useState("");
  const [draggingPersonalNoteId, setDraggingPersonalNoteId] = useState("");
  const [dropProblemGroupId, setDropProblemGroupId] = useState("");
  const [, setLeftPanelTab] = useState<LeftPanelTab>("detail");
  const [, setConclusionRefreshingGroupId] = useState("");
  const conclusionBatchBusy = false;
  const [problemDefinitionStagePending, setProblemDefinitionStagePending] = useState(false);
  const [problemChildGenerationPendingId, setProblemChildGenerationPendingId] = useState("");
  const [solutionStagePending, setSolutionStagePending] = useState(false);
  const [loadingProblemGroupIds, setLoadingProblemGroupIds] = useState<string[]>([]);
  const [, setIdeaAssimilationStatus] = useState("");
  const [, setProblemDiscussionStatus] = useState("");
  const [, setIdeaCreateStack] = useState(0);
  const [sharedSyncEnabled, setSharedSyncEnabled] = useState(true);
  const [importOverrideActive, setImportOverrideActive] = useState(false);
  const {
    nodePositions,
    setNodePositions,
    nodes,
    setNodes,
    agendaDragPreview,
    setAgendaDragPreview,
    ideationDropPreview,
    setIdeationDropPreview,
    setIdeationNodeDragActive,
    ideationDragGhost,
    setIdeationDragGhost,
    problemIdeaDrag,
    setProblemIdeaDrag,
    problemIdeaDropPreview,
    setProblemIdeaDropPreview,
    problemIdeaDragPoint,
    setProblemIdeaDragPoint,
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
    placementFeedback,
    setPlacementFeedback,
    placementFeedbackTimerRef,
    canvasPlacementPreview,
    setCanvasPlacementPreview,
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
  const { canvasSurfaceRef, flowRef, ideationLeftFlowRef, ideationRightFlowRef } = useCanvasFlowRefs();
  const ideationLeftPaneRef = useRef<HTMLDivElement | null>(null);
  const ideationRightPaneRef = useRef<HTMLDivElement | null>(null);
  const autoProblemDefinitionRef = useRef(false);
  const problemConclusionEntryHandledRef = useRef(false);
  const workspaceLoadedRef = useRef(false);
  const workspaceHydratingRef = useRef(false);
  const workspaceSaveTimerRef = useRef<number | null>(null);
  const lastWorkspaceFieldSignaturesRef = useRef<WorkspaceFieldSignatures>(createWorkspaceFieldSignatures());
  const personalNotesSaveTimerRef = useRef<number | null>(null);
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
    pendingIdeationDragFrameRef,
    ideationDragFrameRef,
    pendingNodePlacementsRef,
    hoveredProblemDropTargetElementRef,
    ideationDropTargetElementsRef,
    ideationBubbleUpdateTickRef,
  } = useCanvasNodeSyncRefs();
  const remoteEditPresenceTimersRef = useRef<Record<string, number>>({});
  const applyingRemoteSharedSyncRef = useRef(false);
  const lastIncomingSharedSyncIdRef = useRef("");
  const lastSharedSyncSignatureRef = useRef("");
  const localNodeOverridesRef = useRef(createLocalNodeOverrideMap());
  const previousCanvasItemSignaturesRef = useRef<Record<string, string>>({});

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
  const {
    agendaDragPreviewRef,
    ideationDropPreviewRef,
    stableIdeationDragRef,
    problemIdeaDragRef,
    problemIdeaPointerDragRef,
  } = useCanvasDragRefs<ProblemGroupDisplayCard>();
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
    solutionTopics: SolutionTopicViewModel[];
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
    solutionTopics: [],
    finalSolutionSummary: createEmptyFinalSolutionSummary(),
    nodePositions: {},
    importedState: null,
  });
  const latestSharedSyncEnabledRef = useRef(true);
  const latestPersonalNotesPayloadRef = useRef<ReturnType<typeof buildCanvasPersonalNotesPayload> | null>(null);

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
  const selectedAgendaForDrop = selectedAgendaId || agendaModels[0]?.id || "";
  const canvasItemById = useMemo(
    () => new Map(canvasItems.map((item) => [item.id, item] as const)),
    [canvasItems],
  );
  const canvasItemIndexById = useMemo(
    () => new Map(canvasItems.map((item, index) => [item.id, index] as const)),
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
      solution_topics: solutionTopics.slice(0, 18).map((topic) => ({
        id: topic.group_id,
        topic: clipClientText(topic.topic, 140),
        conclusion: clipClientText(topic.conclusion, 420),
        status: topic.status,
      })),
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
    solutionTopics,
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
    previousCanvasItemSignaturesRef.current = {};
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
      solutionTopics: [],
      finalSolutionSummary: createEmptyFinalSolutionSummary(),
      nodePositions: {},
      importedState: null,
    };
    latestSharedSyncEnabledRef.current = true;
    latestPersonalNotesPayloadRef.current = null;
    setImportOverrideActive(false);
    setAgendaOverrides({});
    setCanvasItems([]);
    setTopicCollapsedOverrides({});
    setIdeaCreateStack(0);
    setCustomGroups([]);
    resetMeetingGoalState();
    resetEndMeetingState();
    onMeetingGoalChange("");
    onMeetingGoalContextChange("");
    setCustomGroupDraftTitle("");
    setEditingPersonalNoteId("");
    setFinalSummaryDocument(createEmptyFinalSolutionSummary());
    setSummaryDocumentEditMode(false);
    setSummaryEvidenceOpenGroupIds(new Set());
    setSelectedProblemSourceNodeId("");
    setArmedCanvasTool(null);
    setIdeaAssimilationStatus("");
    setProblemDiscussionStatus("");
    agendaDragPreviewRef.current = null;
    setAgendaDragPreview(null);
    problemIdeaDragRef.current = null;
    problemIdeaPointerDragRef.current = null;
    setProblemIdeaDrag(null);
    setProblemIdeaDropPreview(null);
    setProblemIdeaDragPoint(null);
    setPlacementFeedback(null);
    if (workspaceSaveTimerRef.current) {
      window.clearTimeout(workspaceSaveTimerRef.current);
      workspaceSaveTimerRef.current = null;
    }
    if (personalNotesSaveTimerRef.current) {
      window.clearTimeout(personalNotesSaveTimerRef.current);
      personalNotesSaveTimerRef.current = null;
    }
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
    if (ideationDragFrameRef.current !== null) {
      window.cancelAnimationFrame(ideationDragFrameRef.current);
      ideationDragFrameRef.current = null;
    }
    pendingIdeationDragFrameRef.current = null;
    liveNodePositionsRef.current = {};
    pendingNodePreviewsRef.current = {};
    lastNodePreviewFlushAtRef.current = 0;
    nodePreviewSeqRef.current = 0;
    localDraggingNodeIdsRef.current.clear();
    dragIdByNodeIdRef.current = {};
    lastRemoteNodePreviewSeqRef.current = {};
    remoteNodePreviewTargetsRef.current.clear();
    if (placementFeedbackTimerRef.current) {
      window.clearTimeout(placementFeedbackTimerRef.current);
      placementFeedbackTimerRef.current = null;
    }
    if (problemDiscussionFlushTimerRef.current) {
      window.clearTimeout(problemDiscussionFlushTimerRef.current);
      problemDiscussionFlushTimerRef.current = null;
    }
  }, [
    agendaDragPreviewRef,
    dragIdByNodeIdRef,
    ideationDragFrameRef,
    lastNodePreviewFlushAtRef,
    lastRemoteNodePreviewSeqRef,
    liveNodePositionsRef,
    localDraggingNodeIdsRef,
    meetingId,
    nodePreviewFlushTimerRef,
    nodePreviewSeqRef,
    onMeetingGoalChange,
    onMeetingGoalContextChange,
    pendingIdeationDragFrameRef,
    pendingNodePreviewsRef,
    placementFeedbackTimerRef,
    problemIdeaDragRef,
    problemIdeaPointerDragRef,
    remoteNodePreviewFrameRef,
    remoteNodePreviewTargetsRef,
    resetEndMeetingState,
    resetMeetingGoalState,
    setAgendaDragPreview,
    setPlacementFeedback,
    setProblemIdeaDrag,
    setProblemIdeaDragPoint,
    setProblemIdeaDropPreview,
  ]);

  useEffect(() => {
    setTopicCollapsedOverrides(readTopicCollapseOverrides(meetingId, userId));
  }, [meetingId, userId]);

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
      solutionTopics,
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
    solutionTopics,
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
    if (ideationDragFrameRef.current !== null) {
      window.cancelAnimationFrame(ideationDragFrameRef.current);
      ideationDragFrameRef.current = null;
    }
    pendingIdeationDragFrameRef.current = null;
  }, [
    ideationDragFrameRef,
    lastRemoteNodePreviewSeqRef,
    pendingIdeationDragFrameRef,
    remoteNodePreviewFrameRef,
    remoteNodePreviewTargetsRef,
    stage,
  ]);

  useEffect(() => {
    const nextSignatures = Object.fromEntries(
      canvasItems.map((item) => [item.id, getCanvasItemChangeSignature(item)] as const),
    );
    const previousSignatures = previousCanvasItemSignaturesRef.current;
    const hadPreviousItems = Object.keys(previousSignatures).length > 0;

    previousCanvasItemSignaturesRef.current = nextSignatures;
    if (!hadPreviousItems) {
      return;
    }

    const changedItems = canvasItems.filter((item) => previousSignatures[item.id] !== nextSignatures[item.id]);
    const removedItemIds = Object.keys(previousSignatures).filter((itemId) => !nextSignatures[itemId]);
    if (changedItems.length === 0 && removedItemIds.length === 0) {
      return;
    }

  }, [canvasItems]);

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

  useEffect(() => {
    let cancelled = false;

    workspaceLoadedRef.current = false;
    workspaceHydratingRef.current = true;
    setProblemGroups([]);
    setProblemDefinitionMode("");
    setProblemDefinitionPhase("explore");
    setProblemStructureMethod("affinity");
    setProblemStructureDraftMethod("affinity");
    setProblemStructureDraftMode("ai");
    setProblemStructureSetupOpen(false);
    setProblemStructureNodes([]);
    setProblemStructureGroups([]);
    setProblemStructurePending(false);
    setProblemStructureDrag(null);
    setEditingProblemStructureGroupId("");
    setProblemStructureGroupDraftTitle("");
    setProblemStructureGroupDraftRationale("");
    setEditingProblemStructureNodeId("");
    setProblemStructureNodeDraftTitle("");
    setSolutionTopics([]);
    setFinalSummaryDocument(createEmptyFinalSolutionSummary());
    setSummaryDocumentEditMode(false);
    setSummaryEvidenceOpenGroupIds(new Set());
    setPersonalNotes([]);
    setAgendaOverrides({});
    setCanvasItems([]);
    setCustomGroups([]);
    setCustomGroupDraftTitle("");
    setIdeaCreateStack(0);
    setNodePositions({});
    setImportedState(null);
    setStage("ideation");
    setProblemDefinitionMode("");
    setProblemDefinitionPhase("explore");
    setProblemStructureMethod("affinity");
    setProblemStructureDraftMethod("affinity");
    setProblemStructureDraftMode("ai");
    setProblemStructureSetupOpen(false);
    setProblemStructureNodes([]);
    setProblemStructureGroups([]);
    setProblemStructurePending(false);
    setProblemStructureDrag(null);
    setEditingProblemStructureGroupId("");
    setProblemStructureGroupDraftTitle("");
    setProblemStructureGroupDraftRationale("");
    setEditingProblemStructureNodeId("");
    setProblemStructureNodeDraftTitle("");
    setProblemDefinitionStagePending(false);
    setSolutionStagePending(false);
    setSelectedProblemGroupId("");
    setSelectedNodeId("");
    setEditingProblemGroupId("");
    setLoadingProblemGroupIds([]);
    setCollapsedProblemGroupIds(new Set());
    setProblemGroupingRationaleById({});
    setProblemGroupingRationalePendingId("");
    setProblemGroupingRationaleOpenGroupId("");

    if (!meetingId) {
      workspaceHydratingRef.current = false;
      workspaceLoadedRef.current = true;
      return () => {
        cancelled = true;
      };
    }

    void Promise.all([getCanvasWorkspaceState(meetingId), getCanvasPersonalNotes(meetingId, userId)])
      .then(([saved, savedPersonalNotes]) => {
        if (cancelled) return;

        const cachedSharedWorkspace = readSharedWorkspaceSessionCache(meetingId);
        const cachedNodePositions =
          cachedSharedWorkspace && typeof cachedSharedWorkspace === "object"
            ? (cachedSharedWorkspace.node_positions as CanvasNodePositionsByStage | undefined)
            : undefined;

        const sharedGroups = hydrateProblemGroups(saved.problem_groups || []);
        const sharedStage =
          saved.stage === "problem-definition" || saved.stage === "solution" || saved.stage === "ideation"
            ? saved.stage
            : "ideation";
        const sharedSolutionTopics = hydrateSolutionTopics(saved.solution_topics || [], sharedGroups);
        const nextPersonalNotes: PersonalNote[] = (savedPersonalNotes.personal_notes || []).map((note) => {
          const kind: ComposerTool =
            note.kind === "comment" || note.kind === "topic" || note.kind === "note"
              ? note.kind
              : "note";
          return {
            id: note.id,
            projectId: note.project_id || meetingId,
            agendaId: note.agenda_id,
            linkedCanvasItemId: note.linked_canvas_item_id || "",
            linkedCanvasItemTitle: note.linked_canvas_item_title || "",
            kind,
            title: note.title,
            body: note.body,
          };
        });
        const savedLocalCanvasState = savedPersonalNotes.local_canvas_state || null;
        const nextSharedSyncEnabled = savedLocalCanvasState?.shared_sync_enabled ?? true;
        const shouldUseLocalCanvas = nextSharedSyncEnabled === false;
        const savedLocalStage =
          savedLocalCanvasState?.stage === "problem-definition" ||
          savedLocalCanvasState?.stage === "solution" ||
          savedLocalCanvasState?.stage === "ideation"
            ? savedLocalCanvasState.stage
            : "";
        const nextAgendaOverrides = shouldUseLocalCanvas
          ? savedLocalCanvasState?.agenda_overrides || {}
          : saved.agenda_overrides || {};
        const nextCanvasItems = shouldUseLocalCanvas
          ? hydrateCanvasItems(savedLocalCanvasState?.canvas_items || [])
          : hydrateCanvasItems(saved.canvas_items || []);
        const nextCustomGroups = shouldUseLocalCanvas
          ? hydrateCustomGroups(savedLocalCanvasState?.custom_groups || [])
          : hydrateCustomGroups(saved.custom_groups || []);
        const nextGroups = shouldUseLocalCanvas
          ? hydrateProblemGroups(savedLocalCanvasState?.problem_groups || [], sharedGroups)
          : sharedGroups;
        const nextProblemStructure = hydrateProblemStructureState(
          shouldUseLocalCanvas ? savedLocalCanvasState?.problem_structure : saved.problem_structure,
          nextGroups,
        );
        const nextStage =
          savedLocalStage || sharedStage;
        const displayStage = captureStageOverride || nextStage;
        const displayProblemStructure =
          displayStage === "problem-definition" && captureProblemPhaseOverride
            ? {
                ...nextProblemStructure,
                phase: captureProblemPhaseOverride,
              }
            : nextProblemStructure;
        const nextSolutionTopics = shouldUseLocalCanvas
          ? hydrateSolutionTopics(savedLocalCanvasState?.solution_topics || [], nextGroups, sharedSolutionTopics)
          : sharedSolutionTopics;
        const nextFinalSummary = normalizeFinalSolutionSummaryPayload(
          shouldUseLocalCanvas
            ? savedLocalCanvasState?.final_solution_summary || saved.final_solution_summary || null
            : saved.final_solution_summary || null,
        );
        const nextNodePositions = normalizeCanvasNodePositionsForComputedIdeation(
          shouldUseLocalCanvas
            ? savedLocalCanvasState?.node_positions || {}
            : Object.keys(saved.node_positions || {}).length > 0
              ? saved.node_positions || {}
              : cachedNodePositions || {},
        );
        const nextImportedState = shouldUseLocalCanvas
          ? savedLocalCanvasState?.imported_state || null
          : saved.imported_state || null;
        const nextMeetingGoal = saved.meeting_goal || "";
        const nextMeetingGoalContext = saved.meeting_goal_context || "";
        const nextImportOverrideActive = shouldUseLocalCanvas
          ? Boolean(savedLocalCanvasState?.import_override_active && nextImportedState)
          : Boolean(saved.imported_state);

        setProblemGroups(nextGroups);
        setSolutionTopics(nextSolutionTopics);
        setFinalSummaryDocument(nextFinalSummary);
        setSummaryDocumentEditMode(false);
        setSummaryEvidenceOpenGroupIds(new Set());
        setPersonalNotes(nextPersonalNotes);
        setAgendaOverrides(nextAgendaOverrides);
        setCanvasItems(nextCanvasItems);
        setCustomGroups(nextCustomGroups);
        setIdeaCreateStack(saved.idea_create_stack || 0);
        setMeetingGoalDrafts(nextMeetingGoal, nextMeetingGoalContext);
        onMeetingGoalChange(nextMeetingGoal);
        onMeetingGoalContextChange(nextMeetingGoalContext);
        setSharedSyncEnabled(nextSharedSyncEnabled);
        setNodePositions(nextNodePositions);
        setImportedState(nextImportedState);
        setProblemDefinitionMode(displayProblemStructure.mode);
        setProblemDefinitionPhase(displayProblemStructure.phase);
        setProblemStructureMethod(displayProblemStructure.method);
        setProblemStructureDraftMethod(displayProblemStructure.method);
        setProblemStructureDraftMode(displayProblemStructure.mode || "ai");
        setProblemStructureSetupOpen(false);
        setProblemStructureNodes(displayProblemStructure.nodes);
        setProblemStructureGroups(displayProblemStructure.groups);
        setProblemStructurePending(false);
        setEditingProblemStructureGroupId("");
        setProblemStructureGroupDraftTitle("");
        setProblemStructureGroupDraftRationale("");
        setEditingProblemStructureNodeId("");
        setProblemStructureNodeDraftTitle("");
        analysisSignatureAtImportRef.current = nextImportedState
          ? buildMeetingStateSignature(nextImportedState)
          : "";
        setImportOverrideActive(nextImportOverrideActive);
        setStage(displayStage);
        lastSharedSyncSignatureRef.current = buildSharedCanvasSignature({
          meeting_goal: nextMeetingGoal,
          meeting_goal_context: nextMeetingGoalContext,
          stage: displayStage,
          agenda_overrides: nextAgendaOverrides,
          canvas_items: nextCanvasItems,
          custom_groups: serializeCustomGroups(nextCustomGroups),
          problem_groups: nextGroups,
          problem_structure: buildProblemStructureStatePayload(displayProblemStructure),
          solution_topics: serializeSharedSolutionTopics(nextSolutionTopics),
          final_solution_summary: buildFinalSolutionSummaryPayload(nextSolutionTopics, nextFinalSummary),
          node_positions: nextNodePositions,
          imported_state: nextImportedState,
        });
        lastWorkspaceFieldSignaturesRef.current = buildWorkspaceFieldSignatures({
          meetingGoal: nextMeetingGoal,
          meetingGoalContext: nextMeetingGoalContext,
          stage: displayStage,
          agendaOverrides: nextAgendaOverrides,
          canvasItems: nextCanvasItems,
          customGroups: nextCustomGroups,
          problemGroups: nextGroups,
          problemStructure: buildProblemStructureStatePayload(displayProblemStructure),
          solutionTopics: nextSolutionTopics,
          finalSolutionSummary: nextFinalSummary,
          nodePositions: nextNodePositions,
          importedState: nextImportedState,
        });
        setSelectedProblemGroupId(displayProblemStructure.phase === "structure" ? "" : nextGroups[0]?.group_id || "");
        setSelectedCanvasItemId("");
        setSelectedNodeId(
          displayStage === "problem-definition"
            ? (displayProblemStructure.phase === "structure" ? "" : nextGroups[0] ? `problem-${nextGroups[0].group_id}` : "")
            : "",
        );
        setEditingProblemGroupId("");

        console.info("[canvas hydrate] loaded workspace", {
          meetingId,
          sharedSyncEnabled: nextSharedSyncEnabled,
          usingLocalCanvas: shouldUseLocalCanvas,
          stage: displayStage,
          canvasItems: nextCanvasItems.length,
          customGroups: nextCustomGroups.length,
          usedCachedNodePositions:
            !shouldUseLocalCanvas &&
            Object.keys(saved.node_positions || {}).length === 0 &&
            Boolean(cachedNodePositions && Object.keys(cachedNodePositions).length > 0),
          nodePositions: summarizeNodePositionsForDebug(nextNodePositions),
        });
      })
      .catch(() => {
        if (cancelled) return;
        setProblemGroups([]);
        setSolutionTopics([]);
        setFinalSummaryDocument(createEmptyFinalSolutionSummary());
        setSummaryDocumentEditMode(false);
        setSummaryEvidenceOpenGroupIds(new Set());
        setPersonalNotes([]);
        setAgendaOverrides({});
        setCanvasItems([]);
        setCustomGroups([]);
        setIdeaCreateStack(0);
        setSharedSyncEnabled(true);
        setNodePositions({});
        setImportedState(null);
        setStage("ideation");
        setProblemDefinitionMode("");
        setProblemDefinitionPhase("explore");
        setProblemStructureMethod("affinity");
        setProblemStructureDraftMethod("affinity");
        setProblemStructureDraftMode("ai");
        setProblemStructureSetupOpen(false);
        setProblemStructureNodes([]);
        setProblemStructureGroups([]);
        setProblemStructurePending(false);
        setEditingProblemStructureGroupId("");
        setProblemStructureGroupDraftTitle("");
        setProblemStructureGroupDraftRationale("");
        setEditingProblemStructureNodeId("");
        setProblemStructureNodeDraftTitle("");
        lastSharedSyncSignatureRef.current = buildSharedCanvasSignature({
          meeting_goal: "",
          meeting_goal_context: "",
          stage: "ideation",
          agenda_overrides: {},
          canvas_items: [],
          custom_groups: [],
          problem_groups: [],
          problem_structure: createDefaultProblemStructureState(),
          solution_topics: [],
          final_solution_summary: buildFinalSolutionSummaryPayload([], createEmptyFinalSolutionSummary()),
          node_positions: {},
          imported_state: null,
        });
        lastWorkspaceFieldSignaturesRef.current = buildWorkspaceFieldSignatures({
          meetingGoal: "",
          meetingGoalContext: "",
          stage: "ideation",
          agendaOverrides: {},
          canvasItems: [],
          customGroups: [],
          problemGroups: [],
          problemStructure: createDefaultProblemStructureState(),
          solutionTopics: [],
          finalSolutionSummary: createEmptyFinalSolutionSummary(),
          nodePositions: {},
          importedState: null,
        });
        setSelectedProblemGroupId("");
        setSelectedCanvasItemId("");
        setSelectedNodeId("");
        setEditingProblemGroupId("");
        setCollapsedProblemGroupIds(new Set());
        setProblemGroupingRationaleById({});
        setProblemGroupingRationalePendingId("");
        setProblemGroupingRationaleOpenGroupId("");
      })
      .finally(() => {
        if (cancelled) return;
        workspaceHydratingRef.current = false;
        workspaceLoadedRef.current = true;
      });

    return () => {
      cancelled = true;
    };
  }, [
    captureProblemPhaseOverride,
    captureStageOverride,
    meetingId,
    onMeetingGoalChange,
    onMeetingGoalContextChange,
    setMeetingGoalDrafts,
    setNodePositions,
    userId,
  ]);

  useEffect(() => {
    if (audioImportRevision <= 0) {
      return;
    }

    setAgendaOverrides({});
    setCanvasItems([]);
    setIdeaCreateStack(0);
    setImportedState(null);
    setImportOverrideActive(false);
    setProblemGroups([]);
    setSolutionTopics([]);
    setNodePositions({});
    setStage("ideation");
    setSelectedProblemGroupId("");
    setSelectedCanvasItemId("");
    setSelectedNodeId("");
    setEditingProblemGroupId("");
    setEditingProblemStructureGroupId("");
    setProblemStructureGroupDraftTitle("");
    setProblemStructureGroupDraftRationale("");
    setEditingProblemStructureNodeId("");
    setProblemStructureNodeDraftTitle("");
    setCollapsedProblemGroupIds(new Set());
    setProblemGroupingRationaleById({});
    setProblemGroupingRationalePendingId("");
    setProblemGroupingRationaleOpenGroupId("");
    setAgendaOverrides({});
    setEditingPersonalNoteId("");
    setLeftPanelTab("detail");
    setActivityMessage("새 오디오 전사를 기준으로 canvas를 초기화했습니다.");
  }, [audioImportRevision, setNodePositions]);

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

  const buildProblemConclusionPayload = useCallback(
    (group: ProblemGroupViewModel) => ({
      meeting_id: meetingId,
      meeting_topic: meetingTopicForAi,
      group: {
        group_id: group.group_id,
        topic: group.topic,
        insight_lens: group.insight_lens,
        agenda_titles: group.agenda_titles || [],
        source_summary_items: group.source_summary_items || [],
        ideas: (group.ideas || []).map((idea) => ({
          id: idea.id,
          kind: idea.kind,
          title: idea.title,
          body: idea.body,
        })),
      },
    }),
    [meetingId, meetingTopicForAi],
  );

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

  const forceBroadcastSharedCanvas = useCallback(
    (overrides?: {
      stage?: CanvasStage;
      agendaOverrides?: Record<string, AgendaOverride>;
      canvasItems?: CanvasItemViewModel[];
      customGroups?: CustomGroupViewModel[];
      problemGroups?: ProblemGroupViewModel[];
      problemStructure?: CanvasProblemStructureState;
      solutionTopics?: SolutionTopicViewModel[];
      finalSolutionSummary?: CanvasFinalSolutionSummary;
      nodePositions?: CanvasNodePositionsByStage;
      importedState?: MeetingState | null;
      meetingGoal?: string;
      meetingGoalContext?: string;
    }) => {
      if (!meetingId || !userId) {
        return;
      }

      const snapshot = {
        meeting_goal: overrides?.meetingGoal ?? meetingGoalDraft.trim(),
        meeting_goal_context: overrides?.meetingGoalContext ?? meetingGoalContextDraft.trim(),
        stage: overrides?.stage ?? stage,
        agenda_overrides: serializeAgendaOverrides(overrides?.agendaOverrides ?? agendaOverrides),
        canvas_items: serializeSharedCanvasItems(overrides?.canvasItems ?? canvasItems),
        custom_groups: serializeCustomGroups(overrides?.customGroups ?? customGroups),
        problem_groups: serializeSharedProblemGroups(overrides?.problemGroups ?? problemGroups),
        problem_structure: overrides?.problemStructure ?? problemStructureStatePayload,
        solution_topics: serializeSharedSolutionTopics(overrides?.solutionTopics ?? solutionTopics),
        final_solution_summary: buildFinalSolutionSummaryPayload(
          overrides?.solutionTopics ?? solutionTopics,
          overrides?.finalSolutionSummary ?? finalSummaryDocument,
        ),
        imported_state:
          overrides && "importedState" in overrides
            ? (overrides.importedState ?? null)
            : persistedSharedImportedState,
      };

      if (nodePreviewFlushTimerRef.current) {
        window.clearTimeout(nodePreviewFlushTimerRef.current);
        nodePreviewFlushTimerRef.current = null;
      }
      pendingNodePreviewsRef.current = {};
      lastNodePreviewFlushAtRef.current = Date.now();
      lastSharedSyncSignatureRef.current = buildSharedCanvasSignature(snapshot);
      onSharedCanvasSync({
        sync_id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        meeting_id: meetingId,
        sync_scope: "full",
        updated_by: userId,
        updated_at: new Date().toISOString(),
        meeting_goal: snapshot.meeting_goal,
        meeting_goal_context: snapshot.meeting_goal_context,
        stage: snapshot.stage,
        agenda_overrides: snapshot.agenda_overrides,
        canvas_items: snapshot.canvas_items,
        custom_groups: snapshot.custom_groups,
        problem_groups: snapshot.problem_groups,
        problem_structure: snapshot.problem_structure,
        solution_topics: snapshot.solution_topics,
        final_solution_summary: snapshot.final_solution_summary,
        imported_state: snapshot.imported_state,
      });
    },
    [
      agendaOverrides,
      canvasItems,
      customGroups,
      finalSummaryDocument,
      meetingGoalContextDraft,
      meetingGoalDraft,
      meetingId,
      onSharedCanvasSync,
      persistedSharedImportedState,
      lastNodePreviewFlushAtRef,
      problemGroups,
      problemStructureStatePayload,
      nodePreviewFlushTimerRef,
      pendingNodePreviewsRef,
      solutionTopics,
      stage,
      userId,
    ],
  );

  const flushPendingNodePreviews = useCallback(() => {
    if (nodePreviewFlushTimerRef.current) {
      window.clearTimeout(nodePreviewFlushTimerRef.current);
    }
    nodePreviewFlushTimerRef.current = null;
    if (
      !meetingId ||
      !userId ||
      !latestSharedSyncEnabledRef.current ||
      !workspaceLoadedRef.current ||
      workspaceHydratingRef.current ||
      applyingRemoteSharedSyncRef.current
    ) {
      pendingNodePreviewsRef.current = {};
      return;
    }

    const pendingPreviews = Object.values(pendingNodePreviewsRef.current);
    pendingNodePreviewsRef.current = {};
    if (pendingPreviews.length === 0) {
      return;
    }

    lastNodePreviewFlushAtRef.current = Date.now();
    pendingPreviews.forEach((preview) => {
      onNodePreviewSync(preview);
    });
  }, [
    lastNodePreviewFlushAtRef,
    meetingId,
    nodePreviewFlushTimerRef,
    onNodePreviewSync,
    pendingNodePreviewsRef,
    userId,
  ]);

  const scheduleNodePreview = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      if (
        !meetingId ||
        !userId ||
        !nodeId ||
        !latestSharedSyncEnabledRef.current ||
        !workspaceLoadedRef.current ||
        workspaceHydratingRef.current ||
        applyingRemoteSharedSyncRef.current
      ) {
        return;
      }

      const dragId =
        dragIdByNodeIdRef.current[nodeId] ||
        `${meetingId}:${userId}:${nodeId}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
      dragIdByNodeIdRef.current[nodeId] = dragId;
      const preview: CanvasNodePreviewPayload = {
        meeting_id: meetingId,
        stage,
        node_id: nodeId,
        x: Number(position.x || 0),
        y: Number(position.y || 0),
        updated_by: userId,
        updated_at: new Date().toISOString(),
        drag_id: dragId,
        client_seq: ++nodePreviewSeqRef.current,
      };
      pendingNodePreviewsRef.current[`${preview.stage}:${preview.node_id}`] = preview;

      const elapsed = Date.now() - lastNodePreviewFlushAtRef.current;
      const delay = Math.max(0, NODE_PREVIEW_SYNC_THROTTLE_MS - elapsed);
      if (delay === 0) {
        flushPendingNodePreviews();
        return;
      }

      if (!nodePreviewFlushTimerRef.current) {
        nodePreviewFlushTimerRef.current = window.setTimeout(flushPendingNodePreviews, delay);
      }
    },
    [
      dragIdByNodeIdRef,
      flushPendingNodePreviews,
      lastNodePreviewFlushAtRef,
      meetingId,
      nodePreviewFlushTimerRef,
      nodePreviewSeqRef,
      pendingNodePreviewsRef,
      stage,
      userId,
    ],
  );

  const ensureRemoteNodePreviewAnimation = useCallback(() => {
    if (remoteNodePreviewFrameRef.current !== null) {
      return;
    }

    const animate = () => {
      remoteNodePreviewFrameRef.current = null;
      if (remoteNodePreviewTargetsRef.current.size === 0) {
        return;
      }

      setNodes((current) => {
        const visibleNodeIds = new Set(current.map((node) => node.id));
        remoteNodePreviewTargetsRef.current.forEach((_, nodeId) => {
          if (!visibleNodeIds.has(nodeId) || localDraggingNodeIdsRef.current.has(nodeId)) {
            remoteNodePreviewTargetsRef.current.delete(nodeId);
          }
        });

        let changed = false;
        const nextNodes = current.map((node) => {
          const target = remoteNodePreviewTargetsRef.current.get(node.id);
          if (!target) {
            return node;
          }

          const dx = target.x - node.position.x;
          const dy = target.y - node.position.y;
          const distance = Math.hypot(dx, dy);
          const nextPosition =
            distance <= NODE_PREVIEW_SETTLE_DISTANCE
              ? target
              : {
                  x: node.position.x + dx * NODE_PREVIEW_ANIMATION_LERP,
                  y: node.position.y + dy * NODE_PREVIEW_ANIMATION_LERP,
                };

          if (distance <= NODE_PREVIEW_SETTLE_DISTANCE) {
            remoteNodePreviewTargetsRef.current.delete(node.id);
          }

          if (positionsEqual(node.position, nextPosition)) {
            return node;
          }

          changed = true;
          return {
            ...node,
            position: nextPosition,
          };
        });

        return changed ? nextNodes : current;
      });

      if (remoteNodePreviewTargetsRef.current.size > 0) {
        remoteNodePreviewFrameRef.current = window.requestAnimationFrame(animate);
      }
    };

    remoteNodePreviewFrameRef.current = window.requestAnimationFrame(animate);
  }, [localDraggingNodeIdsRef, remoteNodePreviewFrameRef, remoteNodePreviewTargetsRef, setNodes]);

  const broadcastNodePositionCommit = useCallback(
    (stageKey: CanvasStage, nodeId: string, nextNodePositions: CanvasNodePositionsByStage) => {
      if (
        !meetingId ||
        !userId ||
        !nodeId ||
        !latestSharedSyncEnabledRef.current ||
        !workspaceLoadedRef.current ||
        workspaceHydratingRef.current ||
        applyingRemoteSharedSyncRef.current
      ) {
        return;
      }

      const normalizedNodePositions = normalizeCanvasNodePositionsForComputedIdeation(nextNodePositions);
      const committedPosition = normalizedNodePositions[stageKey]?.[nodeId];
      if (!committedPosition) {
        return;
      }

      const committedAtMs = Date.now();
      lastNodePositionUpdateMsByKeyRef.current[getNodePositionUpdateKey(stageKey, nodeId)] = committedAtMs;
      lastWorkspaceFieldSignaturesRef.current = {
        ...lastWorkspaceFieldSignaturesRef.current,
        node_positions: JSON.stringify(normalizedNodePositions),
      };

      onSharedCanvasSync({
        sync_id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        meeting_id: meetingId,
        sync_scope: "node_positions",
        updated_by: userId,
        updated_at: new Date(committedAtMs).toISOString(),
        stage: stageKey,
        node_positions: {
          [stageKey]: {
            [nodeId]: committedPosition,
          },
        },
      });
    },
    [lastNodePositionUpdateMsByKeyRef, meetingId, onSharedCanvasSync, userId],
  );

  useEffect(() => {
    if (
      !incomingNodePreview ||
      incomingNodePreview.meeting_id !== meetingId ||
      incomingNodePreview.updated_by === userId ||
      incomingNodePreview.stage !== stage ||
      !workspaceLoadedRef.current ||
      workspaceHydratingRef.current
    ) {
      return;
    }

    const nodeId = incomingNodePreview.node_id;
    if (!nodeId || localDraggingNodeIdsRef.current.has(nodeId)) {
      return;
    }

    const sequenceKey = `${incomingNodePreview.updated_by}:${incomingNodePreview.stage}:${nodeId}`;
    const previousSequence = lastRemoteNodePreviewSeqRef.current[sequenceKey] ?? -1;
    if (incomingNodePreview.client_seq <= previousSequence) {
      return;
    }

    lastRemoteNodePreviewSeqRef.current[sequenceKey] = incomingNodePreview.client_seq;
    remoteNodePreviewTargetsRef.current.set(nodeId, {
      x: incomingNodePreview.x,
      y: incomingNodePreview.y,
    });
    ensureRemoteNodePreviewAnimation();
  }, [
    ensureRemoteNodePreviewAnimation,
    incomingNodePreview,
    lastRemoteNodePreviewSeqRef,
    localDraggingNodeIdsRef,
    meetingId,
    remoteNodePreviewTargetsRef,
    stage,
    userId,
  ]);

  const applyServerIdeaWorkspace = useCallback(
    (workspace: CanvasWorkspaceStateResponse | undefined | null) => {
      if (!workspace || workspace.meeting_id !== meetingId) return;

      const nextCanvasItems = hydrateCanvasItems(workspace.canvas_items || []);
      const nextNodePositions = normalizeCanvasNodePositionsForComputedIdeation(workspace.node_positions || {});
      const nextMeetingGoal = typeof workspace.meeting_goal === "string" ? workspace.meeting_goal : meetingGoalDraft;
      const nextMeetingGoalContext =
        typeof workspace.meeting_goal_context === "string" ? workspace.meeting_goal_context : meetingGoalContextDraft;

      setCanvasItems(nextCanvasItems);
      setMeetingGoalDrafts(nextMeetingGoal, nextMeetingGoalContext);
      onMeetingGoalChange(nextMeetingGoal);
      onMeetingGoalContextChange(nextMeetingGoalContext);
      setIdeaCreateStack(workspace.idea_create_stack || 0);
      setNodePositions(nextNodePositions);
      latestSharedWorkspaceRef.current = {
        ...latestSharedWorkspaceRef.current,
        meetingGoal: nextMeetingGoal,
        meetingGoalContext: nextMeetingGoalContext,
        canvasItems: nextCanvasItems,
        nodePositions: nextNodePositions,
        importedState: persistedSharedImportedState,
      };

      if (sharedSyncEnabled) {
        writeSharedWorkspaceSessionCache(
          meetingId,
          buildFullWorkspacePatchPayload({
            meetingId,
            meetingGoal: nextMeetingGoal,
            meetingGoalContext: nextMeetingGoalContext,
            stage,
            agendaOverrides,
            canvasItems: nextCanvasItems,
            customGroups,
            problemGroups,
            problemStructure: problemStructureStatePayload,
            solutionTopics,
            nodePositions: nextNodePositions,
            importedState: persistedSharedImportedState,
          }),
        );
        forceBroadcastSharedCanvas({
          meetingGoal: nextMeetingGoal,
          meetingGoalContext: nextMeetingGoalContext,
          canvasItems: nextCanvasItems,
          nodePositions: nextNodePositions,
        });
      }
    },
    [
      agendaOverrides,
      customGroups,
      forceBroadcastSharedCanvas,
      meetingGoalContextDraft,
      meetingGoalDraft,
      meetingId,
      onMeetingGoalChange,
      onMeetingGoalContextChange,
      persistedSharedImportedState,
      problemGroups,
      problemStructureStatePayload,
      setMeetingGoalDrafts,
      setNodePositions,
      sharedSyncEnabled,
      solutionTopics,
      stage,
    ],
  );

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
          buildFullWorkspacePatchPayload({
            meetingId,
            meetingGoal: meetingGoalDraft,
            meetingGoalContext: meetingGoalContextDraft,
            stage,
            agendaOverrides,
            canvasItems,
            customGroups,
            problemGroups: nextProblemGroups,
            problemStructure: nextProblemStructurePayload,
            solutionTopics,
            nodePositions: nextNodePositions,
            importedState: persistedSharedImportedState,
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
      agendaOverrides,
      canvasItems,
      customGroups,
      forceBroadcastSharedCanvas,
      meetingGoalContextDraft,
      meetingGoalDraft,
      meetingId,
      nodePositions,
      persistedSharedImportedState,
      problemGroups,
      problemStructureStatePayload,
      setNodePositions,
      sharedSyncEnabled,
      solutionTopics,
      stage,
    ],
  );

  const refreshCanvasTopicSummary = useCallback(
    async (topicItemId: string) => {
      if (!meetingId || !topicItemId) return;

      setIdeaAssimilationStatus("AI가 topic 제목과 content를 생성 중");
      try {
        const started = await startCanvasTopicSummaryWorkspace({
          meeting_id: meetingId,
          meeting_topic: meetingTopicForAi,
          topic_item_id: topicItemId,
        });
        console.info("[canvas topic summary]", {
          label: "start response",
          status: started.status,
          jobId: started.job_id,
          topicItemId,
          detail: started.detail || "",
          warning: started.warning || "",
        });
        applyServerIdeaWorkspace(started.workspace);

        if (started.status !== "processing" || !started.job_id) {
          setIdeaAssimilationStatus(started.detail || "AI topic 정리 상태를 확인했습니다.");
          return;
        }

        let finalResult = started;
        for (let attempt = 0; attempt < 90; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 900));
          finalResult = await getCanvasIdeaAssimilationWorkspaceJob(meetingId, started.job_id);
          if (finalResult.status !== "processing") {
            applyServerIdeaWorkspace(finalResult.workspace);
            break;
          }
        }

        console.info("[canvas topic summary]", {
          label: "final response",
          status: finalResult.status,
          jobId: finalResult.job_id,
          topicItemId,
          detail: finalResult.detail || "",
          warning: finalResult.warning || "",
        });
        setIdeaAssimilationStatus(
          finalResult.status === "completed"
            ? "AI topic 정리 반영됨"
            : finalResult.detail || "AI topic 정리 응답 대기 중",
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[canvas topic summary]", {
          label: "request failed",
          topicItemId,
          errorDetail: message,
        });
        setIdeaAssimilationStatus(`AI topic 정리 실패: ${message}`);
      }
    },
    [applyServerIdeaWorkspace, meetingId, meetingTopicForAi],
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

  const setProblemGroupsLoading = useCallback((groupIds: string[], loading: boolean) => {
    if (groupIds.length === 0) return;
    setLoadingProblemGroupIds((prev) => {
      if (loading) {
        return Array.from(new Set([...prev, ...groupIds]));
      }
      const removeSet = new Set(groupIds);
      return prev.filter((groupId) => !removeSet.has(groupId));
    });
  }, []);

  const handleGenerateProblemGroupConclusion = useCallback(
    async (group: ProblemGroupViewModel, reason: "manual" | "drop" = "manual") => {
      if (group.insight_user_edited && group.conclusion_user_edited) {
        setActivityMessage("이 그룹의 Insight와 결론은 수동 수정 상태라 AI 재생성을 건너뜁니다.");
        return;
      }

      setProblemGroupsLoading([group.group_id], true);
      setConclusionRefreshingGroupId(group.group_id);
      try {
        const result = await generateProblemGroupConclusion(buildProblemConclusionPayload(group));
        let nextGroups: ProblemGroupViewModel[] = [];
        setProblemGroups((prev) => {
          nextGroups = prev.map((item) =>
            item.group_id === group.group_id
              ? {
                  ...item,
                  insight_lens: item.insight_user_edited
                    ? item.insight_lens
                    : (result.used_llm ? result.insight_lens : "") || item.insight_lens,
                  conclusion: item.conclusion_user_edited
                    ? item.conclusion
                    : result.conclusion || item.conclusion,
                }
              : item,
          );
          return nextGroups;
        });
        if (!sharedSyncEnabled && nextGroups.length > 0) {
          forceBroadcastSharedCanvas({
            stage: "problem-definition",
            problemGroups: nextGroups,
          });
        }
        if (editingProblemGroupId === group.group_id) {
          if (!group.insight_user_edited) {
            setProblemGroupDraftInsight((result.used_llm ? result.insight_lens : "") || group.insight_lens || "");
          }
          if (!group.conclusion_user_edited) {
            setProblemGroupDraftConclusion(result.conclusion || group.conclusion);
          }
        }
        setActivityMessage(
          result.warning ||
            (reason === "drop" ? "메모 편입 내용을 반영해 결론을 다시 생성했습니다." : "문제 정의 그룹 결론을 생성했습니다."),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setActivityMessage(`결론 생성 실패: ${message}`);
      } finally {
        setProblemGroupsLoading([group.group_id], false);
        setConclusionRefreshingGroupId("");
      }
    },
    [
      buildProblemConclusionPayload,
      editingProblemGroupId,
      forceBroadcastSharedCanvas,
      setProblemGroupsLoading,
      sharedSyncEnabled,
    ],
  );

  const handleShowProblemGroupingRationale = useCallback(
    async (group: ProblemGroupViewModel) => {
      if (!meetingId) return;
      const cached = problemGroupingRationaleById[group.group_id];
      if (cached) {
        setProblemGroupingRationaleOpenGroupId(group.group_id);
        return;
      }

      setProblemGroupingRationalePendingId(group.group_id);
      try {
        const result = await generateProblemGroupingRationale(buildProblemGroupingRationalePayload(group));
        const nextRationale: ProblemGroupingRationaleViewModel = {
          groupId: result.group_id || group.group_id,
          rationale: result.rationale || "이 분류를 묶은 기준을 찾지 못했습니다.",
          basisItems: result.basis_items || [],
          usedLlm: result.used_llm,
          warning: result.warning || "",
          generatedAt: result.generated_at,
        };
        setProblemGroupingRationaleById((prev) => ({
          ...prev,
          [group.group_id]: nextRationale,
        }));
        setProblemGroupingRationaleOpenGroupId(group.group_id);
        setActivityMessage(result.warning || "문제정의 그룹의 묶은 기준을 확인했습니다.");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setActivityMessage(`묶은 기준 생성 실패: ${message}`);
      } finally {
        setProblemGroupingRationalePendingId("");
      }
    },
    [buildProblemGroupingRationalePayload, meetingId, problemGroupingRationaleById],
  );

  const handleAttachPersonalNoteToProblemGroup = useCallback((groupId: string, noteId: string) => {
    const note = personalNotes.find((entry) => entry.id === noteId);
    const group = problemGroupById.get(groupId);
    if (!note || !group) return;

    if (group.ideas.some((idea) => idea.id === noteId)) {
      setDropProblemGroupId("");
      setDraggingPersonalNoteId("");
      setActivityMessage("이미 편입된 메모입니다.");
      return;
    }

    const nextGroup = {
      ...group,
      ideas: [
        ...group.ideas,
        {
          id: note.id,
          kind: note.kind,
          title: note.title,
          body: note.body,
        },
      ],
    };

    setProblemGroups((prev) =>
      prev.map((item) => (item.group_id === groupId ? nextGroup : item)),
    );
    setSelectedProblemGroupId(groupId);
    setSelectedNodeId(`problem-${groupId}`);
    setLeftPanelTab("detail");
    setDropProblemGroupId("");
    setDraggingPersonalNoteId("");
    void handleGenerateProblemGroupConclusion(nextGroup, "drop");
  }, [handleGenerateProblemGroupConclusion, personalNotes, problemGroupById]);

  const getProblemIdeaDropPreviewFromPoint = useCallback(
    (clientX: number, clientY: number): ProblemIdeaDropPreviewState | null => {
      const activeProblemIdeaDrag = problemIdeaDragRef.current || problemIdeaDrag;
      if (!activeProblemIdeaDrag || typeof document === "undefined") return null;

      const elementAtPoint = document.elementFromPoint(clientX, clientY);
      const groupElement = elementAtPoint?.closest("[data-problem-group-drop-id]") as HTMLElement | null;
      const targetGroupId = groupElement?.dataset.problemGroupDropId || "";
      if (!targetGroupId || !groupElement) return null;

      const targetGroup = problemGroupById.get(targetGroupId);
      if (!targetGroup) return null;

      const cardElement = elementAtPoint?.closest("[data-problem-card-source-node-id]") as HTMLElement | null;
      const cardGroupElement = cardElement?.closest("[data-problem-group-drop-id]") as HTMLElement | null;
      const card =
        cardElement && cardGroupElement === groupElement
          ? buildProblemGroupDisplayCards(targetGroup).find(
              (item) => item.sourceNodeId === cardElement.dataset.problemCardSourceNodeId,
            )
          : undefined;

      const visibleTargetCards = buildProblemGroupDisplayCards(targetGroup).filter(
        (item) =>
          item.cardKind === activeProblemIdeaDrag.cardKind &&
          !(
            activeProblemIdeaDrag.sourceGroupId === targetGroupId &&
            item.sourceNodeId === activeProblemIdeaDrag.sourceNodeId
          ),
      );
      let insertIndex = visibleTargetCards.length;
      const cardElements = Array.from(
        groupElement.querySelectorAll<HTMLElement>("[data-problem-card-source-node-id]"),
      );
      const targetCardEntries = visibleTargetCards
        .map((item) => ({
          item,
          element: cardElements.find((candidate) => candidate.dataset.problemCardSourceNodeId === item.sourceNodeId),
        }))
        .filter((entry): entry is { item: ProblemGroupDisplayCard; element: HTMLElement } => Boolean(entry.element));

      if (targetCardEntries.length > 0) {
        const nearest = targetCardEntries.reduce((best, entry) => {
          const rect = entry.element.getBoundingClientRect();
          const sameRow = clientY >= rect.top - 12 && clientY <= rect.bottom + 12;
          const rowPenalty = sameRow ? 0 : Math.abs(clientY - (rect.top + rect.height / 2)) * 2;
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          const distance = Math.hypot(clientX - centerX, clientY - centerY) + rowPenalty;
          return !best || distance < best.distance
            ? {
                ...entry,
                rect,
                distance,
              }
            : best;
        }, null as null | {
          item: ProblemGroupDisplayCard;
          element: HTMLElement;
          rect: DOMRect;
          distance: number;
        });

        if (nearest) {
          const targetIndex = visibleTargetCards.findIndex((item) => item.sourceNodeId === nearest.item.sourceNodeId);
          const sameRow = clientY >= nearest.rect.top - 12 && clientY <= nearest.rect.bottom + 12;
          const insertAfter = sameRow
            ? clientX > nearest.rect.left + nearest.rect.width / 2
            : clientY > nearest.rect.top + nearest.rect.height / 2;
          insertIndex = targetIndex + (insertAfter ? 1 : 0);
        }
      } else if (card && card.cardKind !== activeProblemIdeaDrag.cardKind) {
        insertIndex = activeProblemIdeaDrag.cardKind === "idea" && card.cardKind === "summary" ? 0 : visibleTargetCards.length;
      } else if (card) {
        const targetIndex = visibleTargetCards.findIndex((item) => item.sourceNodeId === card.sourceNodeId);
        if (targetIndex >= 0 && cardElement) {
          const rect = cardElement.getBoundingClientRect();
          const insertAfter =
            clientY > rect.top + rect.height / 2 ||
            clientX > rect.left + rect.width / 2;
          insertIndex = targetIndex + (insertAfter ? 1 : 0);
        }
      }

      return {
        targetGroupId,
        cardKind: activeProblemIdeaDrag.cardKind,
        insertIndex,
      };
    },
    [problemGroupById, problemIdeaDrag, problemIdeaDragRef],
  );

  const updateProblemIdeaDragPoint = useCallback((clientX: number, clientY: number) => {
    if (!clientX && !clientY) return;
    setProblemIdeaDragPoint((current) =>
      current?.x === clientX && current.y === clientY
        ? current
        : {
            x: clientX,
            y: clientY,
          },
    );
  }, [setProblemIdeaDragPoint]);

  const beginProblemCardDrag = useCallback(
    (groupId: string, card: ProblemGroupDisplayCard, clientX: number, clientY: number) => {
      const nextDrag = {
        sourceGroupId: groupId,
        sourceNodeId: card.sourceNodeId,
        sourceNodeKind: card.sourceNodeKind,
        cardKind: card.cardKind,
        sourceIndex: card.sourceIndex,
        title: card.title,
        ideaId: card.ideaId,
        summaryText: card.summaryText,
      };
      problemIdeaDragRef.current = nextDrag;
      setProblemIdeaDrag(nextDrag);
      setProblemIdeaDropPreview({
        targetGroupId: groupId,
        cardKind: card.cardKind,
        insertIndex: card.sourceIndex,
      });
      updateProblemIdeaDragPoint(clientX, clientY);
    },
    [problemIdeaDragRef, setProblemIdeaDrag, setProblemIdeaDropPreview, updateProblemIdeaDragPoint],
  );

  const handleProblemIdeaDragEnd = useCallback(() => {
    problemIdeaPointerDragRef.current = null;
    setProblemIdeaDrag(null);
    setProblemIdeaDropPreview(null);
    setProblemIdeaDragPoint(null);
  }, [problemIdeaPointerDragRef, setProblemIdeaDrag, setProblemIdeaDragPoint, setProblemIdeaDropPreview]);

  const handleProblemIdeaDrop = useCallback(
    (
      groupId: string,
      event: React.DragEvent<HTMLDivElement>,
      dropPreviewOverride?: ProblemIdeaDropPreviewState | null,
    ) => {
      const activeProblemIdeaDrag = problemIdeaDragRef.current || problemIdeaDrag;
      const draggedSourceNodeId =
        activeProblemIdeaDrag?.sourceNodeId || event.dataTransfer.getData("application/x-imms-problem-card");
      if (!draggedSourceNodeId || !activeProblemIdeaDrag) return;

      event.preventDefault();
      event.stopPropagation();

      const targetGroupId = groupId;
      const effectiveDropPreview = dropPreviewOverride ?? problemIdeaDropPreview;
      const previewInsertIndex =
        effectiveDropPreview?.targetGroupId === targetGroupId &&
        effectiveDropPreview.cardKind === activeProblemIdeaDrag.cardKind
          ? effectiveDropPreview.insertIndex
          : undefined;
      const sourceGroup = problemGroupById.get(activeProblemIdeaDrag.sourceGroupId);
      const targetGroup = problemGroupById.get(targetGroupId);
      if (!sourceGroup || !targetGroup) {
        handleProblemIdeaDragEnd();
        return;
      }

      const sameGroup = sourceGroup.group_id === targetGroup.group_id;
      let nextProblemGroupsSnapshot: ProblemGroupViewModel[] | null = null;
      let nextSelectedSourceNodeId = draggedSourceNodeId;
      let activityMessage = "";

      if (activeProblemIdeaDrag.cardKind === "idea") {
        const draggedIdeaId =
          activeProblemIdeaDrag.ideaId || event.dataTransfer.getData("application/x-imms-problem-idea");
        const movedIdea = sourceGroup.ideas.find((idea) => idea.id === draggedIdeaId);
        if (!draggedIdeaId || !movedIdea) {
          handleProblemIdeaDragEnd();
          return;
        }

        const remainingTargetIdeas = sameGroup
          ? targetGroup.ideas.filter((idea) => idea.id !== draggedIdeaId)
          : targetGroup.ideas;
        const safeInsertIndex = Math.max(
          0,
          Math.min(previewInsertIndex ?? remainingTargetIdeas.length, remainingTargetIdeas.length),
        );
        const nextTargetIdeas = [
          ...remainingTargetIdeas.slice(0, safeInsertIndex),
          movedIdea,
          ...remainingTargetIdeas.slice(safeInsertIndex),
        ];
        const movingAttachedOpinions = sameGroup
          ? []
          : (sourceGroup.discussion_items || []).filter((item) => item.target_node_id === draggedIdeaId);

        nextProblemGroupsSnapshot = problemGroups.map((group) => {
          if (group.group_id === sourceGroup.group_id && !sameGroup) {
            return {
              ...group,
              ideas: group.ideas.filter((idea) => idea.id !== draggedIdeaId),
              discussion_items: (group.discussion_items || []).filter((item) => item.target_node_id !== draggedIdeaId),
            };
          }

          if (group.group_id === targetGroup.group_id) {
            return {
              ...group,
              ideas: nextTargetIdeas,
              discussion_items: sameGroup
                ? group.discussion_items || []
                : [
                    ...(group.discussion_items || []),
                    ...movingAttachedOpinions.map((item) => ({
                      ...item,
                      parent_group_id: targetGroup.group_id,
                      target_node_id: draggedIdeaId,
                      target_node_label: movedIdea.title,
                      target_node_kind: "idea" as const,
                    })),
                  ],
            };
          }

          return group;
        });
        nextSelectedSourceNodeId = draggedIdeaId;
        activityMessage = sameGroup
          ? `"${movedIdea.title || "아이디어"}" 순서를 변경했습니다.`
          : `"${movedIdea.title || "아이디어"}"를 "${targetGroup.topic}" 그룹으로 이동했습니다.`;
      } else {
        const sourceEntries = buildProblemSummaryEntries(sourceGroup);
        const movedEntry = sourceEntries[activeProblemIdeaDrag.sourceIndex];
        if (!movedEntry) {
          handleProblemIdeaDragEnd();
          return;
        }

        if (sameGroup) {
          const remainingEntries = sourceEntries.filter((_, index) => index !== activeProblemIdeaDrag.sourceIndex);
          const safeInsertIndex = Math.max(
            0,
            Math.min(previewInsertIndex ?? remainingEntries.length, remainingEntries.length),
          );
          const nextEntries = [
            ...remainingEntries.slice(0, safeInsertIndex),
            movedEntry,
            ...remainingEntries.slice(safeInsertIndex),
          ];

          nextProblemGroupsSnapshot = problemGroups.map((group) =>
            group.group_id === sourceGroup.group_id
              ? {
                  ...group,
                  source_summary_items: nextEntries.map((entry) => entry.value),
                  discussion_items: remapProblemSummaryDiscussionTargets(
                    group.group_id,
                    group.discussion_items,
                    nextEntries,
                  ),
                }
              : group,
          );
          nextSelectedSourceNodeId = makeProblemSummarySourceNodeId(targetGroup.group_id, safeInsertIndex);
          activityMessage = `"${activeProblemIdeaDrag.title || "요약"}" 순서를 변경했습니다.`;
        } else {
          const sourceRemainingEntries = sourceEntries.filter((_, index) => index !== activeProblemIdeaDrag.sourceIndex);
          const targetEntries = buildProblemSummaryEntries(targetGroup);
          const safeInsertIndex = Math.max(
            0,
            Math.min(previewInsertIndex ?? targetEntries.length, targetEntries.length),
          );
          const nextTargetEntries = [
            ...targetEntries.slice(0, safeInsertIndex),
            movedEntry,
            ...targetEntries.slice(safeInsertIndex),
          ];
          const movingAttachedOpinions = (sourceGroup.discussion_items || []).filter(
            (item) => item.target_node_id === movedEntry.originSourceNodeId,
          );
          const sourceRemainingDiscussions = (sourceGroup.discussion_items || []).filter(
            (item) => item.target_node_id !== movedEntry.originSourceNodeId,
          );
          const movedTargetNodeId = makeProblemSummarySourceNodeId(targetGroup.group_id, safeInsertIndex);
          const movedTargetNodeKind = getProblemSummarySourceNodeKind(safeInsertIndex);
          const movedTargetNodeLabel = makeProblemSummaryTitle(safeInsertIndex);

          nextProblemGroupsSnapshot = problemGroups.map((group) => {
            if (group.group_id === sourceGroup.group_id) {
              return {
                ...group,
                source_summary_items: sourceRemainingEntries.map((entry) => entry.value),
                discussion_items: remapProblemSummaryDiscussionTargets(
                  group.group_id,
                  sourceRemainingDiscussions,
                  sourceRemainingEntries,
                ),
              };
            }

            if (group.group_id === targetGroup.group_id) {
              return {
                ...group,
                source_summary_items: nextTargetEntries.map((entry) => entry.value),
                discussion_items: [
                  ...remapProblemSummaryDiscussionTargets(
                    group.group_id,
                    group.discussion_items,
                    nextTargetEntries,
                  ),
                  ...movingAttachedOpinions.map((item) => ({
                    ...item,
                    parent_group_id: targetGroup.group_id,
                    target_node_id: movedTargetNodeId,
                    target_node_label: movedTargetNodeLabel,
                    target_node_kind: movedTargetNodeKind,
                  })),
                ],
              };
            }

            return group;
          });
          nextSelectedSourceNodeId = movedTargetNodeId;
          activityMessage = `"${activeProblemIdeaDrag.title || "요약"}"를 "${targetGroup.topic}" 그룹으로 이동했습니다.`;
        }
      }

      if (!nextProblemGroupsSnapshot) {
        handleProblemIdeaDragEnd();
        return;
      }

      latestSharedWorkspaceRef.current = {
        ...latestSharedWorkspaceRef.current,
        stage,
        problemGroups: nextProblemGroupsSnapshot,
        nodePositions,
        importedState: persistedSharedImportedState,
      };
      setProblemGroups(nextProblemGroupsSnapshot);
      setSelectedProblemGroupId(targetGroup.group_id);
      setSelectedProblemSourceNodeId(nextSelectedSourceNodeId);
      setSelectedNodeId(`problem-${targetGroup.group_id}`);
      setLeftPanelTab("detail");
      setActivityMessage(activityMessage);
      handleProblemIdeaDragEnd();

      if (sharedSyncEnabled) {
        if (meetingId) {
          writeSharedWorkspaceSessionCache(
            meetingId,
            buildFullWorkspacePatchPayload({
              meetingId,
              meetingGoal: meetingGoalDraft,
              meetingGoalContext: meetingGoalContextDraft,
              stage,
              agendaOverrides,
              canvasItems,
              customGroups,
              problemGroups: nextProblemGroupsSnapshot,
              problemStructure: problemStructureStatePayload,
              solutionTopics,
              nodePositions,
              importedState: persistedSharedImportedState,
            }),
          );
        }
        forceBroadcastSharedCanvas({
          problemGroups: nextProblemGroupsSnapshot,
          nodePositions,
        });
        if (meetingId) {
          void saveCanvasWorkspacePatch({
            meeting_id: meetingId,
            problem_groups: serializeSharedProblemGroups(nextProblemGroupsSnapshot),
            node_positions: nodePositions,
            imported_state: persistedSharedImportedState,
          }).catch((error) => {
            console.error("Failed to save problem idea reorder:", error);
          });
        }
      }
    },
    [
      agendaOverrides,
      canvasItems,
      customGroups,
      forceBroadcastSharedCanvas,
      handleProblemIdeaDragEnd,
      meetingGoalContextDraft,
      meetingGoalDraft,
      meetingId,
      nodePositions,
      persistedSharedImportedState,
      problemGroupById,
      problemGroups,
      problemStructureStatePayload,
      problemIdeaDrag,
      problemIdeaDragRef,
      problemIdeaDropPreview,
      sharedSyncEnabled,
      solutionTopics,
      stage,
    ],
  );

  useEffect(() => {
    if (
      !meetingId ||
      captureStageOverride ||
      !workspaceLoadedRef.current ||
      workspaceHydratingRef.current ||
      problemDefinitionStagePending ||
      solutionStagePending ||
      conclusionBatchBusy ||
      applyingRemoteSharedSyncRef.current
    ) {
      return;
    }

    const nextProblemGroupsPayload = buildWorkspaceProblemGroupsPayload(problemGroups);
    const nextSolutionTopicsPayload = buildWorkspaceSolutionTopicsPayload(solutionTopics);
    const nextMeetingGoal = meetingGoalDraft.trim();
    const nextMeetingGoalContext = meetingGoalContextDraft.trim();
    const nextSignatures = buildWorkspaceFieldSignatures({
      meetingGoal: nextMeetingGoal,
      meetingGoalContext: nextMeetingGoalContext,
      stage,
      agendaOverrides,
      canvasItems,
      customGroups,
      problemGroups,
      problemStructure: problemStructureStatePayload,
      solutionTopics,
      finalSolutionSummary: finalSummaryDocument,
      nodePositions,
      importedState: persistedSharedImportedState,
    });
    const previousSignatures = lastWorkspaceFieldSignaturesRef.current;
    const patch: {
      meeting_id: string;
      meeting_goal?: string;
      meeting_goal_context?: string;
      stage?: CanvasStage;
      agenda_overrides?: ReturnType<typeof serializeAgendaOverrides>;
      canvas_items?: ReturnType<typeof serializeSharedCanvasItems>;
      custom_groups?: ReturnType<typeof serializeCustomGroups>;
      problem_groups?: ReturnType<typeof buildWorkspaceProblemGroupsPayload>;
      problem_structure?: CanvasProblemStructureState;
      solution_topics?: ReturnType<typeof buildWorkspaceSolutionTopicsPayload>;
      final_solution_summary?: CanvasFinalSolutionSummary;
      node_positions?: CanvasNodePositionsByStage;
      imported_state?: MeetingState | null;
    } = {
      meeting_id: meetingId,
    };

    let hasChanges = false;
    let meetingGoalChanged = false;
    if (
      nextSignatures.meeting_goal !== previousSignatures.meeting_goal ||
      nextSignatures.meeting_goal_context !== previousSignatures.meeting_goal_context
    ) {
      patch.meeting_goal = nextMeetingGoal;
      patch.meeting_goal_context = nextMeetingGoalContext;
      hasChanges = true;
      meetingGoalChanged = true;
    }
    if (sharedSyncEnabled && nextSignatures.agenda_overrides !== previousSignatures.agenda_overrides) {
      patch.agenda_overrides = serializeAgendaOverrides(agendaOverrides);
      hasChanges = true;
    }
    if (sharedSyncEnabled && nextSignatures.canvas_items !== previousSignatures.canvas_items) {
      patch.canvas_items = serializeSharedCanvasItems(canvasItems);
      hasChanges = true;
    }
    if (sharedSyncEnabled && nextSignatures.custom_groups !== previousSignatures.custom_groups) {
      patch.custom_groups = serializeCustomGroups(customGroups);
      hasChanges = true;
    }
    if (sharedSyncEnabled && nextSignatures.problem_groups !== previousSignatures.problem_groups) {
      patch.problem_groups = nextProblemGroupsPayload;
      hasChanges = true;
    }
    if (sharedSyncEnabled && nextSignatures.problem_structure !== previousSignatures.problem_structure) {
      patch.problem_structure = problemStructureStatePayload;
      hasChanges = true;
    }
    if (sharedSyncEnabled && nextSignatures.solution_topics !== previousSignatures.solution_topics) {
      patch.solution_topics = nextSolutionTopicsPayload;
      patch.final_solution_summary = buildFinalSolutionSummaryPayload(solutionTopics, finalSummaryDocument);
      hasChanges = true;
    }
    if (sharedSyncEnabled && nextSignatures.final_solution_summary !== previousSignatures.final_solution_summary) {
      patch.final_solution_summary = buildFinalSolutionSummaryPayload(solutionTopics, finalSummaryDocument);
      hasChanges = true;
    }
    if (sharedSyncEnabled && nextSignatures.imported_state !== previousSignatures.imported_state) {
      patch.imported_state = persistedSharedImportedState;
      hasChanges = true;
    }

    if (!hasChanges) {
      return;
    }

    if (workspaceSaveTimerRef.current) {
      window.clearTimeout(workspaceSaveTimerRef.current);
    }

    workspaceSaveTimerRef.current = window.setTimeout(() => {
      void saveCanvasWorkspacePatch(patch)
        .then(() => {
          if (meetingGoalChanged) {
            onMeetingGoalSync?.(nextMeetingGoal, nextMeetingGoalContext);
          }
          lastWorkspaceFieldSignaturesRef.current = sharedSyncEnabled
            ? nextSignatures
            : {
                ...lastWorkspaceFieldSignaturesRef.current,
                meeting_goal: nextSignatures.meeting_goal,
                meeting_goal_context: nextSignatures.meeting_goal_context,
              };
        })
        .catch((error) => {
          console.error("Failed to save canvas workspace patch:", error);
        });
    }, 450);

    return () => {
      if (workspaceSaveTimerRef.current) {
        window.clearTimeout(workspaceSaveTimerRef.current);
        workspaceSaveTimerRef.current = null;
      }
    };
  }, [
    agendaOverrides,
    captureStageOverride,
    canvasItems,
    conclusionBatchBusy,
    customGroups,
    finalSummaryDocument,
    meetingGoalContextDraft,
    meetingGoalDraft,
    meetingId,
    nodePositions,
    onMeetingGoalSync,
    persistedSharedImportedState,
    problemDefinitionStagePending,
    problemGroups,
    problemStructureStatePayload,
    sharedSyncEnabled,
    solutionStagePending,
    solutionTopics,
    stage,
  ]);

  const localCanvasState = useMemo<CanvasLocalState>(
    () =>
      sharedSyncEnabled
        ? {
            shared_sync_enabled: true,
            meeting_goal: meetingGoalDraft.trim(),
            meeting_goal_context: meetingGoalContextDraft.trim(),
            agenda_overrides: serializeAgendaOverrides(agendaOverrides),
            canvas_items: serializeSharedCanvasItems(canvasItems),
            custom_groups: serializeCustomGroups(customGroups),
            stage,
          }
        : {
            shared_sync_enabled: false,
            meeting_goal: meetingGoalDraft.trim(),
            meeting_goal_context: meetingGoalContextDraft.trim(),
            agenda_overrides: serializeAgendaOverrides(agendaOverrides),
            canvas_items: serializeSharedCanvasItems(canvasItems),
            custom_groups: serializeCustomGroups(customGroups),
            stage,
            problem_groups: serializeSharedProblemGroups(problemGroups),
            problem_structure: problemStructureStatePayload,
            solution_topics: serializeSharedSolutionTopics(solutionTopics),
            final_solution_summary: buildFinalSolutionSummaryPayload(solutionTopics, finalSummaryDocument),
            node_positions: normalizeCanvasNodePositionsForComputedIdeation(nodePositions),
            imported_state: persistedSharedImportedState,
            import_override_active: importOverrideActive,
          },
    [
      agendaOverrides,
      canvasItems,
      customGroups,
      finalSummaryDocument,
      importOverrideActive,
      meetingGoalContextDraft,
      meetingGoalDraft,
      nodePositions,
      persistedSharedImportedState,
      problemGroups,
      problemStructureStatePayload,
      sharedSyncEnabled,
      solutionTopics,
      stage,
    ],
  );

  useEffect(() => {
    if (!meetingId || !userId || !workspaceLoadedRef.current || workspaceHydratingRef.current) {
      return;
    }

    if (personalNotesSaveTimerRef.current) {
      window.clearTimeout(personalNotesSaveTimerRef.current);
    }

    personalNotesSaveTimerRef.current = window.setTimeout(() => {
      void saveCanvasPersonalNotes({
        meeting_id: meetingId,
        user_id: userId,
        personal_notes: personalNotes.map((note) => ({
          id: note.id,
          project_id: note.projectId || meetingId,
          agenda_id: note.agendaId,
          linked_canvas_item_id: note.linkedCanvasItemId || "",
          linked_canvas_item_title: note.linkedCanvasItemTitle || "",
          kind: note.kind,
          title: note.title,
          body: note.body,
        })),
        local_canvas_state: localCanvasState,
      }).catch((error) => {
        console.error("Failed to save canvas personal notes:", error);
      });
    }, 300);

    return () => {
      if (personalNotesSaveTimerRef.current) {
        window.clearTimeout(personalNotesSaveTimerRef.current);
        personalNotesSaveTimerRef.current = null;
      }
    };
  }, [localCanvasState, meetingId, personalNotes, userId]);

  const sharedCanvasSnapshot = useMemo(
    () => ({
      meeting_goal: meetingGoalDraft.trim(),
      meeting_goal_context: meetingGoalContextDraft.trim(),
      stage,
      agenda_overrides: serializeAgendaOverrides(agendaOverrides),
      canvas_items: serializeSharedCanvasItems(canvasItems),
      custom_groups: serializeCustomGroups(customGroups),
      problem_groups: serializeSharedProblemGroups(problemGroups),
      problem_structure: problemStructureStatePayload,
      solution_topics: serializeSharedSolutionTopics(solutionTopics),
      final_solution_summary: buildFinalSolutionSummaryPayload(solutionTopics, finalSummaryDocument),
      imported_state: persistedSharedImportedState,
    }),
    [agendaOverrides, canvasItems, customGroups, finalSummaryDocument, meetingGoalContextDraft, meetingGoalDraft, persistedSharedImportedState, problemGroups, problemStructureStatePayload, solutionTopics, stage],
  );

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
    const handlePointerMove = (event: PointerEvent) => {
      const pointerDrag = problemIdeaPointerDragRef.current;
      if (!pointerDrag) return;

      const deltaX = event.clientX - pointerDrag.startX;
      const deltaY = event.clientY - pointerDrag.startY;
      if (!pointerDrag.active && Math.hypot(deltaX, deltaY) < 4) {
        return;
      }

      event.preventDefault();
      if (!pointerDrag.active) {
        pointerDrag.active = true;
        beginProblemCardDrag(pointerDrag.groupId, pointerDrag.card, event.clientX, event.clientY);
      }

      updateProblemIdeaDragPoint(event.clientX, event.clientY);
      const preview = getProblemIdeaDropPreviewFromPoint(event.clientX, event.clientY);
      setProblemIdeaDropPreview((current) =>
        current?.targetGroupId === preview?.targetGroupId &&
        current?.cardKind === preview?.cardKind &&
        current?.insertIndex === preview?.insertIndex
          ? current
          : preview,
      );
    };

    const handlePointerUp = (event: PointerEvent) => {
      const pointerDrag = problemIdeaPointerDragRef.current;
      if (!pointerDrag) return;

      problemIdeaPointerDragRef.current = null;
      if (!pointerDrag.active) {
        return;
      }

      event.preventDefault();
      const preview = getProblemIdeaDropPreviewFromPoint(event.clientX, event.clientY);
      if (!preview) {
        problemIdeaDragRef.current = null;
        setProblemIdeaDrag(null);
        setProblemIdeaDropPreview(null);
        setProblemIdeaDragPoint(null);
        setActivityMessage("문제정의 그룹 밖에 놓아서 이동을 취소했습니다.");
        return;
      }

      setProblemIdeaDropPreview(preview);
      handleProblemIdeaDrop(preview.targetGroupId, {
        preventDefault() {},
        stopPropagation() {},
        dataTransfer: {
          getData(type: string) {
            if (type === "application/x-imms-problem-idea") return pointerDrag.card.ideaId || "";
            if (type === "application/x-imms-problem-card") return pointerDrag.card.sourceNodeId;
            return "";
          },
        },
      } as unknown as React.DragEvent<HTMLDivElement>, preview);
    };

    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", handlePointerUp, true);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", handlePointerUp, true);
    };
  }, [
    beginProblemCardDrag,
    getProblemIdeaDropPreviewFromPoint,
    handleProblemIdeaDrop,
    problemIdeaDragRef,
    problemIdeaPointerDragRef,
    setProblemIdeaDrag,
    setProblemIdeaDragPoint,
    setProblemIdeaDropPreview,
    updateProblemIdeaDragPoint,
  ]);

  useEffect(() => {
    if (!problemIdeaDrag) return;

    const handleWindowDragOver = (event: DragEvent) => {
      updateProblemIdeaDragPoint(event.clientX, event.clientY);
    };
    const handleWindowDrop = (event: DragEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("[data-problem-group-drop-id]")) {
        return;
      }

      event.preventDefault();
      problemIdeaDragRef.current = null;
      setProblemIdeaDrag(null);
      setProblemIdeaDropPreview(null);
      setProblemIdeaDragPoint(null);
      setActivityMessage("문제정의 그룹 밖에 놓아서 이동을 취소했습니다.");
    };

    window.addEventListener("dragover", handleWindowDragOver);
    window.addEventListener("drop", handleWindowDrop);

    return () => {
      window.removeEventListener("dragover", handleWindowDragOver);
      window.removeEventListener("drop", handleWindowDrop);
    };
  }, [
    problemIdeaDrag,
    problemIdeaDragRef,
    setProblemIdeaDrag,
    setProblemIdeaDragPoint,
    setProblemIdeaDropPreview,
    updateProblemIdeaDragPoint,
  ]);

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

  useEffect(() => {
    if (!meetingId || !sharedSyncEnabled || !workspaceLoadedRef.current || workspaceHydratingRef.current) {
      return;
    }

    writeSharedWorkspaceSessionCache(
      meetingId,
      buildFullWorkspacePatchPayload({
        meetingId,
        meetingGoal: meetingGoalDraft,
        meetingGoalContext: meetingGoalContextDraft,
        stage,
        agendaOverrides,
        canvasItems,
        customGroups,
        problemGroups,
        problemStructure: problemStructureStatePayload,
        solutionTopics,
        nodePositions,
        importedState: persistedSharedImportedState,
      }),
    );
  }, [
    agendaOverrides,
    canvasItems,
    customGroups,
    meetingGoalContextDraft,
    meetingGoalDraft,
    meetingId,
    nodePositions,
    persistedSharedImportedState,
    problemGroups,
    problemStructureStatePayload,
    sharedSyncEnabled,
    solutionTopics,
    stage,
  ]);

  const sharedCanvasSignature = useMemo(
    () => buildSharedCanvasSignature(sharedCanvasSnapshot),
    [sharedCanvasSnapshot],
  );

  const currentPersonalNotesPayload = useMemo(() => {
    if (!meetingId || !userId || !workspaceLoadedRef.current || workspaceHydratingRef.current) {
      return null;
    }
    return buildCanvasPersonalNotesPayload(meetingId, userId, personalNotes, localCanvasState);
  }, [localCanvasState, meetingId, personalNotes, userId]);

  useEffect(() => {
    latestPersonalNotesPayloadRef.current = currentPersonalNotesPayload;
  }, [currentPersonalNotesPayload]);

  useEffect(() => {
    if (!incomingSharedCanvasSync || incomingSharedCanvasSync.meeting_id !== meetingId) {
      return;
    }

    if (workspaceHydratingRef.current) {
      return;
    }

    if (incomingSharedCanvasSync.updated_by === userId) {
      return;
    }

    if (lastIncomingSharedSyncIdRef.current === incomingSharedCanvasSync.sync_id) {
      return;
    }

    const hasLocalNodePositions = CANVAS_STAGES.some(
      (stageKey) => Object.keys(nodePositions[stageKey] || {}).length > 0,
    );
    if (
      incomingSharedCanvasSync.updated_by === "__server__" &&
      workspaceLoadedRef.current &&
      hasLocalNodePositions
    ) {
      return;
    }

    lastIncomingSharedSyncIdRef.current = incomingSharedCanvasSync.sync_id;
    if (incomingSharedCanvasSync.sync_scope === "node_positions") {
      const incomingNodePositionPatch = normalizeCanvasNodePositionsForComputedIdeation(
        incomingSharedCanvasSync.node_positions || {},
      );
      const incomingUpdatedAtMs = getSyncUpdatedAtMs(incomingSharedCanvasSync.updated_at);
      const acceptedPreviewTargets: Array<[string, { x: number; y: number }]> = [];
      let changed = false;
      const mergedNodePositions: CanvasNodePositionsByStage = {
        ...liveNodePositionsRef.current,
      };

      CANVAS_STAGES.forEach((stageKey) => {
        const incomingStagePositions = incomingNodePositionPatch[stageKey] || {};
        const incomingEntries = Object.entries(incomingStagePositions);
        if (incomingEntries.length === 0) {
          return;
        }

        const nextStagePositions = {
          ...(mergedNodePositions[stageKey] || {}),
        };
        incomingEntries.forEach(([nodeId, position]) => {
          if (!nodeId || localDraggingNodeIdsRef.current.has(nodeId)) {
            return;
          }
          if (!sharedSyncEnabled && localNodeOverridesRef.current[stageKey].has(nodeId)) {
            return;
          }

          const updateKey = getNodePositionUpdateKey(stageKey, nodeId);
          const lastUpdateMs = lastNodePositionUpdateMsByKeyRef.current[updateKey] || 0;
          if (incomingUpdatedAtMs < lastUpdateMs) {
            return;
          }

          const nextPosition = {
            x: Number(position.x || 0),
            y: Number(position.y || 0),
          };
          lastNodePositionUpdateMsByKeyRef.current[updateKey] = incomingUpdatedAtMs;
          if (!positionsEqual(nextStagePositions[nodeId], nextPosition)) {
            nextStagePositions[nodeId] = nextPosition;
            changed = true;
            if (stageKey === stage) {
              acceptedPreviewTargets.push([nodeId, nextPosition]);
            }
          }
        });
        mergedNodePositions[stageKey] = nextStagePositions;
      });

      const nextMergedNodePositions = changed
        ? normalizeCanvasNodePositionsForComputedIdeation(mergedNodePositions)
        : liveNodePositionsRef.current;

      if (acceptedPreviewTargets.length > 0) {
        acceptedPreviewTargets.forEach(([nodeId, position]) => {
          remoteNodePreviewTargetsRef.current.set(nodeId, position);
        });
        ensureRemoteNodePreviewAnimation();
      }

      applyingRemoteSharedSyncRef.current = true;
      liveNodePositionsRef.current = nextMergedNodePositions;
      latestSharedWorkspaceRef.current = {
        ...latestSharedWorkspaceRef.current,
        nodePositions: nextMergedNodePositions,
      };
      lastWorkspaceFieldSignaturesRef.current = {
        ...lastWorkspaceFieldSignaturesRef.current,
        node_positions: JSON.stringify(nextMergedNodePositions),
      };
      if (changed) {
        setNodePositions(nextMergedNodePositions);
      }
      window.setTimeout(() => {
        applyingRemoteSharedSyncRef.current = false;
      }, 0);
      return;
    }

    const incomingCanvasItems = hydrateCanvasItems(incomingSharedCanvasSync.canvas_items || []);
    const incomingCustomGroups = hydrateCustomGroups(incomingSharedCanvasSync.custom_groups || []);
    const incomingMeetingGoal = incomingSharedCanvasSync.meeting_goal || "";
    const incomingMeetingGoalContext = incomingSharedCanvasSync.meeting_goal_context || "";
    const nextIncomingCanvasItems = incomingCanvasItems;
    const currentNodePositionsSnapshot = liveNodePositionsRef.current;

    const nextProblemGroups = hydrateProblemGroups(incomingSharedCanvasSync.problem_groups || [], problemGroups);
    const nextProblemStructure = hydrateProblemStructureState(
      incomingSharedCanvasSync.problem_structure || createDefaultProblemStructureState(),
      nextProblemGroups,
    );
    const localViewProblemStructurePayload = buildProblemStructureStatePayload({
      ...nextProblemStructure,
      phase: problemDefinitionPhase,
      method: problemStructureMethod,
      mode: problemDefinitionMode,
    });
    const incomingSolutionTopics = hydrateSolutionTopics(
      incomingSharedCanvasSync.solution_topics || [],
      nextProblemGroups,
      solutionTopics,
    );
    const nextSolutionTopics = incomingSolutionTopics;
    const nextFinalSummary = normalizeFinalSolutionSummaryPayload(incomingSharedCanvasSync.final_solution_summary || null);

    lastSharedSyncSignatureRef.current = buildSharedCanvasSignature({
      meeting_goal: incomingMeetingGoal,
      meeting_goal_context: incomingMeetingGoalContext,
      stage,
      agenda_overrides: incomingSharedCanvasSync.agenda_overrides || {},
      canvas_items: nextIncomingCanvasItems,
      custom_groups: serializeCustomGroups(incomingCustomGroups),
      problem_groups: incomingSharedCanvasSync.problem_groups || [],
      problem_structure: localViewProblemStructurePayload,
      solution_topics: serializeSharedSolutionTopics(nextSolutionTopics),
      final_solution_summary: buildFinalSolutionSummaryPayload(nextSolutionTopics, nextFinalSummary),
      node_positions: currentNodePositionsSnapshot,
      imported_state: incomingSharedCanvasSync.imported_state || null,
    });
    applyingRemoteSharedSyncRef.current = true;

    setProblemGroups(nextProblemGroups);
    setProblemStructureNodes(nextProblemStructure.nodes);
    setProblemStructureGroups(nextProblemStructure.groups);
    setProblemStructurePending(false);
    setSolutionTopics(nextSolutionTopics);
    setFinalSummaryDocument(nextFinalSummary);
    setSummaryDocumentEditMode(false);
    setMeetingGoalDrafts(incomingMeetingGoal, incomingMeetingGoalContext);
    onMeetingGoalChange(incomingMeetingGoal);
    onMeetingGoalContextChange(incomingMeetingGoalContext);
    setAgendaOverrides(incomingSharedCanvasSync.agenda_overrides || {});
    setCanvasItems(nextIncomingCanvasItems);
    setCustomGroups(incomingCustomGroups);
    setImportedState(incomingSharedCanvasSync.imported_state || null);
    if (incomingSharedCanvasSync.imported_state) {
      analysisSignatureAtImportRef.current = buildMeetingStateSignature(incomingSharedCanvasSync.imported_state);
      setImportOverrideActive(true);
    } else {
      analysisSignatureAtImportRef.current = "";
      setImportOverrideActive(false);
    }
    lastWorkspaceFieldSignaturesRef.current = buildWorkspaceFieldSignatures({
      meetingGoal: incomingMeetingGoal,
      meetingGoalContext: incomingMeetingGoalContext,
      stage,
      agendaOverrides: incomingSharedCanvasSync.agenda_overrides || {},
      canvasItems: nextIncomingCanvasItems,
      customGroups: incomingCustomGroups,
      problemGroups: nextProblemGroups,
      problemStructure: localViewProblemStructurePayload,
      solutionTopics: nextSolutionTopics,
      finalSolutionSummary: nextFinalSummary,
      nodePositions: currentNodePositionsSnapshot,
      importedState: incomingSharedCanvasSync.imported_state || null,
    });
    setActivityMessage("다른 참가자의 canvas 변경사항이 반영되었습니다.");

    window.setTimeout(() => {
      applyingRemoteSharedSyncRef.current = false;
    }, 0);
  }, [
    incomingSharedCanvasSync,
    lastNodePositionUpdateMsByKeyRef,
    liveNodePositionsRef,
    localDraggingNodeIdsRef,
    meetingId,
    nodePositions,
    onMeetingGoalChange,
    onMeetingGoalContextChange,
    problemGroups,
    remoteNodePreviewTargetsRef,
    setMeetingGoalDrafts,
    setNodePositions,
    sharedSyncEnabled,
    solutionTopics,
    userId,
    ensureRemoteNodePreviewAnimation,
    problemDefinitionMode,
    problemDefinitionPhase,
    problemStructureMethod,
    stage,
  ]);

  useEffect(() => {
    const flushPendingCanvasState = () => {
      if (captureStageOverride) {
        return;
      }
      if (
        meetingId &&
        latestSharedSyncEnabledRef.current &&
        workspaceLoadedRef.current &&
        !workspaceHydratingRef.current
      ) {
        console.info("[canvas pagehide flush] sending workspace snapshot", {
          meetingId,
          stage: latestSharedWorkspaceRef.current.stage,
          canvasItems: latestSharedWorkspaceRef.current.canvasItems.length,
          nodePositions: summarizeNodePositionsForDebug(latestSharedWorkspaceRef.current.nodePositions),
        });
        flushCanvasWorkspacePatch(
          buildFullWorkspacePatchPayload({
            meetingId,
            ...latestSharedWorkspaceRef.current,
          }),
        );
      }
      if (latestPersonalNotesPayloadRef.current) {
        flushCanvasPersonalNotes(latestPersonalNotesPayloadRef.current);
      }
    };

    window.addEventListener("pagehide", flushPendingCanvasState);
    return () => {
      window.removeEventListener("pagehide", flushPendingCanvasState);
    };
  }, [captureStageOverride, meetingId]);

  useEffect(() => {
    if (
      !meetingId ||
      !userId ||
      !sharedSyncEnabled ||
      !workspaceLoadedRef.current ||
      workspaceHydratingRef.current ||
      applyingRemoteSharedSyncRef.current ||
      lastSharedSyncSignatureRef.current === sharedCanvasSignature
    ) {
      return;
    }

    if (sharedSyncTimerRef.current) {
      window.clearTimeout(sharedSyncTimerRef.current);
    }

    sharedSyncTimerRef.current = window.setTimeout(() => {
      if (workspaceHydratingRef.current || applyingRemoteSharedSyncRef.current) {
        return;
      }

      lastSharedSyncSignatureRef.current = sharedCanvasSignature;
      onSharedCanvasSync({
        sync_id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        meeting_id: meetingId,
        sync_scope: "full",
        meeting_goal: sharedCanvasSnapshot.meeting_goal,
        meeting_goal_context: sharedCanvasSnapshot.meeting_goal_context,
        updated_by: userId,
        updated_at: new Date().toISOString(),
        stage: sharedCanvasSnapshot.stage,
        agenda_overrides: sharedCanvasSnapshot.agenda_overrides,
        canvas_items: sharedCanvasSnapshot.canvas_items,
        custom_groups: sharedCanvasSnapshot.custom_groups,
        problem_groups: sharedCanvasSnapshot.problem_groups,
        problem_structure: sharedCanvasSnapshot.problem_structure,
        solution_topics: sharedCanvasSnapshot.solution_topics,
        final_solution_summary: sharedCanvasSnapshot.final_solution_summary,
        imported_state: sharedCanvasSnapshot.imported_state,
      });
    }, 140);

    return () => {
      if (sharedSyncTimerRef.current) {
        window.clearTimeout(sharedSyncTimerRef.current);
        sharedSyncTimerRef.current = null;
      }
    };
  }, [meetingId, onSharedCanvasSync, sharedCanvasSignature, sharedCanvasSnapshot, sharedSyncEnabled, userId]);

  useEffect(() => {
    if (
      !incomingCanvasStateRequestId ||
      !sharedSyncEnabled ||
      !workspaceLoadedRef.current ||
      workspaceHydratingRef.current ||
      applyingRemoteSharedSyncRef.current
    ) {
      return;
    }

    forceBroadcastSharedCanvas();
  }, [forceBroadcastSharedCanvas, incomingCanvasStateRequestId, sharedSyncEnabled]);

  const handleCopyFinalSolutionMarkdown = useCallback(async () => {
    const markdown = finalSummaryDocument.markdown.trim();
    if (!markdown) {
      setActivityMessage("복사할 요약 문서가 없습니다.");
      return;
    }

    try {
      await navigator.clipboard.writeText(markdown);
      setActivityMessage("요약 문서를 마크다운으로 복사했습니다.");
    } catch (error) {
      console.error("Failed to copy final solution markdown:", error);
      setActivityMessage("브라우저 권한 문제로 마크다운 복사에 실패했습니다.");
    }
  }, [finalSummaryDocument.markdown]);

  const handleSummaryDocumentMarkdownChange = useCallback((value: string) => {
    setFinalSummaryDocument((current) =>
      normalizeFinalSolutionSummaryPayload({
        ...current,
        markdown: value,
        document_status: value.trim() ? "edited" : "empty",
      }),
    );
  }, []);

  const handleToggleSummaryEvidence = useCallback((groupId: string) => {
    setSummaryEvidenceOpenGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

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
            problem_groups: serializeSharedProblemGroups(nextGroups),
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

  const handleGenerateProblemChildren = useCallback(
    async (group: ProblemGroupViewModel) => {
      if (!meetingId || problemChildGenerationPendingId) return;

      setProblemChildGenerationPendingId(group.group_id);
      try {
        const result = await generateCanvasProblemTaxonomy({
          meeting_id: meetingId,
          meeting_topic: meetingTopicForAi,
          parent_group_id: group.group_id,
          parent_topic: group.topic,
          parent_depth: group.depth || 0,
          parent_evidence_utterance_ids: group.evidence_utterance_ids || [],
          existing_group_ids: problemGroups.map((item) => item.group_id),
          existing_groups: buildProblemTaxonomyExistingGroupsPayload(problemGroups),
          max_groups: 5,
        });
        const existingIds = new Set(problemGroups.map((item) => item.group_id));
        const generatedGroups = hydrateProblemGroups(result.groups || [], problemGroups);
        const childGroups = generatedGroups
          .filter((item) => !existingIds.has(item.group_id))
          .filter((item) => !isDuplicateProblemTaxonomyGroup(item, problemGroups, group.group_id, group.topic))
          .map((item) => ({
            ...item,
            parent_group_id: item.parent_group_id || group.group_id,
            depth: Math.max(0, item.depth ?? (group.depth || 0) + 1),
            status: "draft" as ProblemGroupStatus,
          }));

        if (childGroups.length === 0) {
          setActivityMessage(
            result.warning ||
              (generatedGroups.length > 0
                ? "이미 생성된 세부 분류와 겹쳐 새로 추가할 노드가 없습니다."
                : "실제 발화 안에서 추가 세부 분류를 찾지 못했습니다."),
          );
          return;
        }

        setCollapsedProblemGroupIds((prev) => {
          if (!prev.has(group.group_id)) return prev;
          const next = new Set(prev);
          next.delete(group.group_id);
          return next;
        });
        commitProblemGroupsSnapshot(
          [...problemGroups, ...childGroups],
          result.warning || `"${group.topic}" 아래에 세부 분류 ${childGroups.length}개를 추가했습니다.`,
          childGroups[0].group_id,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setActivityMessage(`세부 분류 생성 실패: ${message}`);
      } finally {
        setProblemChildGenerationPendingId("");
      }
    },
    [
      commitProblemGroupsSnapshot,
      meetingId,
      meetingTopicForAi,
      problemChildGenerationPendingId,
      problemGroups,
    ],
  );

  const handleQuickEditProblemGroup = useCallback((group: ProblemGroupViewModel) => {
    setSelectedProblemGroupId(group.group_id);
    setSelectedNodeId(`problem-${group.group_id}`);
    setLocalEditPresenceTarget({ targetType: "problem_group", targetId: group.group_id });
    setEditingProblemGroupId(group.group_id);
    setProblemGroupDraftTopic(group.topic);
    setProblemGroupDraftInsight(group.insight_lens || "");
    setProblemGroupDraftConclusion(group.conclusion);
    setActivityMessage("문제정의 노드 수정 모드를 열었습니다. 저장해야 다른 참가자에게 반영됩니다.");
  }, []);

  const handleDeleteProblemGroup = useCallback(
    (group: ProblemGroupViewModel) => {
      const childIdsByParent = new Map<string, string[]>();
      problemGroups.forEach((item) => {
        if (!item.parent_group_id) return;
        const ids = childIdsByParent.get(item.parent_group_id) || [];
        ids.push(item.group_id);
        childIdsByParent.set(item.parent_group_id, ids);
      });
      const removedIds = new Set<string>([group.group_id]);
      const visit = (groupId: string) => {
        (childIdsByParent.get(groupId) || []).forEach((childId) => {
          if (removedIds.has(childId)) return;
          removedIds.add(childId);
          visit(childId);
        });
      };
      visit(group.group_id);

      const nextGroups = problemGroups.filter((item) => !removedIds.has(item.group_id));
      commitProblemGroupsSnapshot(
        nextGroups,
        removedIds.size > 1 ? `문제정의 노드와 하위 ${removedIds.size - 1}개를 삭제했습니다.` : "문제정의 노드를 삭제했습니다.",
        nextGroups[0]?.group_id || "",
      );
    },
    [commitProblemGroupsSnapshot, problemGroups],
  );

  const handleToggleProblemChildren = useCallback((groupId: string) => {
    setCollapsedProblemGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  const syncProblemStructureNodesFromDefinition = useCallback(() => {
    const nextNodes = buildProblemStructureNodesFromGroups(problemGroups);
    setProblemStructureNodes(nextNodes);
    setProblemStructureGroups((prev) => pruneProblemStructureGroups(prev, nextNodes));
    return nextNodes;
  }, [problemGroups]);

  const handleOpenProblemStructureSetup = useCallback(() => {
    if (problemGroups.length === 0) {
      setActivityMessage("구조화할 문제정의 노드가 아직 없습니다.");
      return;
    }
    setProblemStructureDraftMethod(problemStructureMethod);
    setProblemStructureDraftMode(problemDefinitionMode || "ai");
    setProblemStructureSetupOpen(true);
  }, [problemDefinitionMode, problemGroups.length, problemStructureMethod]);

  const runProblemStructureGrouping = useCallback(
    async (options?: { nodes?: ProblemStructureNodeViewModel[]; method?: ProblemStructureMethod }) => {
      const structureNodes =
        options?.nodes && options.nodes.length > 0
          ? options.nodes
          : problemStructureNodes.length > 0
            ? problemStructureNodes
            : buildProblemStructureNodesFromGroups(problemGroups);
      if (structureNodes.length === 0) {
        setActivityMessage("AI가 묶을 문제정의 노드가 아직 없습니다.");
        return;
      }

      const requestSeq = problemStructureRequestSeqRef.current + 1;
      problemStructureRequestSeqRef.current = requestSeq;
      const method = options?.method || problemStructureMethod;
      setProblemStructurePending(true);
      setActivityMessage(`${problemStructureMethodLabel(method)} 기준으로 AI가 노드를 묶고 있습니다.`);

      try {
        const result = await generateProblemStructure({
          meeting_id: meetingId,
          meeting_topic: meetingTopicForAi,
          method,
          nodes: structureNodes.map((node) => ({
            id: node.id,
            title: node.title,
            body: node.body,
            status: node.status,
            depth: node.depth,
          })),
          existing_groups: problemStructureGroups.map((group) => ({
            id: group.id,
            title: group.title,
            node_ids: group.nodeIds,
            rationale: group.rationale,
          })),
          max_groups: Math.min(8, Math.max(1, Math.ceil(structureNodes.length / 2))),
        });
        if (problemStructureRequestSeqRef.current !== requestSeq) {
          return;
        }

        const nextGroups = normalizeProblemStructureGroupsFromResponse(result.groups || [], structureNodes);
        if (nextGroups.length === 0) {
          setActivityMessage(result.warning || "AI가 유효한 구조화 그룹을 만들지 못했습니다.");
          return;
        }

        setProblemDefinitionMode("ai");
        setProblemStructureMethod(method);
        setProblemStructureNodes(structureNodes);
        setProblemStructureGroups(nextGroups);
        setActivityMessage(
          result.warning ||
            `${result.used_llm ? "AI" : "로컬 fallback"}가 ${structureNodes.length}개 노드를 ${nextGroups.length}개 그룹으로 묶었습니다.`,
        );
      } catch (error) {
        if (problemStructureRequestSeqRef.current !== requestSeq) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        setActivityMessage(`AI 구조화 실패: ${message}`);
      } finally {
        if (problemStructureRequestSeqRef.current === requestSeq) {
          setProblemStructurePending(false);
        }
      }
    },
    [
      meetingId,
      meetingTopicForAi,
      problemGroups,
      problemStructureGroups,
      problemStructureMethod,
      problemStructureNodes,
    ],
  );

  const handleStartProblemStructure = useCallback(async () => {
    if (problemGroups.length === 0) {
      setActivityMessage("구조화할 문제정의 노드가 아직 없습니다.");
      return;
    }
    const nextMode = problemStructureDraftMode || "manual";
    setProblemStructureMethod(problemStructureDraftMethod);
    setProblemDefinitionMode(nextMode);
    const nextNodes = syncProblemStructureNodesFromDefinition();
    setProblemDefinitionPhase("structure");
    setProblemStructureSetupOpen(false);
    setArmedCanvasTool(null);
    setCanvasPlacementPreview(null);
    setPendingProblemGroupLinkId("");
    setSelectedNodeId("");
    setSelectedProblemGroupId("");
    setProblemGroupingRationaleOpenGroupId("");
    setActivityMessage(
      `${problemStructureMethodLabel(problemStructureDraftMethod)} · ${problemDefinitionModeLabel(nextMode)} 방식으로 정의 2단계를 시작했습니다. 노드 ${nextNodes.length}개를 가져왔습니다.`,
    );
    if (nextMode === "ai") {
      await runProblemStructureGrouping({
        nodes: nextNodes,
        method: problemStructureDraftMethod,
      });
    }
  }, [
    problemGroups.length,
    problemStructureDraftMethod,
    problemStructureDraftMode,
    runProblemStructureGrouping,
    setCanvasPlacementPreview,
    syncProblemStructureNodesFromDefinition,
  ]);

  const handleBackToProblemDefinitionExplore = useCallback(() => {
    setProblemDefinitionPhase("explore");
    const nextGroupId = selectedProblemGroupId || problemGroups[0]?.group_id || "";
    setSelectedProblemGroupId(nextGroupId);
    setSelectedNodeId(nextGroupId ? `problem-${nextGroupId}` : "");
    setActivityMessage("정의 1단계 캔버스로 돌아왔습니다.");
  }, [problemGroups, selectedProblemGroupId]);

  const handleRefreshProblemStructureNodes = useCallback(() => {
    const nextNodes = syncProblemStructureNodesFromDefinition();
    setActivityMessage(`정의 1단계의 현재 노드 ${nextNodes.length}개를 다시 가져왔습니다.`);
  }, [syncProblemStructureNodesFromDefinition]);

  const handleAddProblemStructureGroup = useCallback(() => {
    const nextGroup = makeProblemStructureGroup(problemStructureGroups.length);
    setProblemStructureGroups((prev) => [...prev, nextGroup]);
    setLocalEditPresenceTarget({ targetType: "problem_structure_group", targetId: nextGroup.id });
    setEditingProblemStructureGroupId(nextGroup.id);
    setProblemStructureGroupDraftTitle(nextGroup.title);
    setProblemStructureGroupDraftRationale(nextGroup.rationale);
    setActivityMessage("정의 2단계 구조화 그룹을 추가했습니다. 제목과 이유를 수정한 뒤 저장해 주세요.");
  }, [problemStructureGroups.length]);

  const clearProblemStructureGroupEdit = useCallback(() => {
    setLocalEditPresenceTarget(null);
    setEditingProblemStructureGroupId("");
    setProblemStructureGroupDraftTitle("");
    setProblemStructureGroupDraftRationale("");
  }, []);

  const clearProblemStructureNodeEdit = useCallback(() => {
    setLocalEditPresenceTarget(null);
    setEditingProblemStructureNodeId("");
    setProblemStructureNodeDraftTitle("");
  }, []);

  const handleDeleteProblemStructureGroup = useCallback((groupId: string) => {
    setProblemStructureGroups((prev) => prev.filter((group) => group.id !== groupId));
    if (editingProblemStructureGroupId === groupId) {
      clearProblemStructureGroupEdit();
    }
    setActivityMessage("구조화 그룹을 삭제했습니다. 포함된 노드는 묶지 않은 노드로 돌아갑니다.");
  }, [clearProblemStructureGroupEdit, editingProblemStructureGroupId]);

  const handleAssignProblemStructureNode = useCallback((nodeId: string, groupId: string) => {
    setProblemStructureGroups((prev) =>
      prev.map((group) => {
        const withoutNode = group.nodeIds.filter((item) => item !== nodeId);
        if (group.id !== groupId) {
          return {
            ...group,
            nodeIds: withoutNode,
          };
        }
        return {
          ...group,
          nodeIds: [...withoutNode, nodeId],
          createdBy: "user",
        };
      }),
    );
  }, []);

  const handleCreateProblemStructurePairGroup = useCallback(
    (sourceNodeId: string, targetNodeId: string) => {
      if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) return;
      const sourceNode = problemStructureNodeById.get(sourceNodeId);
      const targetNode = problemStructureNodeById.get(targetNodeId);
      if (!sourceNode || !targetNode) return;

      setProblemStructureGroups((prev) => {
        const nextGroup = {
          ...makeProblemStructureGroup(prev.length, "user"),
          title: makeProblemStructurePairGroupTitle(sourceNode, targetNode),
          nodeIds: [targetNodeId, sourceNodeId],
        };
        return [
          ...prev.map((group) => ({
            ...group,
            nodeIds: group.nodeIds.filter((nodeId) => nodeId !== sourceNodeId && nodeId !== targetNodeId),
          })),
          nextGroup,
        ];
      });
      setActivityMessage(`"${sourceNode.title}"와 "${targetNode.title}"로 새 구조화 그룹을 만들었습니다.`);
    },
    [problemStructureNodeById],
  );

  const getProblemStructureDraggedNodeId = useCallback(
    (event: React.DragEvent<HTMLElement>) =>
      event.dataTransfer.getData(PROBLEM_STRUCTURE_NODE_DRAG_MIME) ||
      event.dataTransfer.getData("text/plain") ||
      problemStructureDrag?.nodeId ||
      "",
    [problemStructureDrag?.nodeId],
  );

  const handleProblemStructureNodeDragStart = useCallback((event: React.DragEvent<HTMLElement>, nodeId: string) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, button")) {
      event.preventDefault();
      return;
    }

    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(PROBLEM_STRUCTURE_NODE_DRAG_MIME, nodeId);
    event.dataTransfer.setData("text/plain", nodeId);
    setProblemStructureDrag({ nodeId, overGroupId: "", overNodeId: "", mode: "" });
  }, []);

  const handleProblemStructureNodeDragEnd = useCallback(() => {
    setProblemStructureDrag(null);
  }, []);

  const handleProblemStructureGroupDragOver = useCallback((event: React.DragEvent<HTMLElement>, groupId: string) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setProblemStructureDrag((prev) => {
      if (!prev?.nodeId) return prev;
      if (prev.mode === "group" && prev.overGroupId === groupId && !prev.overNodeId) return prev;
      return { ...prev, mode: "group", overGroupId: groupId, overNodeId: "" };
    });
  }, []);

  const handleProblemStructureNodeDragOver = useCallback((event: React.DragEvent<HTMLElement>, targetNodeId: string) => {
    setProblemStructureDrag((prev) => {
      if (!prev?.nodeId || prev.nodeId === targetNodeId) return prev;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      if (prev.mode === "node" && prev.overNodeId === targetNodeId) return prev;
      return { ...prev, mode: "node", overNodeId: targetNodeId, overGroupId: "" };
    });
  }, []);

  const handleProblemStructureGroupDrop = useCallback(
    (event: React.DragEvent<HTMLElement>, groupId: string) => {
      const draggedNodeId = getProblemStructureDraggedNodeId(event);
      if (!draggedNodeId) return;

      event.preventDefault();
      event.stopPropagation();
      handleAssignProblemStructureNode(draggedNodeId, groupId);
      setProblemStructureDrag(null);

      if (!groupId) {
        setActivityMessage("구조화 노드를 묶지 않은 노드로 이동했습니다.");
        return;
      }

      const targetGroup = problemStructureGroups.find((group) => group.id === groupId);
      setActivityMessage(`구조화 노드를 "${targetGroup?.title || "선택한 그룹"}"에 추가했습니다.`);
    },
    [getProblemStructureDraggedNodeId, handleAssignProblemStructureNode, problemStructureGroups],
  );

  const handleProblemStructureNodeDrop = useCallback(
    (event: React.DragEvent<HTMLElement>, targetNodeId: string) => {
      const draggedNodeId = getProblemStructureDraggedNodeId(event);
      if (!draggedNodeId || draggedNodeId === targetNodeId) {
        setProblemStructureDrag(null);
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      handleCreateProblemStructurePairGroup(draggedNodeId, targetNodeId);
      setProblemStructureDrag(null);
    },
    [getProblemStructureDraggedNodeId, handleCreateProblemStructurePairGroup],
  );

  const handleStartProblemStructureGroupEdit = useCallback((group: ProblemStructureGroupViewModel) => {
    setLocalEditPresenceTarget({ targetType: "problem_structure_group", targetId: group.id });
    setEditingProblemStructureGroupId(group.id);
    setProblemStructureGroupDraftTitle(group.title);
    setProblemStructureGroupDraftRationale(group.rationale || "");
  }, []);

  const handleRemoveProblemStructureNode = useCallback((nodeId: string) => {
    setProblemStructureNodes((prev) => prev.filter((node) => node.id !== nodeId));
    setProblemStructureGroups((prev) =>
      prev.map((group) => ({
        ...group,
        nodeIds: group.nodeIds.filter((item) => item !== nodeId),
      })),
    );
    if (editingProblemStructureNodeId === nodeId) {
      clearProblemStructureNodeEdit();
    }
    setActivityMessage("정의 2단계 구조화 레이어에서 노드를 제외했습니다.");
  }, [clearProblemStructureNodeEdit, editingProblemStructureNodeId]);

  const handleCancelProblemStructureGroupEdit = useCallback(() => {
    clearProblemStructureGroupEdit();
  }, [clearProblemStructureGroupEdit]);

  const handleSaveProblemStructureGroupEdit = useCallback(
    (groupId: string) => {
      const targetGroup = problemStructureGroups.find((group) => group.id === groupId);
      if (!targetGroup) {
        clearProblemStructureGroupEdit();
        return;
      }

      const nextTitle = problemStructureGroupDraftTitle.trim() || targetGroup.title;
      const nextRationale = problemStructureGroupDraftRationale.trim() || targetGroup.rationale || "";
      setProblemStructureGroups((prev) =>
        prev.map((group) =>
          group.id === groupId
            ? {
                ...group,
                title: nextTitle,
                rationale: nextRationale,
                createdBy: "user",
              }
            : group,
        ),
      );
      clearProblemStructureGroupEdit();
      setActivityMessage("구조화 그룹 텍스트를 수정했습니다.");
    },
    [
      clearProblemStructureGroupEdit,
      problemStructureGroupDraftRationale,
      problemStructureGroupDraftTitle,
      problemStructureGroups,
    ],
  );

  const handleStartProblemStructureNodeEdit = useCallback((node: ProblemStructureNodeViewModel) => {
    setLocalEditPresenceTarget({ targetType: "problem_structure_node", targetId: node.id });
    setEditingProblemStructureNodeId(node.id);
    setProblemStructureNodeDraftTitle(node.title);
  }, []);

  const handleCancelProblemStructureNodeEdit = useCallback(() => {
    clearProblemStructureNodeEdit();
  }, [clearProblemStructureNodeEdit]);

  const handleSaveProblemStructureNodeEdit = useCallback(
    (nodeId: string) => {
      const targetNode = problemStructureNodeById.get(nodeId);
      if (!targetNode) {
        clearProblemStructureNodeEdit();
        return;
      }

      const nextTitle = problemStructureNodeDraftTitle.trim() || targetNode.title;
      setProblemStructureNodes((prev) =>
        prev.map((node) => (node.id === nodeId ? { ...node, title: nextTitle } : node)),
      );
      clearProblemStructureNodeEdit();
      setActivityMessage("구조화 노드 제목을 수정했습니다.");
    },
    [clearProblemStructureNodeEdit, problemStructureNodeById, problemStructureNodeDraftTitle],
  );

  const handleUpdateProblemStructureGroupStatus = useCallback((groupId: string, status: ProblemGroupStatus) => {
    setProblemStructureGroups((prev) =>
      prev.map((group) => (group.id === groupId ? { ...group, status, createdBy: "user" } : group)),
    );
    setActivityMessage(`구조화 그룹 상태를 ${problemGroupStatusLabel(status)}로 변경했습니다.`);
  }, []);

  const problemExploreLayout = useMemo(
    () =>
      buildProblemExploreLayout({
        collapsedProblemGroupIds,
        problemGroups,
        selectedProblemGroupId,
      }),
    [collapsedProblemGroupIds, problemGroups, selectedProblemGroupId],
  );

  const graphBlueprint = useMemo(() => {
    if (stage === "problem-definition") {
      if (problemDefinitionPhase === "structure") {
        const structureNodes =
          problemStructureNodes.length > 0
            ? problemStructureNodes
            : buildProblemStructureNodesFromGroups(problemGroups);
        const nodeById = new Map(structureNodes.map((node) => [node.id, node]));
        const assignedNodeIds = new Set(
          problemStructureGroups.flatMap((group) => group.nodeIds.filter((nodeId) => nodeById.has(nodeId))),
        );
        const ungroupedNodes = structureNodes.filter((node) => !assignedNodeIds.has(node.id));
        const columns = [
          {
            id: "__ungrouped__",
            title: "아직 묶지 않은 노드",
            rationale: "정의 1단계에서 가져온 모든 노드가 먼저 여기에 놓입니다.",
            nodeIds: ungroupedNodes.map((node) => node.id),
            status: "draft" as const,
            createdBy: "user" as const,
            fixed: true,
          },
          ...problemStructureGroups.map((group) => ({
            ...group,
            fixed: false,
          })),
        ];
        const isCardSorting = problemStructureMethod === "card-sorting";
        const columnWidth = isCardSorting ? 344 : 376;
        const columnGap = isCardSorting ? 28 : 44;
        const baseX = 44;
        const baseY = isCardSorting ? 48 : 64;
        const structureDescriptors: CanvasNodeDescriptor[] = columns.map((column, index) => {
          const isUngrouped = column.id === "__ungrouped__";
          const columnNodes = column.nodeIds
            .map((nodeId) => nodeById.get(nodeId))
            .filter((node): node is ProblemStructureNodeViewModel => Boolean(node));
          const nodeId = isUngrouped ? "problem-structure-ungrouped" : `problem-structure-${column.id}`;
          const columnDropGroupId = isUngrouped ? "" : column.id;
          const isColumnDropTarget =
            problemStructureDrag?.mode === "group" &&
            problemStructureDrag.overGroupId === columnDropGroupId;
          const isGroupEditing = !isUngrouped && editingProblemStructureGroupId === column.id;
          const remoteGroupEditPresence = !isUngrouped
            ? remoteEditPresenceByKey[makeEditPresenceKey("problem_structure_group", column.id)] || null
            : null;
          const savedPosition = !isCardSorting ? nodePositions["problem-definition"]?.[nodeId] : undefined;
          const nodeHeight = Math.max(260, 184 + Math.max(1, columnNodes.length) * 92);
          const position = savedPosition || {
            x: baseX + index * (columnWidth + columnGap),
            y: baseY + (!isCardSorting && index % 2 === 1 ? 34 : 0),
          };
          const rationaleLabel = isCardSorting ? "그룹 설명 / 이유 카드" : "묶은 이유";

          return {
            id: nodeId,
            position,
            positionSource: savedPosition ? "persisted" : "computed",
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
            className: "!border-0 !bg-transparent !p-0 !shadow-none",
            style: { width: columnWidth, minHeight: nodeHeight, padding: 0 },
            draggable: !isCardSorting,
            data: {
              contentSignature: buildNodeContentSignature([
                "problem-structure",
                problemStructureMethod,
                problemDefinitionMode,
                column.id,
                column.title,
                column.rationale,
                column.status || "",
                isGroupEditing,
                isGroupEditing ? problemStructureGroupDraftTitle : "",
                isGroupEditing ? problemStructureGroupDraftRationale : "",
                remoteGroupEditPresence?.updated_at || "",
                columnNodes.length,
                ...columnNodes.flatMap((node) => [
                  node.id,
                  node.title,
                  node.status,
                  node.depth,
                  editingProblemStructureNodeId === node.id,
                  editingProblemStructureNodeId === node.id ? problemStructureNodeDraftTitle : "",
                  remoteEditPresenceByKey[makeEditPresenceKey("problem_structure_node", node.id)]?.updated_at || "",
                ]),
                ...problemStructureGroups.map((group) => `${group.id}:${group.nodeIds.join(",")}`),
                problemStructureDrag?.nodeId,
                problemStructureDrag?.mode,
                problemStructureDrag?.overGroupId,
                problemStructureDrag?.overNodeId,
              ]),
              label: (
                <div
                  className={`nopan box-border min-w-0 rounded-[14px] border bg-white p-4 text-left font-['Inter','Noto_Sans_KR',sans-serif] shadow-[0_1px_0_rgba(0,0,0,0.04)] ${
                    isUngrouped
                      ? "border-dashed border-black/20"
                      : isCardSorting
                        ? "border-[#a13ab8]/20"
                        : "border-black/10"
                  } ${isColumnDropTarget ? "ring-2 ring-[#a13ab8]/35 ring-offset-2" : ""}`}
                  onDragOver={(event) => handleProblemStructureGroupDragOver(event, columnDropGroupId)}
                  onDrop={(event) => handleProblemStructureGroupDrop(event, columnDropGroupId)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="inline-flex items-center rounded-[8px] bg-[#f7ecfb] px-2.5 py-1 text-[11px] font-semibold text-[#a13ab8]">
                        {isUngrouped ? "Pool" : problemStructureMethodLabel(problemStructureMethod)}
                      </span>
                      {isUngrouped ? (
                        <strong className="mt-3 block text-[17px] font-semibold leading-6 text-black">
                          {column.title}
                        </strong>
                      ) : isGroupEditing ? (
                        <input
                          value={problemStructureGroupDraftTitle}
                          onChange={(event) => setProblemStructureGroupDraftTitle(event.target.value)}
                          onPointerDown={(event) => event.stopPropagation()}
                          className="nodrag nopan mt-3 block w-full rounded-[8px] border border-[#a13ab8]/30 bg-white px-3 py-2 text-[17px] font-semibold leading-6 text-black outline-none transition focus:border-[#a13ab8]/60"
                        />
                      ) : (
                        <strong className="mt-3 block text-[17px] font-semibold leading-6 text-black">
                          {column.title || "구조화 그룹"}
                        </strong>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="rounded-[8px] bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
                        {columnNodes.length}개
                      </span>
                      {!isUngrouped ? (
                        isGroupEditing ? (
                          <>
                            <button
                              type="button"
                              onClick={handleCancelProblemStructureGroupEdit}
                              onPointerDown={(event) => event.stopPropagation()}
                              className="nodrag nopan rounded-[8px] border border-black/10 bg-white px-2 py-1 text-[11px] font-semibold text-[#777] transition hover:bg-[#f5f6f8]"
                            >
                              취소
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveProblemStructureGroupEdit(column.id)}
                              onPointerDown={(event) => event.stopPropagation()}
                              className="nodrag nopan rounded-[8px] bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-slate-800"
                            >
                              저장
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleStartProblemStructureGroupEdit(column)}
                              onPointerDown={(event) => event.stopPropagation()}
                              className="nodrag nopan rounded-[8px] border border-black/10 bg-white px-2 py-1 text-[11px] font-semibold text-[#4d4d4d] transition hover:bg-[#f5f6f8]"
                            >
                              수정
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteProblemStructureGroup(column.id)}
                              onPointerDown={(event) => event.stopPropagation()}
                              className="nodrag nopan rounded-[8px] border border-rose-200 bg-white px-2 py-1 text-[11px] font-semibold text-rose-600 transition hover:bg-rose-50"
                            >
                              삭제
                            </button>
                          </>
                        )
                      ) : null}
                    </div>
                  </div>
                  {remoteGroupEditPresence ? (
                    <div className="mt-3 flex items-center gap-2 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-900">
                      {renderEditPresenceBadge()}
                      <span>다른 참가자가 이 구조화 그룹을 수정 중입니다.</span>
                    </div>
                  ) : null}
                  {!isUngrouped ? (
                    <label className="mt-3 block">
                      <span className="mb-1 block text-[11px] font-semibold text-[#777]">그룹 상태</span>
                      <select
                        value={column.status || "draft"}
                        onChange={(event) =>
                          handleUpdateProblemStructureGroupStatus(column.id, event.target.value as ProblemGroupStatus)
                        }
                        onPointerDown={(event) => event.stopPropagation()}
                        className={`nodrag nopan w-full rounded-[8px] border border-black/10 bg-[#f9f9f9] px-2 py-1.5 text-xs font-semibold outline-none transition focus:border-[#a13ab8]/40 ${problemGroupStatusTone(column.status || "draft")}`}
                      >
                        {(["draft", "review", "final"] as ProblemGroupStatus[]).map((status) => (
                          <option key={`${column.id}-status-${status}`} value={status}>
                            {problemGroupStatusLabel(status)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  {isUngrouped ? (
                    <p className="mt-3 rounded-[10px] bg-[#f5f6f8] px-3 py-2 text-xs leading-5 text-[#4d4d4d]">
                      그룹을 만든 뒤 노드를 드래그해 넣거나, 노드끼리 겹쳐 새 그룹을 만들 수 있습니다.
                    </p>
                  ) : (
                    <div className={`mt-3 rounded-[10px] ${isCardSorting ? "border border-[#a13ab8]/10 bg-[#f7ecfb]" : "bg-[#f5f6f8]"} p-3`}>
                      <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#a13ab8]">
                        {rationaleLabel}
                      </label>
                      {isGroupEditing ? (
                        <textarea
                          value={problemStructureGroupDraftRationale}
                          onChange={(event) => setProblemStructureGroupDraftRationale(event.target.value)}
                          onPointerDown={(event) => event.stopPropagation()}
                          placeholder={column.createdBy === "ai" ? "AI가 왜 묶었는지 나중에 여기에 표시합니다." : "이 그룹으로 묶은 이유를 적어둘 수 있습니다."}
                          className="nodrag nopan mt-2 min-h-[68px] w-full resize-none rounded-[8px] border border-[#a13ab8]/30 bg-white px-3 py-2 text-xs leading-5 text-[#333] outline-none transition focus:border-[#a13ab8]/60"
                        />
                      ) : (
                        <p className="mt-2 min-h-[44px] rounded-[8px] border border-transparent bg-white/70 px-3 py-2 text-xs leading-5 text-[#333]">
                          {column.rationale ||
                            (column.createdBy === "ai"
                              ? "AI가 왜 묶었는지 나중에 여기에 표시합니다."
                              : "수정을 눌러 이 그룹으로 묶은 이유를 적어둘 수 있습니다.")}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="mt-3 space-y-2">
                    {columnNodes.length > 0 ? (
                      columnNodes.map((node) => {
                        const isDraggingNode = problemStructureDrag?.nodeId === node.id;
                        const isNodeDropTarget =
                          problemStructureDrag?.mode === "node" &&
                          problemStructureDrag.overNodeId === node.id &&
                          problemStructureDrag.nodeId !== node.id;
                        const isNodeEditing = editingProblemStructureNodeId === node.id;
                        const remoteNodeEditPresence =
                          remoteEditPresenceByKey[makeEditPresenceKey("problem_structure_node", node.id)] || null;
                        return (
                          <div
                            key={`${column.id}-${node.id}`}
                            draggable={!isNodeEditing}
                            onDragStart={(event) => handleProblemStructureNodeDragStart(event, node.id)}
                            onDragEnd={handleProblemStructureNodeDragEnd}
                            onDragOver={(event) => handleProblemStructureNodeDragOver(event, node.id)}
                            onDrop={(event) => handleProblemStructureNodeDrop(event, node.id)}
                            className={`nodrag nopan rounded-[10px] border bg-white px-3 py-2.5 shadow-[0_1px_0_rgba(0,0,0,0.03)] transition ${
                              isNodeEditing ? "cursor-default" : "cursor-grab active:cursor-grabbing"
                            } ${
                              isNodeDropTarget
                                ? "border-[#a13ab8] ring-2 ring-[#a13ab8]/20"
                                : "border-black/10 hover:border-[#a13ab8]/25"
                              } ${isDraggingNode ? "opacity-55" : ""}`}
                          >
                            <div className="flex items-start gap-2">
                              {isNodeEditing ? (
                                <textarea
                                  value={problemStructureNodeDraftTitle}
                                  onChange={(event) => setProblemStructureNodeDraftTitle(event.target.value)}
                                  onPointerDown={(event) => event.stopPropagation()}
                                  aria-label="구조화 노드 제목"
                                  rows={2}
                                  className="nodrag nopan block min-h-[44px] flex-1 resize-none rounded-[8px] border border-[#a13ab8]/30 bg-white px-2 py-1.5 text-sm font-semibold leading-5 text-black outline-none transition focus:border-[#a13ab8]/60"
                                />
                              ) : (
                                <strong className="block min-h-[44px] flex-1 px-1 py-1 text-sm font-semibold leading-5 text-black">
                                  {node.title || "구조화 노드"}
                                </strong>
                              )}
                              {isNodeEditing ? (
                                <div className="flex shrink-0 flex-col gap-1">
                                  <button
                                    type="button"
                                    onClick={handleCancelProblemStructureNodeEdit}
                                    onPointerDown={(event) => event.stopPropagation()}
                                    className="nodrag nopan rounded-[8px] border border-black/10 bg-white px-2 py-1 text-[11px] font-semibold text-[#777] transition hover:bg-[#f5f6f8]"
                                  >
                                    취소
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSaveProblemStructureNodeEdit(node.id)}
                                    onPointerDown={(event) => event.stopPropagation()}
                                    className="nodrag nopan rounded-[8px] bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-slate-800"
                                  >
                                    저장
                                  </button>
                                </div>
                              ) : (
                                <div className="flex shrink-0 items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleStartProblemStructureNodeEdit(node)}
                                    onPointerDown={(event) => event.stopPropagation()}
                                    className="nodrag nopan rounded-[8px] border border-black/10 bg-white px-2 py-1 text-[11px] font-semibold text-[#4d4d4d] transition hover:bg-[#f5f6f8]"
                                  >
                                    수정
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveProblemStructureNode(node.id)}
                                    onPointerDown={(event) => event.stopPropagation()}
                                    aria-label="구조화 노드 제외"
                                    className="nodrag nopan flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-rose-200 bg-white text-[16px] font-semibold leading-none text-rose-600 transition hover:bg-rose-50"
                                  >
                                    ×
                                  </button>
                                </div>
                              )}
                            </div>
                            {remoteNodeEditPresence ? (
                              <div className="mt-2 flex items-center gap-2 rounded-[8px] border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold leading-4 text-amber-900">
                                {renderEditPresenceBadge()}
                                <span>다른 참가자가 이 노드를 수정 중입니다.</span>
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                    ) : (
                      <p className="rounded-[10px] border border-dashed border-black/10 bg-[#f9f9f9] px-3 py-4 text-center text-xs leading-5 text-[#777]">
                        {isUngrouped ? "모든 노드가 그룹에 들어갔습니다." : "아직 이 그룹에 들어온 노드가 없습니다."}
                      </p>
                    )}
                  </div>
                </div>
              ),
            },
          };
        });

        return {
          layoutSignature: buildNodeContentSignature([
            stage,
            problemDefinitionPhase,
            problemStructureMethod,
            problemDefinitionMode,
            ...structureNodes.flatMap((node) => [node.id, node.title, node.status, node.depth]),
            ...problemStructureGroups.flatMap((group) => [
              group.id,
              group.title,
              group.rationale,
              group.status,
              group.createdBy,
              ...group.nodeIds,
            ]),
          ]),
          nodeDescriptors: structureDescriptors,
        };
      }

      return buildProblemExploreCanvasBlueprint({
        collapsedProblemGroupIds,
        dropProblemGroupId,
        getProblemGroupSourceCount: (group) => buildProblemGroupDisplayCards(group).length,
        loadingProblemGroupIds,
        nodePositions,
        onAttachPersonalNoteToProblemGroup: handleAttachPersonalNoteToProblemGroup,
        onDeleteProblemGroup: handleDeleteProblemGroup,
        onDropProblemGroupChange: setDropProblemGroupId,
        onGenerateProblemChildren: (group) => {
          void handleGenerateProblemChildren(group);
        },
        onQuickEditProblemGroup: handleQuickEditProblemGroup,
        onShowProblemGroupingRationale: (group) => {
          void handleShowProblemGroupingRationale(group);
        },
        onToggleProblemChildren: handleToggleProblemChildren,
        pendingProblemGroupLinkId,
        problemChildGenerationPendingId,
        problemExploreLayout,
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
    handleAttachPersonalNoteToProblemGroup,
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
    handleShowProblemGroupingRationale,
    handleToggleProblemChildren,
    loadingProblemGroupIds,
    nodePositions,
    pendingProblemGroupLinkId,
    problemChildGenerationPendingId,
    problemDefinitionMode,
    problemDefinitionPhase,
    problemExploreLayout,
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
    CANVAS_STAGES.forEach((stageKey) => {
      Object.keys(nodePositions[stageKey] || {}).forEach((nodeId) => {
        delete pendingNodePlacementsRef.current[nodeId];
      });
    });
  }, [nodePositions, pendingNodePlacementsRef]);

  useEffect(() => {
    const activeDragNodeId = stableIdeationDragRef.current?.nodeId || "";
    const preserveNodeIds = new Set<string>([
      ...remoteNodePreviewTargetsRef.current.keys(),
      ...localDraggingNodeIdsRef.current,
    ]);
    if (activeDragNodeId) {
      preserveNodeIds.add(activeDragNodeId);
    }
    setNodes((current) =>
      reconcileNodes(current, graphBlueprint.nodeDescriptors, preserveNodeIds),
    );
  }, [graphBlueprint, localDraggingNodeIdsRef, remoteNodePreviewTargetsRef, setNodes, stableIdeationDragRef]);

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

  const handleGenerateProblemDefinition = useCallback(async (options?: { force?: boolean; refreshChunkSummaries?: boolean }) => {
    const forceRegenerate = Boolean(options?.force);
    const refreshChunkSummaries = Boolean(options?.refreshChunkSummaries);
    setProblemDefinitionStagePending(true);
    setBusy(true);
    try {
      setStage("problem-definition");
      setEditingProblemGroupId("");

      if (problemGroups.length > 0 && !forceRegenerate) {
        const firstGroupId = selectedProblemGroupId || problemGroups[0]?.group_id || "";
        setSelectedProblemGroupId(firstGroupId);
        setSelectedNodeId(firstGroupId ? `problem-${firstGroupId}` : "");
        setActivityMessage("기존 문제정의 캔버스를 유지했습니다.");
        return;
      }

      const utterances = buildProblemTaxonomyUtterances(transcripts);
      if (utterances.length === 0) {
        if (forceRegenerate) {
          setProblemGroups([]);
          setProblemGroupingRationaleById({});
          setProblemGroupingRationaleOpenGroupId("");
          setProblemGroupingRationalePendingId("");
          setProblemDefinitionPhase("explore");
          setProblemStructureSetupOpen(false);
          setProblemStructureNodes([]);
          setProblemStructureGroups([]);
          setProblemStructurePending(false);
        }
        setProblemDefinitionMode("");
        setSelectedProblemGroupId("");
        setSelectedNodeId("");
        setActivityMessage("문제정의를 만들 STT 발화가 아직 없습니다.");
        return;
      }

      const nextNodePositionsSnapshot = forceRegenerate
        ? {
            ...nodePositions,
            "problem-definition": {},
            solution: {},
          }
        : nodePositions;
      if (forceRegenerate) {
        setProblemGroups([]);
        setSolutionTopics([]);
        setNodePositions(nextNodePositionsSnapshot);
        setProblemDefinitionPhase("explore");
        setProblemStructureSetupOpen(false);
        setProblemStructureNodes([]);
        setProblemStructureGroups([]);
        setProblemStructurePending(false);
        setSelectedProblemGroupId("");
        setSelectedProblemSourceNodeId("");
        setSelectedNodeId("");
        setCollapsedProblemGroupIds(new Set());
        setProblemGroupingRationaleById({});
        setProblemGroupingRationaleOpenGroupId("");
        setProblemGroupingRationalePendingId("");
      }

      const result = await generateCanvasProblemTaxonomy({
        meeting_id: meetingId,
        meeting_topic: meetingTopicForAi,
        debug_nonce: forceRegenerate ? `debug-${refreshChunkSummaries ? "chunks-" : ""}${Date.now()}` : undefined,
        refresh_chunk_summaries: refreshChunkSummaries || undefined,
        utterances,
        existing_group_ids: [],
        existing_groups: forceRegenerate ? [] : buildProblemTaxonomyExistingGroupsPayload(problemGroups),
        max_groups: 6,
      });
      const nextGroups = hydrateProblemGroups(result.groups || [], []).map((group) => ({
        ...group,
        parent_group_id: group.parent_group_id || "",
        depth: group.depth || 0,
        status: "draft" as ProblemGroupStatus,
      }));

      setProblemGroups(nextGroups);
      setProblemDefinitionPhase("explore");
      setProblemStructureSetupOpen(false);
      setProblemStructureNodes([]);
      setProblemStructureGroups([]);
      setProblemStructurePending(false);
      const nextSelectedGroupId = nextGroups[0]?.group_id || "";
      setSelectedProblemGroupId(nextSelectedGroupId);
      setSelectedNodeId(nextSelectedGroupId ? `problem-${nextSelectedGroupId}` : "");
      latestSharedWorkspaceRef.current = {
        ...latestSharedWorkspaceRef.current,
        stage: "problem-definition",
        problemGroups: nextGroups,
        solutionTopics: forceRegenerate ? [] : latestSharedWorkspaceRef.current.solutionTopics,
        nodePositions: nextNodePositionsSnapshot,
        importedState: persistedSharedImportedState,
      };

      if (sharedSyncEnabled) {
        forceBroadcastSharedCanvas({
          stage: "problem-definition",
          problemGroups: nextGroups,
          solutionTopics: forceRegenerate ? [] : undefined,
          nodePositions: nextNodePositionsSnapshot,
        });
        if (meetingId) {
          void saveCanvasWorkspacePatch({
            meeting_id: meetingId,
            stage: "problem-definition",
            problem_groups: serializeSharedProblemGroups(nextGroups),
            solution_topics: forceRegenerate ? [] : undefined,
            node_positions: nextNodePositionsSnapshot,
            imported_state: persistedSharedImportedState,
          }).catch((error) => {
            console.error("Failed to save problem taxonomy:", error);
          });
        }
      }

      setActivityMessage(
        result.warning ||
          (nextGroups.length > 0
            ? forceRegenerate
              ? refreshChunkSummaries
                ? `요약 캐시까지 다시 만들고 문제정의를 재생성했습니다. 큰 분류 ${nextGroups.length}개를 만들었습니다.`
                : `문제정의를 다시 생성했습니다. 큰 분류 ${nextGroups.length}개를 만들었습니다.`
              : `STT 발화에서 큰 분류 ${nextGroups.length}개를 만들었습니다.`
            : "분류할 만큼 뚜렷한 STT 발화를 찾지 못했습니다."),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setActivityMessage(`문제 정의 생성 실패: ${message}`);
    } finally {
      setProblemDefinitionStagePending(false);
      setBusy(false);
    }
  }, [
    forceBroadcastSharedCanvas,
    meetingId,
    meetingTopicForAi,
    nodePositions,
    persistedSharedImportedState,
    problemGroups,
    selectedProblemGroupId,
    setNodePositions,
    sharedSyncEnabled,
    transcripts,
  ]);

  const handleDebugRegenerateProblemDefinition = useCallback(async () => {
    if (busy || problemDefinitionStagePending) {
      setActivityMessage("문제정의 생성 작업이 이미 진행 중입니다.");
      return;
    }
    const ok = window.confirm("디버깅용으로 기존 문제정의 노드와 해결책 결과를 비우고 STT 기반으로 다시 생성할까요?");
    if (!ok) return;
    await handleGenerateProblemDefinition({ force: true });
  }, [busy, handleGenerateProblemDefinition, problemDefinitionStagePending]);

  const handleRefreshProblemChunkSummaries = useCallback(async () => {
    if (busy || problemDefinitionStagePending) {
      setActivityMessage("문제정의 생성 작업이 이미 진행 중입니다.");
      return;
    }
    const ok = window.confirm(
      "디버깅용으로 chunk summary 캐시까지 새로 만들고 문제정의 노드를 다시 생성할까요?",
    );
    if (!ok) return;
    await handleGenerateProblemDefinition({ force: true, refreshChunkSummaries: true });
  }, [busy, handleGenerateProblemDefinition, problemDefinitionStagePending]);

  const handleGenerateSolutionStage = useCallback(async (options?: { force?: boolean }) => {
    const eligibleGroups = getSummaryEligibleStructureGroups(problemStructureGroups);
    setStage("solution");
    setLeftPanelTab("detail");
    setSelectedProblemGroupId("");
    setSelectedNodeId("");

    if (eligibleGroups.length === 0) {
      setActivityMessage("요약 문서에 포함할 검토 중/확정 구조화 그룹이 없습니다.");
      return;
    }

    const hasExistingSummaryDocument =
      finalSummaryDocument.markdown.trim() && (finalSummaryDocument.sections || []).length > 0;
    if (!options?.force && hasExistingSummaryDocument) {
      setActivityMessage("기존 요약 문서를 유지했습니다. 다시 만들려면 요약 단계의 다시 생성 버튼을 사용해 주세요.");
      return;
    }

    setSolutionStagePending(true);
    setBusy(true);
    try {
      const result = await generateCanvasSummaryDocument({
        meeting_id: meetingId,
        meeting_topic: meetingTopicForAi,
        groups: eligibleGroups.map((group) => ({
          id: group.id,
          title: group.title,
          node_ids: group.nodeIds,
          rationale: group.rationale,
          status: group.status,
          created_by: group.createdBy,
        })),
        nodes: problemStructureNodes.map((node) => ({
          id: node.id,
          source_group_id: node.sourceGroupId,
          title: node.title,
          body: node.body,
          status: node.status,
          depth: node.depth,
        })),
      });
      const nextFinalSummary = buildSummaryDocumentFromResponse({
        markdown: result.markdown || "",
        sections: result.sections || [],
        generatedAt: result.generated_at,
        usedLlm: result.used_llm,
        warning: result.warning,
        sourceSignature: result.source_signature || buildSummaryDocumentSourceSignature(eligibleGroups, problemStructureNodes),
      });

      setFinalSummaryDocument(nextFinalSummary);
      setSummaryDocumentEditMode(false);
      setSummaryEvidenceOpenGroupIds(new Set());
      latestSharedWorkspaceRef.current = {
        ...latestSharedWorkspaceRef.current,
        stage: "solution",
        finalSolutionSummary: nextFinalSummary,
        importedState: persistedSharedImportedState,
      };
      if (sharedSyncEnabled) {
        forceBroadcastSharedCanvas({
          stage: "solution",
          finalSolutionSummary: nextFinalSummary,
        });
        if (meetingId) {
          void saveCanvasWorkspacePatch({
            meeting_id: meetingId,
            stage: "solution",
            final_solution_summary: nextFinalSummary,
            imported_state: persistedSharedImportedState,
          }).catch((error) => {
            console.error("Failed to save summary document:", error);
          });
        }
      }
      setActivityMessage(result.warning || `구조화 그룹 ${eligibleGroups.length}개 기준으로 요약 문서를 생성했습니다.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setActivityMessage(`요약 문서 생성 실패: ${message}`);
    } finally {
      setSolutionStagePending(false);
      setBusy(false);
    }
  }, [
    forceBroadcastSharedCanvas,
    finalSummaryDocument.markdown,
    finalSummaryDocument.sections,
    meetingId,
    meetingTopicForAi,
    persistedSharedImportedState,
    problemStructureGroups,
    problemStructureNodes,
    sharedSyncEnabled,
  ]);

  const handleRegenerateSummaryDocument = useCallback(async () => {
    if (busy || solutionStagePending) {
      setActivityMessage("요약 문서 생성 작업이 이미 진행 중입니다.");
      return;
    }
    await handleGenerateSolutionStage({ force: true });
  }, [busy, handleGenerateSolutionStage, solutionStagePending]);

  const handleStageSelect = useCallback(
    async (nextStage: CanvasStage) => {
      if (stage === "problem-definition" && nextStage !== "problem-definition") {
        await flushProblemDiscussionBuffer("stage-change");
      }

      if (nextStage === "solution") {
        if (busy || solutionStagePending) {
          setActivityMessage(
            solutionStagePending
              ? "요약 문서를 생성하는 중이라 잠시 후 다시 시도해 주세요."
              : "다른 작업이 진행 중이라 아직 요약 단계로 전환할 수 없습니다.",
          );
          return;
        }

        const hasExistingSummaryDocument =
          finalSummaryDocument.markdown.trim() && (finalSummaryDocument.sections || []).length > 0;
        if (!hasExistingSummaryDocument) {
          await handleGenerateSolutionStage();
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
        setProblemStructureDrag(null);
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
      setProblemStructureDrag(null);
      await handleGenerateProblemDefinition();
      setLeftPanelTab("detail");
      return;
    },
    [
      busy,
      conclusionBatchBusy,
      finalSummaryDocument.markdown,
      finalSummaryDocument.sections,
      flushProblemDiscussionBuffer,
      handleGenerateProblemDefinition,
      handleGenerateSolutionStage,
      solutionStagePending,
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

  const canUseCanvasToolbar = stage === "problem-definition";
  const isProblemDefinitionExploreStage = stage === "problem-definition" && problemDefinitionPhase !== "structure";
  const visibleCanvasTools = useMemo<CanvasTool[]>(
    () =>
      stage === "problem-definition"
        ? ["group"]
        : [],
    [stage],
  );
  const problemCanvasToolbarActions: ProblemCanvasToolbarAction[] =
    problemDefinitionPhase === "structure"
      ? ["structure-back", "structure-ai-group", "structure-add-group", "structure-refresh"]
      : ["structure-start"];

  const problemToolbarActionLabel = (action: ProblemCanvasToolbarAction) => {
    if (action === "group") return "문제정의 그룹 추가";
    if (action === "problem-link") return "문제정의 그룹 연결";
    if (action === "debug-regenerate") return "디버그 재생성";
    if (action === "debug-refresh-chunks") return "요약 캐시 재생성";
    if (action === "structure-start") return "구조화 시작";
    if (action === "structure-back") return "정의 1단계";
    if (action === "structure-ai-group") return problemStructurePending ? "AI 묶는 중" : "AI 묶기";
    if (action === "structure-add-group") return "그룹 추가";
    if (action === "structure-refresh") return "다시 가져오기";
    if (action === "note") return "의견추가";
    if (action === "problem-idea") return "아이디어 추가";
    return "채택";
  };

  const isProblemToolbarActionActive = (action: ProblemCanvasToolbarAction) => {
    if (action === "debug-regenerate" || action === "debug-refresh-chunks") return problemDefinitionStagePending;
    if (action === "structure-start") return problemDefinitionPhase === "structure" || problemStructureSetupOpen;
    if (action === "structure-ai-group") return problemStructurePending;
    if (action === "problem-link") return Boolean(pendingProblemGroupLinkId);
    if (action === "adopt") return selectedProblemGroup?.status === "final";
    return armedCanvasTool === action;
  };

  const armCanvasTool = (tool: CanvasTool) => {
    if (!canUseCanvasToolbar || !visibleCanvasTools.includes(tool)) {
      setActivityMessage("현재 단계에서는 이 도구를 사용할 수 없습니다.");
      return;
    }
    setPendingProblemGroupLinkId("");
    if (isComposerTool(tool)) {
      setComposerTool(tool);
    }
    const isDisarming = armedCanvasTool === tool;
    setArmedCanvasTool(isDisarming ? null : tool);
    setCanvasPlacementPreview((prev) =>
      !prev || isDisarming
        ? null
        : {
            ...prev,
            label: toolLabel(tool, stage),
            hint: toolPreviewHint(tool, stage),
            tone: toolPreviewTone(tool, stage),
          },
    );
    setActivityMessage(
      isDisarming
        ? "보드 클릭 도구를 해제했습니다."
        : stage === "problem-definition" && tool === "group"
          ? "문제정의 그룹 도구를 선택했습니다. 보드를 클릭하면 새 문제정의 그룹이 생성됩니다."
          : stage === "problem-definition" && tool === "problem-idea"
            ? "아이디어 추가 도구를 선택했습니다. 문제정의 그룹을 클릭하면 아이디어 카드가 추가됩니다."
          : `${toolLabel(tool, stage)} 도구를 선택했습니다. 보드를 클릭하면 문제정의 의견 노드가 생성됩니다.`,
    );
  };

  useEffect(() => {
    if (!canUseCanvasToolbar || !armedCanvasTool || !visibleCanvasTools.includes(armedCanvasTool)) {
      setArmedCanvasTool(null);
      setCanvasPlacementPreview(null);
    }
  }, [armedCanvasTool, canUseCanvasToolbar, setCanvasPlacementPreview, visibleCanvasTools]);

  useEffect(() => {
    if (stage !== "problem-definition") {
      setPendingProblemGroupLinkId("");
    }
  }, [stage]);

  const updateCanvasPlacementPreview = useCallback(
    (clientX: number, clientY: number) => {
      if (!canUseCanvasToolbar || !armedCanvasTool || !visibleCanvasTools.includes(armedCanvasTool) || !canvasSurfaceRef.current) {
        setCanvasPlacementPreview(null);
        return;
      }

      const rect = canvasSurfaceRef.current.getBoundingClientRect();
      const previewWidth = 232;
      const previewHeight = 112;
      const x = Math.max(0, Math.min(clientX - rect.left, Math.max(rect.width - previewWidth, 0)));
      const y = Math.max(0, Math.min(clientY - rect.top, Math.max(rect.height - previewHeight, 0)));

      setCanvasPlacementPreview({
        x,
        y,
        label: toolLabel(armedCanvasTool, stage),
        hint: toolPreviewHint(armedCanvasTool, stage),
        tone: toolPreviewTone(armedCanvasTool, stage),
      });
    },
    [armedCanvasTool, canvasSurfaceRef, canUseCanvasToolbar, setCanvasPlacementPreview, stage, visibleCanvasTools],
  );

  const clearCanvasPlacementPreview = useCallback(() => {
    setCanvasPlacementPreview(null);
  }, [setCanvasPlacementPreview]);

  const handleCanvasPlacementStart = useCallback(
    async (tool: CanvasTool, clientX: number, clientY: number, agendaId?: string, pointId?: string) => {
      if (!flowRef.current || !canvasSurfaceRef.current) {
        return;
      }

      if (stage === "ideation" && (tool === "note" || tool === "comment")) {
        const rightPaneRect = getReactFlowCanvasRect(ideationRightPaneRef.current);
        if (!pointInRect(clientX, clientY, rightPaneRect)) {
          setArmedCanvasTool(null);
          setCanvasPlacementPreview(null);
          setActivityMessage("메모와 댓글은 오른쪽 상세 캔버스에서 추가해 주세요.");
          return;
        }
      }

      const canvasRect = canvasSurfaceRef.current.getBoundingClientRect();
      const uiX = Math.max(0, Math.min(clientX - canvasRect.left, canvasRect.width));
      const uiY = Math.max(0, Math.min(clientY - canvasRect.top, canvasRect.height));
      const flowPosition = flowRef.current.screenToFlowPosition({ x: clientX, y: clientY });

      if (stage === "problem-definition") {
        const now = new Date().toISOString();
        const makeUserProblemGroup = (groupId: string): ProblemGroupViewModel => ({
          group_id: groupId,
          topic: `문제정의 그룹 ${problemGroups.length + 1}`,
          insight_lens: "",
          insight_user_edited: false,
          keywords: [],
          agenda_ids: [],
          agenda_titles: [],
          ideas: [],
          discussion_items: [],
          source_summary_items: [],
          conclusion: "직접 추가한 문제정의 그룹입니다. 관련 의견을 드래그해서 편입해 주세요.",
          conclusion_user_edited: false,
          status: "draft",
          source_signature: `user:${groupId}`,
          source_agenda_signatures: {},
          source_idea_signatures: {},
        });

        let nextProblemGroupsSnapshot: ProblemGroupViewModel[] = problemGroups;
        let nextNodePositionsSnapshot: CanvasNodePositionsByStage = nodePositions;
        const clickedProblemGroupId =
          pointId?.startsWith("problem-") && !pointId.startsWith("problem-discussion-")
            ? pointId.slice("problem-".length)
            : "";
        const clickedDiscussionGroupId =
          pointId?.startsWith("problem-discussion-")
            ? problemGroups.find((group) =>
                (group.discussion_items || []).some(
                  (item) => `problem-discussion-${item.id}` === pointId,
                ),
              )?.group_id || ""
            : "";
        let nextSelectedGroupId =
          clickedProblemGroupId ||
          clickedDiscussionGroupId ||
          selectedProblemGroupId ||
          problemGroups[0]?.group_id ||
          "";
        let nextSelectedNodeId = "";
        let nextSelectedProblemSourceNodeId = "";
        let nextLeftPanelTab: LeftPanelTab = "detail";

        if (tool === "group") {
          const groupId = `user-problem-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
          const nextGroup = makeUserProblemGroup(groupId);
          nextProblemGroupsSnapshot = [nextGroup, ...problemGroups];
          nextNodePositionsSnapshot = {
            ...nodePositions,
            "problem-definition": {
              ...(nodePositions["problem-definition"] || {}),
              [`problem-${groupId}`]: {
                x: flowPosition.x,
                y: flowPosition.y,
              },
            },
          };
          nextSelectedGroupId = groupId;
          nextSelectedNodeId = `problem-${groupId}`;
          setEditingProblemGroupId(groupId);
          setProblemGroupDraftTopic(nextGroup.topic);
          setProblemGroupDraftInsight("");
          setProblemGroupDraftConclusion(nextGroup.conclusion);
          setActivityMessage("새 문제정의 그룹을 추가했습니다. 다른 의견 노드를 드래그해서 편입할 수 있습니다.");
        } else if (tool === "problem-idea") {
          let workingGroups = problemGroups;
          if (!nextSelectedGroupId) {
            const groupId = `user-problem-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
            const nextGroup = makeUserProblemGroup(groupId);
            workingGroups = [nextGroup, ...problemGroups];
            nextSelectedGroupId = groupId;
            nextNodePositionsSnapshot = {
              ...nodePositions,
              "problem-definition": {
                ...(nodePositions["problem-definition"] || {}),
                [`problem-${groupId}`]: {
                  x: Math.max(80, flowPosition.x - 560),
                  y: flowPosition.y,
                },
              },
            };
          }

          const targetGroup = workingGroups.find((group) => group.group_id === nextSelectedGroupId);
          const ideaId = `user-problem-idea-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
          const nextIdea = {
            id: ideaId,
            kind: "idea",
            title: `아이디어 ${(targetGroup?.ideas.length || 0) + 1}`,
            body: "문제정의 그룹에 추가할 아이디어를 입력해 주세요.",
          };

          nextProblemGroupsSnapshot = workingGroups.map((group) =>
            group.group_id === nextSelectedGroupId
              ? {
                  ...group,
                  ideas: [
                    ...(group.ideas || []),
                    nextIdea,
                  ],
                }
              : group,
          );
          nextSelectedNodeId = `problem-${nextSelectedGroupId}`;
          nextSelectedProblemSourceNodeId = ideaId;
          nextLeftPanelTab = "detail";
          setActivityMessage("아이디어 카드를 문제정의 그룹에 추가했습니다.");
        } else {
          let workingGroups = problemGroups;
          if (!nextSelectedGroupId) {
            const groupId = `user-problem-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
            const nextGroup = makeUserProblemGroup(groupId);
            workingGroups = [nextGroup, ...problemGroups];
            nextSelectedGroupId = groupId;
            nextNodePositionsSnapshot = {
              ...nodePositions,
              "problem-definition": {
                ...(nodePositions["problem-definition"] || {}),
                [`problem-${groupId}`]: {
                  x: Math.max(80, flowPosition.x - 560),
                  y: flowPosition.y,
                },
              },
            };
          }

          const discussionId = `user-problem-note-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
          const nextDiscussion: ProblemDiscussionViewModel = {
            id: discussionId,
            parent_group_id: nextSelectedGroupId,
            title: tool === "comment" ? "댓글" : "문제 의견",
            body:
              tool === "comment"
                ? "문제정의 단계에서 남길 댓글을 입력해 주세요."
                : "문제정의에 반영할 의견을 입력해 주세요.",
            keywords: [],
            key_evidence: [],
            refined_utterances: [],
            evidence_utterance_ids: [],
            ignored_utterance_ids: [],
            ai_pending: false,
            ai_generated: false,
            user_edited: true,
            created_by: "user",
            created_at: now,
          };

          nextProblemGroupsSnapshot = workingGroups.map((group) =>
            group.group_id === nextSelectedGroupId
              ? {
                  ...group,
                  discussion_items: [
                    ...(group.discussion_items || []),
                    nextDiscussion,
                  ],
                }
              : group,
          );
          nextNodePositionsSnapshot = {
            ...nextNodePositionsSnapshot,
            "problem-definition": {
              ...(nextNodePositionsSnapshot["problem-definition"] || {}),
              [`problem-discussion-${discussionId}`]: {
                x: flowPosition.x,
                y: flowPosition.y,
              },
            },
          };
          nextSelectedNodeId = `problem-discussion-${discussionId}`;
          setActivityMessage(`${toolLabel(tool, stage)} 노드를 문제정의 단계에 추가했습니다.`);
        }

        latestSharedWorkspaceRef.current = {
          ...latestSharedWorkspaceRef.current,
          stage,
          problemGroups: nextProblemGroupsSnapshot,
          nodePositions: nextNodePositionsSnapshot,
          importedState: persistedSharedImportedState,
        };

        setArmedCanvasTool(null);
        setCanvasPlacementPreview(null);
        setProblemGroups(nextProblemGroupsSnapshot);
        setNodePositions(nextNodePositionsSnapshot);
        setSelectedProblemGroupId(nextSelectedGroupId);
        setSelectedProblemSourceNodeId(nextSelectedProblemSourceNodeId);
        setSelectedCanvasItemId("");
        setSelectedNodeId(nextSelectedNodeId);
        setLeftPanelTab(nextLeftPanelTab);
        setPlacementFeedback({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          x: uiX,
          y: uiY,
          label: toolLabel(tool, stage),
        });
        if (placementFeedbackTimerRef.current) {
          window.clearTimeout(placementFeedbackTimerRef.current);
        }
        placementFeedbackTimerRef.current = window.setTimeout(() => {
          setPlacementFeedback(null);
          placementFeedbackTimerRef.current = null;
        }, 1500);

        if (sharedSyncEnabled) {
          writeSharedWorkspaceSessionCache(
            meetingId,
            buildFullWorkspacePatchPayload({
              meetingId,
              meetingGoal: meetingGoalDraft,
              meetingGoalContext: meetingGoalContextDraft,
              stage,
              agendaOverrides,
              canvasItems,
              customGroups,
              problemGroups: nextProblemGroupsSnapshot,
              problemStructure: problemStructureStatePayload,
              solutionTopics,
              nodePositions: nextNodePositionsSnapshot,
              importedState: persistedSharedImportedState,
            }),
          );
          forceBroadcastSharedCanvas({
            problemGroups: nextProblemGroupsSnapshot,
            nodePositions: nextNodePositionsSnapshot,
          });
          if (meetingId) {
            void saveCanvasWorkspacePatch({
              meeting_id: meetingId,
              problem_groups: serializeSharedProblemGroups(nextProblemGroupsSnapshot),
              node_positions: nextNodePositionsSnapshot,
              imported_state: persistedSharedImportedState,
            }).catch((error) => {
              console.error("Failed to save shared problem-definition tool placement:", error);
            });
          }
        }
        return;
      }

      if (tool === "group") {
        const now = new Date().toISOString();
        const draftTitle = customGroupDraftTitle.trim() || `그룹 분류 ${customGroups.length + 1}`;
        const nextGroup: CustomGroupViewModel = {
          id: `project-group-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
          title: draftTitle,
          description: "프로젝트에서 직접 추가한 그룹 분류입니다.",
          keywords: [],
          color: "",
          created_by: userId,
          created_at: now,
        };
        const nextNodeId = `agenda-${nextGroup.id}`;
        const nextCustomGroupsSnapshot = [nextGroup, ...customGroups];
        const nextNodePositionsSnapshot: CanvasNodePositionsByStage = normalizeCanvasNodePositionsForComputedIdeation({
          ...nodePositions,
          ideation: {
            ...(nodePositions.ideation || {}),
            [nextNodeId]: {
              x: flowPosition.x,
              y: flowPosition.y,
            },
          },
        });

        pendingNodePlacementsRef.current[nextNodeId] = {
          x: flowPosition.x,
          y: flowPosition.y,
        };
        latestSharedWorkspaceRef.current = {
          ...latestSharedWorkspaceRef.current,
          stage,
          customGroups: nextCustomGroupsSnapshot,
          nodePositions: nextNodePositionsSnapshot,
          importedState: persistedSharedImportedState,
        };

        setArmedCanvasTool(null);
        setCanvasPlacementPreview(null);
        setCustomGroups(nextCustomGroupsSnapshot);
        setNodePositions(nextNodePositionsSnapshot);
        setSelectedAgendaId(nextGroup.id);
        setSelectedCanvasItemId("");
        setSelectedProblemGroupId("");
        setSelectedNodeId(nextNodeId);
        setCustomGroupDraftTitle("");
        setLeftPanelTab("detail");
        setPlacementFeedback({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          x: uiX,
          y: uiY,
          label: toolLabel(tool),
        });
        if (placementFeedbackTimerRef.current) {
          window.clearTimeout(placementFeedbackTimerRef.current);
        }
        placementFeedbackTimerRef.current = window.setTimeout(() => {
          setPlacementFeedback(null);
          placementFeedbackTimerRef.current = null;
        }, 1500);
        setActivityMessage("보드 위치에 프로젝트 그룹 분류를 생성했습니다. 이름을 바로 수정할 수 있습니다.");

        if (sharedSyncEnabled) {
          writeSharedWorkspaceSessionCache(
            meetingId,
            buildFullWorkspacePatchPayload({
              meetingId,
              meetingGoal: meetingGoalDraft,
              meetingGoalContext: meetingGoalContextDraft,
              stage,
              agendaOverrides,
              canvasItems,
              customGroups: nextCustomGroupsSnapshot,
              problemGroups,
              problemStructure: problemStructureStatePayload,
              solutionTopics,
              nodePositions: nextNodePositionsSnapshot,
              importedState: persistedSharedImportedState,
            }),
          );
          forceBroadcastSharedCanvas({
            customGroups: nextCustomGroupsSnapshot,
            nodePositions: nextNodePositionsSnapshot,
          });
          if (meetingId) {
            void saveCanvasWorkspacePatch({
              meeting_id: meetingId,
              custom_groups: serializeCustomGroups(nextCustomGroupsSnapshot),
              node_positions: nextNodePositionsSnapshot,
              imported_state: persistedSharedImportedState,
            }).catch((error) => {
              console.error("Failed to save shared project group placement:", error);
            });
          }
        }

        try {
          await confirmCanvasPlacement({
            tool,
            ui_x: uiX,
            ui_y: uiY,
            flow_x: flowPosition.x,
            flow_y: flowPosition.y,
            title: draftTitle,
            body: "",
          });
        } catch (error) {
          console.error("Failed to confirm project group placement:", error);
        }
        return;
      }

      if (!isComposerTool(tool)) {
        setActivityMessage("현재 단계에서는 이 도구를 사용할 수 없습니다.");
        return;
      }

      const clickedCanvasItemId = extractCanvasItemIdFromNodeId(pointId || "");
      const clickedCanvasItem = clickedCanvasItemId
        ? canvasItemById.get(clickedCanvasItemId) || null
        : null;
      const selectedRootItemId = selectedCanvasItemId
        ? getCanvasItemTopLevelAncestorId(canvasItems, selectedCanvasItemId)
        : "";
      const selectedRootItem = selectedRootItemId
        ? canvasItemById.get(selectedRootItemId) || null
        : null;
      const parentItemForPlacement =
        stage === "ideation" && tool !== "topic"
          ? clickedCanvasItem || selectedRootItem
          : null;

      if (stage === "ideation" && tool !== "topic" && !parentItemForPlacement) {
        setActivityMessage("먼저 왼쪽 그룹을 선택한 뒤 오른쪽 캔버스에 메모나 댓글을 추가해 주세요.");
        setArmedCanvasTool(null);
        setCanvasPlacementPreview(null);
        return;
      }

      const nextAgendaId =
        agendaId ||
        parentItemForPlacement?.agenda_id ||
        selectedAgendaId ||
        agendaModels[0]?.id ||
        "";
      const nextParentItemId = parentItemForPlacement?.id || "";
      const draftTitle = `${toolLabel(tool)} ${canvasItems.filter((item) => item.kind === tool).length + 1}`;
      const nextItemId = `item-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
      const nextNodeId = `canvas-item-${nextItemId}`;
      const draftBody =
        tool === "topic"
          ? "새 주제를 정리해 주세요."
          : tool === "comment"
            ? "코멘트 내용을 입력해 주세요."
            : "메모 내용을 입력해 주세요.";
      const nextItem: CanvasItemViewModel = {
        id: nextItemId,
        agenda_id: nextAgendaId,
        point_id: pointId || "",
        kind: tool,
        status: "discussion",
        title: draftTitle,
        keywords: [],
        key_evidence: [],
        refined_utterances: [],
        evidence_utterance_ids: [],
        ignored_utterance_ids: [],
        parent_topic_id: nextParentItemId,
        parent_topic_source: nextParentItemId ? "user" : "",
        parent_topic_locked: Boolean(nextParentItemId),
        child_item_ids: [],
        topic_collapsed: tool === "topic" ? false : undefined,
        created_by: "user",
        manual_position: false,
        ai_generated: false,
        user_edited: true,
        body: draftBody,
      };
      const nextCanvasItemsSnapshot: CanvasItemViewModel[] = [
        nextItem,
        ...canvasItems.map((item) =>
          item.id === nextParentItemId
            ? {
                ...item,
                child_item_ids: [...new Set([...(item.child_item_ids || []), nextItemId])],
              }
            : item,
        ),
      ];
      const nextNodePositionsSnapshot = normalizeCanvasNodePositionsForComputedIdeation(nodePositions);
      latestSharedWorkspaceRef.current = {
        ...latestSharedWorkspaceRef.current,
        stage,
        canvasItems: nextCanvasItemsSnapshot,
        nodePositions: nextNodePositionsSnapshot,
        importedState: persistedSharedImportedState,
      };

      if (nextAgendaId) {
        setSelectedAgendaId(nextAgendaId);
      }
      setComposerTool(tool);
      setArmedCanvasTool(null);
      setCanvasPlacementPreview(null);
      setCanvasItems(nextCanvasItemsSnapshot);
      setSelectedCanvasItemId(nextItemId);
      setSelectedNodeId(nextNodeId);
      setLeftPanelTab("detail");
      setPlacementFeedback({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        x: uiX,
        y: uiY,
        label: toolLabel(tool),
      });
      if (placementFeedbackTimerRef.current) {
        window.clearTimeout(placementFeedbackTimerRef.current);
      }
      placementFeedbackTimerRef.current = window.setTimeout(() => {
        setPlacementFeedback(null);
        placementFeedbackTimerRef.current = null;
      }, 1500);

      setActivityMessage("보드 위치에 공용 canvas 아이템을 생성했습니다.");

      if (sharedSyncEnabled) {
        writeSharedWorkspaceSessionCache(
          meetingId,
          buildFullWorkspacePatchPayload({
            meetingId,
            meetingGoal: meetingGoalDraft,
            meetingGoalContext: meetingGoalContextDraft,
            stage,
            agendaOverrides,
            canvasItems: nextCanvasItemsSnapshot,
            customGroups,
            problemGroups,
            problemStructure: problemStructureStatePayload,
            solutionTopics,
            nodePositions: nextNodePositionsSnapshot,
            importedState: persistedSharedImportedState,
          }),
        );
        forceBroadcastSharedCanvas({
          canvasItems: nextCanvasItemsSnapshot,
        });
        if (meetingId) {
          void saveCanvasWorkspacePatch({
            meeting_id: meetingId,
            canvas_items: serializeSharedCanvasItems(nextCanvasItemsSnapshot),
            imported_state: persistedSharedImportedState,
          }).catch((error) => {
            console.error("Failed to save shared canvas item placement:", error);
          });
        }
      }

      try {
        await confirmCanvasPlacement({
          tool,
          ui_x: uiX,
          ui_y: uiY,
          flow_x: flowPosition.x,
          flow_y: flowPosition.y,
          agenda_id: nextAgendaId || undefined,
          point_id: pointId || undefined,
          title: draftTitle,
          body: "",
        });
      } catch (error) {
        console.error("Failed to confirm canvas placement:", error);
      }
    },
    [
      agendaOverrides,
      agendaModels,
      canvasItemById,
      canvasItems,
      customGroupDraftTitle,
      customGroups,
      forceBroadcastSharedCanvas,
      meetingGoalContextDraft,
      meetingGoalDraft,
      meetingId,
      nodePositions,
      persistedSharedImportedState,
      placementFeedbackTimerRef,
      canvasSurfaceRef,
      problemGroups,
      problemStructureStatePayload,
      selectedAgendaId,
      selectedCanvasItemId,
      selectedProblemGroupId,
      flowRef,
      pendingNodePlacementsRef,
      setCanvasPlacementPreview,
      setNodePositions,
      setPlacementFeedback,
      sharedSyncEnabled,
      solutionTopics,
      stage,
      userId,
    ],
  );

  const onNodesChange = (changes: NodeChange[]) => {
    if (!workspaceLoadedRef.current || workspaceHydratingRef.current || applyingRemoteSharedSyncRef.current) {
      setNodes((current) => applyNodeChanges(changes, current));
      return;
    }

    setNodes((current) => applyNodeChanges(changes, current));
    let livePositionsChanged = false;
    let nextLiveStagePositions = { ...(liveNodePositionsRef.current[stage] || {}) };

    changes.forEach((change) => {
      if (change.type !== "position" || !("position" in change) || !change.position) {
        return;
      }
      if (stage === "ideation" && !change.id.startsWith("agenda-")) {
        return;
      }

      const nextPosition = {
        x: Number(change.position.x || 0),
        y: Number(change.position.y || 0),
      };
      const previousPosition = nextLiveStagePositions[change.id];
      if (previousPosition?.x === nextPosition.x && previousPosition.y === nextPosition.y) {
        return;
      }

      scheduleNodePreview(change.id, nextPosition);
      nextLiveStagePositions = {
        ...nextLiveStagePositions,
        [change.id]: nextPosition,
      };
      livePositionsChanged = true;
    });

    if (livePositionsChanged) {
      const nextLivePositions = normalizeCanvasNodePositionsForComputedIdeation({
        ...liveNodePositionsRef.current,
        [stage]: nextLiveStagePositions,
      });
      liveNodePositionsRef.current = nextLivePositions;
    }

    setNodePositions((prev) => {
      const stagePositions = { ...(prev[stage] || {}) };
      let changed = false;

      changes.forEach((change) => {
        if (change.type === "remove" && stagePositions[change.id]) {
          delete stagePositions[change.id];
          changed = true;
        }
      });

      if (!changed) {
        return prev;
      }

      if (!sharedSyncEnabled) {
        changes.forEach((change) => {
          if (change.type === "remove") {
            localNodeOverridesRef.current[stage].delete(change.id);
          }
        });
      }

      return {
        ...prev,
        [stage]: stagePositions,
      };
    });
  };

  const setProblemDropHighlight = (target: ProblemSourceDropTarget | null) => {
    const previousElement = hoveredProblemDropTargetElementRef.current;
    if (previousElement && previousElement !== target?.element) {
      previousElement.classList.remove("imms-problem-source-drop-active");
    }

    if (target?.element) {
      target.element.classList.add("imms-problem-source-drop-active");
      hoveredProblemDropTargetElementRef.current = target.element;
      if (typeof document !== "undefined") {
        document.body.style.cursor = "copy";
      }
      return;
    }

    hoveredProblemDropTargetElementRef.current = null;
    if (typeof document !== "undefined") {
      document.body.style.cursor = "";
    }
  };

  const getStableIdeationDragPosition = useCallback(
    (event: React.MouseEvent, node: Node) => {
      const dragState = stableIdeationDragRef.current;
      if (!flowRef.current || !dragState || dragState.nodeId !== node.id) {
        return node.position;
      }

      const pointerPosition = flowRef.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      return {
        x: pointerPosition.x - dragState.anchor.x,
        y: pointerPosition.y - dragState.anchor.y,
      };
    },
    [flowRef, stableIdeationDragRef],
  );

  const getIdeationDropPlaceholderPosition = useCallback(
    (pane: "left" | "right", clientX: number, clientY: number, fallback: { x: number; y: number }) => {
      const instance = pane === "left" ? ideationLeftFlowRef.current : ideationRightFlowRef.current;
      if (!instance) {
        return fallback;
      }

      const flowPosition = instance.screenToFlowPosition({ x: clientX, y: clientY });
      return {
        x: flowPosition.x - CANVAS_ITEM_NODE_WIDTH / 2,
        y: flowPosition.y - 64,
      };
    },
    [ideationLeftFlowRef, ideationRightFlowRef],
  );

  const collectIdeationDropTargetElements = useCallback((draggedNodeId: string): IdeationDropTargetElement[] => {
    if (typeof document === "undefined") {
      return [];
    }

    return Array.from(document.querySelectorAll<HTMLElement>(".react-flow__node"))
      .map((element) => {
        const nodeId = element.getAttribute("data-id") || "";
        const itemId = extractCanvasItemIdFromNodeId(nodeId);
        return {
          element,
          nodeId,
          itemId,
        };
      })
      .filter(
        (candidate) =>
          candidate.nodeId &&
          candidate.itemId &&
          candidate.nodeId !== draggedNodeId &&
          candidate.nodeId !== "ideation-drop-placeholder",
      );
  }, []);

  const findIdeationLeftGroupDropTarget = useCallback(
    (clientX: number, clientY: number, draggedItem: CanvasItemViewModel) => {
      if (stage !== "ideation") {
        return null;
      }

      const leftPane = ideationLeftPaneRef.current;
      if (!leftPane) {
        return null;
      }

      const draggedRootId = getCanvasItemTopLevelAncestorId(canvasItems, draggedItem.id);
      const draggedDescendantIds = new Set(getCanvasItemDescendantIds(canvasItems, draggedItem.id));
      const candidates =
        ideationDropTargetElementsRef.current.length > 0
          ? ideationDropTargetElementsRef.current
          : collectIdeationDropTargetElements(`canvas-item-${draggedItem.id}`);
      let bestTarget: {
        nodeId: string;
        targetItem: CanvasItemViewModel;
        targetNode: Node | null;
        isCurrentRoot: boolean;
        distance: number;
      } | null = null;

      for (const { element, nodeId, itemId } of candidates) {
        if (!leftPane.contains(element)) {
          continue;
        }
        const targetItem = canvasItemById.get(itemId) || null;
        if (!targetItem) {
          continue;
        }

        const rect = element.getBoundingClientRect();
        const inside =
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom;
        if (!inside) {
          continue;
        }

        if (
          targetItem.parent_topic_id ||
          targetItem.agenda_id !== selectedAgendaForDrop ||
          targetItem.id === draggedItem.id ||
          draggedDescendantIds.has(targetItem.id)
        ) {
          continue;
        }

        const target = {
          nodeId,
          targetItem,
          targetNode: flowNodeById.get(nodeId) || null,
          isCurrentRoot: targetItem.id === draggedRootId,
          distance: Math.hypot(clientX - (rect.left + rect.width / 2), clientY - (rect.top + rect.height / 2)),
        };
        if (!bestTarget || target.distance < bestTarget.distance) {
          bestTarget = target;
        }
      }

      return bestTarget;
    },
    [
      canvasItemById,
      canvasItems,
      collectIdeationDropTargetElements,
      flowNodeById,
      ideationDropTargetElementsRef,
      selectedAgendaForDrop,
      stage,
    ],
  );

  const resolveIdeationDropPreview = useCallback(
    (clientX: number, clientY: number, node: Node): IdeationDropPreviewState | null => {
      if (stage !== "ideation" || !node.id.startsWith("canvas-item-")) {
        return null;
      }

      const draggedItemId = node.id.slice("canvas-item-".length);
      const draggedItem = canvasItemById.get(draggedItemId) || null;
      if (!draggedItem) {
        return null;
      }

      const draggedRootId = getCanvasItemTopLevelAncestorId(canvasItems, draggedItem.id);
      const draggedDescendantIds = getCanvasItemDescendantIds(canvasItems, draggedItem.id);
      const splitLeftDropTarget = findIdeationLeftGroupDropTarget(clientX, clientY, draggedItem);
      const pointerInsideLeftPane = pointInRect(
        clientX,
        clientY,
        getReactFlowCanvasRect(ideationLeftPaneRef.current),
      );
      const pointerInsideRightPane = pointInRect(
        clientX,
        clientY,
        getReactFlowCanvasRect(ideationRightPaneRef.current),
      );

      if (draggedItem.parent_topic_id && pointerInsideLeftPane) {
        if (splitLeftDropTarget && splitLeftDropTarget.targetNode && !splitLeftDropTarget.isCurrentRoot) {
          return {
            draggedItemId,
            targetId: splitLeftDropTarget.targetItem.id,
            mode: "topic",
            agendaId: splitLeftDropTarget.targetItem.agenda_id || draggedItem.agenda_id,
            position: splitLeftDropTarget.targetNode.position,
            label: "이 그룹으로 이동",
            hint: `"${splitLeftDropTarget.targetItem.title || "그룹"}" 상세 캔버스로 이동합니다.`,
          };
        }

        return {
          draggedItemId,
          targetId: selectedAgendaForDrop || draggedItem.agenda_id,
          mode: "detach",
          agendaId: selectedAgendaForDrop || draggedItem.agenda_id,
          position: getIdeationDropPlaceholderPosition("left", clientX, clientY, node.position),
          label: "왼쪽에 추가",
          hint: "마우스를 놓으면 현재 그룹분류의 1차 노드로 추가합니다.",
        };
      }

      if (splitLeftDropTarget && splitLeftDropTarget.targetNode) {
        if (!draggedItem.parent_topic_id && !splitLeftDropTarget.isCurrentRoot) {
          return makeIdeationMergeDropPreview(
            draggedItem,
            splitLeftDropTarget.targetItem,
            splitLeftDropTarget.targetNode.position,
          );
        }
      }

      if (!draggedItem.parent_topic_id && pointerInsideRightPane) {
        const selectedRootIdForDrop = selectedCanvasItemId
          ? getCanvasItemTopLevelAncestorId(canvasItems, selectedCanvasItemId)
          : "";
        const selectedRootItemForDrop = selectedRootIdForDrop
          ? canvasItemById.get(selectedRootIdForDrop) || null
          : null;

        if (
          selectedRootItemForDrop &&
          selectedRootItemForDrop.id !== draggedItem.id &&
          selectedRootItemForDrop.agenda_id === selectedAgendaForDrop
        ) {
          return makeIdeationMergeDropPreview(
            draggedItem,
            selectedRootItemForDrop,
            getIdeationDropPlaceholderPosition("right", clientX, clientY, node.position),
          );
        }
      }

      if (pointerInsideLeftPane || (!draggedItem.parent_topic_id && !pointerInsideRightPane)) {
        return null;
      }

      if (draggedItem.parent_topic_id && pointerInsideRightPane) {
        return null;
      }

      const candidateElements =
        ideationDropTargetElementsRef.current.length > 0
          ? ideationDropTargetElementsRef.current
          : collectIdeationDropTargetElements(node.id);
      let candidateDropTarget: {
        nodeId: string;
        targetItem: CanvasItemViewModel;
        targetNode: Node;
        childCount: number;
        directAction: "group-move" | "group-merge" | "";
        distance: number;
      } | null = null;

      for (const { element, nodeId, itemId } of candidateElements) {
        if (!nodeId.startsWith("canvas-item-")) {
          continue;
        }
        const targetItem = canvasItemById.get(itemId) || null;
        const targetNode = flowNodeById.get(nodeId) || null;
        if (!targetItem || !targetNode || targetItem.id === draggedItem.id) {
          continue;
        }

        const rect = element.getBoundingClientRect();
        const insideNodeRect =
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom;
        const canDropOnSplitGroup =
          insideNodeRect &&
          Boolean(draggedItem.parent_topic_id) &&
          !targetItem.parent_topic_id &&
          targetItem.agenda_id === selectedAgendaForDrop &&
          targetItem.id !== draggedRootId &&
          !draggedDescendantIds.includes(targetItem.id);
        if (canDropOnSplitGroup) {
          const target = {
            nodeId,
            targetItem,
            targetNode,
            childCount: 0,
            directAction: "group-move" as const,
            distance: Math.hypot(clientX - (rect.left + rect.width / 2), clientY - (rect.top + rect.height / 2)),
          };
          if (!candidateDropTarget || target.distance < candidateDropTarget.distance) {
            candidateDropTarget = target;
          }
          continue;
        }
        const canMergeSplitGroups =
          insideNodeRect &&
          !draggedItem.parent_topic_id &&
          !targetItem.parent_topic_id &&
          targetItem.agenda_id === selectedAgendaForDrop &&
          targetItem.id !== draggedItem.id &&
          !draggedDescendantIds.includes(targetItem.id);
        if (canMergeSplitGroups) {
          const target = {
            nodeId,
            targetItem,
            targetNode,
            childCount: 0,
            directAction: "group-merge" as const,
            distance: Math.hypot(clientX - (rect.left + rect.width / 2), clientY - (rect.top + rect.height / 2)),
          };
          if (!candidateDropTarget || target.distance < candidateDropTarget.distance) {
            candidateDropTarget = target;
          }
          continue;
        }

        const screenGap = Math.max(10, rect.width * 0.045);
        const childCount =
          isTopicCanvasItem(targetItem) && !isTopicCanvasItem(draggedItem)
            ? getTopicDirectChildIds(canvasItems, targetItem.id).filter((childId) => childId !== draggedItem.id).length
            : 0;
        const dropLeft = rect.right + screenGap + childCount * (rect.width + screenGap);
        const dropRight = dropLeft + rect.width;
        const dropTop = rect.top - CANVAS_IDEATION_DROP_ZONE_VERTICAL_PADDING;
        const dropBottom = rect.bottom + CANVAS_IDEATION_DROP_ZONE_VERTICAL_PADDING;
        const insideDropZone =
          clientX >= dropLeft &&
          clientX <= dropRight &&
          clientY >= dropTop &&
          clientY <= dropBottom;
        if (!insideDropZone) {
          continue;
        }

        const target = {
          nodeId,
          targetItem,
          targetNode,
          childCount,
          directAction: "" as const,
          distance: Math.hypot(clientX - dropLeft, clientY - (rect.top + rect.height / 2)),
        };
        if (!candidateDropTarget || target.distance < candidateDropTarget.distance) {
          candidateDropTarget = target;
        }
      }

      const candidateNodeId = candidateDropTarget?.nodeId || "";

      if (candidateNodeId.startsWith("canvas-item-")) {
        const targetItem = candidateDropTarget?.targetItem || null;
        const targetNode = candidateDropTarget?.targetNode || null;
        if (!targetItem || !targetNode) {
          return null;
        }
        const placeholderPosition = {
          x: targetNode.position.x + CANVAS_ITEM_NODE_WIDTH + CANVAS_TOPIC_CHILD_GAP_X + (candidateDropTarget?.childCount || 0) * (CANVAS_ITEM_NODE_WIDTH + CANVAS_TOPIC_CHILD_GAP_X),
          y: targetNode.position.y,
        };

        if (candidateDropTarget?.directAction === "group-merge") {
          return makeIdeationMergeDropPreview(draggedItem, targetItem, targetNode.position);
        }

        if (candidateDropTarget?.directAction === "group-move") {
          return {
            draggedItemId,
            targetId: targetItem.id,
            mode: "topic",
            agendaId: targetItem.agenda_id || draggedItem.agenda_id,
            position: targetNode.position,
            label: "이 그룹으로 이동",
            hint: `"${targetItem.title || "그룹"}" 상세 캔버스로 이동합니다.`,
          };
        }

        if (isTopicCanvasItem(targetItem)) {
          if (isTopicCanvasItem(draggedItem)) {
            return {
              draggedItemId,
              targetId: targetItem.id,
              mode: "topic-merge",
              agendaId: targetItem.agenda_id || draggedItem.agenda_id,
              position: placeholderPosition,
              label: "토픽 통합",
              hint: `"${targetItem.title || "토픽"}"과 합쳐 새 토픽으로 재구성합니다.`,
            };
          }

          return {
            draggedItemId,
            targetId: targetItem.id,
            mode: "topic",
            agendaId: targetItem.agenda_id || draggedItem.agenda_id,
            position: placeholderPosition,
            label: "이 토픽에 추가",
            hint: `"${targetItem.title || "토픽"}"의 하위 아이디어로 이동합니다.`,
          };
        }

        if (isTopicCanvasItem(draggedItem)) {
          const draggedTopicChildIds = getTopicFlattenedIdeaChildIds(canvasItems, draggedItem.id);
          if (draggedTopicChildIds.includes(targetItem.id)) {
            return null;
          }

          return {
            draggedItemId,
            targetId: targetItem.id,
            mode: "topic-idea-merge",
            agendaId: targetItem.agenda_id || draggedItem.agenda_id,
            position: placeholderPosition,
            label: "새 토픽으로 통합",
            hint: `"${targetItem.title || "대상 노드"}"와 토픽을 새 주제로 묶습니다.`,
          };
        }

        return {
          draggedItemId,
          targetId: targetItem.id,
          mode: "merge",
          agendaId: targetItem.agenda_id || draggedItem.agenda_id,
          position: placeholderPosition,
          label: "새 토픽으로 묶기",
          hint: `"${targetItem.title || "대상 노드"}"와 함께 새 토픽을 만듭니다.`,
        };
      }

      return null;
    },
    [
      canvasItemById,
      canvasItems,
      collectIdeationDropTargetElements,
      findIdeationLeftGroupDropTarget,
      flowNodeById,
      getIdeationDropPlaceholderPosition,
      ideationDropTargetElementsRef,
      selectedAgendaForDrop,
      selectedCanvasItemId,
      stage,
    ],
  );

  const cancelPendingIdeationDragFrame = () => {
    if (ideationDragFrameRef.current !== null) {
      window.cancelAnimationFrame(ideationDragFrameRef.current);
      ideationDragFrameRef.current = null;
    }
    pendingIdeationDragFrameRef.current = null;
  };

  const applyPendingIdeationDragFrame = () => {
    ideationDragFrameRef.current = null;
    const pendingFrame = pendingIdeationDragFrameRef.current;
    pendingIdeationDragFrameRef.current = null;
    if (!pendingFrame) {
      return;
    }

    const { node, itemId, clientX, clientY, position } = pendingFrame;
    setIdeationDragGhost((current) =>
      current?.itemId === itemId && current.x === clientX && current.y === clientY
        ? current
        : {
            itemId,
            x: clientX,
            y: clientY,
          },
    );
    scheduleNodePreview(node.id, position);
    setNodes((current) => {
      const targetNode = current.find((item) => item.id === node.id);
      if (!targetNode || positionsEqual(targetNode.position, position)) {
        return current;
      }

      return current.map((item) =>
        item.id === node.id
          ? {
              ...item,
              position,
            }
          : item,
      );
    });

    const dragNode = {
      ...node,
      position,
    };
    const nextPreview = resolveIdeationDropPreview(clientX, clientY, dragNode);
    ideationDropPreviewRef.current = nextPreview;
    setIdeationDropPreview((current) =>
      current?.draggedItemId === nextPreview?.draggedItemId &&
      current?.targetId === nextPreview?.targetId &&
      current?.mode === nextPreview?.mode &&
      current?.agendaId === nextPreview?.agendaId &&
      current?.position.x === nextPreview?.position.x &&
      current?.position.y === nextPreview?.position.y
        ? current
        : nextPreview,
    );
    setProblemDropHighlight(null);
  };

  const queueIdeationDragFrame = (pendingFrame: PendingIdeationDragFrame) => {
    pendingIdeationDragFrameRef.current = pendingFrame;
    if (ideationDragFrameRef.current !== null) {
      return;
    }

    ideationDragFrameRef.current = window.requestAnimationFrame(applyPendingIdeationDragFrame);
  };

  const onNodeDragStop = (event: React.MouseEvent, node: Node) => {
    setProblemDropHighlight(null);
    setIdeationNodeDragActive(false);
    setIdeationDragGhost(null);
    cancelPendingIdeationDragFrame();
    const dragNode =
      stage === "ideation" && node.id.startsWith("canvas-item-")
        ? {
            ...node,
            position: getStableIdeationDragPosition(event, node),
          }
        : node;
    localDraggingNodeIdsRef.current.delete(node.id);
    stableIdeationDragRef.current = null;
    const clearNodeDragSession = () => {
      delete dragIdByNodeIdRef.current[node.id];
      ideationDropTargetElementsRef.current = [];
    };
    const activeIdeationDropPreview = ideationDropPreviewRef.current || ideationDropPreview;
    ideationDropPreviewRef.current = null;
    setIdeationDropPreview(null);
    const activeAgendaDragPreview = agendaDragPreviewRef.current || agendaDragPreview;
    const agendaDragSession =
      stage === "ideation" && node.id.startsWith("agenda-") ? activeAgendaDragPreview : null;

    if (!workspaceLoadedRef.current || workspaceHydratingRef.current || applyingRemoteSharedSyncRef.current) {
      if (agendaDragSession) {
        agendaDragPreviewRef.current = null;
        setAgendaDragPreview(null);
      }
      clearNodeDragSession();
      return;
    }

    scheduleNodePreview(dragNode.id, dragNode.position);
    flushPendingNodePreviews();
    clearNodeDragSession();

    const currentPosition = nodePositions[stage]?.[node.id];
    if (currentPosition && currentPosition.x === dragNode.position.x && currentPosition.y === dragNode.position.y) {
      if (agendaDragSession) {
        agendaDragPreviewRef.current = null;
        setAgendaDragPreview(null);
      }
      return;
    }

    if (!sharedSyncEnabled) {
      localNodeOverridesRef.current[stage].add(node.id);
    }

    let nextPositionsSnapshot: CanvasNodePositionsByStage = {
      ...nodePositions,
      [stage]: {
        ...(nodePositions[stage] || {}),
        [node.id]: {
          x: dragNode.position.x,
          y: dragNode.position.y,
        },
      },
    };

    let nextCanvasItemsSnapshot: CanvasItemViewModel[] | null = null;
    let nextProblemGroupsSnapshot: ProblemGroupViewModel[] | null = null;
    let topicSummaryRefreshItemIds: string[] = [];
    if (stage === "ideation" && node.id.startsWith("agenda-")) {
      const agendaId = node.id.slice("agenda-".length);
      const nextStagePositions = {
        ...(nextPositionsSnapshot.ideation || {}),
        [`agenda-${agendaId}`]: {
          x: dragNode.position.x,
          y: dragNode.position.y,
        },
      };

      nextPositionsSnapshot = {
        ...nextPositionsSnapshot,
        ideation: nextStagePositions,
      };
      agendaDragPreviewRef.current = null;
      setAgendaDragPreview(null);
      setActivityMessage("그룹 분류와 하위 콘텐츠 위치를 함께 이동했습니다.");
    }

    if (stage === "ideation" && node.id.startsWith("canvas-item-")) {
      const canvasItemId = node.id.slice("canvas-item-".length);
      const draggedItem = canvasItemById.get(canvasItemId) || null;
      const droppedOnRightPane = pointInRect(
        event.clientX,
        event.clientY,
        getReactFlowCanvasRect(ideationRightPaneRef.current),
      );
      let dropPreview =
        resolveIdeationDropPreview(event.clientX, event.clientY, dragNode) ||
        (activeIdeationDropPreview?.draggedItemId === canvasItemId ? activeIdeationDropPreview : null);
      let topicToExpandId = "";
      let ideationMoveMessage = "";
      let nextSelectedIdeationItemId = canvasItemId;

      if (draggedItem && !draggedItem.parent_topic_id && droppedOnRightPane) {
        const selectedRootIdForDrop = selectedCanvasItemId
          ? getCanvasItemTopLevelAncestorId(canvasItems, selectedCanvasItemId)
          : "";
        const selectedRootItemForDrop = selectedRootIdForDrop
          ? canvasItemById.get(selectedRootIdForDrop) || null
          : null;

        if (selectedRootItemForDrop && selectedRootItemForDrop.id !== draggedItem.id) {
          dropPreview = makeIdeationMergeDropPreview(
            draggedItem,
            selectedRootItemForDrop,
            dragNode.position,
          );
        } else {
          if (draggedItem.agenda_id) {
            setSelectedAgendaId(draggedItem.agenda_id);
          }
          ideationMoveMessage = `"${draggedItem.title || "그룹"}" 상세 캔버스를 열었습니다.`;
        }
      }

      if (draggedItem && dropPreview?.mode === "topic-merge") {
        const draggedTopic = isTopicCanvasItem(draggedItem) ? draggedItem : null;
        const targetTopicCandidate = canvasItemById.get(dropPreview.targetId) || null;
        const targetTopic = targetTopicCandidate && isTopicCanvasItem(targetTopicCandidate) ? targetTopicCandidate : null;
        if (draggedTopic && targetTopic && draggedTopic.id !== targetTopic.id) {
          const newTopicId = `user-topic-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
          const nextAgendaId = dropPreview.agendaId || targetTopic.agenda_id || draggedTopic.agenda_id;
          const childIds = [
            ...new Set([
              ...getTopicFlattenedIdeaChildIds(canvasItems, targetTopic.id),
              ...getTopicFlattenedIdeaChildIds(canvasItems, draggedTopic.id),
            ]),
          ].filter((childId) => childId !== targetTopic.id && childId !== draggedTopic.id);
          const nextTopic: CanvasItemViewModel = {
            id: newTopicId,
            agenda_id: nextAgendaId,
            point_id: "",
            kind: "topic",
            status: "discussion",
            title: buildUserMergedTopicTitle(targetTopic, draggedTopic),
            body: [targetTopic.body, draggedTopic.body].filter(Boolean).join("\n") || "통합한 토픽의 내용을 정리해 주세요.",
            keywords: [...new Set([...(targetTopic.keywords || []), ...(draggedTopic.keywords || [])])].slice(0, 5),
            key_evidence: [],
            refined_utterances: [],
            evidence_utterance_ids: [
              ...new Set([...(targetTopic.evidence_utterance_ids || []), ...(draggedTopic.evidence_utterance_ids || [])]),
            ],
            ignored_utterance_ids: [
              ...new Set([...(targetTopic.ignored_utterance_ids || []), ...(draggedTopic.ignored_utterance_ids || [])]),
            ],
            merged_children: [],
            compacted_from_ids: [
              ...new Set([
                targetTopic.id,
                draggedTopic.id,
                ...(targetTopic.compacted_from_ids || []),
                ...(draggedTopic.compacted_from_ids || []),
                ...childIds,
              ]),
            ],
            compaction_level: Math.max(targetTopic.compaction_level || 0, draggedTopic.compaction_level || 0) + 1,
            parent_topic_id: "",
            parent_topic_source: "",
            parent_topic_locked: false,
            child_item_ids: childIds,
            topic_collapsed: false,
            created_by: "user",
            manual_position: false,
            ai_generated: sharedSyncEnabled,
            user_edited: !sharedSyncEnabled,
            ai_pending: sharedSyncEnabled,
            x: undefined,
            y: undefined,
          };
          const targetIndex = canvasItemIndexById.get(targetTopic.id) ?? canvasItems.length;
          const draggedIndex = canvasItemIndexById.get(draggedTopic.id) ?? canvasItems.length;
          const insertIndex = Math.max(0, Math.min(
            targetIndex >= 0 ? targetIndex : canvasItems.length,
            draggedIndex >= 0 ? draggedIndex : canvasItems.length,
          ));
          const removedTopicIds = new Set([
            targetTopic.id,
            draggedTopic.id,
            ...getTopicDescendantTopicIds(canvasItems, targetTopic.id),
            ...getTopicDescendantTopicIds(canvasItems, draggedTopic.id),
          ]);
          const childIdSet = new Set(childIds);
          const nextItems: CanvasItemViewModel[] = [];
          let insertedTopic = false;

          canvasItems.forEach((item, index) => {
            if (index === insertIndex && !insertedTopic) {
              nextItems.push(nextTopic);
              insertedTopic = true;
            }

            if (removedTopicIds.has(item.id)) {
              return;
            }

            if (childIdSet.has(item.id)) {
              nextItems.push({
                ...item,
                agenda_id: nextAgendaId,
                parent_topic_id: newTopicId,
                parent_topic_source: "user",
                parent_topic_locked: true,
                manual_position: false,
                x: undefined,
                y: undefined,
              });
              return;
            }

            if (isTopicCanvasItem(item)) {
              nextItems.push({
                ...item,
                child_item_ids: (item.child_item_ids || []).filter(
                  (id) => !childIdSet.has(id) && !removedTopicIds.has(id),
                ),
              });
              return;
            }

            nextItems.push(item);
          });

          if (!insertedTopic) {
            nextItems.push(nextTopic);
          }

          nextCanvasItemsSnapshot = nextItems;
          topicToExpandId = newTopicId;
          topicSummaryRefreshItemIds = [newTopicId];
          nextSelectedIdeationItemId = newTopicId;
          ideationMoveMessage = `"${targetTopic.title || "토픽"}"과 "${draggedTopic.title || "토픽"}"을 새 토픽으로 통합했습니다.`;
        }
      } else if (draggedItem && dropPreview?.mode === "topic-idea-merge") {
        const draggedTopic = isTopicCanvasItem(draggedItem) ? draggedItem : null;
        const targetItemCandidate = canvasItemById.get(dropPreview.targetId) || null;
        const targetItem = targetItemCandidate && !isTopicCanvasItem(targetItemCandidate) ? targetItemCandidate : null;
        if (draggedTopic && targetItem) {
          const newTopicId = `user-topic-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
          const nextAgendaId = dropPreview.agendaId || targetItem.agenda_id || draggedTopic.agenda_id;
          const removedTopicIds = new Set([
            draggedTopic.id,
            ...getTopicDescendantTopicIds(canvasItems, draggedTopic.id),
          ]);
          const childIds = [
            ...new Set([
              ...getTopicFlattenedIdeaChildIds(canvasItems, draggedTopic.id),
              targetItem.id,
            ]),
          ].filter((childId) => !removedTopicIds.has(childId));
          const childIdSet = new Set(childIds);
          const previousTargetParentTopicId =
            targetItem.parent_topic_id && targetItem.parent_topic_id !== draggedTopic.id
              ? targetItem.parent_topic_id
              : "";
          const previousParentRemainingChildIds = previousTargetParentTopicId
            ? getTopicFlattenedIdeaChildIds(canvasItems, previousTargetParentTopicId).filter(
                (childId) => !childIdSet.has(childId),
              )
            : [];
          const nextTopic: CanvasItemViewModel = {
            id: newTopicId,
            agenda_id: nextAgendaId,
            point_id: "",
            kind: "topic",
            status: "discussion",
            title: buildUserMergedTopicTitle(draggedTopic, targetItem),
            body: [draggedTopic.body, targetItem.body].filter(Boolean).join("\n") || "통합한 토픽의 내용을 정리해 주세요.",
            keywords: [...new Set([...(draggedTopic.keywords || []), ...(targetItem.keywords || [])])].slice(0, 5),
            key_evidence: [...new Set([...(draggedTopic.key_evidence || []), ...(targetItem.key_evidence || [])])].slice(0, 6),
            refined_utterances: [],
            evidence_utterance_ids: [
              ...new Set([...(draggedTopic.evidence_utterance_ids || []), ...(targetItem.evidence_utterance_ids || [])]),
            ],
            ignored_utterance_ids: [
              ...new Set([...(draggedTopic.ignored_utterance_ids || []), ...(targetItem.ignored_utterance_ids || [])]),
            ],
            merged_children: [],
            compacted_from_ids: [
              ...new Set([
                draggedTopic.id,
                targetItem.id,
                ...(draggedTopic.compacted_from_ids || []),
                ...(targetItem.compacted_from_ids || []),
                ...childIds,
              ]),
            ],
            compaction_level: Math.max(draggedTopic.compaction_level || 0, targetItem.compaction_level || 0) + 1,
            parent_topic_id: "",
            parent_topic_source: "",
            parent_topic_locked: false,
            child_item_ids: childIds,
            topic_collapsed: false,
            created_by: "user",
            manual_position: false,
            ai_generated: sharedSyncEnabled,
            user_edited: !sharedSyncEnabled,
            ai_pending: sharedSyncEnabled,
            x: undefined,
            y: undefined,
          };
          const targetIndex = canvasItemIndexById.get(targetItem.id) ?? canvasItems.length;
          const draggedIndex = canvasItemIndexById.get(draggedTopic.id) ?? canvasItems.length;
          const insertIndex = Math.max(0, Math.min(
            targetIndex >= 0 ? targetIndex : canvasItems.length,
            draggedIndex >= 0 ? draggedIndex : canvasItems.length,
          ));
          const nextItems: CanvasItemViewModel[] = [];
          let insertedTopic = false;

          canvasItems.forEach((item, index) => {
            if (index === insertIndex && !insertedTopic) {
              nextItems.push(nextTopic);
              insertedTopic = true;
            }

            if (removedTopicIds.has(item.id)) {
              return;
            }

            if (childIdSet.has(item.id)) {
              nextItems.push({
                ...item,
                agenda_id: nextAgendaId,
                parent_topic_id: newTopicId,
                parent_topic_source: "user",
                parent_topic_locked: true,
                manual_position: false,
                x: undefined,
                y: undefined,
              });
              return;
            }

            if (isTopicCanvasItem(item)) {
              const remainingChildIds = (item.child_item_ids || []).filter(
                (id) => !childIdSet.has(id) && !removedTopicIds.has(id),
              );
              nextItems.push({
                ...item,
                child_item_ids: remainingChildIds,
                ...(item.id === previousTargetParentTopicId && previousParentRemainingChildIds.length > 0 && sharedSyncEnabled
                  ? {
                      ai_pending: true,
                      ai_generated: true,
                      user_edited: false,
                    }
                  : {}),
              });
              return;
            }

            nextItems.push(item);
          });

          if (!insertedTopic) {
            nextItems.push(nextTopic);
          }

          nextCanvasItemsSnapshot = nextItems;
          topicToExpandId = newTopicId;
          topicSummaryRefreshItemIds = [
            newTopicId,
            ...(previousTargetParentTopicId && previousParentRemainingChildIds.length > 0
              ? [previousTargetParentTopicId]
              : []),
          ];
          nextSelectedIdeationItemId = newTopicId;
          ideationMoveMessage = `"${draggedTopic.title || "토픽"}"과 "${targetItem.title || "대상 노드"}"를 새 토픽으로 통합했습니다.`;
        }
      } else if (draggedItem && dropPreview?.mode === "topic") {
        const targetGroup = canvasItemById.get(dropPreview.targetId) || null;
        if (targetGroup && targetGroup.id !== draggedItem.id) {
          const nextAgendaId = targetGroup.agenda_id || draggedItem.agenda_id;
          nextCanvasItemsSnapshot = canvasItems.map((item) =>
            item.id === canvasItemId
              ? {
                  ...item,
                  agenda_id: nextAgendaId,
                  parent_topic_id: targetGroup.id,
                  parent_topic_source: "user",
                  parent_topic_locked: true,
                  manual_position: false,
                  x: undefined,
                  y: undefined,
                }
              : item.id === targetGroup.id
                ? {
                    ...item,
                    child_item_ids: [...new Set([...(item.child_item_ids || []), canvasItemId])],
                    ...(isTopicCanvasItem(item) && sharedSyncEnabled
                      ? {
                          ai_pending: true,
                          ai_generated: true,
                          user_edited: false,
                        }
                      : {}),
                  }
              : item.child_item_ids?.includes(canvasItemId)
                ? {
                    ...item,
                    child_item_ids: (item.child_item_ids || []).filter((id) => id !== canvasItemId),
                  }
                : item,
          );
          topicToExpandId = targetGroup.id;
          topicSummaryRefreshItemIds = isTopicCanvasItem(targetGroup) ? [targetGroup.id] : [];
          ideationMoveMessage = `"${draggedItem.title || "노드"}"를 "${targetGroup.title || "그룹"}"에 추가했습니다.`;
        }
      } else if (draggedItem && dropPreview?.mode === "merge") {
        const targetItemCandidate = canvasItemById.get(dropPreview.targetId) || null;
        const targetItem = targetItemCandidate && !isTopicCanvasItem(targetItemCandidate) ? targetItemCandidate : null;
        if (targetItem && targetItem.id !== draggedItem.id) {
          const newTopicId = `user-topic-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
          const nextAgendaId = dropPreview.agendaId || targetItem.agenda_id || draggedItem.agenda_id;
          const childIds = [...new Set([targetItem.id, draggedItem.id])];
          const nextTopic: CanvasItemViewModel = {
            id: newTopicId,
            agenda_id: nextAgendaId,
            point_id: "",
            kind: "topic",
            status: "discussion",
            title: buildUserMergedTopicTitle(targetItem, draggedItem),
            body: "사용자가 직접 묶은 토픽입니다. 필요하면 제목과 내용을 수정해 주세요.",
            keywords: [...new Set([...(targetItem.keywords || []), ...(draggedItem.keywords || [])])].slice(0, 5),
            key_evidence: [],
            refined_utterances: [],
            evidence_utterance_ids: [],
            ignored_utterance_ids: [],
            merged_children: [],
            compacted_from_ids: childIds,
            compaction_level: Math.max(targetItem.compaction_level || 0, draggedItem.compaction_level || 0) + 1,
            parent_topic_id: "",
            parent_topic_source: "",
            parent_topic_locked: false,
            child_item_ids: childIds,
            topic_collapsed: false,
            created_by: "user",
            manual_position: false,
            ai_generated: sharedSyncEnabled,
            user_edited: !sharedSyncEnabled,
            ai_pending: sharedSyncEnabled,
            x: undefined,
            y: undefined,
          };
          const targetIndex = canvasItemIndexById.get(targetItem.id) ?? canvasItems.length;
          const draggedIndex = canvasItemIndexById.get(draggedItem.id) ?? canvasItems.length;
          const insertIndex = Math.max(0, Math.min(
            targetIndex >= 0 ? targetIndex : canvasItems.length,
            draggedIndex >= 0 ? draggedIndex : canvasItems.length,
          ));
          const nextItems: CanvasItemViewModel[] = [];
          canvasItems.forEach((item, index) => {
            if (index === insertIndex) {
              nextItems.push(nextTopic);
            }

            if (childIds.includes(item.id)) {
              nextItems.push({
                ...item,
                agenda_id: nextAgendaId,
                parent_topic_id: newTopicId,
                parent_topic_source: "user",
                parent_topic_locked: true,
                manual_position: false,
                x: undefined,
                y: undefined,
              });
              return;
            }

            if (isTopicCanvasItem(item)) {
              nextItems.push({
                ...item,
                child_item_ids: (item.child_item_ids || []).filter((id) => !childIds.includes(id)),
              });
              return;
            }

            nextItems.push(item);
          });
          if (insertIndex >= canvasItems.length) {
            nextItems.push(nextTopic);
          }

          nextCanvasItemsSnapshot = nextItems;
          topicToExpandId = newTopicId;
          topicSummaryRefreshItemIds = [newTopicId];
          nextSelectedIdeationItemId = newTopicId;
          ideationMoveMessage = `"${targetItem.title || "대상 노드"}"와 "${draggedItem.title || "노드"}"를 새 토픽으로 묶었습니다.`;
        }
      } else if (draggedItem && dropPreview?.mode === "detach") {
        const nextAgendaId = dropPreview.agendaId || draggedItem.agenda_id;
        nextCanvasItemsSnapshot = canvasItems.map((item) =>
          item.id === canvasItemId
            ? {
                ...item,
                agenda_id: nextAgendaId,
                parent_topic_id: "",
                parent_topic_source: "",
                parent_topic_locked: false,
                manual_position: false,
                x: undefined,
                y: undefined,
              }
            : item.child_item_ids?.includes(canvasItemId)
              ? {
                  ...item,
                child_item_ids: (item.child_item_ids || []).filter((id) => id !== canvasItemId),
              }
            : item,
        );
        nextSelectedIdeationItemId = canvasItemId;
        ideationMoveMessage = `"${draggedItem.title || "노드"}"를 왼쪽 캔버스의 1차 노드로 추가했습니다.`;
      }

      const nextStagePositions = {
        ...(nextPositionsSnapshot.ideation || {}),
      };
      delete nextStagePositions[node.id];
      nextPositionsSnapshot = {
        ...nextPositionsSnapshot,
        ideation: nextStagePositions,
      };

      if (nextCanvasItemsSnapshot) {
        setCanvasItems(nextCanvasItemsSnapshot);
      }
      if (topicToExpandId) {
        setTopicCollapsedOverrides((current) => {
          if (current[topicToExpandId] === false) return current;
          const next = {
            ...current,
            [topicToExpandId]: false,
          };
          writeTopicCollapseOverrides(meetingId, userId, next);
          return next;
        });
      }
      if (ideationMoveMessage) {
        setSelectedCanvasItemId(nextSelectedIdeationItemId);
        setSelectedNodeId(`canvas-item-${nextSelectedIdeationItemId}`);
        setActivityMessage(ideationMoveMessage);
      }
    }

    if (stage === "problem-definition" && node.id.startsWith("problem-discussion-")) {
      const discussionId = node.id.slice("problem-discussion-".length);
      const sourceDropTarget = findProblemSourceDropTarget(event.clientX, event.clientY, node.id);
      if (sourceDropTarget?.groupId && sourceDropTarget.nodeId) {
        let movedDiscussion: ProblemDiscussionViewModel | null = null;
        nextProblemGroupsSnapshot = problemGroups.map((group) => {
          const remaining = (group.discussion_items || []).filter((item) => {
            if (item.id !== discussionId) return true;
            movedDiscussion = {
              ...item,
              parent_group_id: sourceDropTarget.groupId,
              target_node_id: sourceDropTarget.nodeId,
              target_node_label: sourceDropTarget.nodeLabel,
              target_node_kind: sourceDropTarget.nodeKind,
            };
            return false;
          });
          return {
            ...group,
            discussion_items: remaining,
          };
        }).map((group) =>
          group.group_id === sourceDropTarget.groupId && movedDiscussion
            ? {
                ...group,
                discussion_items: [
                  ...(group.discussion_items || []),
                  movedDiscussion,
                ],
              }
            : group,
        );

        const nextStagePositions = {
          ...(nextPositionsSnapshot["problem-definition"] || {}),
        };
        delete nextStagePositions[node.id];
        nextPositionsSnapshot = {
          ...nextPositionsSnapshot,
          "problem-definition": nextStagePositions,
        };

        setProblemGroups(nextProblemGroupsSnapshot);
        setSelectedProblemGroupId(sourceDropTarget.groupId);
        setSelectedProblemSourceNodeId(sourceDropTarget.nodeId);
        setSelectedNodeId(`problem-${sourceDropTarget.groupId}`);
        setLeftPanelTab("detail");
        setActivityMessage(`의견 노드를 "${sourceDropTarget.nodeLabel || "선택한 노드"}"의 속한 의견으로 추가했습니다.`);
      } else {
        const nextStagePositions = {
          ...(nextPositionsSnapshot["problem-definition"] || {}),
        };
        delete nextStagePositions[node.id];
        nextPositionsSnapshot = {
          ...nextPositionsSnapshot,
          "problem-definition": nextStagePositions,
        };
        setSelectedNodeId(node.id);
        setActivityMessage("의견 노드는 오른쪽 캔버스의 아이디어/맥락 카드 위에 놓을 때만 연결됩니다.");
      }
    }

    nextPositionsSnapshot = normalizeCanvasNodePositionsForComputedIdeation(nextPositionsSnapshot);
    liveNodePositionsRef.current = nextPositionsSnapshot;
    latestSharedWorkspaceRef.current = {
      ...latestSharedWorkspaceRef.current,
      stage,
      canvasItems: nextCanvasItemsSnapshot || canvasItems,
      problemGroups: nextProblemGroupsSnapshot || problemGroups,
      nodePositions: nextPositionsSnapshot,
      importedState: persistedSharedImportedState,
    };
    console.info("[canvas drag stop] computed position", {
      meetingId,
      stage,
      nodeId: node.id,
      position: nextPositionsSnapshot[stage]?.[node.id],
      nodePositions: summarizeNodePositionsForDebug(nextPositionsSnapshot),
      renderedNodes: summarizeRenderedNodesForDebug(nodes),
    });
    setNodePositions(nextPositionsSnapshot);

    if (sharedSyncEnabled) {
      if (meetingId) {
        writeSharedWorkspaceSessionCache(
          meetingId,
          buildFullWorkspacePatchPayload({
            meetingId,
            meetingGoal: meetingGoalDraft,
            meetingGoalContext: meetingGoalContextDraft,
            stage,
            agendaOverrides,
            canvasItems: nextCanvasItemsSnapshot || canvasItems,
            customGroups,
            problemGroups: nextProblemGroupsSnapshot || problemGroups,
            problemStructure: problemStructureStatePayload,
            solutionTopics,
            nodePositions: nextPositionsSnapshot,
            importedState: persistedSharedImportedState,
          }),
        );
      }
      if (nextCanvasItemsSnapshot || nextProblemGroupsSnapshot) {
        forceBroadcastSharedCanvas({
          canvasItems: nextCanvasItemsSnapshot || undefined,
          problemGroups: nextProblemGroupsSnapshot || undefined,
        });
      }
      broadcastNodePositionCommit(stage, node.id, nextPositionsSnapshot);
      if (meetingId) {
        const savePromise = saveCanvasWorkspacePatch({
          meeting_id: meetingId,
          stage,
          canvas_items: nextCanvasItemsSnapshot
            ? serializeSharedCanvasItems(nextCanvasItemsSnapshot)
            : undefined,
          problem_groups: nextProblemGroupsSnapshot
            ? serializeSharedProblemGroups(nextProblemGroupsSnapshot)
            : undefined,
          node_positions: nextPositionsSnapshot,
          imported_state: persistedSharedImportedState,
        });
        void savePromise.catch((error) => {
          console.error("Failed to save shared node positions:", error);
        });
        const uniqueTopicSummaryRefreshItemIds = [...new Set(topicSummaryRefreshItemIds.filter(Boolean))];
        if (uniqueTopicSummaryRefreshItemIds.length > 0) {
          void savePromise
            .then(() => {
              uniqueTopicSummaryRefreshItemIds.forEach((topicItemId) => {
                void refreshCanvasTopicSummary(topicItemId);
              });
            })
            .catch(() => undefined);
        }
      }
    }
  };

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

  const handleSetProblemGroupStatus = (status: ProblemGroupStatus) => {
    if (!selectedProblemGroup) return;

    setProblemGroups((prev) =>
      prev.map((group) =>
        group.group_id === selectedProblemGroup.group_id
          ? {
              ...group,
              status,
            }
          : group,
      ),
    );
    setActivityMessage(`문제 정의 그룹 상태를 ${problemGroupStatusLabel(status)}로 변경했습니다.`);
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

  const getEndingSolutionTopicsSnapshot = () =>
    latestSharedWorkspaceRef.current.solutionTopics.length > 0
      ? latestSharedWorkspaceRef.current.solutionTopics
      : solutionTopics;

  const getEndingFinalSummaryDocumentSnapshot = () => {
    const latestSummary = normalizeFinalSolutionSummaryPayload(latestSharedWorkspaceRef.current.finalSolutionSummary);
    if (latestSummary.markdown.trim() || (latestSummary.sections || []).length > 0 || latestSummary.final_count > 0) {
      return latestSummary;
    }
    return finalSummaryDocument;
  };

  const handleEndMeetingClick = async () => {
    await flushProblemDiscussionBuffer("stage-change");

    const endingSolutionTopics = getEndingSolutionTopicsSnapshot();
    const finalSolutionSummary = buildFinalSolutionSummaryPayload(
      endingSolutionTopics,
      getEndingFinalSummaryDocumentSnapshot(),
    );
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

    const endingSolutionTopics = getEndingSolutionTopicsSnapshot();
    if (meetingId) {
      const finalSolutionSummary = buildFinalSolutionSummaryPayload(
        endingSolutionTopics,
        finalSummarySnapshot,
      );
      try {
        await saveCanvasWorkspacePatch({
          meeting_id: meetingId,
          solution_topics: serializeSharedSolutionTopics(endingSolutionTopics),
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

  const onNodeDrag = (event: React.MouseEvent, node: Node) => {
    if (stage === "ideation" && node.id.startsWith("canvas-item-")) {
      event.stopPropagation();
      const stablePosition = getStableIdeationDragPosition(event, node);
      queueIdeationDragFrame({
        node,
        itemId: node.id.slice("canvas-item-".length),
        clientX: event.clientX,
        clientY: event.clientY,
        position: stablePosition,
      });
      return;
    }

    if (stage !== "problem-definition" || !node.id.startsWith("problem-discussion-")) {
      setProblemDropHighlight(null);
      ideationDropPreviewRef.current = null;
      setIdeationDropPreview(null);
      setIdeationDragGhost(null);
      return;
    }

    setProblemDropHighlight(findProblemSourceDropTarget(event.clientX, event.clientY, node.id));
  };

  const onNodeDragStart = (event: React.MouseEvent, node: Node) => {
    localDraggingNodeIdsRef.current.add(node.id);
    dragIdByNodeIdRef.current[node.id] =
      `${meetingId}:${userId}:${node.id}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    ideationDropPreviewRef.current = null;
    setIdeationDropPreview(null);
    cancelPendingIdeationDragFrame();
    ideationDropTargetElementsRef.current = [];

    if (stage === "ideation" && node.id.startsWith("canvas-item-")) {
      event.stopPropagation();
      ideationDropTargetElementsRef.current = collectIdeationDropTargetElements(node.id);
      setIdeationNodeDragActive(true);
      setIdeationDragGhost({
        itemId: node.id.slice("canvas-item-".length),
        x: event.clientX,
        y: event.clientY,
      });
      stableIdeationDragRef.current = {
        nodeId: node.id,
        anchor: {
          x: CANVAS_ITEM_NODE_WIDTH / 2,
          y: 64,
        },
      };
      const stablePosition = getStableIdeationDragPosition(event, node);
      setNodes((current) =>
        current.map((item) =>
          item.id === node.id
            ? {
                ...item,
                position: stablePosition,
              }
            : item,
        ),
      );
      agendaDragPreviewRef.current = null;
      setAgendaDragPreview(null);
      return;
    }

    stableIdeationDragRef.current = null;
    setIdeationNodeDragActive(false);
    setIdeationDragGhost(null);

    if (stage !== "ideation" || !node.id.startsWith("agenda-")) {
      agendaDragPreviewRef.current = null;
      setAgendaDragPreview(null);
      return;
    }

    const agendaId = node.id.slice("agenda-".length);
    const nextPreview = {
      agendaId,
      originPosition: nodePositions.ideation?.[node.id] || node.position,
    };
    agendaDragPreviewRef.current = nextPreview;
    setAgendaDragPreview(nextPreview);
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
  const problemSplitEdges = useMemo(() => {
    if (stage !== "problem-definition" || problemDefinitionPhase === "structure") {
      return { left: [] as Edge[], right: [] as Edge[] };
    }

    const problemGroupIds = new Set(problemGroups.map((group) => group.group_id));
    const childGroupsByParentId = new Map<string, ProblemGroupViewModel[]>();
    problemGroups.forEach((group) => {
      const parentId = group.parent_group_id || "";
      childGroupsByParentId.set(parentId, [...(childGroupsByParentId.get(parentId) || []), group]);
    });
    const rootProblemGroupCandidates = problemGroups.filter(
      (group) => !group.parent_group_id || !problemGroupIds.has(group.parent_group_id),
    );
    const rootProblemGroups = rootProblemGroupCandidates.length > 0 ? rootProblemGroupCandidates : problemGroups;
    const visibleProblemGroupIds = new Set<string>();
    const visitVisible = (group: ProblemGroupViewModel, trail = new Set<string>()) => {
      if (trail.has(group.group_id)) return;
      const nextTrail = new Set(trail);
      nextTrail.add(group.group_id);
      visibleProblemGroupIds.add(group.group_id);
      if (!collapsedProblemGroupIds.has(group.group_id)) {
        (childGroupsByParentId.get(group.group_id) || []).forEach((child) => {
          visitVisible(child, nextTrail);
        });
      }
    };
    rootProblemGroups.forEach((group) => {
      visitVisible(group);
    });

    const hierarchyEdges = problemGroups
      .filter(
        (group) =>
          Boolean(group.parent_group_id) &&
          problemGroupIds.has(group.parent_group_id || "") &&
          visibleProblemGroupIds.has(group.group_id) &&
          visibleProblemGroupIds.has(group.parent_group_id || ""),
      )
      .map((group): Edge => ({
        id: `problem-parent-edge::${group.parent_group_id}::${group.group_id}`,
        source: `problem-${group.parent_group_id}`,
        target: `problem-${group.group_id}`,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, color: "#a3a3a3" },
        interactionWidth: 0,
        selectable: false,
        style: { stroke: "#a3a3a3", strokeOpacity: 0.62, strokeWidth: 1.6 },
      }));
    const groupLinkEdges = problemGroups.flatMap((group) =>
      (group.linked_group_ids || [])
        .filter(
          (linkedGroupId) =>
            linkedGroupId !== group.group_id &&
            problemGroupIds.has(linkedGroupId) &&
            visibleProblemGroupIds.has(group.group_id) &&
            visibleProblemGroupIds.has(linkedGroupId),
        )
        .map((linkedGroupId): Edge => ({
          id: `problem-group-link::${group.group_id}::${linkedGroupId}`,
          source: `problem-${group.group_id}`,
          target: `problem-${linkedGroupId}`,
          type: "smoothstep",
          markerEnd: { type: MarkerType.ArrowClosed, color: "#a13ab8" },
          interactionWidth: 0,
          selectable: false,
          style: { stroke: "#a13ab8", strokeOpacity: 0.58, strokeWidth: 2, strokeDasharray: "5 5" },
        })),
    );

    return {
      left: [...hierarchyEdges, ...groupLinkEdges],
      right: [] as Edge[],
    };
  }, [collapsedProblemGroupIds, problemDefinitionPhase, problemGroups, stage]);
  const ideationDragGhostItem = useMemo(
    () =>
      ideationDragGhost
        ? canvasItemById.get(ideationDragGhost.itemId) || null
        : null,
    [canvasItemById, ideationDragGhost],
  );

  const linkPendingPersonalNoteToCanvasItem = (item: CanvasItemViewModel) => {
    if (!pendingPersonalNoteLinkId) return false;

    if (isTopicCanvasItem(item)) {
      setActivityMessage("토픽 내용은 열어두고, 연결할 아이디어 노드를 선택해 주세요.");
      return false;
    }

    if (pendingPersonalNoteLinkId === COMPOSER_PERSONAL_NOTE_LINK_ID) {
      setComposerAgendaId(item.agenda_id || composerAgendaId);
      setComposerLinkedCanvasItemId(item.id);
      setComposerLinkedCanvasItemTitle(item.title || "연결 아이디어");
      setPendingPersonalNoteLinkId("");
      setFocusedCanvasItemId(item.id);
      setSelectedCanvasItemId(item.id);
      setSelectedNodeId(`canvas-item-${item.id}`);
      setActivityMessage("작성 중인 개인 메모에 연결할 아이디어를 선택했습니다.");
      return true;
    }

    setPersonalNotes((prev) =>
      prev.map((note) =>
        note.id === pendingPersonalNoteLinkId
          ? {
              ...note,
              agendaId: item.agenda_id || note.agendaId,
              linkedCanvasItemId: item.id,
              linkedCanvasItemTitle: item.title || "연결 아이디어",
            }
          : note,
      ),
    );
    setPendingPersonalNoteLinkId("");
    setFocusedCanvasItemId(item.id);
    setSelectedCanvasItemId(item.id);
    setSelectedNodeId(`canvas-item-${item.id}`);
    setActivityMessage("개인 메모를 선택한 아이디어 노드에 연결했습니다.");
    return true;
  };

  const handleCreateProblemGroupLink = (sourceGroupId: string, targetGroupId: string) => {
    if (!sourceGroupId || !targetGroupId) return false;
    if (sourceGroupId === targetGroupId) {
      setPendingProblemGroupLinkId("");
      setActivityMessage("같은 문제정의 그룹에는 연결할 수 없습니다.");
      return true;
    }

    const sourceGroup = problemGroupById.get(sourceGroupId);
    const targetGroup = problemGroupById.get(targetGroupId);
    if (!sourceGroup || !targetGroup) {
      setPendingProblemGroupLinkId("");
      setActivityMessage("연결할 문제정의 그룹을 찾지 못했습니다.");
      return true;
    }

    if ((sourceGroup.linked_group_ids || []).includes(targetGroupId)) {
      setSelectedProblemGroupId(targetGroupId);
      setPendingProblemGroupLinkId("");
      setActivityMessage("이미 연결된 문제정의 그룹입니다.");
      return true;
    }

    const nextProblemGroups = problemGroups.map((group) =>
      group.group_id === sourceGroupId
        ? {
            ...group,
            linked_group_ids: [...new Set([...(group.linked_group_ids || []), targetGroupId])],
          }
        : group,
    );

    latestSharedWorkspaceRef.current = {
      ...latestSharedWorkspaceRef.current,
      stage,
      problemGroups: nextProblemGroups,
      importedState: persistedSharedImportedState,
    };
    setProblemGroups(nextProblemGroups);
    setSelectedProblemGroupId(targetGroupId);
    setSelectedProblemSourceNodeId("");
    setSelectedCanvasItemId("");
    setPendingProblemGroupLinkId("");
    setActivityMessage(`"${sourceGroup.topic}"와 "${targetGroup.topic}" 문제정의 그룹을 연결했습니다.`);

    if (sharedSyncEnabled) {
      if (meetingId) {
        writeSharedWorkspaceSessionCache(
          meetingId,
          buildFullWorkspacePatchPayload({
            meetingId,
            meetingGoal: meetingGoalDraft,
            meetingGoalContext: meetingGoalContextDraft,
            stage,
            agendaOverrides,
            canvasItems,
            customGroups,
            problemGroups: nextProblemGroups,
            problemStructure: problemStructureStatePayload,
            solutionTopics,
            nodePositions,
            importedState: persistedSharedImportedState,
          }),
        );
      }
      forceBroadcastSharedCanvas({
        problemGroups: nextProblemGroups,
      });
      if (meetingId) {
        void saveCanvasWorkspacePatch({
          meeting_id: meetingId,
          problem_groups: serializeSharedProblemGroups(nextProblemGroups),
          imported_state: persistedSharedImportedState,
        }).catch((error) => {
          console.error("Failed to save problem group link:", error);
        });
      }
    }

    return true;
  };

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
      if (
        armedCanvasTool &&
        stage === "ideation" &&
        (armedCanvasTool === "note" || armedCanvasTool === "comment") &&
        canvasItem &&
        !canvasItem.parent_topic_id
      ) {
        setActivityMessage("메모와 댓글은 오른쪽 상세 캔버스에서 추가해 주세요.");
        return;
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
    const problemSourceInfo = extractProblemSourceCanvasNodeInfo(node.id);
    const clickedProblemGroupId =
      node.id.startsWith("problem-") && !node.id.startsWith("problem-discussion-")
        ? node.id.slice("problem-".length)
        : "";
    if (pendingProblemGroupLinkId && clickedProblemGroupId) {
      handleCreateProblemGroupLink(pendingProblemGroupLinkId, clickedProblemGroupId);
      return;
    }
    if (problemSourceInfo) {
      setSelectedProblemGroupId(problemSourceInfo.groupId);
      setSelectedProblemSourceNodeId(problemSourceInfo.sourceNodeId);
      setSelectedCanvasItemId("");
      setEditingProblemGroupId("");
    } else if (node.id.startsWith("problem-discussion-")) {
      const discussionId = node.id.slice("problem-discussion-".length);
      const parentGroup = problemGroups.find((group) =>
        (group.discussion_items || []).some((item) => item.id === discussionId),
      );
      setSelectedProblemGroupId(parentGroup?.group_id || "");
      const discussion = parentGroup?.discussion_items?.find((item) => item.id === discussionId);
      setSelectedProblemSourceNodeId(discussion?.target_node_id || "");
      setSelectedCanvasItemId("");
      setEditingProblemGroupId("");
    } else if (clickedProblemGroupId) {
      setSelectedProblemGroupId(clickedProblemGroupId);
      setSelectedProblemSourceNodeId("");
      setSelectedCanvasItemId("");
      setEditingProblemGroupId("");
    }
    if (agendaId) {
      setSelectedAgendaId(agendaId);
    }
    if (armedCanvasTool) {
      void handleCanvasPlacementStart(
        armedCanvasTool,
        event.clientX,
        event.clientY,
        agendaId || selectedAgendaId || agendaModels[0]?.id,
        node.id,
      );
    }
  };

  const handleCanvasPaneClick = (
    event: React.MouseEvent,
    pane: "default" | "ideation-left" | "ideation-right" | "problem-left" | "problem-right" = "default",
  ) => {
    if (stage === "ideation" && pane === "ideation-right" && !armedCanvasTool) {
      return;
    }

    if (!armedCanvasTool) {
      closeRightDrawer();
      if (stage === "ideation" && pane === "ideation-left") {
        setSelectedCanvasItemId("");
        setSelectedNodeId("");
        setLeftPanelTab("detail");
      }
      return;
    }
    if (
      stage === "ideation" &&
      pane !== "ideation-right" &&
      (armedCanvasTool === "note" || armedCanvasTool === "comment")
    ) {
      setCanvasPlacementPreview(null);
      setActivityMessage("메모와 댓글은 오른쪽 상세 캔버스에서 추가해 주세요.");
      return;
    }
    setSelectedCanvasItemId("");
    void handleCanvasPlacementStart(
      armedCanvasTool,
      event.clientX,
      event.clientY,
      selectedAgendaId || agendaModels[0]?.id,
    );
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
    if (action === "debug-regenerate") {
      setArmedCanvasTool(null);
      setCanvasPlacementPreview(null);
      setPendingProblemGroupLinkId("");
      void handleDebugRegenerateProblemDefinition();
      return;
    }

    if (action === "debug-refresh-chunks") {
      setArmedCanvasTool(null);
      setCanvasPlacementPreview(null);
      setPendingProblemGroupLinkId("");
      void handleRefreshProblemChunkSummaries();
      return;
    }

    if (action === "structure-start") {
      setArmedCanvasTool(null);
      setCanvasPlacementPreview(null);
      setPendingProblemGroupLinkId("");
      handleOpenProblemStructureSetup();
      return;
    }

    if (action === "structure-back") {
      setArmedCanvasTool(null);
      setCanvasPlacementPreview(null);
      setPendingProblemGroupLinkId("");
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
      return;
    }

    if (action === "problem-link") {
      setArmedCanvasTool(null);
      setCanvasPlacementPreview(null);
      if (pendingProblemGroupLinkId) {
        setPendingProblemGroupLinkId("");
        setActivityMessage("문제정의 그룹 연결을 취소했습니다.");
        return;
      }
      if (!selectedProblemGroup) {
        setActivityMessage("먼저 왼쪽 캔버스에서 연결을 시작할 문제정의 그룹을 선택해 주세요.");
        return;
      }
      setPendingProblemGroupLinkId(selectedProblemGroup.group_id);
      setActivityMessage("연결할 다른 문제정의 그룹을 왼쪽 캔버스에서 클릭해 주세요.");
      return;
    }

    if (action === "adopt") {
      setArmedCanvasTool(null);
      setCanvasPlacementPreview(null);
      setPendingProblemGroupLinkId("");
      if (!selectedProblemGroup) {
        setActivityMessage("채택할 문제정의 그룹을 먼저 선택해 주세요.");
        return;
      }
      handleSetProblemGroupStatus("final");
      return;
    }

    armCanvasTool(action);
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
            summaryEligibleStructureGroups={summaryEligibleStructureGroups}
            summaryDocumentSectionByGroupId={summaryDocumentSectionByGroupId}
            problemStructureNodeById={problemStructureNodeById}
            summaryEvidenceOpenGroupIds={summaryEvidenceOpenGroupIds}
            remoteEditPresenceByKey={remoteEditPresenceByKey}
            summaryDocumentEditMode={summaryDocumentEditMode}
            solutionStagePending={solutionStagePending}
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
            canUseCanvasToolbar={canUseCanvasToolbar}
            showClickWaiting={Boolean(armedCanvasTool || pendingProblemGroupLinkId)}
            hasSelectedProblemGroup={Boolean(selectedProblemGroup)}
            pendingProblemGroupLinkId={pendingProblemGroupLinkId}
            selectedProblemStatus={selectedProblemGroup?.status || ""}
            placementFeedback={placementFeedback}
            canvasPlacementPreview={canvasPlacementPreview}
            problemIdeaDrag={problemIdeaDrag}
            problemIdeaDragPoint={problemIdeaDragPoint}
            ideationDragGhost={ideationDragGhost}
            ideationDragGhostContent={
              ideationDragGhost && ideationDragGhostItem
                ? makeIdeationDragGhostLabel(
                    ideationDragGhostItem,
                    ideationDropPreview?.mode === "detach"
                      ? "왼쪽에 추가"
                      : ideationDropPreview?.mode === "topic"
                        ? "토픽으로 이동"
                        : "이동 중",
                  )
                : null
            }
            onCanvasMouseMove={(event) => {
              if (!armedCanvasTool) {
                return;
              }
              updateCanvasPlacementPreview(event.clientX, event.clientY);
            }}
            onCanvasMouseLeave={clearCanvasPlacementPreview}
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
