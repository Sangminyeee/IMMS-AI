import { Position } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import type * as React from "react";
import {
  buildNodeContentSignature,
  type CanvasGraphBlueprint,
  type CanvasNodeDescriptor,
} from "@/components/canvas/CanvasGraphTypes";
import type { CanvasNodePositionsByStage } from "@/lib/types";

type ProblemGroupStatus = "draft" | "review" | "final";

export type ProblemExploreGroupNodeModel = {
  group_id: string;
  parent_group_id?: string;
  depth?: number;
  topic: string;
  status: ProblemGroupStatus;
  insight_lens?: string;
  conclusion?: string;
  linked_group_ids?: string[];
  source_summary_items?: string[];
  ideas?: Array<{
    id?: string;
    kind?: string;
    title?: string;
    body?: string;
  }>;
  discussion_items?: Array<{
    id: string;
    parent_group_id?: string;
    target_node_id?: string;
    target_node_label?: string;
    target_node_kind?: string;
    ai_pending?: boolean;
  }>;
};

type ProblemExploreLayoutModel<TGroup extends ProblemExploreGroupNodeModel> = {
  activeGroup: TGroup | null;
  childCountByGroupId: Map<string, number>;
};

type RemoteEditPresence = {
  updated_at?: string;
};

type ProblemExploreBoardRow<TGroup extends ProblemExploreGroupNodeModel> = {
  visualDepth: number;
  items: Array<{
    group: TGroup;
    visualDepth: number;
  }>;
};

type ProblemExploreBoardGroup<TGroup extends ProblemExploreGroupNodeModel> = {
  root: TGroup;
  descendants: Array<{
    group: TGroup;
    visualDepth: number;
  }>;
  rows: ProblemExploreBoardRow<TGroup>[];
  height: number;
  columnCount: number;
  width: number;
};

type ProblemExploreEventHandlers<TGroup extends ProblemExploreGroupNodeModel> = {
  onAttachPersonalNoteToProblemGroup: (groupId: string, noteId: string) => void;
  onCancelProblemGroupEdit: () => void;
  onDeleteProblemGroup: (group: TGroup) => void;
  onDropProblemGroupChange: (groupId: string) => void;
  onGenerateProblemChildren: (group: TGroup) => void;
  onProblemGroupDraftConclusionChange: (value: string) => void;
  onProblemGroupDraftInsightChange: (value: string) => void;
  onProblemGroupDraftTopicChange: (value: string) => void;
  onQuickEditProblemGroup: (group: TGroup) => void;
  onSaveProblemGroupEdit: (groupId: string) => void;
};

const PROBLEM_EXPLORE_BOARD_X = 28;
const PROBLEM_EXPLORE_BOARD_Y = 132;
const PROBLEM_EXPLORE_BOARD_GAP_Y = 45;
const PROBLEM_EXPLORE_BOARD_WIDTH = 1198;
const PROBLEM_EXPLORE_BOARD_MIN_HEIGHT = 489;
const PROBLEM_EXPLORE_BOARD_LEFT_WIDTH = 243;
const PROBLEM_EXPLORE_CARD_WIDTH = 249;
const PROBLEM_EXPLORE_CARD_HEIGHT = 116;
const PROBLEM_EXPLORE_EDIT_CARD_HEIGHT = PROBLEM_EXPLORE_CARD_HEIGHT;
const PROBLEM_EXPLORE_CARD_GAP_X = 27;
const PROBLEM_EXPLORE_CARD_GAP_Y = 47;
const PROBLEM_EXPLORE_BOARD_PADDING_Y = 23;
const PROBLEM_EXPLORE_BOARD_BOTTOM_PADDING = 24;
const PROBLEM_EXPLORE_BOARD_CARD_COLUMNS = 2;
const PROBLEM_EXPLORE_BOARD_MAX_CARD_COLUMNS = 4;
const PROBLEM_EXPLORE_BOARD_PAGE_SIZE = 4;
const PROBLEM_EXPLORE_BOARD_GRID_PAD_LEFT = 24;
const PROBLEM_EXPLORE_BOARD_GRID_PAD_RIGHT = 20;

function makeProblemExploreEditPresenceKey(groupId: string) {
  return `problem_group:${groupId}:`;
}

function problemExploreDetailText(group: ProblemExploreGroupNodeModel, loading: boolean) {
  if (loading) return "인사이트를 정리하는 중입니다.";
  return (group.conclusion && group.conclusion !== group.topic ? group.conclusion : "") || group.insight_lens || "";
}

function problemExploreDepthLabel(group: ProblemExploreGroupNodeModel, visualDepth?: number) {
  const depth = Math.max(1, visualDepth ?? group.depth ?? (group.parent_group_id ? 1 : 0));
  return `${depth + 1}차`;
}

function buildProblemExploreChildrenByParent<TGroup extends ProblemExploreGroupNodeModel>(problemGroups: TGroup[]) {
  const childGroupsByParentId = new Map<string, TGroup[]>();
  problemGroups.forEach((group) => {
    const parentId = group.parent_group_id || "";
    const children = childGroupsByParentId.get(parentId) || [];
    children.push(group);
    childGroupsByParentId.set(parentId, children);
  });
  return childGroupsByParentId;
}

function resolveProblemExploreBoardColumnCount<TGroup extends ProblemExploreGroupNodeModel>(
  rows: ProblemExploreBoardRow<TGroup>[],
) {
  const maxRowCount = Math.max(0, ...rows.map((row) => row.items.length));
  if (maxRowCount <= 0) return PROBLEM_EXPLORE_BOARD_CARD_COLUMNS;
  return Math.min(
    PROBLEM_EXPLORE_BOARD_MAX_CARD_COLUMNS,
    Math.max(PROBLEM_EXPLORE_BOARD_CARD_COLUMNS, Math.min(maxRowCount, PROBLEM_EXPLORE_BOARD_PAGE_SIZE)),
  );
}

function resolveProblemExploreBoardWidth(columnCount: number) {
  const cardsWidth = columnCount * PROBLEM_EXPLORE_CARD_WIDTH;
  const gapsWidth = Math.max(0, columnCount - 1) * PROBLEM_EXPLORE_CARD_GAP_X;
  const contentWidth =
    PROBLEM_EXPLORE_BOARD_LEFT_WIDTH +
    PROBLEM_EXPLORE_BOARD_GRID_PAD_LEFT +
    cardsWidth +
    gapsWidth +
    PROBLEM_EXPLORE_BOARD_GRID_PAD_RIGHT;
  return Math.max(PROBLEM_EXPLORE_BOARD_WIDTH, contentWidth);
}

function buildProblemExploreRootGroups<TGroup extends ProblemExploreGroupNodeModel>(problemGroups: TGroup[]) {
  const problemGroupIds = new Set(problemGroups.map((group) => group.group_id));
  const rootProblemGroupCandidates = problemGroups.filter(
    (group) => !group.parent_group_id || !problemGroupIds.has(group.parent_group_id || ""),
  );
  return rootProblemGroupCandidates.length > 0 ? rootProblemGroupCandidates : problemGroups;
}

function collectProblemExploreDescendants<TGroup extends ProblemExploreGroupNodeModel>(
  group: TGroup,
  childGroupsByParentId: Map<string, TGroup[]>,
  trail = new Set<string>(),
): Array<{ group: TGroup; visualDepth: number }> {
  if (trail.has(group.group_id)) return [];

  const seen = new Set(trail);
  seen.add(group.group_id);
  const result: Array<{ group: TGroup; visualDepth: number }> = [];
  let queue = (childGroupsByParentId.get(group.group_id) || []).map((child) => ({
    group: child,
    visualDepth: 1,
  }));

  while (queue.length > 0) {
    const nextQueue: Array<{ group: TGroup; visualDepth: number }> = [];
    queue.forEach((item) => {
      if (seen.has(item.group.group_id)) return;
      seen.add(item.group.group_id);
      result.push(item);
      (childGroupsByParentId.get(item.group.group_id) || []).forEach((child) => {
        nextQueue.push({
          group: child,
          visualDepth: item.visualDepth + 1,
        });
      });
    });
    queue = nextQueue;
  }

  return result;
}

function buildProblemExploreRows<TGroup extends ProblemExploreGroupNodeModel>(
  descendants: Array<{ group: TGroup; visualDepth: number }>,
) {
  const rowsByDepth = new Map<number, ProblemExploreBoardRow<TGroup>>();
  descendants.forEach((item) => {
    const row = rowsByDepth.get(item.visualDepth) || { visualDepth: item.visualDepth, items: [] };
    row.items.push(item);
    rowsByDepth.set(item.visualDepth, row);
  });
  return Array.from(rowsByDepth.values()).sort((left, right) => left.visualDepth - right.visualDepth);
}

function estimateProblemExploreBoardHeight<TGroup extends ProblemExploreGroupNodeModel>(
  rows: ProblemExploreBoardRow<TGroup>[],
  editingProblemGroupId: string,
) {
  const rowCount = Math.max(1, rows.length);
  const rowHeights = Array.from({ length: rowCount }, () => PROBLEM_EXPLORE_CARD_HEIGHT);
  rows.forEach((row, rowIndex) => {
    rowHeights[rowIndex] = Math.max(
      rowHeights[rowIndex] || PROBLEM_EXPLORE_CARD_HEIGHT,
      row.items.some((item) => editingProblemGroupId === item.group.group_id)
        ? PROBLEM_EXPLORE_EDIT_CARD_HEIGHT
        : PROBLEM_EXPLORE_CARD_HEIGHT,
    );
  });
  const contentHeight =
    PROBLEM_EXPLORE_BOARD_PADDING_Y +
    rowHeights.reduce((total, height) => total + height, 0) +
    Math.max(0, rowHeights.length - 1) * PROBLEM_EXPLORE_CARD_GAP_Y +
    PROBLEM_EXPLORE_BOARD_BOTTOM_PADDING;
  return Math.max(PROBLEM_EXPLORE_BOARD_MIN_HEIGHT, contentHeight);
}

function buildProblemExploreBoards<TGroup extends ProblemExploreGroupNodeModel>(
  problemGroups: TGroup[],
  editingProblemGroupId: string,
) {
  const childGroupsByParentId = buildProblemExploreChildrenByParent(problemGroups);
  const rootGroups = buildProblemExploreRootGroups(problemGroups);
  return rootGroups.map((root): ProblemExploreBoardGroup<TGroup> => {
    const descendants = collectProblemExploreDescendants(root, childGroupsByParentId);
    const rows = buildProblemExploreRows(descendants);
    const columnCount = resolveProblemExploreBoardColumnCount(rows);
    return {
      root,
      descendants,
      rows,
      height: estimateProblemExploreBoardHeight(rows, editingProblemGroupId),
      columnCount,
      width: resolveProblemExploreBoardWidth(columnCount),
    };
  });
}

function AddIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PencilIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path d="m5 17.8.8-3.8 8.7-8.7a2.1 2.1 0 0 1 3 0l1.2 1.2a2.1 2.1 0 0 1 0 3L10 18.2l-3.8.8A1 1 0 0 1 5 17.8Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m13.2 6.6 4.2 4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path d="M6.5 8h11M10 8V6.5h4V8M8.2 8l.7 10.2h6.2L15.8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path d="m6 12.5 4 4L18 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function XIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function ChevronLeftIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path d="m15 6-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ProblemExploreIconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      onPointerDown={(event) => event.stopPropagation()}
      className="moa-node-control nodrag nopan grid h-[18px] w-[18px] place-items-center rounded-full text-[#808080] transition hover:bg-[#eef8ff] hover:text-[#236cf3] disabled:cursor-wait disabled:opacity-45"
    >
      {children}
    </button>
  );
}

function ProblemExploreInlineTextarea({
  value,
  onChange,
  placeholder,
  maxHeight,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  maxHeight: number;
  className: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    textarea.style.height = "auto";
    const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [maxHeight, value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      rows={1}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      className={className}
    />
  );
}

function ProblemExploreInlineEditActions({
  onCancel,
  onSave,
}: {
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-[4px]">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onCancel();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        className="moa-node-control nodrag nopan grid h-[18px] w-[18px] place-items-center rounded-full bg-[#f2f4f8] text-[#737982] transition hover:bg-[#e7edf7]"
        aria-label="수정 취소"
      >
        <XIcon className="h-[11px] w-[11px]" />
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onSave();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        className="moa-node-control nodrag nopan grid h-[18px] w-[18px] place-items-center rounded-full bg-[#236cf3] text-white transition hover:brightness-105"
        aria-label="수정 저장"
      >
        <CheckIcon className="h-[11px] w-[11px]" />
      </button>
    </div>
  );
}

function ProblemExploreInlineTitleInput({
  draftTopic,
  onDraftTopicChange,
  className,
}: {
  draftTopic: string;
  onDraftTopicChange: (value: string) => void;
  className: string;
}) {
  return (
    <input
      value={draftTopic}
      autoFocus
      onChange={(event) => onDraftTopicChange(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      className={className}
    />
  );
}

function problemExploreDropHandlers<TGroup extends ProblemExploreGroupNodeModel>(
  group: TGroup,
  handlers: Pick<ProblemExploreEventHandlers<TGroup>, "onAttachPersonalNoteToProblemGroup" | "onDropProblemGroupChange">,
) {
  return {
    onDragOver: (event: React.DragEvent<HTMLElement>) => {
      const types = Array.from(event.dataTransfer.types || []);
      const isNoteDrag = types.includes("application/x-imms-note-id") || types.includes("text/plain");
      if (!isNoteDrag) return;
      event.preventDefault();
      event.stopPropagation();
      handlers.onDropProblemGroupChange(group.group_id);
    },
    onDragLeave: () => {
      handlers.onDropProblemGroupChange("");
    },
    onDrop: (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const noteId = event.dataTransfer.getData("application/x-imms-note-id") || event.dataTransfer.getData("text/plain");
      if (!noteId) return;
      handlers.onAttachPersonalNoteToProblemGroup(group.group_id, noteId);
      handlers.onDropProblemGroupChange("");
    },
  };
}

function ProblemExploreCard<TGroup extends ProblemExploreGroupNodeModel>({
  group,
  visualDepth,
  selected,
  loading,
  dropTarget,
  childLoading,
  editing,
  remoteEditing,
  draftTopic,
  draftConclusion,
  handlers,
}: {
  group: TGroup;
  visualDepth: number;
  selected: boolean;
  loading: boolean;
  dropTarget: boolean;
  childLoading: boolean;
  editing: boolean;
  remoteEditing: boolean;
  draftTopic: string;
  draftConclusion: string;
  handlers: ProblemExploreEventHandlers<TGroup>;
}) {
  const detailText = problemExploreDetailText(group, loading);
  const dropHandlers = problemExploreDropHandlers(group, handlers);
  return (
    <article
      data-problem-group-drop-id={group.group_id}
      className={`moa-node-card moa-node-enter nopan relative flex min-h-[116px] w-[249px] flex-col rounded-[4px] border bg-[#f9f9f9] px-[10px] pb-[8px] pt-[9px] text-left font-['Pretendard','Inter','Noto_Sans_KR',sans-serif] shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition ${
        selected ? "border-[#01a3ff] ring-2 ring-[#01a3ff]/15" : "border-[#cecccc]"
      } ${dropTarget ? "ring-2 ring-[#01a3ff]/35 ring-offset-2" : ""} ${editing ? "moa-node-editing" : ""}`}
      {...dropHandlers}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex h-[16px] min-w-[32px] items-center justify-center rounded-full bg-[#236cf3] px-[10px] text-[8px] font-bold leading-none text-white">
          {problemExploreDepthLabel(group, visualDepth)}
        </span>
        {editing ? (
          <ProblemExploreInlineEditActions
            onCancel={handlers.onCancelProblemGroupEdit}
            onSave={() => handlers.onSaveProblemGroupEdit(group.group_id)}
          />
        ) : remoteEditing ? (
          <span className="moa-state-callout rounded-full bg-[#fff7ed] px-2 py-0.5 text-[9px] font-bold text-[#c2410c]">
            수정중
          </span>
        ) : null}
      </div>
      {editing ? (
        <>
          <ProblemExploreInlineTitleInput
            draftTopic={draftTopic}
            onDraftTopicChange={handlers.onProblemGroupDraftTopicChange}
            className="moa-node-input nodrag nopan mt-[10px] block h-[16px] w-full rounded-[3px] bg-transparent px-0 text-[11px] font-bold leading-[16px] tracking-[-0.03px] text-[#111] outline-none transition focus:bg-[#eef8ff]"
          />
          <ProblemExploreInlineTextarea
            value={draftConclusion}
            onChange={handlers.onProblemGroupDraftConclusionChange}
            placeholder="내용 없음"
            maxHeight={44}
            className="moa-node-input nodrag nopan mt-[4px] block min-h-[24px] w-full resize-none rounded-[3px] bg-transparent p-0 text-[8.5px] font-medium leading-[12px] tracking-[-0.02px] text-[#4d4d4d] outline-none transition placeholder:text-[#9aa3af] focus:bg-[#eef8ff]"
          />
        </>
      ) : (
        <>
          <strong className="mt-[10px] line-clamp-1 text-[11px] font-bold leading-[16px] tracking-[-0.03px] text-[#111]">
            {group.topic || "문제 후보"}
          </strong>
          {detailText ? (
            <p className="mt-[4px] line-clamp-2 text-[8.5px] font-medium leading-[12px] tracking-[-0.02px] text-[#4d4d4d]">
              {detailText}
            </p>
          ) : null}
          <div className="mt-auto flex items-center justify-between pt-[9px]">
            <ProblemExploreIconButton
              label="세부 후보 생성"
              disabled={childLoading}
              onClick={(event) => {
                event.stopPropagation();
                handlers.onGenerateProblemChildren(group);
              }}
            >
              <AddIcon className="h-[12px] w-[12px]" />
            </ProblemExploreIconButton>
            <div className="flex items-center gap-[5px]">
              <ProblemExploreIconButton
                label="문제 후보 수정"
                disabled={remoteEditing}
                onClick={(event) => {
                  event.stopPropagation();
                  if (remoteEditing) return;
                  handlers.onQuickEditProblemGroup(group);
                }}
              >
                <PencilIcon className="h-[12px] w-[12px]" />
              </ProblemExploreIconButton>
              <ProblemExploreIconButton
                label="문제 후보 삭제"
                onClick={(event) => {
                  event.stopPropagation();
                  handlers.onDeleteProblemGroup(group);
                }}
              >
                <TrashIcon className="h-[12px] w-[12px]" />
              </ProblemExploreIconButton>
            </div>
          </div>
        </>
      )}
    </article>
  );
}

function ProblemExploreBoard<TGroup extends ProblemExploreGroupNodeModel>({
  board,
  rootIndex,
  activeGroupId,
  loadingProblemGroupIds,
  dropProblemGroupId,
  problemChildGenerationPendingId,
  editingProblemGroupId,
  problemGroupDraftTopic,
  problemGroupDraftConclusion,
  remoteEditPresenceByKey,
  handlers,
}: {
  board: ProblemExploreBoardGroup<TGroup>;
  rootIndex: number;
  activeGroupId: string;
  loadingProblemGroupIds: string[];
  dropProblemGroupId: string;
  problemChildGenerationPendingId: string;
  editingProblemGroupId: string;
  problemGroupDraftTopic: string;
  problemGroupDraftConclusion: string;
  remoteEditPresenceByKey: Record<string, RemoteEditPresence | null | undefined>;
  handlers: ProblemExploreEventHandlers<TGroup>;
}) {
  const { root, descendants, rows, height, columnCount, width } = board;
  const rootEditing = editingProblemGroupId === root.group_id;
  const rootSelected = activeGroupId === root.group_id;
  const rootLoading = loadingProblemGroupIds.includes(root.group_id);
  const rootDetailText = problemExploreDetailText(root, rootLoading);
  const rootDropHandlers = problemExploreDropHandlers(root, handlers);
  const rootRemoteEditing = Boolean(remoteEditPresenceByKey[makeProblemExploreEditPresenceKey(root.group_id)]);
  const [requestedPageIndex, setRequestedPageIndex] = useState(0);
  const totalPages = Math.max(
    1,
    ...rows.map((row) => Math.ceil(row.items.length / PROBLEM_EXPLORE_BOARD_PAGE_SIZE)),
  );
  const pageIndex = Math.min(requestedPageIndex, totalPages - 1);
  const pageStartIndex = pageIndex * PROBLEM_EXPLORE_BOARD_PAGE_SIZE;
  const visibleRows = rows
    .map((row) => ({
      ...row,
      items: row.items.slice(pageStartIndex, pageStartIndex + PROBLEM_EXPLORE_BOARD_PAGE_SIZE),
    }))
    .filter((row) => row.items.length > 0);

  return (
    <div
      className="moa-node-board moa-node-enter nopan grid overflow-hidden rounded-[8px] border border-[#cecccc] bg-white text-left font-['Pretendard','Inter','Noto_Sans_KR',sans-serif] shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
      style={{ width, height, gridTemplateColumns: `${PROBLEM_EXPLORE_BOARD_LEFT_WIDTH}px 1fr` }}
    >
      <aside
        data-problem-group-drop-id={root.group_id}
        className={`relative border-r border-[#dfdfdf] bg-white px-[18px] py-[23px] ${rootSelected ? "ring-2 ring-inset ring-[#01a3ff]/12" : ""} ${
          dropProblemGroupId === root.group_id ? "ring-2 ring-inset ring-[#01a3ff]/35" : ""
        }`}
        {...rootDropHandlers}
      >
        {rootEditing ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <ProblemExploreInlineEditActions
                onCancel={handlers.onCancelProblemGroupEdit}
                onSave={() => handlers.onSaveProblemGroupEdit(root.group_id)}
              />
              <div className="inline-flex h-[22px] shrink-0 items-center rounded-full bg-[#f0f1f3] px-[10px] text-[9px] font-bold leading-none text-[#767676]">
                분류{rootIndex + 1}
              </div>
            </div>
            <div className="mt-[19px] min-w-0">
              <ProblemExploreInlineTitleInput
                draftTopic={problemGroupDraftTopic}
                onDraftTopicChange={handlers.onProblemGroupDraftTopicChange}
                className="moa-node-input nodrag nopan block min-h-[32px] w-full rounded-[3px] bg-transparent px-0 text-[12px] font-bold leading-[16px] tracking-[-0.03px] text-[#111] outline-none transition focus:bg-[#eef8ff]"
              />
              <p className="mt-[7px] text-[11px] font-medium leading-[16px] tracking-[-0.03px] text-[#4d4d4d]">
                {descendants.length} cards
              </p>
            </div>
            <ProblemExploreInlineTextarea
              value={problemGroupDraftConclusion}
              onChange={handlers.onProblemGroupDraftConclusionChange}
              placeholder="내용 없음"
              maxHeight={142}
              className="moa-node-input nodrag nopan mt-[14px] block min-h-[32px] w-full resize-none rounded-[3px] bg-transparent p-0 text-[10px] font-medium leading-[16px] text-[#737982] outline-none transition placeholder:text-[#9aa3af] focus:bg-[#eef8ff]"
            />
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="line-clamp-2 text-[12px] font-bold leading-[16px] tracking-[-0.03px] text-[#111]">
                  {root.topic || "문제 후보 분류"}
                </h3>
                <p className="mt-[7px] text-[11px] font-medium leading-[16px] tracking-[-0.03px] text-[#4d4d4d]">
                  {descendants.length} cards
                </p>
              </div>
              {rootRemoteEditing ? (
                <span className="moa-state-callout shrink-0 rounded-full bg-[#fff7ed] px-2 py-0.5 text-[9px] font-bold text-[#c2410c]">
                  수정중
                </span>
              ) : null}
              <div className="flex shrink-0 items-center gap-[4px]">
                <ProblemExploreIconButton
                  label="분류 수정"
                  disabled={rootRemoteEditing}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (rootRemoteEditing) return;
                    handlers.onQuickEditProblemGroup(root);
                  }}
                >
                  <PencilIcon className="h-[12px] w-[12px]" />
                </ProblemExploreIconButton>
                <ProblemExploreIconButton
                  label="분류 삭제"
                  onClick={(event) => {
                    event.stopPropagation();
                    handlers.onDeleteProblemGroup(root);
                  }}
                >
                  <TrashIcon className="h-[12px] w-[12px]" />
                </ProblemExploreIconButton>
                <span className="inline-flex h-[22px] shrink-0 items-center rounded-full bg-[#f0f1f3] px-[10px] text-[9px] font-bold leading-none text-[#767676]">
                  분류{rootIndex + 1}
                </span>
              </div>
            </div>
            {rootDetailText ? (
              <p className="mt-[14px] line-clamp-6 text-[10px] font-medium leading-[16px] text-[#737982]">
                {rootDetailText}
              </p>
            ) : null}
            <button
              type="button"
              disabled={problemChildGenerationPendingId === root.group_id}
              onClick={(event) => {
                event.stopPropagation();
                handlers.onGenerateProblemChildren(root);
              }}
              onPointerDown={(event) => event.stopPropagation()}
              className="moa-node-control nodrag nopan absolute bottom-[23px] left-[17px] flex h-[27px] w-[207px] items-center justify-center rounded-[5.195px] border-[0.649px] border-[#01a3ff] bg-[rgba(1,163,255,0.03)] text-[10px] font-semibold leading-[15.584px] tracking-[-0.25px] text-[#01a3ff] transition hover:bg-white hover:text-[#0780f8] disabled:cursor-wait disabled:border-[#d8d8d8] disabled:bg-[#f7f7f7] disabled:text-[#90a1b9]"
            >
              <AddIcon className="mr-[7px] h-[10px] w-[10px]" />
              {problemChildGenerationPendingId === root.group_id ? "생성 중" : "세부 내용 추가"}
            </button>
          </>
        )}
      </aside>

      <div
        className="relative min-h-0 overflow-hidden bg-white"
        style={{
          backgroundImage:
            "linear-gradient(to bottom, transparent 0, transparent 162px, #dfdfdf 162px, #dfdfdf 163px, transparent 163px)",
          backgroundSize: "100% 163px",
          backgroundPosition: "0 0",
        }}
      >
        {descendants.length > 0 ? (
          <div
            className="flex flex-col"
            style={{
              gap: PROBLEM_EXPLORE_CARD_GAP_Y,
              padding: `${PROBLEM_EXPLORE_BOARD_PADDING_Y}px ${PROBLEM_EXPLORE_BOARD_GRID_PAD_RIGHT}px ${PROBLEM_EXPLORE_BOARD_BOTTOM_PADDING}px ${PROBLEM_EXPLORE_BOARD_GRID_PAD_LEFT}px`,
            }}
          >
            {visibleRows.map((row) => (
              <div
                key={row.visualDepth}
                className="grid"
                style={{
                  gridTemplateColumns: `repeat(${columnCount}, ${PROBLEM_EXPLORE_CARD_WIDTH}px)`,
                  columnGap: PROBLEM_EXPLORE_CARD_GAP_X,
                }}
              >
                {row.items.map(({ group, visualDepth }) => {
                  const editing = editingProblemGroupId === group.group_id;
                  return (
                    <ProblemExploreCard
                      key={group.group_id}
                      group={group}
                      visualDepth={visualDepth}
                      selected={activeGroupId === group.group_id}
                      loading={loadingProblemGroupIds.includes(group.group_id)}
                      dropTarget={dropProblemGroupId === group.group_id}
                      childLoading={problemChildGenerationPendingId === group.group_id}
                      editing={editing}
                      remoteEditing={Boolean(remoteEditPresenceByKey[makeProblemExploreEditPresenceKey(group.group_id)])}
                      draftTopic={editing ? problemGroupDraftTopic : ""}
                      draftConclusion={editing ? problemGroupDraftConclusion : ""}
                      handlers={handlers}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-8 text-center text-[12px] font-medium leading-6 text-[#90a1b9]">
            세부 후보가 아직 없습니다. 왼쪽의 세부 내용 추가를 눌러 후보를 생성하세요.
          </div>
        )}
        {totalPages > 1 ? (
          <div className="absolute bottom-[20px] right-[20px] flex items-center gap-[6px] rounded-full border border-[#d8e6f5] bg-white/95 px-[8px] py-[5px] shadow-[0_4px_14px_rgba(35,108,243,0.08)]">
            <button
              type="button"
              aria-label="이전 세부 페이지"
              disabled={pageIndex === 0}
              onClick={(event) => {
                event.stopPropagation();
                setRequestedPageIndex((currentPage) => Math.max(0, currentPage - 1));
              }}
              onPointerDown={(event) => event.stopPropagation()}
              className="moa-node-control nodrag nopan grid h-[22px] w-[22px] place-items-center rounded-full text-[#236cf3] transition hover:bg-[#eef8ff] disabled:cursor-default disabled:text-[#c7d4e6]"
            >
              <ChevronLeftIcon className="h-[13px] w-[13px]" />
            </button>
            <span className="min-w-[30px] text-center text-[10px] font-bold leading-none tracking-[-0.025px] text-[#505050]">
              {pageIndex + 1}/{totalPages}
            </span>
            <button
              type="button"
              aria-label="다음 세부 페이지"
              disabled={pageIndex >= totalPages - 1}
              onClick={(event) => {
                event.stopPropagation();
                setRequestedPageIndex((currentPage) => Math.min(totalPages - 1, currentPage + 1));
              }}
              onPointerDown={(event) => event.stopPropagation()}
              className="moa-node-control nodrag nopan grid h-[22px] w-[22px] place-items-center rounded-full text-[#236cf3] transition hover:bg-[#eef8ff] disabled:cursor-default disabled:text-[#c7d4e6]"
            >
              <ChevronRightIcon className="h-[13px] w-[13px]" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function buildProblemExploreCanvasBlueprint<TGroup extends ProblemExploreGroupNodeModel>(input: {
  collapsedProblemGroupIds: Set<string>;
  dropProblemGroupId: string;
  getProblemGroupSourceCount: (group: TGroup) => number;
  loadingProblemGroupIds: string[];
  nodePositions: CanvasNodePositionsByStage;
  onAttachPersonalNoteToProblemGroup: (groupId: string, noteId: string) => void;
  onCancelProblemGroupEdit: () => void;
  onDeleteProblemGroup: (group: TGroup) => void;
  onDropProblemGroupChange: (groupId: string) => void;
  onGenerateProblemChildren: (group: TGroup) => void;
  onProblemGroupDraftConclusionChange: (value: string) => void;
  onProblemGroupDraftInsightChange: (value: string) => void;
  onProblemGroupDraftTopicChange: (value: string) => void;
  onQuickEditProblemGroup: (group: TGroup) => void;
  onSaveProblemGroupEdit: (groupId: string) => void;
  onShowProblemGroupingRationale: (group: TGroup) => void;
  onToggleProblemChildren: (groupId: string) => void;
  problemChildGenerationPendingId: string;
  editingProblemGroupId: string;
  problemExploreLayout: ProblemExploreLayoutModel<TGroup>;
  problemGroupDraftConclusion: string;
  problemGroupDraftTopic: string;
  problemGroupingRationaleById: Record<string, unknown>;
  problemGroupingRationalePendingId: string;
  problemGroups: TGroup[];
  remoteEditPresenceByKey: Record<string, RemoteEditPresence | null | undefined>;
  stage: string;
}): CanvasGraphBlueprint {
  const {
    dropProblemGroupId,
    loadingProblemGroupIds,
    onAttachPersonalNoteToProblemGroup,
    onCancelProblemGroupEdit,
    onDeleteProblemGroup,
    onDropProblemGroupChange,
    onGenerateProblemChildren,
    onProblemGroupDraftConclusionChange,
    onProblemGroupDraftInsightChange,
    onProblemGroupDraftTopicChange,
    onQuickEditProblemGroup,
    onSaveProblemGroupEdit,
    problemChildGenerationPendingId,
    editingProblemGroupId,
    problemExploreLayout,
    problemGroupDraftConclusion,
    problemGroupDraftTopic,
    problemGroups,
    remoteEditPresenceByKey,
    stage,
  } = input;
  const activeGroupId = problemExploreLayout.activeGroup?.group_id || "";
  const boards = buildProblemExploreBoards(problemGroups, editingProblemGroupId);
  const handlers: ProblemExploreEventHandlers<TGroup> = {
    onAttachPersonalNoteToProblemGroup,
    onCancelProblemGroupEdit,
    onDeleteProblemGroup,
    onDropProblemGroupChange,
    onGenerateProblemChildren,
    onProblemGroupDraftConclusionChange,
    onProblemGroupDraftInsightChange,
    onProblemGroupDraftTopicChange,
    onQuickEditProblemGroup,
    onSaveProblemGroupEdit,
  };

  let nextY = PROBLEM_EXPLORE_BOARD_Y;
  const nodeDescriptors: CanvasNodeDescriptor[] = boards.map((board, rootIndex) => {
    const position = { x: PROBLEM_EXPLORE_BOARD_X, y: nextY };
    nextY += board.height + PROBLEM_EXPLORE_BOARD_GAP_Y;
    const nodeId = `problem-${board.root.group_id}`;
    return {
      id: nodeId,
      position,
      positionSource: "computed",
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      className: "!border-0 !bg-transparent !p-0 !shadow-none",
      style: { width: board.width, height: board.height, padding: 0 },
      draggable: false,
      selectable: false,
      data: {
        contentSignature: buildNodeContentSignature([
          "problem-explore-board",
          board.root.group_id,
          board.root.parent_group_id || "",
          board.root.depth || 0,
          board.root.topic,
          board.root.status,
          board.root.insight_lens || "",
          board.root.conclusion || "",
          board.height,
          board.width,
          board.columnCount,
          activeGroupId,
          dropProblemGroupId,
          problemChildGenerationPendingId,
          editingProblemGroupId,
          loadingProblemGroupIds.includes(board.root.group_id),
          remoteEditPresenceByKey[makeProblemExploreEditPresenceKey(board.root.group_id)]?.updated_at || "",
          problemGroupDraftTopic,
          problemGroupDraftConclusion,
          ...board.descendants.flatMap(({ group, visualDepth }) => [
            group.group_id,
            group.parent_group_id || "",
            group.depth || 0,
            visualDepth,
            group.topic,
            group.status,
            group.insight_lens || "",
            group.conclusion || "",
            loadingProblemGroupIds.includes(group.group_id),
            remoteEditPresenceByKey[makeProblemExploreEditPresenceKey(group.group_id)]?.updated_at || "",
          ]),
        ]),
        label: (
          <ProblemExploreBoard
            board={board}
            rootIndex={rootIndex}
            activeGroupId={activeGroupId}
            loadingProblemGroupIds={loadingProblemGroupIds}
            dropProblemGroupId={dropProblemGroupId}
            problemChildGenerationPendingId={problemChildGenerationPendingId}
            editingProblemGroupId={editingProblemGroupId}
            problemGroupDraftTopic={problemGroupDraftTopic}
            problemGroupDraftConclusion={problemGroupDraftConclusion}
            remoteEditPresenceByKey={remoteEditPresenceByKey}
            handlers={handlers}
          />
        ),
      },
    };
  });

  return {
    layoutSignature: buildNodeContentSignature([
      stage,
      activeGroupId,
      ...problemGroups.flatMap((group) => [
        group.group_id,
        group.parent_group_id || "",
        group.depth || 0,
        group.topic,
        group.status,
        group.insight_lens || "",
        group.conclusion || "",
        editingProblemGroupId === group.group_id,
        editingProblemGroupId === group.group_id ? problemGroupDraftTopic : "",
        editingProblemGroupId === group.group_id ? problemGroupDraftConclusion : "",
        ...(group.linked_group_ids || []),
        ...(group.source_summary_items || []),
        ...(group.ideas || []).flatMap((idea) => [idea.id, idea.kind, idea.title, idea.body]),
        ...(group.discussion_items || []).flatMap((item) => [
          item.id,
          item.parent_group_id,
          item.target_node_id || "",
          item.target_node_label || "",
          item.target_node_kind || "",
          item.ai_pending ? "pending" : "ready",
        ]),
      ]),
    ]),
    nodeDescriptors,
  };
}
