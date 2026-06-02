export interface TranscriptUtterance {
  speaker: string;
  text: string;
  timestamp: string;
}

export interface AgendaItem {
  title: string;
  status: "PROPOSED" | "ACTIVE" | "CLOSING" | "CLOSED";
}
export interface LlmStatus {
  provider: string;
  model: string;
  base_url: string;
  mode: "mock" | "live";
  api_key_present: boolean;
  connected: boolean;
  note: string;
  request_count?: number;
  success_count?: number;
  error_count?: number;
  last_operation?: string;
  last_request_at?: string;
  last_success_at?: string;
  last_error?: string;
  last_error_at?: string;
  last_raw_preview?: string;
  last_finish_reason?: string;
}

export interface AgendaActionReason {
  turn_id?: number;
  speaker: string;
  timestamp: string;
  quote: string;
  why: string;
}

export interface AgendaActionItemDetail {
  item: string;
  owner: string;
  due: string;
  reasons: AgendaActionReason[];
}

export interface AgendaDecisionDetail {
  opinions: string[];
  conclusion: string;
}

export interface AgendaOutcomeDetail {
  agenda_id?: string;
  agenda_title: string;
  agenda_state?: string;
  flow_type?: string;
  key_utterances: string[];
  agenda_summary_items?: string[];
  summary: string;
  summary_references?: AgendaActionReason[];
  agenda_keywords: string[];
  opinion_groups?: Array<{
    type?: "proposal" | "concern" | "question" | "agree" | "disagree" | "info" | string;
    summary?: string;
    evidence_turn_ids?: number[];
  }>;
  decision_results: AgendaDecisionDetail[];
  action_items: AgendaActionItemDetail[];
  start_turn_id?: number;
  end_turn_id?: number;
}

export interface AnalysisOutput {
  agenda: {
    active: { title: string; confidence: number };
    candidates: Array<{ title: string; confidence: number }>;
  };
  agenda_outcomes: AgendaOutcomeDetail[];
  evidence_gate: {
    claims: Array<{ claim: string; verifiability: number; note: string }>;
  };
}

export interface MeetingState {
  meeting_goal: string;
  initial_context: string;
  window_size: number;
  transcript: TranscriptUtterance[];
  agenda_stack: AgendaItem[];
  llm_enabled?: boolean;
  llm_status?: LlmStatus;
  llm_io_logs?: Array<{
    seq?: number;
    at?: string;
    direction?: "request" | "response" | "error" | string;
    stage?: string;
    payload?: string;
    meta?: Record<string, unknown>;
  }>;
  replay?: {
    queued_total?: number;
    queued_cursor?: number;
    queued_remaining?: number;
    done?: boolean;
    source?: string;
    loaded_at?: string;
  };
  analysis_runtime?: {
    tick_mode?: "full_context" | "full_document" | "windowed";
    transcript_count?: number;
    llm_window_turns?: number;
    engine_window_turns?: number;
    control_plane_source?: string;
    control_plane_reason?: string;
    used_local_fallback?: boolean;
    title_refine_attempts?: number;
    title_refine_success?: number;
    last_llm_json_available?: boolean;
    last_llm_json_at?: string;
    llm_io_count?: number;
    analysis_worker?: {
      inflight?: boolean;
      queued?: number;
      queued_logical?: number;
      queued_observed?: number;
      last_enqueued_id?: number;
      last_started_id?: number;
      last_done_id?: number;
      last_enqueued_at?: string;
      last_started_at?: string;
      last_done_at?: string;
      last_error?: string;
    };
  };
  analysis: AnalysisOutput | null;
}

export interface CanvasProblemDefinitionGroup {
  group_id: string;
  parent_group_id?: string;
  depth?: number;
  topic: string;
  insight_lens?: string;
  insight_user_edited?: boolean;
  keywords: string[];
  agenda_ids: string[];
  agenda_titles: string[];
  ideas: Array<{
    id: string;
    kind: string;
    title: string;
    body: string;
  }>;
  discussion_items?: CanvasProblemDiscussionItem[];
  linked_group_ids?: string[];
  evidence_utterance_ids?: string[];
  source_summary_items: string[];
  conclusion: string;
  conclusion_user_edited?: boolean;
  source_signature?: string;
  source_agenda_signatures?: Record<string, string>;
  source_idea_signatures?: Record<string, string>;
}

export interface CanvasProblemDiscussionItem {
  id: string;
  parent_group_id: string;
  target_node_id?: string;
  target_node_label?: string;
  target_node_kind?: "topic" | "idea" | string;
  title: string;
  body: string;
  keywords?: string[];
  key_evidence?: string[];
  refined_utterances?: CanvasRefinedUtterance[];
  evidence_utterance_ids?: string[];
  ignored_utterance_ids?: string[];
  ai_pending?: boolean;
  ai_generated?: boolean;
  user_edited?: boolean;
  created_by?: "ai" | "user" | "";
  created_at?: string;
}

export interface CanvasProblemTaxonomyResponse {
  ok: boolean;
  used_llm: boolean;
  warning?: string;
  generated_at: string;
  groups: CanvasProblemDefinitionGroup[];
  problem_structure?: CanvasProblemStructureState;
  demo_balance_classification?: CanvasDemoBalanceClassification;
}

export interface CanvasPersonalNote {
  id: string;
  project_id?: string;
  agenda_id: string;
  linked_canvas_item_id?: string;
  linked_canvas_item_title?: string;
  kind: string;
  title: string;
  body: string;
}

export interface CanvasProblemGroupingRationaleResponse {
  ok: boolean;
  used_llm: boolean;
  warning?: string;
  generated_at: string;
  group_id: string;
  rationale: string;
  basis_items: string[];
}

export interface CanvasProblemStructureGroup {
  id: string;
  title: string;
  node_ids: string[];
  rationale: string;
  status?: "draft" | "review" | "final" | string;
  created_by?: "ai" | "user" | string;
}

export interface CanvasProblemStructureNode {
  id: string;
  source_group_id?: string;
  title: string;
  body: string;
  status?: string;
  depth?: number;
}

export interface CanvasProblemStructureState {
  phase: "explore" | "structure" | string;
  method: "affinity" | "card-sorting" | string;
  mode?: "" | "manual" | "ai" | string;
  revision?: number;
  source_generation_id?: string;
  based_on_transcript_revision?: number;
  updated_at?: string;
  nodes: CanvasProblemStructureNode[];
  groups: CanvasProblemStructureGroup[];
}

export interface CanvasProblemStructureResponse {
  ok: boolean;
  used_llm: boolean;
  warning?: string;
  generated_at: string;
  groups: CanvasProblemStructureGroup[];
}

export interface CanvasIdeationSuggestion {
  id: string;
  text: string;
  status?: "draft" | "selected" | "dismissed" | string;
}

export interface CanvasWorkspaceItem {
  id: string;
  agenda_id: string;
  point_id?: string;
  kind: string;
  status?: "discussion" | "confirmed" | "closed" | string;
  title: string;
  body: string;
  keywords?: string[];
  key_evidence?: string[];
  refined_utterances?: CanvasRefinedUtterance[];
  evidence_utterance_ids?: string[];
  ignored_utterance_ids?: string[];
  merged_children?: CanvasWorkspaceItem[];
  compacted_from_ids?: string[];
  compaction_level?: number;
  parent_topic_id?: string;
  parent_topic_source?: "ai" | "user" | "";
  parent_topic_locked?: boolean;
  child_item_ids?: string[];
  topic_collapsed?: boolean;
  created_by?: "ai" | "user" | "";
  manual_position?: boolean;
  ai_generated?: boolean;
  user_edited?: boolean;
  ai_pending?: boolean;
  ai_suggestions?: CanvasIdeationSuggestion[];
  x?: number;
  y?: number;
}

export interface CanvasRefinedUtterance {
  utterance_id: string;
  speaker: string;
  text: string;
  timestamp?: string;
}

export interface CanvasIdeaAssimilationUtterance {
  id: string;
  speaker: string;
  text: string;
  timestamp: string;
}

export interface CanvasCustomGroup {
  id: string;
  title: string;
  description?: string;
  keywords?: string[];
  color?: string;
  created_by?: string;
  created_at?: string;
}

export interface CanvasWorkspaceProblemGroup {
  group_id: string;
  parent_group_id?: string;
  depth?: number;
  topic: string;
  insight_lens?: string;
  insight_user_edited?: boolean;
  keywords: string[];
  agenda_ids: string[];
  agenda_titles: string[];
  ideas: Array<{
    id: string;
    kind: string;
    title: string;
    body: string;
  }>;
  discussion_items?: CanvasProblemDiscussionItem[];
  linked_group_ids?: string[];
  evidence_utterance_ids?: string[];
  source_summary_items: string[];
  conclusion: string;
  conclusion_user_edited?: boolean;
  status?: "draft" | "review" | "final" | string;
  source_signature?: string;
  source_agenda_signatures?: Record<string, string>;
  source_idea_signatures?: Record<string, string>;
}

export interface CanvasNodePosition {
  x: number;
  y: number;
}

export interface CanvasNodePositionsByStage {
  ideation?: Record<string, CanvasNodePosition>;
  "problem-definition"?: Record<string, CanvasNodePosition>;
  solution?: Record<string, CanvasNodePosition>;
}

export type CanvasArtifactGenerationStatus = "idle" | "generating" | "ready" | "failed";

export type CanvasArtifactGenerationKey =
  | "problem-definition:explore"
  | "problem-definition:structure"
  | "solution:summary";

export interface CanvasArtifactGenerationState {
  artifact_key: CanvasArtifactGenerationKey | string;
  status: CanvasArtifactGenerationStatus | string;
  generation_id?: string;
  started_by?: string;
  started_at?: string;
  updated_at?: string;
  finished_at?: string;
  error?: string;
  version?: number;
  input_transcript_revision?: number;
}

export type CanvasArtifactGenerationMap = Record<string, CanvasArtifactGenerationState>;

export interface CanvasWorkspaceStateResponse {
  ok: boolean;
  meeting_id: string;
  meeting_goal?: string;
  meeting_goal_context?: string;
  demo_config?: CanvasDemoConfig;
  demo_balance_classification?: CanvasDemoBalanceClassification;
  stage: "ideation" | "problem-definition" | "solution";
  agenda_overrides?: Record<
    string,
    {
      title?: string;
      keywords?: string[];
      summaryBullets?: string[];
    }
  >;
  canvas_items: CanvasWorkspaceItem[];
  custom_groups?: CanvasCustomGroup[];
  problem_groups: CanvasWorkspaceProblemGroup[];
  problem_structure?: CanvasProblemStructureState;
  solution_topics: CanvasSolutionTopicResponse[];
  final_solution_summary?: CanvasFinalSolutionSummary;
  node_positions?: CanvasNodePositionsByStage;
  artifact_generation?: CanvasArtifactGenerationMap;
  ideation_bubble_graph?: CanvasIdeationBubbleGraph;
  idea_create_stack?: number;
  idea_processed_utterance_ids?: string[];
  problem_processed_utterance_ids?: string[];
  imported_state?: MeetingState | null;
  saved_at?: string;
}

export interface CanvasWorkspacePatchRequest {
  meeting_id: string;
  meeting_goal?: string;
  meeting_goal_context?: string;
  demo_config?: CanvasDemoConfig;
  demo_balance_classification?: CanvasDemoBalanceClassification;
  stage?: "ideation" | "problem-definition" | "solution";
  agenda_overrides?: Record<
    string,
    {
      title?: string;
      keywords?: string[];
      summaryBullets?: string[];
    }
  >;
  canvas_items?: CanvasWorkspaceItem[];
  custom_groups?: CanvasCustomGroup[];
  problem_groups?: CanvasWorkspaceProblemGroup[];
  problem_structure?: CanvasProblemStructureState;
  solution_topics?: CanvasSolutionTopicResponse[];
  final_solution_summary?: CanvasFinalSolutionSummary;
  node_positions?: CanvasNodePositionsByStage;
  artifact_generation?: CanvasArtifactGenerationMap;
  ideation_bubble_graph?: CanvasIdeationBubbleGraph;
  imported_state?: MeetingState | null;
  llm_cache_reset_prefixes?: string[];
}

export interface CanvasFinalReportShareResponse {
  ok: boolean;
  meeting_id: string;
  token: string;
  created_at?: string;
  saved_at?: string;
}

export interface PublicFinalReportResponse {
  ok: boolean;
  meeting_id: string;
  markdown: string;
  document_blocks?: CanvasSummaryDocumentBlock[];
  document_status?: string;
  generated_at?: string;
  created_at?: string;
  saved_at?: string;
}

export interface CanvasLocalState {
  shared_sync_enabled?: boolean;
  meeting_goal?: string;
  meeting_goal_context?: string;
  demo_config?: CanvasDemoConfig;
  demo_balance_classification?: CanvasDemoBalanceClassification;
  agenda_overrides?: Record<
    string,
    {
      title?: string;
      keywords?: string[];
      summaryBullets?: string[];
    }
  >;
  canvas_items?: CanvasWorkspaceItem[];
  custom_groups?: CanvasCustomGroup[];
  stage?: "ideation" | "problem-definition" | "solution";
  problem_groups?: CanvasWorkspaceProblemGroup[];
  problem_structure?: CanvasProblemStructureState;
  solution_topics?: CanvasSolutionTopicResponse[];
  final_solution_summary?: CanvasFinalSolutionSummary;
  node_positions?: CanvasNodePositionsByStage;
  artifact_generation?: CanvasArtifactGenerationMap;
  ideation_bubble_graph?: CanvasIdeationBubbleGraph;
  imported_state?: MeetingState | null;
  import_override_active?: boolean;
}

export interface CanvasPersonalNotesStateResponse {
  ok: boolean;
  meeting_id: string;
  user_id: string;
  personal_notes: CanvasPersonalNote[];
  local_canvas_state?: CanvasLocalState | null;
  saved_at?: string;
}

export interface CanvasRealtimeSyncPayload {
  sync_id: string;
  meeting_id: string;
  sync_scope?:
    | "full"
    | "node_positions"
    | "artifact_generation"
    | "ideation_bubble_graph"
    | "problem_groups"
    | "problem_structure"
    | "summary_document";
  meeting_goal?: string;
  meeting_goal_context?: string;
  demo_config?: CanvasDemoConfig;
  demo_balance_classification?: CanvasDemoBalanceClassification;
  updated_by: string;
  updated_at: string;
  stage: "ideation" | "problem-definition" | "solution";
  agenda_overrides?: Record<
    string,
    {
      title?: string;
      keywords?: string[];
      summaryBullets?: string[];
    }
  >;
  canvas_items?: CanvasWorkspaceItem[];
  custom_groups?: CanvasCustomGroup[];
  problem_groups?: CanvasWorkspaceProblemGroup[];
  problem_structure?: CanvasProblemStructureState;
  solution_topics?: CanvasSolutionTopicResponse[];
  final_solution_summary?: CanvasFinalSolutionSummary;
  node_positions?: CanvasNodePositionsByStage;
  artifact_generation?: CanvasArtifactGenerationMap;
  ideation_bubble_graph?: CanvasIdeationBubbleGraph;
  imported_state?: MeetingState | null;
}

export interface CanvasDemoConfig {
  enabled?: boolean;
  mode?: "normal" | "demo_balance" | string;
  option_a?: string;
  option_b?: string;
  instruction?: string;
}

export interface CanvasDemoBalanceOpinion {
  id?: string;
  utterance_id?: string;
  choice?: "a" | "b" | "unclassified" | string;
  valid?: boolean;
  confidence?: number;
  reason_summary?: string;
  keywords?: string[];
  text?: string;
}

export interface CanvasDemoBalanceClassification {
  version?: number;
  mode?: "demo_balance" | string;
  option_a?: string;
  option_b?: string;
  classified_at?: string;
  source_signature?: string;
  valid_a_count?: number;
  valid_b_count?: number;
  unclassified_count?: number;
  opinions?: CanvasDemoBalanceOpinion[];
  summary?: {
    option_a_summary?: string;
    option_b_summary?: string;
    unclassified_summary?: string;
  };
}

export interface CanvasEditPresencePayload {
  meeting_id: string;
  target_type:
    | "agenda"
    | "canvas_item"
    | "problem_group"
    | "problem_structure_group"
    | "problem_structure_node"
    | "solution_topic"
    | "solution_note"
    | "summary_document";
  target_id: string;
  note_id?: string;
  status: "start" | "stop";
  updated_by: string;
  updated_at: string;
}

export interface CanvasNodePreviewPayload {
  meeting_id: string;
  stage: "ideation" | "problem-definition" | "solution";
  node_id: string;
  x: number;
  y: number;
  updated_by: string;
  updated_at: string;
  drag_id: string;
  client_seq: number;
}

export interface CanvasFinalSolutionSummaryItem {
  id: string;
  topic_id: string;
  topic_no: number;
  topic_title: string;
  problem_topic: string;
  problem_conclusion: string;
  solution_conclusion: string;
  note_id: string;
  note_text: string;
  final_comment: string;
  source: "ai" | "user" | string;
  source_ai_id?: string;
  agenda_titles: string[];
}

export interface CanvasFinalSolutionSummaryTopic {
  topic_id: string;
  topic_no: number;
  topic_title: string;
  problem_topic: string;
  solution_conclusion: string;
  final_notes: CanvasFinalSolutionSummaryItem[];
}

export interface CanvasFinalSolutionSummary {
  final_count: number;
  topics: CanvasFinalSolutionSummaryTopic[];
  items: CanvasFinalSolutionSummaryItem[];
  markdown: string;
  document_blocks?: CanvasSummaryDocumentBlock[];
  document_status?: "empty" | "ready" | "edited" | string;
  revision?: number;
  source_generation_id?: string;
  based_on_transcript_revision?: number;
  updated_at?: string;
  generated_at?: string;
  used_llm?: boolean;
  warning?: string;
  source_signature?: string;
  sections?: CanvasSummaryDocumentSection[];
  structured?: CanvasSummaryStructuredDocument;
}

export interface CanvasSummaryEvidenceItem {
  utterance_id: string;
  speaker: string;
  timestamp?: string;
  text: string;
}

export interface CanvasSummaryDocumentSection {
  group_id: string;
  title: string;
  status: "draft" | "review" | "final" | string;
  status_label: string;
  rationale?: string;
  node_titles: string[];
  evidence: CanvasSummaryEvidenceItem[];
}

export interface CanvasSummaryStructuredIdeaGroup {
  group_id: string;
  title: string;
  items: string[];
}

export interface CanvasSummaryStructuredOpinion {
  label: string;
  text: string;
}

export interface CanvasSummaryStructuredDiscussionFlow {
  group_id: string;
  title: string;
  opinions: CanvasSummaryStructuredOpinion[];
  conclusion: string;
}

export interface CanvasSummaryStructuredFlowSection {
  section_id: string;
  group_id: string;
  title: string;
  time_range?: string;
  trigger?: string;
  narrative: string;
  key_points: string[];
  opinions: CanvasSummaryStructuredOpinion[];
  settlement: string;
  open_questions: string[];
}

export interface CanvasSummaryStructuredConclusionGroup {
  group_id: string;
  title: string;
  status: "draft" | "review" | "final" | string;
  status_label?: string;
  bullets: string[];
}

export interface CanvasSummaryTableColumn {
  id: string;
  title: string;
  type?: "text" | "select" | string;
}

export interface CanvasSummaryTableRow {
  id: string;
  cells: Record<string, string>;
}

export type CanvasSummaryDocumentBlock =
  | {
      id: string;
      type: "heading";
      text: string;
      level?: 1 | 2 | 3;
    }
  | {
      id: string;
      type: "paragraph";
      text: string;
    }
  | {
      id: string;
      type: "bullets";
      items: string[];
    }
  | {
      id: string;
      type: "table";
      title?: string;
      columns: CanvasSummaryTableColumn[];
      rows: CanvasSummaryTableRow[];
    };

export interface CanvasSummaryStructuredDocument {
  meeting_overview: string;
  attendee_summary?: string;
  key_summary: string;
  idea_groups: CanvasSummaryStructuredIdeaGroup[];
  discussion_flows: CanvasSummaryStructuredDiscussionFlow[];
  flow_sections: CanvasSummaryStructuredFlowSection[];
  pending_items: string[];
  conclusion: {
    title: string;
    summary: string;
    groups: CanvasSummaryStructuredConclusionGroup[];
  };
}

export interface CanvasSummaryDocumentResponse {
  ok: boolean;
  used_llm: boolean;
  warning?: string;
  generated_at: string;
  source_signature: string;
  markdown: string;
  document_blocks?: CanvasSummaryDocumentBlock[];
  sections: CanvasSummaryDocumentSection[];
  structured?: CanvasSummaryStructuredDocument;
}

export interface CanvasQuickAskResponse {
  ok: boolean;
  used_llm: boolean;
  warning?: string;
  generated_at: string;
  answer: string;
}

export interface CanvasIdeationKeywordResponse {
  ok: boolean;
  used_llm: boolean;
  warning?: string;
  generated_at: string;
  source_signature: string;
  merge_keywords?: Array<{
    source: string;
    target: string;
    reason?: string;
  }>;
  remove_keywords?: string[];
  keywords: Array<{
    text: string;
    count: number;
    related?: string[];
    kind?: "entity" | "topic" | "relation" | "action" | "off_topic";
    importance?: number;
    relevance?: number;
    off_topic?: boolean;
    off_topic_reason?: string;
    anchor?: string;
  }>;
}

export type CanvasIdeationBubbleDisplayState = "active" | "dimmed" | "archived";
export type CanvasIdeationBubbleLayoutZone = "core" | "default" | "peripheral" | "archived";

export interface CanvasIdeationBubbleGraphBubble {
  id: string;
  label: string;
  aliases?: string[];
  kind?: "entity" | "topic" | "relation" | "action" | "off_topic" | string;
  count: number;
  importance?: number;
  relevance?: number;
  activity?: number;
  opacity?: number;
  emphasis?: "primary" | "default" | string;
  x?: number;
  y?: number;
  size?: number;
  cluster_id?: string;
  cluster_x?: number;
  cluster_y?: number;
  local_x?: number;
  local_y?: number;
  display_state?: CanvasIdeationBubbleDisplayState | string;
  layout_zone?: CanvasIdeationBubbleLayoutZone | string;
  missing_cycles?: number;
  anchor_id?: string;
  related_ids?: string[];
  evidence_utterance_ids?: string[];
  first_seen_at?: string;
  last_seen_at?: string;
  last_seen_cycle?: number;
  off_topic?: boolean;
  off_topic_reason?: string;
  archive_reason?: string;
}

export interface CanvasIdeationBubbleGraph {
  version: number;
  update_cycle: number;
  layout_revision?: number;
  bubbles: CanvasIdeationBubbleGraphBubble[];
  processed_utterance_ids: string[];
  updated_at?: string;
}

export interface CanvasIdeationBubbleGraphUpdateResponse {
  ok: boolean;
  used_llm: boolean;
  warning?: string;
  generated_at: string;
  source_signature: string;
  bubble_graph: CanvasIdeationBubbleGraph;
  workspace?: CanvasWorkspaceStateResponse;
}
export interface CanvasSolutionTopicResponse {
  group_id: string;
  topic_no: number;
  topic: string;
  conclusion: string;
  ideas: string[];
  status?: "draft" | "review" | "final" | string;
  problem_topic?: string;
  problem_insight?: string;
  problem_conclusion?: string;
  problem_keywords?: string[];
  agenda_titles?: string[];
  ai_suggestions?: Array<{
    id: string;
    text: string;
    status?: "draft" | "selected" | "dismissed" | string;
  }>;
  notes?: Array<{
    id: string;
    text: string;
    source?: "ai" | "user" | string;
    source_ai_id?: string;
    is_final_candidate?: boolean;
    final_comment?: string;
  }>;
}
