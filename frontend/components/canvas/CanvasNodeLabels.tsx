"use client";

import type * as React from "react";

type ProblemGroupStatus = "draft" | "review" | "final";
type CanvasItemStatus = "discussion" | "confirmed" | "closed";

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

export function estimateWrappedLines(text: string, charsPerLine: number) {
  const normalized = stripLeadingTimestamp(text).replace(/\s+/g, " ").trim();
  if (!normalized) return 1;
  return normalized
    .split("\n")
    .reduce((count, line) => count + Math.max(1, Math.ceil(line.trim().length / charsPerLine)), 0);
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
  editing: boolean,
  draftTopic: string,
  draftInsight: string,
  draftConclusion: string,
  remoteEditing: boolean,
  onShowGroupingRationale: (event: React.MouseEvent<HTMLButtonElement>) => void,
  onGenerateChildren: (event: React.MouseEvent<HTMLButtonElement>) => void,
  onToggleChildren: (event: React.MouseEvent<HTMLButtonElement>) => void,
  onEdit: (event: React.MouseEvent<HTMLButtonElement>) => void,
  onCancelEdit: () => void,
  onSaveEdit: () => void,
  onDraftTopicChange: (value: string) => void,
  onDraftInsightChange: (value: string) => void,
  onDraftConclusionChange: (value: string) => void,
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
      {editing ? (
        <div
          className="mt-3 space-y-2.5"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <label className="block text-[11px] font-semibold text-black/50">
            제목
            <input
              value={draftTopic}
              onChange={(event) => onDraftTopicChange(event.target.value)}
              className="mt-1 w-full rounded-[10px] border border-black/10 bg-white px-3 py-2 text-[13px] font-semibold leading-5 text-black outline-none transition focus:border-[#a13ab8]/50 focus:ring-2 focus:ring-[#a13ab8]/10"
            />
          </label>
          <label className="block text-[11px] font-semibold text-black/50">
            Insight
            <textarea
              value={draftInsight}
              onChange={(event) => onDraftInsightChange(event.target.value)}
              className="mt-1 min-h-[72px] w-full resize-none rounded-[10px] border border-black/10 bg-white px-3 py-2 text-[13px] leading-5 text-[#333] outline-none transition focus:border-[#a13ab8]/50 focus:ring-2 focus:ring-[#a13ab8]/10"
            />
          </label>
          <label className="block text-[11px] font-semibold text-black/50">
            결론
            <textarea
              value={draftConclusion}
              onChange={(event) => onDraftConclusionChange(event.target.value)}
              className="mt-1 min-h-[88px] w-full resize-none rounded-[10px] border border-black/10 bg-white px-3 py-2 text-[13px] leading-5 text-[#333] outline-none transition focus:border-[#a13ab8]/50 focus:ring-2 focus:ring-[#a13ab8]/10"
            />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              className="nodrag nopan rounded-[8px] border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#4d4d4d] transition hover:bg-[#f5f6f8]"
              onClick={onCancelEdit}
            >
              취소
            </button>
            <button
              type="button"
              className="nodrag nopan rounded-[8px] bg-[#a13ab8] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#8f2fa3]"
              onClick={onSaveEdit}
            >
              저장
            </button>
          </div>
        </div>
      ) : (
        <>
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
        </>
      )}
      {!editing && dropTarget ? (
        <p className="mt-3 rounded-xl border border-[#a13ab8]/20 bg-[#f7ecfb] px-3 py-2 text-xs font-semibold leading-5 text-[#a13ab8]">
          개인 메모를 놓으면 이 문제정의 그룹의 의견으로 추가됩니다.
        </p>
      ) : null}
    </div>
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

