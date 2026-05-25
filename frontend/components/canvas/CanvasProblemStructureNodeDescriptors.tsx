import { Position } from "@xyflow/react";
import type * as React from "react";
import {
  buildNodeContentSignature,
  type CanvasGraphBlueprint,
  type CanvasNodeDescriptor,
} from "@/components/canvas/CanvasGraphTypes";
import {
  buildProblemStructureNodesFromGroups,
  problemStructureMethodLabel,
  type ProblemDefinitionMode,
  type ProblemDefinitionPhase,
  type ProblemStructureDragState,
  type ProblemStructureGroupViewModel,
  type ProblemStructureMethod,
  type ProblemStructureNodeViewModel,
  type ProblemStructureSourceGroup,
  type ProblemStructureStatus,
} from "@/components/canvas/problemStructureModel";
import type { CanvasEditPresencePayload, CanvasNodePositionsByStage } from "@/lib/types";

type RemoteEditPresence = CanvasEditPresencePayload | null | undefined;

const UNGROUPED_STRUCTURE_COLUMN_ID = "__ungrouped__";

function makeProblemStructureEditPresenceKey(
  targetType: CanvasEditPresencePayload["target_type"],
  targetId: string,
  noteId = "",
) {
  return `${targetType}:${targetId}:${noteId}`;
}

function renderProblemStructureEditPresenceBadge(label = "수정중") {
  return (
    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
      {label}
    </span>
  );
}

function problemStructureStatusLabel(status: ProblemStructureStatus) {
  if (status === "review") return "검토중";
  if (status === "final") return "확정";
  return "초안";
}

function problemStructureStatusTone(status: ProblemStructureStatus) {
  if (status === "review") return "bg-fuchsia-100 text-fuchsia-700";
  if (status === "final") return "bg-emerald-100 text-emerald-700";
  return "bg-slate-100 text-slate-600";
}

type ProblemStructureColumnViewModel = ProblemStructureGroupViewModel & {
  fixed: boolean;
};

export function buildProblemStructureCanvasBlueprint(input: {
  editingProblemStructureGroupId: string;
  editingProblemStructureNodeId: string;
  fallbackProblemGroups: ProblemStructureSourceGroup[];
  nodePositions: CanvasNodePositionsByStage;
  onCancelProblemStructureGroupEdit: () => void;
  onCancelProblemStructureNodeEdit: () => void;
  onDeleteProblemStructureGroup: (groupId: string) => void;
  onProblemStructureGroupDragOver: (event: React.DragEvent<HTMLElement>, groupId: string) => void;
  onProblemStructureGroupDrop: (event: React.DragEvent<HTMLElement>, groupId: string) => void;
  onProblemStructureGroupDraftRationaleChange: (value: string) => void;
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
  onUpdateProblemStructureGroupStatus: (groupId: string, status: ProblemStructureStatus) => void;
  problemDefinitionMode: ProblemDefinitionMode;
  problemDefinitionPhase: ProblemDefinitionPhase;
  problemStructureDrag: ProblemStructureDragState | null;
  problemStructureGroupDraftRationale: string;
  problemStructureGroupDraftTitle: string;
  problemStructureGroups: ProblemStructureGroupViewModel[];
  problemStructureMethod: ProblemStructureMethod;
  problemStructureNodeDraftTitle: string;
  problemStructureNodes: ProblemStructureNodeViewModel[];
  remoteEditPresenceByKey: Record<string, RemoteEditPresence>;
  stage: string;
}): CanvasGraphBlueprint {
  const {
    editingProblemStructureGroupId,
    editingProblemStructureNodeId,
    fallbackProblemGroups,
    nodePositions,
    onCancelProblemStructureGroupEdit,
    onCancelProblemStructureNodeEdit,
    onDeleteProblemStructureGroup,
    onProblemStructureGroupDragOver,
    onProblemStructureGroupDrop,
    onProblemStructureGroupDraftRationaleChange,
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
    onUpdateProblemStructureGroupStatus,
    problemDefinitionMode,
    problemDefinitionPhase,
    problemStructureDrag,
    problemStructureGroupDraftRationale,
    problemStructureGroupDraftTitle,
    problemStructureGroups,
    problemStructureMethod,
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
    {
      id: UNGROUPED_STRUCTURE_COLUMN_ID,
      title: "아직 묶지 않은 노드",
      rationale: "정의 1단계에서 가져온 모든 노드가 먼저 여기에 놓입니다.",
      nodeIds: ungroupedNodes.map((node) => node.id),
      status: "draft",
      createdBy: "user",
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
          <div
            className={`nopan box-border min-w-0 rounded-[14px] border bg-white p-4 text-left font-['Inter','Noto_Sans_KR',sans-serif] shadow-[0_1px_0_rgba(0,0,0,0.04)] ${
              isUngrouped
                ? "border-dashed border-black/20"
                : isCardSorting
                  ? "border-[#a13ab8]/20"
                  : "border-black/10"
            } ${isColumnDropTarget ? "ring-2 ring-[#a13ab8]/35 ring-offset-2" : ""}`}
            onDragOver={(event) => onProblemStructureGroupDragOver(event, columnDropGroupId)}
            onDrop={(event) => onProblemStructureGroupDrop(event, columnDropGroupId)}
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
                    onChange={(event) => onProblemStructureGroupDraftTitleChange(event.target.value)}
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
                        onClick={onCancelProblemStructureGroupEdit}
                        onPointerDown={(event) => event.stopPropagation()}
                        className="nodrag nopan rounded-[8px] border border-black/10 bg-white px-2 py-1 text-[11px] font-semibold text-[#777] transition hover:bg-[#f5f6f8]"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={() => onSaveProblemStructureGroupEdit(column.id)}
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
                        onClick={() => onStartProblemStructureGroupEdit(column)}
                        onPointerDown={(event) => event.stopPropagation()}
                        className="nodrag nopan rounded-[8px] border border-black/10 bg-white px-2 py-1 text-[11px] font-semibold text-[#4d4d4d] transition hover:bg-[#f5f6f8]"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteProblemStructureGroup(column.id)}
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
                {renderProblemStructureEditPresenceBadge()}
                <span>다른 참가자가 이 구조화 그룹을 수정 중입니다.</span>
              </div>
            ) : null}
            {!isUngrouped ? (
              <label className="mt-3 block">
                <span className="mb-1 block text-[11px] font-semibold text-[#777]">그룹 상태</span>
                <select
                  value={column.status || "draft"}
                  onChange={(event) =>
                    onUpdateProblemStructureGroupStatus(column.id, event.target.value as ProblemStructureStatus)
                  }
                  onPointerDown={(event) => event.stopPropagation()}
                  className={`nodrag nopan w-full rounded-[8px] border border-black/10 bg-[#f9f9f9] px-2 py-1.5 text-xs font-semibold outline-none transition focus:border-[#a13ab8]/40 ${problemStructureStatusTone(column.status || "draft")}`}
                >
                  {(["draft", "review", "final"] as ProblemStructureStatus[]).map((status) => (
                    <option key={`${column.id}-status-${status}`} value={status}>
                      {problemStructureStatusLabel(status)}
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
              <div
                className={`mt-3 rounded-[10px] ${
                  isCardSorting ? "border border-[#a13ab8]/10 bg-[#f7ecfb]" : "bg-[#f5f6f8]"
                } p-3`}
              >
                <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#a13ab8]">
                  {rationaleLabel}
                </label>
                {isGroupEditing ? (
                  <textarea
                    value={problemStructureGroupDraftRationale}
                    onChange={(event) => onProblemStructureGroupDraftRationaleChange(event.target.value)}
                    onPointerDown={(event) => event.stopPropagation()}
                    placeholder={
                      column.createdBy === "ai"
                        ? "AI가 왜 묶었는지 나중에 여기에 표시합니다."
                        : "이 그룹으로 묶은 이유를 적어둘 수 있습니다."
                    }
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
                    remoteEditPresenceByKey[makeProblemStructureEditPresenceKey("problem_structure_node", node.id)] ||
                    null;
                  return (
                    <div
                      key={`${column.id}-${node.id}`}
                      draggable={!isNodeEditing}
                      onDragStart={(event) => onProblemStructureNodeDragStart(event, node.id)}
                      onDragEnd={onProblemStructureNodeDragEnd}
                      onDragOver={(event) => onProblemStructureNodeDragOver(event, node.id)}
                      onDrop={(event) => onProblemStructureNodeDrop(event, node.id)}
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
                            onChange={(event) => onProblemStructureNodeDraftTitleChange(event.target.value)}
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
                              onClick={onCancelProblemStructureNodeEdit}
                              onPointerDown={(event) => event.stopPropagation()}
                              className="nodrag nopan rounded-[8px] border border-black/10 bg-white px-2 py-1 text-[11px] font-semibold text-[#777] transition hover:bg-[#f5f6f8]"
                            >
                              취소
                            </button>
                            <button
                              type="button"
                              onClick={() => onSaveProblemStructureNodeEdit(node.id)}
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
                              onClick={() => onStartProblemStructureNodeEdit(node)}
                              onPointerDown={(event) => event.stopPropagation()}
                              className="nodrag nopan rounded-[8px] border border-black/10 bg-white px-2 py-1 text-[11px] font-semibold text-[#4d4d4d] transition hover:bg-[#f5f6f8]"
                            >
                              수정
                            </button>
                            <button
                              type="button"
                              onClick={() => onRemoveProblemStructureNode(node.id)}
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
                          {renderProblemStructureEditPresenceBadge()}
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
    nodeDescriptors,
  };
}
