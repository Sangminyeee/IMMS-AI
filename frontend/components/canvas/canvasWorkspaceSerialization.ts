import type { Node } from "@xyflow/react";
import { createDefaultProblemStructureState } from "@/components/canvas/problemStructureModel";
import { buildFinalSolutionSummaryPayload } from "@/components/canvas/summaryDocumentHelpers";
import { normalizeCanvasArtifactGeneration } from "@/components/canvas/canvasArtifactGeneration";
import type {
  CanvasArtifactGenerationMap,
  CanvasCustomGroup,
  CanvasFinalSolutionSummary,
  CanvasIdeationBubbleGraph,
  CanvasLocalState,
  CanvasNodePositionsByStage,
  CanvasProblemDefinitionGroup,
  CanvasProblemStructureState,
  CanvasRefinedUtterance,
  CanvasWorkspaceItem,
  MeetingState,
} from "@/lib/types";

export type CanvasWorkspaceStage = "ideation" | "problem-definition" | "solution";

export type AgendaOverride = {
  title?: string;
  keywords?: string[];
  summaryBullets?: string[];
};

export type WorkspaceFieldSignatures = {
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
  artifact_generation: string;
  ideation_bubble_graph: string;
  imported_state: string;
};

export type FullWorkspacePatchPayloadInput = {
  meetingId: string;
  meetingGoal: string;
  meetingGoalContext: string;
  stage: CanvasWorkspaceStage;
  agendaOverrides: Record<string, AgendaOverride>;
  canvasItems: CanvasWorkspaceItem[];
  customGroups: CanvasCustomGroup[];
  problemGroups: Array<CanvasProblemDefinitionGroup & { status?: string }>;
  problemStructure?: CanvasProblemStructureState;
  finalSolutionSummary?: CanvasFinalSolutionSummary;
  nodePositions: CanvasNodePositionsByStage;
  artifactGeneration?: CanvasArtifactGenerationMap;
  ideationBubbleGraph?: CanvasIdeationBubbleGraph;
  importedState: MeetingState | null;
};

export type FullWorkspacePatchPayloadOverrides = Partial<Omit<FullWorkspacePatchPayloadInput, "meetingId">>;

const CANVAS_WORKSPACE_STAGES: CanvasWorkspaceStage[] = ["ideation", "problem-definition", "solution"];

type CanvasItemStatus = "discussion" | "confirmed" | "closed";

type CanvasPersonalNotePayloadSource = {
  id: string;
  projectId: string;
  agendaId: string;
  linkedCanvasItemId?: string;
  linkedCanvasItemTitle?: string;
  kind: string;
  title: string;
  body: string;
};

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

export function createWorkspaceFieldSignatures(): WorkspaceFieldSignatures {
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
    artifact_generation: "",
    ideation_bubble_graph: "",
    imported_state: "",
  };
}

export function normalizeRefinedUtterances(
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

export function normalizeCanvasItemStatus(raw: string | undefined): CanvasItemStatus {
  if (raw === "confirmed" || raw === "final") return "confirmed";
  if (raw === "closed") return "closed";
  return "discussion";
}

export function normalizeIdeationSuggestionStatus(raw: string | undefined) {
  if (raw === "selected" || raw === "dismissed") return raw;
  return "draft";
}

export function buildWorkspaceProblemGroupsPayload(groups: Array<CanvasProblemDefinitionGroup & { status?: string }>) {
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

export function buildWorkspaceCanvasItemsPayload(items: CanvasWorkspaceItem[]): CanvasWorkspaceItem[] {
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

export function serializeSharedCanvasItems(items: CanvasWorkspaceItem[]) {
  return buildWorkspaceCanvasItemsPayload(items);
}

export function serializeCustomGroups(groups: CanvasCustomGroup[]) {
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

export function serializeAgendaOverrides(overrides: Record<string, AgendaOverride>) {
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

export function normalizeCanvasNodePositionsForComputedIdeation(
  positions: CanvasNodePositionsByStage | undefined,
): CanvasNodePositionsByStage {
  if (!positions) return {};

  const normalized: CanvasNodePositionsByStage = {};
  CANVAS_WORKSPACE_STAGES.forEach((stageKey) => {
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

export function createEmptyIdeationBubbleGraph(): CanvasIdeationBubbleGraph {
  return {
    version: 1,
    update_cycle: 0,
    bubbles: [],
    processed_utterance_ids: [],
    updated_at: "",
  };
}

export function normalizeIdeationBubbleGraphForWorkspace(
  graph: CanvasIdeationBubbleGraph | null | undefined,
): CanvasIdeationBubbleGraph {
  if (!graph || typeof graph !== "object") {
    return createEmptyIdeationBubbleGraph();
  }
  return {
    version: Number(graph.version || 1),
    update_cycle: Number(graph.update_cycle || 0),
    layout_revision: Number(graph.layout_revision || 0),
    bubbles: Array.isArray(graph.bubbles) ? graph.bubbles : [],
    processed_utterance_ids: Array.isArray(graph.processed_utterance_ids)
      ? graph.processed_utterance_ids.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [],
    updated_at: graph.updated_at || "",
  };
}

export function buildWorkspaceFieldSignatures(input: {
  meetingGoal: string;
  meetingGoalContext: string;
  stage: CanvasWorkspaceStage;
  agendaOverrides: Record<string, AgendaOverride>;
  canvasItems: CanvasWorkspaceItem[];
  customGroups: CanvasCustomGroup[];
  problemGroups: Array<CanvasProblemDefinitionGroup & { status?: string }>;
  problemStructure?: CanvasProblemStructureState;
  finalSolutionSummary?: CanvasFinalSolutionSummary;
  nodePositions: CanvasNodePositionsByStage;
  artifactGeneration?: CanvasArtifactGenerationMap;
  ideationBubbleGraph?: CanvasIdeationBubbleGraph;
  importedState: MeetingState | null;
}): WorkspaceFieldSignatures {
  const ideationBubbleGraph = normalizeIdeationBubbleGraphForWorkspace(input.ideationBubbleGraph);
  const artifactGeneration = normalizeCanvasArtifactGeneration(input.artifactGeneration);
  return {
    meeting_goal: input.meetingGoal.trim(),
    meeting_goal_context: input.meetingGoalContext.trim(),
    stage: input.stage,
    agenda_overrides: JSON.stringify(serializeAgendaOverrides(input.agendaOverrides)),
    canvas_items: JSON.stringify(buildWorkspaceCanvasItemsPayload(input.canvasItems)),
    custom_groups: JSON.stringify(serializeCustomGroups(input.customGroups)),
    problem_groups: JSON.stringify(buildWorkspaceProblemGroupsPayload(input.problemGroups)),
    problem_structure: JSON.stringify(input.problemStructure || createDefaultProblemStructureState()),
    solution_topics: JSON.stringify([]),
    final_solution_summary: JSON.stringify(buildFinalSolutionSummaryPayload(input.finalSolutionSummary)),
    node_positions: JSON.stringify(normalizeCanvasNodePositionsForComputedIdeation(input.nodePositions)),
    artifact_generation: JSON.stringify(artifactGeneration),
    ideation_bubble_graph: JSON.stringify(ideationBubbleGraph),
    imported_state: JSON.stringify(input.importedState || null),
  };
}

export function buildFullWorkspacePatchPayload(input: FullWorkspacePatchPayloadInput) {
  return {
    meeting_id: input.meetingId,
    meeting_goal: input.meetingGoal.trim(),
    meeting_goal_context: input.meetingGoalContext.trim(),
    stage: input.stage,
    agenda_overrides: serializeAgendaOverrides(input.agendaOverrides),
    canvas_items: serializeSharedCanvasItems(input.canvasItems),
    custom_groups: serializeCustomGroups(input.customGroups),
    problem_groups: buildWorkspaceProblemGroupsPayload(input.problemGroups),
    problem_structure: input.problemStructure || createDefaultProblemStructureState(),
    solution_topics: [],
    final_solution_summary: buildFinalSolutionSummaryPayload(input.finalSolutionSummary),
    node_positions: normalizeCanvasNodePositionsForComputedIdeation(input.nodePositions),
    artifact_generation: normalizeCanvasArtifactGeneration(input.artifactGeneration),
    ideation_bubble_graph: normalizeIdeationBubbleGraphForWorkspace(input.ideationBubbleGraph),
    imported_state: input.importedState,
  };
}

export function buildSharedCanvasSignature(payload: {
  meeting_goal?: string;
  meeting_goal_context?: string;
  stage: CanvasWorkspaceStage;
  agenda_overrides: Record<string, unknown>;
  canvas_items?: unknown[];
  custom_groups?: unknown[];
  problem_groups?: unknown[];
  problem_structure?: unknown;
  solution_topics?: unknown[];
  final_solution_summary?: unknown;
  node_positions?: CanvasNodePositionsByStage;
  artifact_generation?: CanvasArtifactGenerationMap;
  ideation_bubble_graph?: CanvasIdeationBubbleGraph;
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
    artifact_generation: normalizeCanvasArtifactGeneration(payload.artifact_generation),
    ideation_bubble_graph: normalizeIdeationBubbleGraphForWorkspace(payload.ideation_bubble_graph),
    imported_state: payload.imported_state,
  });
}

function getSharedWorkspaceSessionStorageKey(meetingId: string) {
  return `imms:canvas-shared-workspace:${meetingId}`;
}

export function writeSharedWorkspaceSessionCache(
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

export function readSharedWorkspaceSessionCache(
  meetingId: string,
): Partial<ReturnType<typeof buildFullWorkspacePatchPayload>> | null {
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

export function readTopicCollapseOverrides(meetingId: string, userId: string): Record<string, boolean> {
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

export function writeTopicCollapseOverrides(meetingId: string, userId: string, overrides: Record<string, boolean>) {
  if (typeof window === "undefined" || !meetingId) return;
  try {
    window.localStorage.setItem(getTopicCollapseStorageKey(meetingId, userId), JSON.stringify(overrides));
  } catch {
    // ignore localStorage errors
  }
}

export function summarizeNodePositionsForDebug(nodePositions: CanvasNodePositionsByStage) {
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

export function summarizeRenderedNodesForDebug(nodes: Node[]) {
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

export function buildCanvasPersonalNotesPayload(
  meetingId: string,
  userId: string,
  personalNotes: CanvasPersonalNotePayloadSource[],
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

export function buildMeetingStateSignature(state: MeetingState | null) {
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
