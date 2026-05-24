"use client";

import type * as React from "react";

type ComposerTool = "note" | "comment" | "topic";
type CanvasTool = ComposerTool | "group" | "problem-idea";
type ProblemGroupStatus = "draft" | "review" | "final";
type CanvasItemStatus = "discussion" | "confirmed" | "closed";
type SolutionAiSuggestionStatus = "draft" | "selected" | "dismissed";
type SolutionNoteSource = "ai" | "user";

type CanvasItemViewModel = {
  id: string;
  agenda_id?: string;
  kind?: string;
  status?: string;
  title: string;
  body?: string;
  keywords?: string[];
  point_id?: string;
  compacted_from_ids?: string[];
  merged_children?: CanvasItemViewModel[];
  child_item_ids?: string[];
  parent_topic_id?: string;
  topic_collapsed?: boolean;
  evidence_utterance_ids?: string[];
  ignored_utterance_ids?: string[];
  ai_pending?: boolean;
};

type ProblemGroupViewModel = {
  group_id: string;
  parent_group_id?: string;
  depth?: number;
  topic: string;
  insight_lens?: string;
  conclusion?: string;
  status: ProblemGroupStatus;
};

type SolutionAiSuggestionViewModel = {
  id: string;
  text: string;
  status: SolutionAiSuggestionStatus;
};

type SolutionNoteViewModel = {
  id: string;
  text: string;
  source: SolutionNoteSource;
  source_ai_id?: string;
  is_final_candidate: boolean;
  final_comment: string;
};

type SolutionTopicViewModel = {
  group_id: string;
  topic_no: number;
  topic: string;
  status: ProblemGroupStatus;
  conclusion: string;
  problem_topic: string;
  problem_insight: string;
  problem_conclusion: string;
  agenda_titles: string[];
  ai_suggestions: SolutionAiSuggestionViewModel[];
  notes: SolutionNoteViewModel[];
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

type IdeationDropPreviewState = {
  draggedItemId: string;
  targetId: string;
  mode: "topic" | "merge" | "topic-merge" | "topic-idea-merge" | "detach";
  agendaId: string;
  position: { x: number; y: number };
  label: string;
  hint: string;
};

export const CANVAS_ITEM_NODE_WIDTH = 320;
const CANVAS_ITEM_NODE_MIN_HEIGHT = 252;
export const CANVAS_TOPIC_CHILD_GAP_X = 24;
export const CANVAS_TOPIC_CHILD_GAP_Y = 14;
export const CANVAS_TOPIC_CHILDS_PER_ROW = 999;
export const CANVAS_IDEATION_DROP_ZONE_VERTICAL_PADDING = 28;
export const CANVAS_TOP_LEVEL_GAP_Y = 16;
export const CANVAS_AGENDA_TO_ITEMS_GAP_Y = 18;
export const CANVAS_AGENDA_BLOCK_GAP_X = 1080;
export const CANVAS_AGENDA_BLOCK_GAP_Y = 56;

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

function makeStableSignature(value: unknown) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length}:${(hash >>> 0).toString(36)}`;
}

function normalizeCanvasItemStatus(raw: string | undefined): CanvasItemStatus {
  if (raw === "confirmed" || raw === "final") return "confirmed";
  if (raw === "closed") return "closed";
  return "discussion";
}

function renderEditPresenceBadge(label = "수정중") {
  return (
    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
      {label}
    </span>
  );
}

function toolLabel(tool: CanvasTool, stage?: "ideation" | "problem-definition" | "solution") {
  if (tool === "note") return stage === "problem-definition" ? "의견추가" : "추가";
  if (tool === "problem-idea") return "아이디어 추가";
  if (tool === "comment") return "댓글";
  if (tool === "group") return stage === "problem-definition" ? "문제정의 그룹 추가" : "그룹";
  return "주제";
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
export function makeAgendaNodeLabel(
  title: string,
  summary: string,
  status: string,
  keywords: string[],
  remoteEditing = false,
  onEdit?: (event: React.MouseEvent<HTMLButtonElement>) => void,
) {
  return (
    <div className="min-w-0 p-1">
      <div className="rounded-[24px] bg-gradient-to-br from-amber-50 via-white to-white p-4">
        <div className="flex items-start justify-between gap-3">
          <span className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-800">
            Group
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-500">
              {status}
            </span>
            {remoteEditing ? renderEditPresenceBadge() : null}
            {onEdit ? (
              <button
                type="button"
                onClick={onEdit}
                onPointerDown={(event) => event.stopPropagation()}
                className="nodrag nopan rounded-full border border-black/10 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#4d4d4d] transition hover:bg-[#f5f6f8]"
              >
                수정
              </button>
            ) : null}
          </div>
        </div>
        <strong className="mt-4 block text-[17px] leading-7 text-slate-900">
          {title}
        </strong>
        <div className="mt-4 px-1">
          <p className="text-sm leading-6 text-slate-600">
            {summary}
          </p>
        </div>
        {keywords.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {keywords.slice(0, 3).map((item) => (
              <span key={`${title}-${item}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                #{item}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function canvasItemTone(kind: ComposerTool) {
  if (kind === "comment") {
    return {
      shell: "bg-[linear-gradient(128deg,#eef7ff_0%,#ffffff_100%)]",
      badge: "bg-sky-100 text-sky-700",
      accent: "text-sky-700",
    };
  }
  if (kind === "topic") {
    return {
      shell: "bg-[linear-gradient(128deg,#eefbf7_0%,#ffffff_100%)]",
      badge: "bg-fuchsia-100 text-fuchsia-700",
      accent: "text-fuchsia-700",
    };
  }
  return {
    shell: "bg-[linear-gradient(128deg,#fefbee_0%,#ffffff_100%)]",
    badge: "bg-amber-100 text-amber-700",
    accent: "text-amber-700",
  };
}

export function estimateCanvasItemNodeHeight(item: CanvasItemViewModel) {
  const pending = Boolean(item.ai_pending);
  const titleLines = Math.min(3, estimateWrappedLines(pending ? "AI 정리 중" : item.title || "내용 상세보기", 18));
  const body = pending ? "요약 생성 중" : cleanCanvasNodeBodyText(item.body);
  const bodyLines = body ? estimateWrappedLines(body, 26) : 0;
  const keywordCount = pending ? 3 : Math.max((item.keywords || []).filter(Boolean).length, 3);
  const keywordRows = Math.max(1, Math.ceil(keywordCount / 3));
  const footerLines = item.point_id ? 1 : 0;

  return Math.max(
    CANVAS_ITEM_NODE_MIN_HEIGHT,
    88 + titleLines * 26 + bodyLines * 25 + keywordRows * 28 + footerLines * 18,
  );
}

export function getIdeationKeywordBubbleFontSize(text: string, size: number) {
  const weightedLength = Array.from(text).reduce((sum, char) => {
    if (/\s/.test(char)) return sum + 0.32;
    if (/[A-Z]/.test(char)) return sum + 0.72;
    if (/[a-z0-9+#._-]/.test(char)) return sum + 0.6;
    return sum + 1;
  }, 0);
  const availableWidth = Math.max(42, size * 0.82);
  const fittedSize = Math.floor((availableWidth / Math.max(1, weightedLength)) * 0.95);
  return clampNumber(fittedSize, 5, 23);
}

export function makeIdeationKeywordBubbleNodeLabel(bubble: IdeationKeywordBubble, size: number) {
  const fontSize = getIdeationKeywordBubbleFontSize(bubble.text, size);
  const offTopic = bubble.offTopic || bubble.kind === "off_topic";
  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center rounded-full border px-4 text-center font-['Inter','Noto_Sans_KR',sans-serif] backdrop-blur ${
        offTopic
          ? "border-[#ef4e4e]/35 bg-[#fff5f5]/92 shadow-[0_18px_44px_rgba(239,78,78,0.13)]"
          : "border-[#a13ab8]/10 bg-white/90 shadow-[0_18px_44px_rgba(161,58,184,0.14)]"
      }`}
    >
      {offTopic && size >= 92 ? (
        <span className="mb-1 rounded-full bg-[#ef4e4e]/10 px-2 py-0.5 text-[10px] font-semibold leading-none text-[#b23b3b]">
          이탈
        </span>
      ) : null}
      <strong
        className={`max-w-full whitespace-nowrap font-semibold ${offTopic ? "text-[#b23b3b]" : "text-[#a13ab8]"}`}
        style={{
          fontSize,
          lineHeight: 1.08,
          maxWidth: Math.max(44, Math.round(size * 0.82)),
          wordBreak: "keep-all",
        }}
      >
        {bubble.text}
      </strong>
    </div>
  );
}

export function getCanvasItemMergedSourceCount(item: CanvasItemViewModel): number {
  const explicitCount = (item.compacted_from_ids || []).filter(Boolean).length;
  if (explicitCount > 0) return explicitCount;

  const childCount = (item.merged_children || []).reduce(
    (sum, child) => sum + getCanvasItemMergedSourceCount(child),
    0,
  );
  return childCount || 1;
}

export function isTopicCanvasItem(item: CanvasItemViewModel) {
  return item.kind === "topic";
}

export function getTopicChildCount(item: CanvasItemViewModel) {
  return (item.child_item_ids || []).filter(Boolean).length;
}

export function getTopicDirectChildIds(
  items: CanvasItemViewModel[],
  topicId: string,
) {
  const topic = items.find((item) => item.id === topicId);
  return [
    ...new Set([
      ...(topic?.child_item_ids || []),
      ...items.filter((item) => item.parent_topic_id === topicId).map((item) => item.id),
    ]),
  ].filter((childId) => childId !== topicId);
}

export function getTopicFlattenedIdeaChildIds(
  items: CanvasItemViewModel[],
  topicId: string,
) {
  const childIds: string[] = [];
  const visitedTopicIds = new Set<string>();

  const visitTopic = (currentTopicId: string) => {
    if (visitedTopicIds.has(currentTopicId)) return;
    visitedTopicIds.add(currentTopicId);

    getTopicDirectChildIds(items, currentTopicId).forEach((childId) => {
      const child = items.find((item) => item.id === childId);
      if (!child) return;
      if (isTopicCanvasItem(child)) {
        visitTopic(child.id);
        return;
      }
      childIds.push(child.id);
    });
  };

  visitTopic(topicId);
  return [...new Set(childIds)];
}

export function getTopicDescendantTopicIds(
  items: CanvasItemViewModel[],
  topicId: string,
) {
  const topicIds: string[] = [];
  const visitedTopicIds = new Set<string>();

  const visitTopic = (currentTopicId: string) => {
    if (visitedTopicIds.has(currentTopicId)) return;
    visitedTopicIds.add(currentTopicId);

    getTopicDirectChildIds(items, currentTopicId).forEach((childId) => {
      const child = items.find((item) => item.id === childId);
      if (!child || !isTopicCanvasItem(child)) return;
      topicIds.push(child.id);
      visitTopic(child.id);
    });
  };

  visitTopic(topicId);
  return [...new Set(topicIds)];
}

export function getCanvasItemTopLevelAncestorId(
  items: CanvasItemViewModel[],
  itemId: string,
) {
  const itemById = new Map(items.map((item) => [item.id, item]));
  let current = itemById.get(itemId) || null;
  const visited = new Set<string>();

  while (current?.parent_topic_id && !visited.has(current.id)) {
    visited.add(current.id);
    const parent = itemById.get(current.parent_topic_id);
    if (!parent) break;
    current = parent;
  }

  return current?.id || itemId;
}

export function getCanvasItemDescendantIds(
  items: CanvasItemViewModel[],
  itemId: string,
) {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const descendantIds: string[] = [];
  const visited = new Set<string>();

  const visit = (parentId: string) => {
    if (visited.has(parentId)) return;
    visited.add(parentId);

    getTopicDirectChildIds(items, parentId).forEach((childId) => {
      const child = itemById.get(childId);
      if (!child || descendantIds.includes(child.id)) return;
      descendantIds.push(child.id);
      visit(child.id);
    });
  };

  visit(itemId);
  return descendantIds;
}

export function buildUserMergedTopicTitle(
  left: CanvasItemViewModel,
  right: CanvasItemViewModel,
) {
  const keywords = [...(left.keywords || []), ...(right.keywords || [])]
    .map((keyword) => keyword.trim())
    .filter(Boolean);
  if (keywords.length > 0) {
    return `${keywords[0]} 묶음`;
  }

  const titleSource = [left.title, right.title]
    .map((title) => title.trim())
    .filter(Boolean)[0];
  return titleSource ? `${titleSource.slice(0, 12)} 묶음` : "새 주제 묶음";
}

export function makeIdeationMergeDropPreview(
  draggedItem: CanvasItemViewModel,
  targetItem: CanvasItemViewModel,
  position: { x: number; y: number },
): IdeationDropPreviewState | null {
  if (draggedItem.id === targetItem.id) return null;

  if (isTopicCanvasItem(targetItem)) {
    if (isTopicCanvasItem(draggedItem)) {
      return {
        draggedItemId: draggedItem.id,
        targetId: targetItem.id,
        mode: "topic-merge",
        agendaId: targetItem.agenda_id || draggedItem.agenda_id || "",
        position,
        label: "토픽 통합",
        hint: `"${targetItem.title || "토픽"}"과 합쳐 새 토픽으로 재구성합니다.`,
      };
    }

    return {
      draggedItemId: draggedItem.id,
      targetId: targetItem.id,
      mode: "topic",
      agendaId: targetItem.agenda_id || draggedItem.agenda_id || "",
      position,
      label: "이 토픽에 병합",
      hint: `"${targetItem.title || "토픽"}" 하위로 넣고 토픽 내용을 다시 정리합니다.`,
    };
  }

  if (isTopicCanvasItem(draggedItem)) {
    return {
      draggedItemId: draggedItem.id,
      targetId: targetItem.id,
      mode: "topic-idea-merge",
      agendaId: targetItem.agenda_id || draggedItem.agenda_id || "",
      position,
      label: "새 토픽으로 통합",
      hint: `"${targetItem.title || "대상 노드"}"와 토픽을 새 주제로 묶습니다.`,
    };
  }

  return {
    draggedItemId: draggedItem.id,
    targetId: targetItem.id,
    mode: "merge",
    agendaId: targetItem.agenda_id || draggedItem.agenda_id || "",
    position,
    label: "새 토픽으로 묶기",
    hint: `"${targetItem.title || "대상 노드"}"와 함께 새 토픽을 만듭니다.`,
  };
}

export function getCanvasItemChangeSignature(item: CanvasItemViewModel) {
  return makeStableSignature({
    id: item.id,
    kind: item.kind,
    status: normalizeCanvasItemStatus(item.status),
    title: item.title,
    body: item.body,
    keywords: item.keywords || [],
    parent_topic_id: item.parent_topic_id || "",
    child_item_ids: item.child_item_ids || [],
    compacted_from_ids: item.compacted_from_ids || [],
    evidence_utterance_ids: item.evidence_utterance_ids || [],
    ignored_utterance_ids: item.ignored_utterance_ids || [],
    ai_pending: Boolean(item.ai_pending),
  });
}

export function cleanCanvasNodeBodyText(value: string | undefined) {
  const text = (value || "").trim();
  if (!text || /^content\s*:?\s*$/i.test(text)) {
    return "";
  }
  return text;
}

export function makeCanvasItemNodeLabel(
  item: CanvasItemViewModel,
  selected: boolean,
  _linkedAgendaTitle: string,
  onToggleTopicCollapsed?: (itemId: string) => void,
  onEdit?: (event: React.MouseEvent<HTMLButtonElement>) => void,
  remoteEditing = false,
  highlighted = false,
) {
  const tone = canvasItemTone((item.kind as ComposerTool) || "note");
  const keywords = (item.keywords || []).filter(Boolean);
  const pending = Boolean(item.ai_pending);
  const mergedSourceCount = getCanvasItemMergedSourceCount(item);
  const topicChildCount = getTopicChildCount(item);
  const showTopicToggle = isTopicCanvasItem(item) && topicChildCount > 0;
  const title = pending ? "AI 정리 중" : item.title || "내용 상세보기";
  const body = pending ? "" : cleanCanvasNodeBodyText(item.body);
  const backgroundClass = highlighted ? "bg-[linear-gradient(128deg,#fef1ee_0%,#ffffff_100%)]" : tone.shell;
  const borderClass = selected ? "border-black" : "border-black/10";
  const displayKeywords = pending ? [] : keywords.length > 0 ? keywords : ["키워드", "키워드", "키워드"];

  return (
    <div className="min-w-0">
      <div
        className={`nopan imms-canvas-node-drag-handle relative flex h-full min-h-[252px] w-full cursor-grab flex-col rounded-[18px] border px-5 py-4 text-center font-['Inter','Noto_Sans_KR',sans-serif] transition-colors active:cursor-grabbing ${backgroundClass} ${borderClass}`}
      >
        <div className="flex min-h-[28px] w-full items-start justify-between gap-2">
          <span />
          <div className="flex shrink-0 items-center gap-1.5">
            {remoteEditing ? renderEditPresenceBadge() : null}
            {!pending && onEdit ? (
              <button
                type="button"
                onClick={onEdit}
                onPointerDown={(event) => event.stopPropagation()}
                className="nodrag nopan rounded-full border border-black/10 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-[#4d4d4d] shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition hover:bg-white"
              >
                수정
              </button>
            ) : null}
            {showTopicToggle ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleTopicCollapsed?.(item.id);
                }}
                className="nodrag shrink-0 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-[#4d4d4d] shadow-[0_1px_2px_rgba(0,0,0,0.08)] hover:bg-white"
              >
                {item.topic_collapsed ? "펼치기" : "접기"} {topicChildCount}
              </button>
            ) : mergedSourceCount > 1 ? (
              <span className="shrink-0 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-[#4d4d4d] shadow-[0_1px_2px_rgba(0,0,0,0.08)]">
                묶음 {mergedSourceCount}
              </span>
            ) : null}
          </div>
        </div>
        <strong className="mt-3 max-w-full text-[18px] font-semibold leading-[24.811px] text-black line-clamp-2">
          {title}
        </strong>
        {pending ? (
          <p className="mt-3 text-[16px] font-normal leading-[24.811px] text-[#4d4d4d]">
            요약 생성 중
          </p>
        ) : body ? (
          <p className="mx-auto mt-3 max-w-full whitespace-pre-wrap break-words text-[16px] font-normal leading-[24.811px] text-[#4d4d4d]">
            {body}
          </p>
        ) : null}
        {pending ? (
          <div className="mt-auto flex justify-center gap-2.5 pt-4">
            {[0, 1, 2].map((index) => (
              <span key={`${item.id}-pending-keyword-${index}`} className="h-4 w-[48px] animate-pulse rounded-full bg-black/10" />
            ))}
          </div>
        ) : (
          <div className="mt-auto flex max-w-full flex-wrap justify-center gap-x-2.5 gap-y-1.5 pt-4">
            {displayKeywords.map((keyword, index) => (
              <span key={`${item.id}-${keyword}-${index}`} className="max-w-[86px] truncate whitespace-nowrap text-[15px] font-normal leading-[24.811px] text-[#4d4d4d]">
                #{keyword}
              </span>
            ))}
          </div>
        )}
        {item.point_id ? (
          <p className={`mt-1 truncate text-[11px] font-medium ${tone.accent}`}>
            연결 노드: {item.point_id}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function makeIdeationDragGhostLabel(item: CanvasItemViewModel, dropLabel = "이동 중") {
  const tone = canvasItemTone((item.kind as ComposerTool) || "note");
  const body = cleanCanvasNodeBodyText(item.body);

  return (
    <div className={`rounded-[18px] border px-4 py-3 shadow-[0_20px_48px_rgba(15,23,42,0.22)] backdrop-blur ${tone.shell} border-black/10`}>
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-white/85 px-2.5 py-1 text-[11px] font-semibold text-[#a13ab8]">
          {dropLabel}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/35">
          Drag
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-black">
        {item.title || toolLabel((item.kind as ComposerTool) || "note")}
      </p>
      {body ? (
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#4d4d4d]">
          {body}
        </p>
      ) : null}
    </div>
  );
}

export function solutionTopicSelectedSuggestions(topic: SolutionTopicViewModel) {
  return (topic.ai_suggestions || []).filter((item) => item.status === "selected");
}

export function solutionTopicFinalNotes(topic: SolutionTopicViewModel) {
  return (topic.notes || []).filter((note) => note.is_final_candidate);
}

export function makeSolutionNodeLabel(
  topic: SolutionTopicViewModel,
  selected: boolean,
  onEdit?: (event: React.MouseEvent<HTMLButtonElement>) => void,
  remoteEditing = false,
) {
  const selectedAiCount = solutionTopicSelectedSuggestions(topic).length;
  const finalCount = solutionTopicFinalNotes(topic).length;
  return (
    <div
      className={`nopan box-border flex h-full w-full min-w-0 cursor-pointer flex-col justify-start border bg-white px-4 py-4 text-left font-['Inter','Noto_Sans_KR',sans-serif] transition ${
        selected
          ? "border-black shadow-[0_14px_30px_rgba(15,23,42,0.16)]"
          : "border-black/10 shadow-[0_1px_0_rgba(0,0,0,0.04)] hover:border-emerald-300"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
            Insight {topic.topic_no || 0}
          </p>
          <strong className="mt-2 block line-clamp-2 text-[17px] font-semibold leading-6 text-slate-950">
            {topic.topic}
          </strong>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${problemGroupStatusTone(topic.status)}`}>
            {problemGroupStatusLabel(topic.status)}
          </span>
          {remoteEditing ? renderEditPresenceBadge() : null}
          {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              onPointerDown={(event) => event.stopPropagation()}
              className="nodrag nopan rounded-full border border-black/10 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#4d4d4d] transition hover:bg-[#f5f6f8]"
            >
              수정
            </button>
          ) : null}
        </div>
      </div>
      <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#4d4d4d]">
        {topic.conclusion || topic.problem_conclusion || "해결 방향이 아직 없습니다."}
      </p>
      <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold">
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
          AI {topic.ai_suggestions.length}
        </span>
        <span className="rounded-full bg-fuchsia-50 px-2.5 py-1 text-fuchsia-700">
          채택 {selectedAiCount}
        </span>
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
          결론 {finalCount}
        </span>
      </div>
    </div>
  );
}

export function makeSolutionOverviewNodeLabel(
  topic: SolutionTopicViewModel,
  onEdit?: (event: React.MouseEvent<HTMLButtonElement>) => void,
  remoteEditing = false,
) {
  return (
    <div className="nopan box-border flex h-full w-full flex-col justify-start border border-black/10 bg-white px-5 py-5 text-left font-['Inter','Noto_Sans_KR',sans-serif] shadow-[0_1px_0_rgba(0,0,0,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">해결 방향</p>
          <h4 className="mt-2 text-xl font-semibold leading-8 text-slate-950">{topic.topic}</h4>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${problemGroupStatusTone(topic.status)}`}>
            {problemGroupStatusLabel(topic.status)}
          </span>
          {remoteEditing ? renderEditPresenceBadge() : null}
          {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              onPointerDown={(event) => event.stopPropagation()}
              className="nodrag nopan rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#4d4d4d] transition hover:bg-[#f5f6f8]"
            >
              수정
            </button>
          ) : null}
        </div>
      </div>
      <p className="mt-4 line-clamp-4 text-base leading-7 text-[#4d4d4d]">
        {topic.conclusion || topic.problem_conclusion || "해결 방향이 아직 없습니다."}
      </p>
      <div className="mt-4 grid gap-3 text-sm leading-6 text-[#4d4d4d] md:grid-cols-3">
        <div className="border border-black/10 bg-[#fafafa] px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#777]">문제정의</p>
          <p className="mt-1 line-clamp-2">{topic.problem_topic || "연결된 문제정의 없음"}</p>
        </div>
        <div className="border border-black/10 bg-[#fafafa] px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#777]">인사이트</p>
          <p className="mt-1 line-clamp-2">{topic.problem_insight || "인사이트 없음"}</p>
        </div>
        <div className="border border-black/10 bg-[#fafafa] px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#777]">출처</p>
          <p className="mt-1 line-clamp-2">{topic.agenda_titles.length > 0 ? topic.agenda_titles.join(", ") : "연결 안건 없음"}</p>
        </div>
      </div>
    </div>
  );
}

export function makeSolutionAiSuggestionNodeLabel(
  suggestion: SolutionAiSuggestionViewModel,
  index: number,
  onAdopt: (event: React.MouseEvent<HTMLButtonElement>) => void,
  busy = false,
) {
  const selected = suggestion.status === "selected";
  if (busy) {
    return (
      <article className="nopan box-border flex h-full w-full flex-col justify-center border border-emerald-100 bg-white px-4 py-4 text-left font-['Inter','Noto_Sans_KR',sans-serif] shadow-[0_1px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 animate-ping rounded-full bg-emerald-500" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
              AI 추천 생성 중
            </p>
            <p className="mt-1 text-sm leading-6 text-[#4d4d4d]">
              선택한 인사이트 기준으로 해결책 아이디어를 다시 정리하고 있습니다.
            </p>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className={`nopan box-border flex h-full w-full flex-col justify-start border px-4 py-4 text-left font-['Inter','Noto_Sans_KR',sans-serif] ${
      selected ? "border-fuchsia-100 bg-slate-50/90 opacity-80" : "border-black/10 bg-white"
    } shadow-[0_1px_0_rgba(0,0,0,0.04)]`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#777]">AI 제안 {index + 1}</p>
          <p className={`mt-2 line-clamp-5 text-sm leading-6 ${selected ? "text-slate-500" : "text-[#4d4d4d]"}`}>
            {suggestion.text}
          </p>
          {selected ? (
            <p className="mt-2 text-xs font-semibold text-fuchsia-700">채택 카드로 이동됨</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onAdopt}
          disabled={selected}
          className="nodrag shrink-0 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#4d4d4d] transition hover:bg-[#f5f6f8] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {selected ? "채택됨" : "채택"}
        </button>
      </div>
    </article>
  );
}

export function makeSolutionNoteNodeLabel(
  note: SolutionNoteViewModel,
  index: number,
  onToggleFinal: (event: React.MouseEvent<HTMLButtonElement>) => void,
  editing: boolean,
  textDraft: string,
  finalCommentDraft: string,
  onStartEdit: (event: React.MouseEvent<HTMLButtonElement>) => void,
  onTextDraftChange: (value: string) => void,
  onFinalCommentDraftChange: (value: string) => void,
  onSaveEdit: (event: React.MouseEvent<HTMLButtonElement>) => void,
  onCancelEdit: (event: React.MouseEvent<HTMLButtonElement>) => void,
  remoteEditing = false,
) {
  const sourceLabel = note.source === "ai" ? `AI 채택 카드 ${index + 1}` : `사용자 카드 ${index + 1}`;
  const shellClass = note.is_final_candidate
    ? "border-slate-900 bg-white"
    : note.source === "ai"
      ? "border-fuchsia-100 bg-fuchsia-50/70"
      : "border-amber-100 bg-amber-50/80";
  const labelClass = note.is_final_candidate
    ? "text-slate-900"
    : note.source === "ai"
      ? "text-fuchsia-700"
      : "text-amber-700";

  return (
    <article className={`nopan box-border flex h-full w-full flex-col justify-start border px-4 py-4 text-left font-['Inter','Noto_Sans_KR',sans-serif] shadow-[0_1px_0_rgba(0,0,0,0.04)] ${shellClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${labelClass}`}>
              {sourceLabel}
            </p>
            {remoteEditing ? renderEditPresenceBadge() : null}
          </div>
          {editing ? (
            <textarea
              value={textDraft}
              onChange={(event) => onTextDraftChange(event.target.value)}
              onPointerDown={(event) => event.stopPropagation()}
              placeholder="해결책 카드 내용을 입력합니다."
              className="nodrag mt-2 min-h-[92px] w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm leading-6 text-slate-700 focus:border-black/30 focus:outline-none"
            />
          ) : (
            <p className="mt-2 line-clamp-5 text-sm leading-6 text-slate-700">{note.text}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <button
            type="button"
            onClick={onToggleFinal}
            className={`nodrag rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              note.is_final_candidate
                ? "bg-slate-900 text-white"
                : "border border-black/10 bg-white text-[#4d4d4d] hover:bg-[#f5f6f8]"
            }`}
          >
            {note.is_final_candidate ? "최종 결론" : "결론 후보"}
          </button>
          {editing ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onCancelEdit}
                className="nodrag rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#777] transition hover:bg-[#f5f6f8]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={onSaveEdit}
                className="nodrag rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
              >
                저장
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onStartEdit}
              className="nodrag rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#4d4d4d] transition hover:bg-[#f5f6f8]"
            >
              편집
            </button>
          )}
        </div>
      </div>
      {note.is_final_candidate && editing ? (
        <textarea
          value={finalCommentDraft}
          onChange={(event) => onFinalCommentDraftChange(event.target.value)}
          onPointerDown={(event) => event.stopPropagation()}
          placeholder="최종 결론에 붙일 설명을 입력합니다."
          className="nodrag mt-3 min-h-[72px] w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm leading-6 text-slate-700 focus:border-black/30 focus:outline-none"
        />
      ) : note.is_final_candidate ? (
        <p className="mt-3 rounded-xl border border-black/10 bg-white px-3 py-3 text-xs leading-5 text-slate-500">
          {note.final_comment || "최종 결론 설명은 편집을 눌러 추가할 수 있습니다."}
        </p>
      ) : null}
    </article>
  );
}

export function makeSolutionComposerNodeLabel(
  draft: string,
  onDraftChange: (value: string) => void,
  onAdd: (event: React.MouseEvent<HTMLButtonElement>) => void,
) {
  return (
    <div className="nopan box-border flex h-full w-full flex-col justify-start border border-black/10 bg-[#fafafa] px-4 py-4 text-left font-['Inter','Noto_Sans_KR',sans-serif] shadow-[0_1px_0_rgba(0,0,0,0.04)]">
      <p className="text-sm font-semibold text-slate-700">사용자 해결책 추가</p>
      <textarea
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        onPointerDown={(event) => event.stopPropagation()}
        placeholder="직접 해결책 메모를 추가합니다."
        className="nodrag mt-3 min-h-[96px] w-full rounded-xl border border-black/10 bg-white px-3 py-3 text-sm leading-6 text-slate-700 focus:border-black/30 focus:outline-none"
      />
      <button
        type="button"
        onClick={onAdd}
        className="nodrag mt-3 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        카드 추가
      </button>
    </div>
  );
}

export function makeSolutionFinalNoteNodeLabel(
  note: {
    id: string;
    topicId: string;
    topicTitle: string;
    text: string;
    final_comment: string;
  },
  active: boolean,
  onFocus: (event: React.MouseEvent<HTMLButtonElement>) => void,
) {
  return (
    <button
      type="button"
      onClick={onFocus}
      className={`nopan nodrag box-border block h-full w-full border px-4 py-3 text-left font-['Inter','Noto_Sans_KR',sans-serif] transition ${
        active ? "border-slate-900 bg-white" : "border-black/10 bg-[#fafafa] hover:bg-white"
      }`}
    >
      <p className="text-sm font-semibold text-slate-700">{note.topicTitle}</p>
      <p className="mt-2 line-clamp-4 text-sm leading-6 text-slate-700">{note.text}</p>
      {note.final_comment ? (
        <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-500">{note.final_comment}</p>
      ) : null}
    </button>
  );
}

export function makeSolutionEmptyNodeLabel() {
  return (
    <div className="nopan box-border flex h-full w-full flex-col items-center justify-center border border-dashed border-black/10 bg-white px-6 py-8 text-center font-['Inter','Noto_Sans_KR',sans-serif]">
      <p className="text-base font-semibold text-slate-950">해결책 인사이트를 선택해 주세요</p>
      <p className="mt-2 text-sm leading-6 text-[#777]">
        왼쪽 인사이트를 클릭하면 AI 추천 아이디어와 채택 카드가 오른쪽 캔버스에 표시됩니다.
      </p>
    </div>
  );
}

export function estimateWrappedLines(text: string, charsPerLine: number) {
  const normalized = stripLeadingTimestamp(text).replace(/\s+/g, " ").trim();
  if (!normalized) return 1;
  return normalized
    .split("\n")
    .reduce((count, line) => count + Math.max(1, Math.ceil(line.trim().length / charsPerLine)), 0);
}

export function estimateAgendaNodeHeight(title: string, summary: string, keywordCount: number) {
  const titleLines = estimateWrappedLines(title, 14);
  const summaryLines = estimateWrappedLines(summary, 24);
  const keywordRows = keywordCount > 0 ? Math.ceil(Math.min(keywordCount, 3) / 2) : 0;
  return 122 + titleLines * 28 + summaryLines * 24 + keywordRows * 30;
}

export function estimateProblemTopicNodeHeight(group: ProblemGroupViewModel) {
  const topicLines = Math.min(3, estimateWrappedLines(group.topic || "문제정의", 20));
  const insightLines = group.insight_lens ? Math.min(3, estimateWrappedLines(group.insight_lens, 32)) : 1;
  return Math.max(176, 116 + topicLines * 22 + insightLines * 20);
}

export function makeProblemTopicNodeLabel(
  group: ProblemGroupViewModel,
  index: number,
  selected: boolean,
  loading: boolean,
  dropTarget: boolean,
  sourceCount: number,
  opinionCount: number,
  childCount: number,
  childCollapsed: boolean,
  childLoading: boolean,
  criteriaLoading: boolean,
  hasGroupingRationale: boolean,
  remoteEditing: boolean,
  onShowGroupingRationale: (event: React.MouseEvent<HTMLButtonElement>) => void,
  onGenerateChildren: (event: React.MouseEvent<HTMLButtonElement>) => void,
  onToggleChildren: (event: React.MouseEvent<HTMLButtonElement>) => void,
  onEdit: (event: React.MouseEvent<HTMLButtonElement>) => void,
  onDelete: (event: React.MouseEvent<HTMLButtonElement>) => void,
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void,
  onDragLeave: () => void,
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void,
) {
  const depth = Math.max(0, group.depth || 0);
  const depthLabel = depth > 0 ? `${depth + 1}차` : `분류 ${index + 1}`;
  const detailText = loading
    ? "인사이트를 정리하는 중입니다."
    : group.insight_lens || (group.conclusion && group.conclusion !== group.topic ? group.conclusion : "");

  return (
    <div
      data-problem-group-drop-id={group.group_id}
      className={`nopan box-border min-w-0 rounded-[12px] border bg-white p-4 text-left font-['Inter','Noto_Sans_KR',sans-serif] shadow-[0_1px_0_rgba(0,0,0,0.04)] transition ${
        selected ? "border-[#a13ab8] ring-2 ring-[#a13ab8]/10" : "border-black/10 hover:border-[#a13ab8]/30"
      } ${dropTarget ? "ring-2 ring-fuchsia-300 ring-offset-2" : ""}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-2 rounded-[8px] bg-[#f7ecfb] px-2.5 py-1 text-[11px] font-semibold text-[#a13ab8]">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#a13ab8]" />
          <span className="truncate">{depthLabel}</span>
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {childCount > 0 ? (
            <button
              type="button"
              aria-label={childCollapsed ? "하위 분류 펼치기" : "하위 분류 접기"}
              className="nodrag nopan flex h-7 w-7 items-center justify-center rounded-[8px] border border-black/10 bg-[#f9f9f9] text-sm font-semibold text-[#4d4d4d] transition hover:border-[#a13ab8]/20 hover:bg-[#f7ecfb] hover:text-[#a13ab8]"
              onClick={onToggleChildren}
              onPointerDown={(event) => event.stopPropagation()}
            >
              {childCollapsed ? "+" : "-"}
            </button>
          ) : null}
          <span className={`rounded-[8px] px-2 py-1 text-[11px] font-semibold ${problemGroupStatusTone(group.status)}`}>
            {problemGroupStatusLabel(group.status)}
          </span>
          {remoteEditing ? renderEditPresenceBadge() : null}
        </div>
      </div>
      <strong className="mt-3 block line-clamp-2 text-[18px] font-semibold leading-6 text-black">
        {group.topic || "문제정의 토픽"}
      </strong>
      {detailText ? (
        <p className="mt-2 line-clamp-3 text-[13px] leading-5 text-[#4d4d4d]">
          {detailText}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-1.5 text-[11px] font-semibold">
        <span className="rounded-full bg-[#f7ecfb] px-2.5 py-1 text-[#a13ab8]">근거 {sourceCount}</span>
        {opinionCount > 0 ? (
          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700">의견 {opinionCount}</span>
        ) : null}
        {childCount > 0 ? (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
            하위 {childCount}{childCollapsed ? " 접힘" : ""}
          </span>
        ) : null}
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        <button
          type="button"
          className="nodrag nopan rounded-[8px] border border-black/10 bg-[#f9f9f9] px-2.5 py-1.5 text-xs font-semibold text-[#4d4d4d] transition hover:border-[#a13ab8]/20 hover:bg-[#f7ecfb] hover:text-[#a13ab8] disabled:cursor-wait disabled:opacity-60"
          disabled={criteriaLoading}
          onClick={onShowGroupingRationale}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {criteriaLoading ? "확인 중" : hasGroupingRationale ? "기준 보기" : "묶은 기준"}
        </button>
        <button
          type="button"
          className="nodrag nopan rounded-[8px] border border-[#a13ab8]/20 bg-[#f7ecfb] px-2.5 py-1.5 text-xs font-semibold text-[#a13ab8] transition hover:bg-[#efdaf7] disabled:cursor-wait disabled:opacity-60"
          disabled={childLoading}
          onClick={onGenerateChildren}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {childLoading ? "생성 중" : "+ 세부"}
        </button>
        <button
          type="button"
          className="nodrag nopan rounded-[8px] border border-black/10 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#4d4d4d] transition hover:bg-[#f5f6f8]"
          onClick={onEdit}
          onPointerDown={(event) => event.stopPropagation()}
        >
          수정
        </button>
        <button
          type="button"
          className="nodrag nopan rounded-[8px] border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
          onClick={onDelete}
          onPointerDown={(event) => event.stopPropagation()}
        >
          삭제
        </button>
      </div>
      {dropTarget ? (
        <p className="mt-3 rounded-xl border border-[#a13ab8]/20 bg-[#f7ecfb] px-3 py-2 text-xs font-semibold leading-5 text-[#a13ab8]">
          개인 메모를 놓으면 이 문제정의 그룹의 의견으로 추가됩니다.
        </p>
      ) : null}
    </div>
  );
}

export function estimateSolutionNodeHeight(topic: SolutionTopicViewModel) {
  const topicLines = estimateWrappedLines(topic.topic, 18);
  const conclusionLines = Math.min(
    3,
    estimateWrappedLines(topic.conclusion || topic.problem_conclusion || "해결 방향이 아직 없습니다.", 28),
  );

  return (
    118 +
    Math.max(0, topicLines - 1) * 22 +
    Math.max(0, conclusionLines - 1) * 18 +
    42
  );
}

export function buildGridPositions(heights: number[], gapX: number, gapY: number, baseX: number, baseY: number) {
  const total = heights.length;
  const columns = Math.max(1, Math.ceil(Math.sqrt(Math.max(total, 1))));
  const rowHeights: number[] = [];

  heights.forEach((height, index) => {
    const row = Math.floor(index / columns);
    rowHeights[row] = Math.max(rowHeights[row] || 0, height);
  });

  const rowOffsets: number[] = [];
  let currentY = baseY;
  rowHeights.forEach((height, rowIndex) => {
    rowOffsets[rowIndex] = currentY;
    currentY += height + gapY;
  });

  return heights.map((_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      x: baseX + column * gapX,
      y: rowOffsets[row] ?? baseY,
    };
  });
}

export function buildColumnPositions(
  heights: number[],
  columns: number,
  gapX: number,
  gapY: number,
  baseX: number,
  baseY: number,
) {
  const safeColumns = Math.max(1, columns);
  const rowHeights: number[] = [];

  heights.forEach((height, index) => {
    const row = Math.floor(index / safeColumns);
    rowHeights[row] = Math.max(rowHeights[row] || 0, height);
  });

  const rowOffsets: number[] = [];
  let nextY = baseY;
  rowHeights.forEach((height, rowIndex) => {
    rowOffsets[rowIndex] = nextY;
    nextY += height + gapY;
  });

  return heights.map((_, index) => {
    const column = index % safeColumns;
    const row = Math.floor(index / safeColumns);
    return {
      x: baseX + column * gapX,
      y: rowOffsets[row] ?? baseY,
    };
  });
}

export function estimateSolutionCardLineChars(width: number) {
  return Math.max(22, Math.floor(width / 10.5));
}

