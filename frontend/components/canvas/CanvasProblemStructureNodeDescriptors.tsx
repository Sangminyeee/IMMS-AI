import { Position } from "@xyflow/react";
import type * as React from "react";
import {
  buildNodeContentSignature,
  type CanvasGraphBlueprint,
  type CanvasNodeDescriptor,
} from "@/components/canvas/CanvasGraphTypes";
import {
  buildProblemStructureNodesFromGroups,
  type ProblemStructureDragState,
  type ProblemStructureGroupViewModel,
  type ProblemStructureNodeViewModel,
  type ProblemStructureSourceGroup,
} from "@/components/canvas/problemStructureModel";
import type { CanvasEditPresencePayload } from "@/lib/types";

type RemoteEditPresence = CanvasEditPresencePayload | null | undefined;
type IconProps = {
  className?: string;
};

const UNGROUPED_STRUCTURE_COLUMN_ID = "__ungrouped__";
const PROBLEM_STRUCTURE_COLUMN_WIDTH = 272;
const PROBLEM_STRUCTURE_COLUMN_GAP = 34;
const PROBLEM_STRUCTURE_BASE_X = 40;
const PROBLEM_STRUCTURE_BASE_Y = 178;
const PROBLEM_STRUCTURE_HEADER_OFFSET = 140;
const PROBLEM_STRUCTURE_CARD_PERIOD = 130;

function makeProblemStructureEditPresenceKey(
  targetType: CanvasEditPresencePayload["target_type"],
  targetId: string,
  noteId = "",
) {
  return `${targetType}:${targetId}:${noteId}`;
}

function MoreHorizontalIcon({ className = "" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 18 18" fill="none">
      <circle cx="4" cy="9" r="1.4" fill="currentColor" />
      <circle cx="9" cy="9" r="1.4" fill="currentColor" />
      <circle cx="14" cy="9" r="1.4" fill="currentColor" />
    </svg>
  );
}

function PlusIcon({ className = "" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 18 18" fill="none">
      <path d="M9 4v10M4 9h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PencilIcon({ className = "" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 18 18" fill="none">
      <path
        d="M4 12.9 4.7 10l6.8-6.8a1.5 1.5 0 0 1 2.1 0l1.2 1.2a1.5 1.5 0 0 1 0 2.1L8 13.3l-2.9.7a.9.9 0 0 1-1.1-1.1Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path d="m10.5 4.2 3.3 3.3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon({ className = "" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 18 18" fill="none">
      <path d="M4.5 6h9M7.2 6V4.8h3.6V6M6 7.6l.5 5.8h5l.5-5.8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon({ className = "" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 18 18" fill="none">
      <path d="m4.5 9.2 2.8 2.8 6.2-6.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function XIcon({ className = "" }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 18 18" fill="none">
      <path d="m5 5 8 8M13 5l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function problemStructureColumnLabel(isUngrouped: boolean, index: number) {
  return isUngrouped ? "미분류" : `분류${index}`;
}

function problemStructureColumnHeight(cardCount: number) {
  return PROBLEM_STRUCTURE_HEADER_OFFSET + Math.max(1, cardCount) * PROBLEM_STRUCTURE_CARD_PERIOD;
}

function problemStructureCardsCountLabel(count: number) {
  return `${count} cards`;
}

function problemStructureDepthLabel(depth: number) {
  return `${Math.max(2, depth + 2)}차`;
}

function problemStructureDepthTone(depth: number) {
  const depthIndex = Math.max(2, depth + 2);
  if (depthIndex === 2) return "bg-[rgba(1,163,255,0.8)]";
  if (depthIndex === 3) return "bg-[#005cdc]";
  return "bg-[#04044a]";
}

function renderProblemStructureEditPresenceBadge(label = "수정중") {
  return (
    <span className="inline-flex items-center rounded-full border border-[#f1d7a7] bg-[#fff8e8] px-2 py-0.5 text-[10px] font-semibold text-[#9a5d00]">
      {label}
    </span>
  );
}

type ProblemStructureColumnViewModel = ProblemStructureGroupViewModel & {
  fixed: boolean;
};

export function buildProblemStructureCanvasBlueprint(input: {
  editingProblemStructureGroupId: string;
  editingProblemStructureNodeId: string;
  fallbackProblemGroups: ProblemStructureSourceGroup[];
  onCancelProblemStructureGroupEdit: () => void;
  onCancelProblemStructureNodeEdit: () => void;
  onDeleteProblemStructureGroup: (groupId: string) => void;
  onProblemStructureGroupDragOver: (event: React.DragEvent<HTMLElement>, groupId: string) => void;
  onProblemStructureGroupDrop: (event: React.DragEvent<HTMLElement>, groupId: string) => void;
  onProblemStructureGroupDraftTitleChange: (value: string) => void;
  onProblemStructureNodeDragEnd: () => void;
  onProblemStructureNodeDragOver: (event: React.DragEvent<HTMLElement>, targetNodeId: string) => void;
  onProblemStructureNodeDragStart: (event: React.DragEvent<HTMLElement>, nodeId: string) => void;
  onProblemStructureNodeDrop: (event: React.DragEvent<HTMLElement>, targetNodeId: string) => void;
  onProblemStructureNodeDraftTitleChange: (value: string) => void;
  onRemoveProblemStructureNode: (nodeId: string) => void;
  onSaveProblemStructureGroupEdit: (groupId: string) => void;
  onSaveProblemStructureNodeEdit: (nodeId: string) => void;
  onStartProblemStructureGroupEdit: (group: ProblemStructureGroupViewModel) => void;
  onStartProblemStructureNodeEdit: (node: ProblemStructureNodeViewModel) => void;
  problemStructureDrag: ProblemStructureDragState | null;
  problemStructureGroupDraftTitle: string;
  problemStructureGroups: ProblemStructureGroupViewModel[];
  problemStructureNodeDraftTitle: string;
  problemStructureNodes: ProblemStructureNodeViewModel[];
  remoteEditPresenceByKey: Record<string, RemoteEditPresence>;
  stage: string;
}): CanvasGraphBlueprint {
  const {
    editingProblemStructureGroupId,
    editingProblemStructureNodeId,
    fallbackProblemGroups,
    onCancelProblemStructureGroupEdit,
    onCancelProblemStructureNodeEdit,
    onDeleteProblemStructureGroup,
    onProblemStructureGroupDragOver,
    onProblemStructureGroupDrop,
    onProblemStructureGroupDraftTitleChange,
    onProblemStructureNodeDragEnd,
    onProblemStructureNodeDragOver,
    onProblemStructureNodeDragStart,
    onProblemStructureNodeDrop,
    onProblemStructureNodeDraftTitleChange,
    onRemoveProblemStructureNode,
    onSaveProblemStructureGroupEdit,
    onSaveProblemStructureNodeEdit,
    onStartProblemStructureGroupEdit,
    onStartProblemStructureNodeEdit,
    problemStructureDrag,
    problemStructureGroupDraftTitle,
    problemStructureGroups,
    problemStructureNodeDraftTitle,
    problemStructureNodes,
    remoteEditPresenceByKey,
    stage,
  } = input;

  const structureNodes =
    problemStructureNodes.length > 0 ? problemStructureNodes : buildProblemStructureNodesFromGroups(fallbackProblemGroups);
  const nodeById = new Map(structureNodes.map((node) => [node.id, node]));
  const assignedNodeIds = new Set(
    problemStructureGroups.flatMap((group) => group.nodeIds.filter((nodeId) => nodeById.has(nodeId))),
  );
  const ungroupedNodes = structureNodes.filter((node) => !assignedNodeIds.has(node.id));
  const columns: ProblemStructureColumnViewModel[] = [
    ...(ungroupedNodes.length > 0
      ? [
          {
            id: UNGROUPED_STRUCTURE_COLUMN_ID,
            title: "미분류",
            rationale: "",
            nodeIds: ungroupedNodes.map((node) => node.id),
            status: "draft" as const,
            createdBy: "user" as const,
            fixed: true,
          },
        ]
      : []),
    ...problemStructureGroups.map((group) => ({
      ...group,
      fixed: false,
    })),
  ];

  const nodeDescriptors: CanvasNodeDescriptor[] = columns.map((column, index) => {
    const isUngrouped = column.id === UNGROUPED_STRUCTURE_COLUMN_ID;
    const columnNodes = column.nodeIds
      .map((nodeId) => nodeById.get(nodeId))
      .filter((node): node is ProblemStructureNodeViewModel => Boolean(node));
    const nodeId = isUngrouped ? "problem-structure-ungrouped" : `problem-structure-${column.id}`;
    const columnDropGroupId = isUngrouped ? "" : column.id;
    const isColumnDropTarget =
      problemStructureDrag?.mode === "group" && problemStructureDrag.overGroupId === columnDropGroupId;
    const isGroupEditing = !isUngrouped && editingProblemStructureGroupId === column.id;
    const remoteGroupEditPresence = !isUngrouped
      ? remoteEditPresenceByKey[makeProblemStructureEditPresenceKey("problem_structure_group", column.id)] || null
      : null;
    const groupDisplayIndex = columns.slice(0, index).filter((item) => item.id !== UNGROUPED_STRUCTURE_COLUMN_ID).length + 1;
    const columnHeight = problemStructureColumnHeight(columnNodes.length);

    return {
      id: nodeId,
      position: {
        x: PROBLEM_STRUCTURE_BASE_X + index * (PROBLEM_STRUCTURE_COLUMN_WIDTH + PROBLEM_STRUCTURE_COLUMN_GAP),
        y: PROBLEM_STRUCTURE_BASE_Y,
      },
      positionSource: "computed",
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      className: "!border-0 !bg-transparent !p-0 !shadow-none",
      style: { width: PROBLEM_STRUCTURE_COLUMN_WIDTH, height: columnHeight, padding: 0 },
      draggable: false,
      data: {
        contentSignature: buildNodeContentSignature([
          "problem-structure-board",
          column.id,
          column.title,
          isGroupEditing,
          isGroupEditing ? problemStructureGroupDraftTitle : "",
          remoteGroupEditPresence?.updated_at || "",
          columnNodes.length,
          ...columnNodes.flatMap((node) => [
            node.id,
            node.title,
            node.body,
            node.status,
            node.depth,
            editingProblemStructureNodeId === node.id,
            editingProblemStructureNodeId === node.id ? problemStructureNodeDraftTitle : "",
            remoteEditPresenceByKey[makeProblemStructureEditPresenceKey("problem_structure_node", node.id)]
              ?.updated_at || "",
          ]),
          ...problemStructureGroups.map((group) => `${group.id}:${group.nodeIds.join(",")}`),
          problemStructureDrag?.nodeId,
          problemStructureDrag?.mode,
          problemStructureDrag?.overGroupId,
          problemStructureDrag?.overNodeId,
        ]),
        label: (
          <section
            className={`nopan group/column box-border flex h-full w-full flex-col rounded-[8.442px] border-[0.8px] border-[#cecccc] bg-white px-3 py-[13px] text-left font-['Pretendard','Inter',sans-serif] text-[#111] ${
              isColumnDropTarget ? "ring-2 ring-[#01a3ff]/35 ring-offset-2" : ""
            }`}
            onDragOver={(event) => onProblemStructureGroupDragOver(event, columnDropGroupId)}
            onDrop={(event) => onProblemStructureGroupDrop(event, columnDropGroupId)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="inline-flex h-[22px] w-[40px] items-center justify-center rounded-full bg-[rgba(161,161,161,0.2)] px-[6px] text-[10px] font-normal leading-[14px] text-[#414141]">
                  {problemStructureColumnLabel(isUngrouped, groupDisplayIndex)}
                </span>
                {isGroupEditing ? (
                  <input
                    value={problemStructureGroupDraftTitle}
                    onChange={(event) => onProblemStructureGroupDraftTitleChange(event.target.value)}
                    onPointerDown={(event) => event.stopPropagation()}
                    aria-label="구조화 그룹 제목"
                    className="nodrag nopan mt-[14px] block h-8 w-full rounded-[5px] border border-[#01a3ff]/35 bg-white px-2 text-[14px] font-bold leading-none text-[#111] outline-none"
                  />
                ) : (
                  <strong className="mt-[14px] block truncate text-[14.286px] font-bold leading-[16px] text-[#111]">
                    {column.title || (isUngrouped ? "미분류" : "구조화 그룹")}
                  </strong>
                )}
                <p className="mt-[5px] text-[11.688px] font-normal leading-[16px] text-[#423a3d]">
                  {problemStructureCardsCountLabel(columnNodes.length)}
                </p>
              </div>
              <div className="relative shrink-0">
                {isGroupEditing ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={onCancelProblemStructureGroupEdit}
                      onPointerDown={(event) => event.stopPropagation()}
                      aria-label="구조화 그룹 수정 취소"
                      className="nodrag nopan flex h-7 w-7 items-center justify-center rounded-full border border-[#cecccc] bg-white text-[#4d4d4d] transition hover:bg-[#f7f7f7]"
                    >
                      <XIcon className="h-[15px] w-[15px]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onSaveProblemStructureGroupEdit(column.id)}
                      onPointerDown={(event) => event.stopPropagation()}
                      aria-label="구조화 그룹 저장"
                      className="nodrag nopan flex h-7 w-7 items-center justify-center rounded-full bg-[#01a3ff] text-white transition hover:bg-[#005cdc]"
                    >
                      <CheckIcon className="h-[15px] w-[15px]" />
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      aria-label="구조화 그룹 메뉴"
                      onPointerDown={(event) => event.stopPropagation()}
                      className="nodrag nopan flex h-6 w-6 items-center justify-center rounded-full text-[#4d4d4d] transition hover:bg-[#f7f7f7]"
                    >
                      <MoreHorizontalIcon className="h-[18px] w-[18px]" />
                    </button>
                    {!isUngrouped ? (
                      <div className="absolute right-0 top-7 z-10 hidden items-center gap-1 rounded-full border border-[#cecccc] bg-white px-1.5 py-1 shadow-[0_5.64px_22.56px_rgba(0,0,0,0.05)] group-hover/column:flex">
                        <button
                          type="button"
                          onClick={() => onStartProblemStructureGroupEdit(column)}
                          onPointerDown={(event) => event.stopPropagation()}
                          aria-label="구조화 그룹 수정"
                          className="nodrag nopan flex h-6 w-6 items-center justify-center rounded-full text-[#4d4d4d] transition hover:bg-[#f7f7f7] hover:text-[#01a3ff]"
                        >
                          <PencilIcon className="h-[15px] w-[15px]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteProblemStructureGroup(column.id)}
                          onPointerDown={(event) => event.stopPropagation()}
                          aria-label="구조화 그룹 삭제"
                          className="nodrag nopan flex h-6 w-6 items-center justify-center rounded-full text-[#4d4d4d] transition hover:bg-[#fff1f2] hover:text-[#e11d48]"
                        >
                          <TrashIcon className="h-[15px] w-[15px]" />
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>

            {remoteGroupEditPresence ? (
              <div className="mt-3 flex items-center gap-2 rounded-[6px] border border-[#f1d7a7] bg-[#fff8e8] px-2 py-1.5 text-[11px] font-medium leading-4 text-[#7a4a00]">
                {renderProblemStructureEditPresenceBadge()}
                <span>다른 참가자가 수정 중입니다.</span>
              </div>
            ) : null}

            <div className="mt-[18px] flex h-[27.273px] w-full items-center justify-center rounded-[5.195px] border-[0.649px] border-[#cecccc] bg-white text-[#4d4d4d]">
              <PlusIcon className="h-[11.429px] w-[11.169px]" />
            </div>

            <div className="mt-[9px] flex-1 space-y-[14px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {columnNodes.length > 0 ? (
                columnNodes.map((node) => {
                  const isDraggingNode = problemStructureDrag?.nodeId === node.id;
                  const isNodeDropTarget =
                    problemStructureDrag?.mode === "node" &&
                    problemStructureDrag.overNodeId === node.id &&
                    problemStructureDrag.nodeId !== node.id;
                  const isNodeEditing = editingProblemStructureNodeId === node.id;
                  const remoteNodeEditPresence =
                    remoteEditPresenceByKey[makeProblemStructureEditPresenceKey("problem_structure_node", node.id)] ||
                    null;
                  return (
                    <article
                      key={`${column.id}-${node.id}`}
                      draggable={!isNodeEditing}
                      onDragStart={(event) => onProblemStructureNodeDragStart(event, node.id)}
                      onDragEnd={onProblemStructureNodeDragEnd}
                      onDragOver={(event) => onProblemStructureNodeDragOver(event, node.id)}
                      onDrop={(event) => onProblemStructureNodeDrop(event, node.id)}
                      className={`nodrag nopan relative h-[116.234px] rounded-[5.195px] border-[0.649px] border-[#cecccc] bg-[#f7f7f7] px-[10px] pb-[31px] pt-[28px] text-[#111] transition ${
                        isNodeEditing ? "cursor-default" : "cursor-grab active:cursor-grabbing"
                      } ${
                        isNodeDropTarget
                          ? "ring-2 ring-[#01a3ff]/35 ring-offset-1"
                          : "hover:border-[#01a3ff]/35"
                      } ${isDraggingNode ? "opacity-60" : ""}`}
                    >
                      <span
                        className={`absolute left-[10px] top-[10px] inline-flex h-[14px] min-w-[32px] items-center justify-center rounded-full border-[0.8px] border-white px-[6px] text-[7px] font-bold leading-[10px] text-white ${problemStructureDepthTone(
                          node.depth,
                        )}`}
                      >
                        {problemStructureDepthLabel(node.depth)}
                      </span>

                      {isNodeEditing ? (
                        <textarea
                          value={problemStructureNodeDraftTitle}
                          onChange={(event) => onProblemStructureNodeDraftTitleChange(event.target.value)}
                          onPointerDown={(event) => event.stopPropagation()}
                          aria-label="구조화 노드 제목"
                          rows={2}
                          className="nodrag nopan block h-[39px] w-full resize-none rounded-[5px] border border-[#01a3ff]/35 bg-white px-2 py-1 text-[11.688px] font-bold leading-[16px] text-[#111] outline-none"
                        />
                      ) : (
                        <strong className="block truncate text-[11.688px] font-bold leading-[16px] text-[#111]">
                          {node.title || "구조화 노드"}
                        </strong>
                      )}

                      {node.body ? (
                        <p className="mt-[5px] line-clamp-2 w-[206px] text-[8.442px] font-normal leading-[12px] text-[#4d4d4d]">
                          {node.body}
                        </p>
                      ) : null}

                      {remoteNodeEditPresence ? (
                        <div className="absolute inset-x-[10px] bottom-[30px] flex items-center gap-1.5 rounded-[5px] border border-[#f1d7a7] bg-[#fff8e8] px-2 py-1 text-[10px] font-medium leading-none text-[#7a4a00]">
                          {renderProblemStructureEditPresenceBadge()}
                          <span>수정 중</span>
                        </div>
                      ) : null}

                      <div className="absolute bottom-[8px] left-[10px] flex h-[18px] w-[18px] items-center justify-center rounded-full text-[#4d4d4d]">
                        <PlusIcon className="h-[15px] w-[15px]" />
                      </div>

                      {isNodeEditing ? (
                        <div className="absolute bottom-[7px] right-[8px] flex items-center gap-[7px]">
                          <button
                            type="button"
                            onClick={onCancelProblemStructureNodeEdit}
                            onPointerDown={(event) => event.stopPropagation()}
                            aria-label="구조화 노드 수정 취소"
                            className="nodrag nopan flex h-[20px] w-[20px] items-center justify-center rounded-full text-[#4d4d4d] transition hover:bg-white"
                          >
                            <XIcon className="h-[15px] w-[15px]" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onSaveProblemStructureNodeEdit(node.id)}
                            onPointerDown={(event) => event.stopPropagation()}
                            aria-label="구조화 노드 저장"
                            className="nodrag nopan flex h-[20px] w-[20px] items-center justify-center rounded-full bg-[#01a3ff] text-white transition hover:bg-[#005cdc]"
                          >
                            <CheckIcon className="h-[14px] w-[14px]" />
                          </button>
                        </div>
                      ) : (
                        <div className="absolute bottom-[7px] right-[8px] flex items-center gap-[7px] text-[#4d4d4d]">
                          <button
                            type="button"
                            onClick={() => onStartProblemStructureNodeEdit(node)}
                            onPointerDown={(event) => event.stopPropagation()}
                            aria-label="구조화 노드 수정"
                            className="nodrag nopan flex h-[20px] w-[20px] items-center justify-center rounded-full transition hover:bg-white hover:text-[#01a3ff]"
                          >
                            <PencilIcon className="h-[15px] w-[15px]" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveProblemStructureNode(node.id)}
                            onPointerDown={(event) => event.stopPropagation()}
                            aria-label="구조화 노드 제외"
                            className="nodrag nopan flex h-[20px] w-[20px] items-center justify-center rounded-full transition hover:bg-white hover:text-[#e11d48]"
                          >
                            <TrashIcon className="h-[15px] w-[15px]" />
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })
              ) : (
                <p className="rounded-[5px] border border-dashed border-[#cecccc] bg-[#f7f7f7] px-3 py-5 text-center text-[11px] font-medium leading-[16px] text-[#777]">
                  {isUngrouped ? "미분류 노드가 없습니다." : "아직 이 분류에 들어온 노드가 없습니다."}
                </p>
              )}
            </div>
          </section>
        ),
      },
    };
  });

  return {
    layoutSignature: buildNodeContentSignature([
      stage,
      "problem-structure-board",
      ...structureNodes.flatMap((node) => [node.id, node.title, node.body, node.status, node.depth]),
      ...problemStructureGroups.flatMap((group) => [
        group.id,
        group.title,
        group.status,
        group.createdBy,
        ...group.nodeIds,
      ]),
    ]),
    nodeDescriptors,
  };
}
