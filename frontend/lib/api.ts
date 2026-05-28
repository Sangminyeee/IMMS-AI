import type {
  CanvasLocalState,
  CanvasFinalSolutionSummary,
  CanvasIdeaAssimilationUtterance,
  CanvasIdeationKeywordResponse,
  CanvasPersonalNotesStateResponse,
  CanvasWorkspacePatchRequest,
  CanvasProblemGroupingRationaleResponse,
  CanvasProblemStructureResponse,
  CanvasProblemTaxonomyResponse,
  CanvasQuickAskResponse,
  CanvasSummaryDocumentResponse,
  CanvasWorkspaceStateResponse,
} from "./types";

const JSON_HEADERS = { "Content-Type": "application/json" };
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000").replace(/\/+$/, "");

function apiPath(path: string): string {
  return `${API_BASE_URL}${path}`;
}
async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiPath(path), init);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to fetch: ${apiPath(path)} - ${msg}`);
  }
  return parse<T>(res);
}

export async function generateCanvasProblemTaxonomy(payload: {
  meeting_id: string;
  meeting_topic: string;
  debug_nonce?: string;
  refresh_chunk_summaries?: boolean;
  parent_group_id?: string;
  parent_topic?: string;
  parent_depth?: number;
  parent_evidence_utterance_ids?: string[];
  existing_group_ids?: string[];
  existing_groups?: Array<{
    group_id: string;
    parent_group_id?: string;
    depth?: number;
    topic: string;
    evidence_utterance_ids?: string[];
    source_summary_items?: string[];
  }>;
  max_groups?: number;
  utterances?: Array<{
    id: string;
    speaker: string;
    text: string;
    timestamp?: string;
  }>;
}): Promise<CanvasProblemTaxonomyResponse> {
  return requestJson<CanvasProblemTaxonomyResponse>("/api/canvas/problem-taxonomy", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

export async function generateProblemGroupingRationale(payload: {
  meeting_id: string;
  meeting_topic: string;
  group: {
    group_id: string;
    topic: string;
    insight_lens?: string;
    conclusion?: string;
    agenda_titles?: string[];
    source_summary_items?: string[];
    evidence_utterance_ids?: string[];
    ideas?: Array<{
      id: string;
      kind: string;
      title: string;
      body: string;
    }>;
  };
  child_groups?: Array<{
    group_id: string;
    topic: string;
    insight_lens?: string;
    conclusion?: string;
  }>;
  utterances?: Array<{
    id: string;
    speaker: string;
    text: string;
    timestamp?: string;
  }>;
}): Promise<CanvasProblemGroupingRationaleResponse> {
  return requestJson<CanvasProblemGroupingRationaleResponse>("/api/canvas/problem-grouping-rationale", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

export async function generateProblemStructure(payload: {
  meeting_id: string;
  meeting_topic: string;
  method: "affinity" | "card-sorting" | string;
  nodes: Array<{
    id: string;
    title: string;
    body: string;
    status?: string;
    depth?: number;
  }>;
  existing_groups?: Array<{
    id: string;
    title: string;
    node_ids: string[];
    rationale?: string;
  }>;
  max_groups?: number;
}): Promise<CanvasProblemStructureResponse> {
  return requestJson<CanvasProblemStructureResponse>("/api/canvas/problem-structure", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

export async function generateCanvasSummaryDocument(payload: {
  meeting_id: string;
  meeting_topic: string;
  refresh_chunk_summaries?: boolean;
  groups: Array<{
    id: string;
    title: string;
    node_ids: string[];
    rationale?: string;
    status?: string;
    created_by?: string;
  }>;
  nodes: Array<{
    id: string;
    source_group_id?: string;
    title: string;
    body?: string;
    status?: string;
    depth?: number;
  }>;
}): Promise<CanvasSummaryDocumentResponse> {
  return requestJson<CanvasSummaryDocumentResponse>("/api/canvas/summary-document", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

export async function generateCanvasSummaryConclusion(payload: {
  meeting_id: string;
  meeting_topic: string;
  refresh_chunk_summaries?: boolean;
  regenerate_nonce?: string;
  current_summary?: CanvasFinalSolutionSummary;
  groups: Array<{
    id: string;
    title: string;
    node_ids: string[];
    rationale?: string;
    status?: string;
    created_by?: string;
  }>;
  nodes: Array<{
    id: string;
    source_group_id?: string;
    title: string;
    body?: string;
    status?: string;
    depth?: number;
  }>;
}): Promise<CanvasSummaryDocumentResponse> {
  return requestJson<CanvasSummaryDocumentResponse>("/api/canvas/summary-conclusion", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

export async function askCanvasQuickQuestion(payload: {
  meeting_id: string;
  meeting_topic: string;
  stage: "ideation" | "problem-definition" | "solution";
  question: string;
  context?: Record<string, unknown>;
}): Promise<CanvasQuickAskResponse> {
  return requestJson<CanvasQuickAskResponse>("/api/canvas/quick-ask", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

export async function extractCanvasIdeationKeywords(payload: {
  meeting_id: string;
  meeting_topic: string;
  meeting_goal?: string;
  meeting_goal_context?: string;
  utterances: Array<{
    id: string;
    speaker: string;
    text: string;
    timestamp?: string;
  }>;
  context_cache?: string;
  context_utterances?: Array<{
    id: string;
    speaker: string;
    text: string;
    timestamp?: string;
  }>;
  existing_keywords?: Array<{
    text: string;
    count?: number;
    related?: string[];
    kind?: "entity" | "topic" | "relation" | "action" | "off_topic";
    importance?: number;
    relevance?: number;
    off_topic?: boolean;
    anchor?: string;
  }>;
  max_keywords?: number;
}): Promise<CanvasIdeationKeywordResponse> {
  return requestJson<CanvasIdeationKeywordResponse>("/api/canvas/ideation-keywords", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

export async function startCanvasProblemDiscussionWorkspace(payload: {
  meeting_id: string;
  meeting_topic: string;
  selected_group_id?: string;
  context_utterances?: CanvasIdeaAssimilationUtterance[];
  target_utterances: CanvasIdeaAssimilationUtterance[];
}): Promise<{
  ok: boolean;
  job_id: string;
  meeting_id: string;
  status: "idle" | "processing" | "completed" | "error" | "missing" | string;
  detail?: string;
  used_llm?: boolean;
  warning?: string;
  pending_item_id?: string;
  target_count?: number;
  target_signature?: string;
  workspace?: CanvasWorkspaceStateResponse;
}> {
  return requestJson("/api/canvas/problem-discussion-workspace/start", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

export async function getCanvasProblemDiscussionWorkspaceJob(
  meetingId: string,
  jobId: string,
): Promise<{
  ok: boolean;
  job_id: string;
  meeting_id: string;
  status: "idle" | "processing" | "completed" | "error" | "missing" | string;
  detail?: string;
  used_llm?: boolean;
  warning?: string;
  pending_item_id?: string;
  target_count?: number;
  target_signature?: string;
  workspace?: CanvasWorkspaceStateResponse;
}> {
  const params = new URLSearchParams({ meeting_id: meetingId });
  return requestJson(`/api/canvas/problem-discussion-workspace/jobs/${encodeURIComponent(jobId)}?${params.toString()}`, {
    cache: "no-store",
  });
}

export async function getCanvasWorkspaceState(meetingId: string): Promise<CanvasWorkspaceStateResponse> {
  const params = new URLSearchParams({ meeting_id: meetingId });
  return requestJson<CanvasWorkspaceStateResponse>(`/api/canvas/workspace-state?${params.toString()}`, {
    cache: "no-store",
  });
}

export async function saveCanvasWorkspacePatch(
  payload: CanvasWorkspacePatchRequest,
): Promise<CanvasWorkspaceStateResponse> {
  return requestJson<CanvasWorkspaceStateResponse>("/api/canvas/workspace-patch", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

export function flushCanvasWorkspacePatch(payload: CanvasWorkspacePatchRequest): void {
  const url = apiPath("/api/canvas/workspace-patch");
  const body = JSON.stringify(payload);

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(url, blob)) {
        return;
      }
    }
  } catch {
    // pagehide 시점에는 fallback fetch를 다시 시도한다.
  }

  try {
    void fetch(url, {
      method: "POST",
      headers: JSON_HEADERS,
      body,
      keepalive: true,
    }).catch(() => {
      // unload 직전 네트워크 오류는 사용자 콘솔에 노출하지 않는다.
    });
  } catch {
    // unload 직전 실패는 다음 세션에서 다시 저장된다.
  }
}
export async function getCanvasPersonalNotes(
  meetingId: string,
  userId: string,
): Promise<CanvasPersonalNotesStateResponse> {
  const params = new URLSearchParams({ meeting_id: meetingId, user_id: userId });
  return requestJson<CanvasPersonalNotesStateResponse>(`/api/canvas/personal-notes?${params.toString()}`, {
    cache: "no-store",
  });
}

export async function saveCanvasPersonalNotes(payload: {
  meeting_id: string;
  user_id: string;
  personal_notes: Array<{
    id: string;
    project_id?: string;
    agenda_id: string;
    linked_canvas_item_id?: string;
    linked_canvas_item_title?: string;
    kind: string;
    title: string;
    body: string;
  }>;
  local_canvas_state?: CanvasLocalState | null;
}): Promise<CanvasPersonalNotesStateResponse> {
  return requestJson<CanvasPersonalNotesStateResponse>("/api/canvas/personal-notes", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

export function flushCanvasPersonalNotes(payload: {
  meeting_id: string;
  user_id: string;
  personal_notes: Array<{
    id: string;
    project_id?: string;
    agenda_id: string;
    linked_canvas_item_id?: string;
    linked_canvas_item_title?: string;
    kind: string;
    title: string;
    body: string;
  }>;
  local_canvas_state?: CanvasLocalState | null;
}): void {
  const url = apiPath("/api/canvas/personal-notes");
  const body = JSON.stringify(payload);

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(url, blob)) {
        return;
      }
    }
  } catch {
    // pagehide 시점에는 fallback fetch를 다시 시도한다.
  }

  try {
    void fetch(url, {
      method: "POST",
      headers: JSON_HEADERS,
      body,
      keepalive: true,
    }).catch(() => {
      // unload 직전 네트워크 오류는 사용자 콘솔에 노출하지 않는다.
    });
  } catch {
    // unload 직전 실패는 다음 세션에서 다시 저장된다.
  }
}
