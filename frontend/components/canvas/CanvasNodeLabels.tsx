"use client";

import type * as React from "react";

type ProblemGroupStatus = "draft" | "review" | "final";

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
  emphasis?: "primary" | "default";
  role?: "center" | "satellite" | "dot" | string;
  orbitAngle?: number;
  orbitRing?: number;
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
  if (status === "review") return "bg-[#eef8ff] text-[#236cf3]";
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
  const figmaScaleSize = Math.round(size * 0.132);
  return clampNumber(Math.min(fittedSize, figmaScaleSize), 6, 26);
}

export function makeIdeationKeywordBubbleNodeLabel(bubble: IdeationKeywordBubble, size: number) {
  if (bubble.role === "dot") {
    return (
      <div
        className="h-full w-full rounded-full border border-white/90 bg-[linear-gradient(158deg,#9de5ff_43%,#b2eaff_61%,#fdfeff_87%)] shadow-[0_0.462px_20.787px_rgba(91,173,255,0.18)]"
        aria-hidden="true"
      />
    );
  }

  const offTopic = bubble.offTopic || bubble.kind === "off_topic";
  const primary = !offTopic && (bubble.emphasis === "primary" || bubble.role === "center");
  const fittedFontSize = getIdeationKeywordBubbleFontSize(bubble.text, size);
  const roleScaledFontSize = primary
    ? Math.round(size * 0.126)
    : Math.round(size * 0.165);
  const fontSize = primary
    ? clampNumber(Math.max(fittedFontSize, roleScaledFontSize), 12, 21)
    : clampNumber(Math.min(fittedFontSize + 3, roleScaledFontSize), 10, 15);
  const borderWidth = Number(clampNumber(size / 94, 0.517, 1.041).toFixed(3));
  const normalShadowY = Number(clampNumber(size * 0.00532, 0.259, 0.521).toFixed(3));
  const satelliteIsMedium = size >= 78;
  const satelliteVariantKey = Array.from(bubble.id || bubble.text).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const satelliteUsesSoftSweep = satelliteIsMedium && (bubble.orbitRing === 1 || satelliteVariantKey % 2 === 0);
  const backgroundImage = offTopic
    ? undefined
    : primary
      ? "radial-gradient(ellipse 68% 68% at 84.3% 14.9%, #011aff 0%, #013dff 25%, #015fff 50%, #0181ff 75%, #01a3ff 100%)"
      : satelliteIsMedium
        ? satelliteUsesSoftSweep
          ? "linear-gradient(232.095deg, #09caff 0.194%, #e8faff 81.224%)"
          : "linear-gradient(169.603deg, #09caff 7.752%, #b2eaff 49.345%, #fdfeff 95.14%)"
        : "linear-gradient(153.493deg, #f4ffff 16.639%, #bdedff 69.555%, #fdfeff 83.198%)";
  const bubbleClassName = offTopic
    ? "border-[#ef4e4e]/45 bg-[#fff5f5]"
    : primary
      ? "border-white"
      : "border-white";
  const bubbleStyle: React.CSSProperties = {
    backgroundImage,
    borderWidth,
    boxShadow: offTopic
      ? `0 ${normalShadowY}px 6.75px rgba(239,78,78,0.22)`
      : primary
        ? "0 3.244px 12.016px rgba(1,163,255,0.3), inset 0 3.244px 37.877px rgba(255,255,255,0.22)"
        : satelliteIsMedium
          ? "0 0.462px 10.394px rgba(91,173,255,0.18)"
          : "0 0.361px 8.116px rgba(91,173,255,0.18)",
  };
  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center rounded-full border px-4 text-center font-['Pretendard','Inter','Noto_Sans_KR',sans-serif] ${bubbleClassName}`}
      style={bubbleStyle}
    >
      {offTopic && size >= 92 ? (
        <span className="mb-1 rounded-full bg-[#ef4e4e]/10 px-2 py-0.5 text-[10px] font-semibold leading-none text-[#b23b3b]">
          이탈
        </span>
      ) : null}
      <strong
        className={`max-w-full whitespace-nowrap antialiased ${primary ? "font-bold" : "font-medium"} ${offTopic ? "text-[#a43131]" : primary ? "text-white" : "text-[#004fe2]"}`}
        style={{
          fontSize,
          lineHeight: 1.4,
          maxWidth: Math.max(44, Math.round(size * 0.82)),
          textShadow: primary ? "0 0 3.244px #01a3ff" : undefined,
          textRendering: "geometricPrecision",
          wordBreak: "keep-all",
        }}
      >
        {bubble.text}
      </strong>
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
        selected ? "border-[#01a3ff] ring-2 ring-[#01a3ff]/12" : "border-black/10 hover:border-[#01a3ff]/30"
      } ${dropTarget ? "ring-2 ring-[#01a3ff]/35 ring-offset-2" : ""}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-2 rounded-[8px] bg-[#eef8ff] px-2.5 py-1 text-[11px] font-semibold text-[#236cf3]">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#01a3ff]" />
          <span className="truncate">{depthLabel}</span>
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {childCount > 0 ? (
            <button
              type="button"
              aria-label={childCollapsed ? "하위 분류 펼치기" : "하위 분류 접기"}
              className="nodrag nopan flex h-7 w-7 items-center justify-center rounded-[8px] border border-black/10 bg-[#f9f9f9] text-sm font-semibold text-[#4d4d4d] transition hover:border-[#01a3ff]/30 hover:bg-[#eef8ff] hover:text-[#236cf3]"
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
              className="mt-1 w-full rounded-[10px] border border-black/10 bg-white px-3 py-2 text-[13px] font-semibold leading-5 text-black outline-none transition focus:border-[#01a3ff]/50 focus:ring-2 focus:ring-[#01a3ff]/10"
            />
          </label>
          <label className="block text-[11px] font-semibold text-black/50">
            Insight
            <textarea
              value={draftInsight}
              onChange={(event) => onDraftInsightChange(event.target.value)}
              className="mt-1 min-h-[72px] w-full resize-none rounded-[10px] border border-black/10 bg-white px-3 py-2 text-[13px] leading-5 text-[#333] outline-none transition focus:border-[#01a3ff]/50 focus:ring-2 focus:ring-[#01a3ff]/10"
            />
          </label>
          <label className="block text-[11px] font-semibold text-black/50">
            결론
            <textarea
              value={draftConclusion}
              onChange={(event) => onDraftConclusionChange(event.target.value)}
              className="mt-1 min-h-[88px] w-full resize-none rounded-[10px] border border-black/10 bg-white px-3 py-2 text-[13px] leading-5 text-[#333] outline-none transition focus:border-[#01a3ff]/50 focus:ring-2 focus:ring-[#01a3ff]/10"
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
              className="nodrag nopan rounded-[8px] border border-[#01a3ff] bg-[linear-gradient(90deg,#54c1ff_32.705%,#2f70e9_157.88%)] px-3 py-1.5 text-xs font-semibold tracking-[-0.03px] text-white shadow-[0_-3px_2px_rgba(255,255,255,0.25),0_1.5px_4px_rgba(1,231,255,0.25)] transition hover:brightness-105"
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
            <span className="rounded-full bg-[#eef8ff] px-2.5 py-1 text-[#236cf3]">근거 {sourceCount}</span>
            {opinionCount > 0 ? (
              <span className="rounded-full bg-[#f4f8ff] px-2.5 py-1 text-[#3a52bc]">의견 {opinionCount}</span>
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
              className="nodrag nopan rounded-[8px] border border-black/10 bg-[#f9f9f9] px-2.5 py-1.5 text-xs font-semibold text-[#4d4d4d] transition hover:border-[#01a3ff]/30 hover:bg-[#eef8ff] hover:text-[#236cf3] disabled:cursor-wait disabled:opacity-60"
              disabled={criteriaLoading}
              onClick={onShowGroupingRationale}
              onPointerDown={(event) => event.stopPropagation()}
            >
              {criteriaLoading ? "확인 중" : hasGroupingRationale ? "기준 보기" : "묶은 기준"}
            </button>
            <button
              type="button"
              className="nodrag nopan rounded-[8px] border border-[#01a3ff] bg-[linear-gradient(90deg,#54c1ff_32.705%,#2f70e9_157.88%)] px-2.5 py-1.5 text-xs font-semibold tracking-[-0.03px] text-white shadow-[0_-3px_2px_rgba(255,255,255,0.25),0_1.5px_4px_rgba(1,231,255,0.25)] transition hover:brightness-105 disabled:cursor-wait disabled:border-[#d8d8d8] disabled:bg-none disabled:bg-[#d8d8d8] disabled:shadow-none"
              disabled={childLoading}
              onClick={onGenerateChildren}
              onPointerDown={(event) => event.stopPropagation()}
            >
              {childLoading ? "생성 중" : "+ 세부"}
            </button>
            <button
              type="button"
              className="nodrag nopan rounded-[8px] border border-black/10 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#4d4d4d] transition hover:border-[#01a3ff]/30 hover:bg-[#eef8ff] hover:text-[#236cf3]"
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
        <p className="mt-3 rounded-xl border border-[#01a3ff]/25 bg-[#eef8ff] px-3 py-2 text-xs font-semibold leading-5 text-[#236cf3]">
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

