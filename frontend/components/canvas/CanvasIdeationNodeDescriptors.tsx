import { Position } from "@xyflow/react";
import {
  CANVAS_ITEM_NODE_WIDTH,
  CANVAS_TOP_LEVEL_GAP_Y,
  estimateCanvasItemNodeHeight,
  isTopicCanvasItem,
  makeAgendaNodeLabel,
  makeCanvasItemNodeLabel,
  makeIdeationKeywordBubbleNodeLabel,
} from "@/components/canvas/CanvasNodeLabels";
import { CANVAS_IDEATION_BUBBLE_TRANSITION, type IdeationKeywordBubbleVisual } from "@/components/canvas/CanvasIdeationBubbles";
import type { AgendaDragPreviewState, IdeationDropPreviewState } from "@/components/canvas/useCanvasRuntimeState";
import type { CanvasNodePositionsByStage } from "@/lib/types";
import type {
  CanvasAgendaLayoutModel,
  CanvasItemLayoutModel,
  IdeationGraphLayout,
} from "@/components/canvas/CanvasGraphLayouts";
import {
  buildNodeContentSignature,
  type CanvasGraphBlueprint,
  type CanvasNodeDescriptor,
} from "@/components/canvas/CanvasGraphTypes";

type RemoteEditPresence = {
  updated_at?: string;
};

function stripLeadingTimestamp(text: string) {
  return text
    .replace(
      /^\s*\[?\s*(?:\d{4}-\d{2}-\d{2}[T\s]\d{1,2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?|\d{1,2}:\d{2}(?::\d{2})?)\s*\]?\s*/,
      "",
    )
    .trim();
}

export function buildIdeationKeywordBubbleBlueprint(input: {
  bubbles: IdeationKeywordBubbleVisual[];
  debugGrowthById: Record<string, number>;
  layoutRevision: number;
  stage: string;
}): CanvasGraphBlueprint {
  const { bubbles, debugGrowthById, layoutRevision, stage } = input;
  const bubbleDescriptors: CanvasNodeDescriptor[] = bubbles.length > 0
    ? bubbles.map((bubble) => {
        const debugGrowth = debugGrowthById[bubble.id] || 1;
        return {
          id: bubble.id,
          position: {
            x: bubble.targetX,
            y: bubble.targetY,
          },
          positionSource: "computed",
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
          className: "imms-ideation-keyword-node pointer-events-none !border-0 !bg-transparent !p-0 !shadow-none",
          style: {
            width: bubble.size,
            height: bubble.size,
            padding: 0,
            opacity: bubble.opacity ?? 1,
            transition: CANVAS_IDEATION_BUBBLE_TRANSITION,
            willChange: "transform, opacity, width, height",
          },
          draggable: false,
          selectable: false,
          data: {
            contentSignature: buildNodeContentSignature([
              "ideation-keyword-bubble",
              bubble.text,
              bubble.count,
              bubble.weight,
              debugGrowth,
              bubble.activity,
              bubble.opacity,
              bubble.kind,
              bubble.offTopic,
              bubble.offTopicReason,
              ...bubble.related,
            ]),
            label: makeIdeationKeywordBubbleNodeLabel(bubble, bubble.size),
          },
        };
      })
    : [
        {
          id: "ideation-keyword-empty",
          position: { x: 320, y: 260 },
          positionSource: "computed",
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
          className: "!border-0 !bg-transparent !p-0 !shadow-none",
          style: { width: 520, minHeight: 180, padding: 0 },
          draggable: false,
          selectable: false,
          data: {
            contentSignature: "ideation-keyword-empty",
            label: (
              <div className="flex min-h-[180px] items-center justify-center rounded-[18px] border border-dashed border-black/10 bg-white/80 px-6 text-center text-sm leading-6 text-[#777]">
                발화가 들어오면 자주 나온 명사가 버블로 표시됩니다.
              </div>
            ),
          },
        },
      ];

  return {
    layoutSignature: buildNodeContentSignature([
      stage,
      "keyword-bubbles",
      layoutRevision,
      ...bubbles.flatMap((bubble) => [
        bubble.text,
        bubble.count,
        bubble.activity,
        bubble.opacity,
        bubble.targetX,
        bubble.targetY,
        bubble.size,
        bubble.kind,
        bubble.offTopic,
        debugGrowthById[bubble.id] || 1,
        ...bubble.related,
      ]),
    ]),
    nodeDescriptors: bubbleDescriptors,
  };
}

export function buildIdeationCanvasBlueprint<
  TAgenda extends CanvasAgendaLayoutModel,
  TItem extends CanvasItemLayoutModel,
>(input: {
  agendaDragPreview: AgendaDragPreviewState | null;
  agendaIndexById: Map<string, number>;
  agendaModels: TAgenda[];
  canvasItems: TItem[];
  editingAgendaId: string;
  editingCanvasItemId: string;
  focusedCanvasItemId: string;
  getTopicCollapsed: (item: TItem) => boolean;
  handleQuickEditAgenda: (agenda: TAgenda) => void;
  handleQuickEditCanvasItem: (item: TItem) => void;
  handleToggleTopicCollapsed: (itemId: string) => void;
  ideationDropPreview: IdeationDropPreviewState | null;
  ideationGraphLayout: Omit<IdeationGraphLayout, "visibleCanvasItems"> & { visibleCanvasItems: TItem[] };
  latestHighlightedTopicId: string;
  nodePositions: CanvasNodePositionsByStage;
  remoteEditPresenceByKey: Record<string, RemoteEditPresence | null | undefined>;
  selectedCanvasItemId: string;
  stage: string;
}): CanvasGraphBlueprint {
  const {
    agendaDragPreview,
    agendaIndexById,
    agendaModels,
    canvasItems,
    editingAgendaId,
    editingCanvasItemId,
    focusedCanvasItemId,
    getTopicCollapsed,
    handleQuickEditAgenda,
    handleQuickEditCanvasItem,
    handleToggleTopicCollapsed,
    ideationDropPreview,
    ideationGraphLayout,
    latestHighlightedTopicId,
    nodePositions,
    remoteEditPresenceByKey,
    selectedCanvasItemId,
    stage,
  } = input;
  const {
    agendaHeights,
    agendaTitleById,
    canvasItemHeights,
    computedCanvasPositions,
    positions,
    visibleCanvasItems,
  } = ideationGraphLayout;

  return {
    layoutSignature: buildNodeContentSignature([
      stage,
      ...agendaModels.map((agenda) => agenda.id),
      ...canvasItems.flatMap((item) => [
        item.id,
        item.kind,
        item.status || "",
        item.parent_topic_id || "",
        isTopicCanvasItem(item) && getTopicCollapsed(item) ? "collapsed" : "expanded",
        ...(item.child_item_ids || []),
      ]),
    ]),
    nodeDescriptors: [
      ...agendaModels.map((agenda, agendaIndex) => {
        const nodeId = `agenda-${agenda.id}`;
        const savedPosition = nodePositions.ideation?.[nodeId];
        const positionSource: CanvasNodeDescriptor["positionSource"] = savedPosition
          ? "persisted"
          : "fallback";
        const isAgendaDragSource = agendaDragPreview?.agendaId === agenda.id;
        const remoteAgendaEditPresence = remoteEditPresenceByKey[`agenda:${agenda.id}:`] || null;

        return {
          id: nodeId,
          position: savedPosition || positions[agendaIndex],
          positionSource,
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
          className: `imms-agenda-node rounded-[28px] border border-amber-200 bg-white shadow-[0_18px_40px_rgba(148,163,184,0.16)] ${isAgendaDragSource ? "z-20" : ""}`,
          style: { width: 300, minHeight: agendaHeights[agendaIndex], borderRadius: 28, padding: 0 },
          data: {
            contentSignature: buildNodeContentSignature([
              agenda.id,
              agenda.title,
              agenda.status,
              editingAgendaId === agenda.id,
              remoteAgendaEditPresence?.updated_at || "",
              ...(agenda.keywords || []),
              ...(agenda.summaryBullets || []),
            ]),
            label: makeAgendaNodeLabel(
              agenda.title,
              stripLeadingTimestamp(agenda.summaryBullets[0] || "요약이 아직 없습니다."),
              agenda.status,
              agenda.keywords || [],
              Boolean(remoteAgendaEditPresence),
              (event) => {
                event.stopPropagation();
                handleQuickEditAgenda(agenda);
              },
            ),
          },
        };
      }),
      ...(agendaDragPreview
        ? agendaModels
            .filter((agenda) => agenda.id === agendaDragPreview.agendaId)
            .map((agenda) => {
              const agendaIndex = agendaIndexById.get(agenda.id) ?? 0;
              const agendaHeight = agendaHeights[Math.max(0, agendaIndex)] || 160;
              return {
                id: `agenda-drag-placeholder-${agenda.id}`,
                position: agendaDragPreview.originPosition,
                positionSource: "persisted" as const,
                sourcePosition: Position.Bottom,
                targetPosition: Position.Top,
                className: "imms-agenda-drag-placeholder rounded-[28px] border border-dashed border-fuchsia-300 bg-fuchsia-50/70 shadow-[0_18px_40px_rgba(161,58,184,0.10)]",
                style: { width: 300, minHeight: agendaHeight, borderRadius: 28, padding: 0 },
                draggable: false,
                selectable: false,
                zIndex: 0,
                data: {
                  contentSignature: buildNodeContentSignature([
                    "agenda-placeholder",
                    agenda.id,
                    agenda.title,
                    agendaDragPreview.originPosition.x,
                    agendaDragPreview.originPosition.y,
                  ]),
                  label: (
                    <div className="p-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fuchsia-700">
                        기존 위치
                      </p>
                      <p className="mt-2 text-lg font-semibold leading-7 text-slate-800">{agenda.title}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        드롭하면 아래 콘텐츠와 함께 이동합니다.
                      </p>
                    </div>
                  ),
                },
              };
            })
        : []),
      ...(ideationDropPreview
        ? [
            {
              id: "ideation-drop-placeholder",
              position: ideationDropPreview.position,
              positionSource: "computed" as const,
              sourcePosition: Position.Right,
              targetPosition: Position.Left,
              className: "imms-ideation-drop-placeholder pointer-events-none !border-0 !bg-transparent !p-0 !shadow-none",
              style: {
                width: CANVAS_ITEM_NODE_WIDTH,
                height: 158,
                background: "transparent",
                border: "none",
                boxShadow: "none",
                padding: 0,
              },
              draggable: false,
              selectable: false,
              zIndex: 1,
              data: {
                contentSignature: buildNodeContentSignature([
                  "ideation-drop-placeholder",
                  ideationDropPreview.draggedItemId,
                  ideationDropPreview.targetId,
                  ideationDropPreview.mode,
                  ideationDropPreview.agendaId,
                  ideationDropPreview.position.x,
                  ideationDropPreview.position.y,
                ]),
                label: (
                  <div className="flex h-full min-h-[158px] flex-col items-center justify-center rounded-[18px] border-2 border-dashed border-[#a13ab8]/55 bg-[#f7ecfb]/80 px-5 py-4 text-center shadow-[inset_0_0_0_5px_rgba(161,58,184,0.08),0_16px_34px_rgba(161,58,184,0.12)]">
                    <p className="text-[15px] font-semibold text-[#a13ab8]">{ideationDropPreview.label}</p>
                    <p className="mt-2 text-[13px] leading-5 text-[#4d4d4d]">{ideationDropPreview.hint}</p>
                  </div>
                ),
              },
            },
          ]
        : []),
      ...visibleCanvasItems.map((item, index) => {
        const nodeId = `canvas-item-${item.id}`;
        const displayItem =
          isTopicCanvasItem(item)
            ? {
                ...item,
                topic_collapsed: getTopicCollapsed(item),
              }
            : item;
        const highlighted =
          focusedCanvasItemId === item.id ||
          (isTopicCanvasItem(item) && latestHighlightedTopicId === item.id);
        const computedPosition = computedCanvasPositions.get(item.id);
        const positionSource: CanvasNodeDescriptor["positionSource"] =
          computedPosition ? "computed" : "fallback";
        const linkedAgendaTitle = agendaTitleById.get(item.agenda_id || "") || "";
        const itemHeight = canvasItemHeights.get(item.id) || estimateCanvasItemNodeHeight(item);
        const fallbackPosition = {
          x: 180 + ((index % 3) * (CANVAS_ITEM_NODE_WIDTH + 36)),
          y: 320 + Math.floor(index / 3) * (itemHeight + CANVAS_TOP_LEVEL_GAP_Y),
        };
        const remoteCanvasItemEditPresence = remoteEditPresenceByKey[`canvas_item:${item.id}:`] || null;

        return {
          id: nodeId,
          position: computedPosition || fallbackPosition,
          positionSource,
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
          className: "nopan imms-canvas-node-drag-handle !border-0 !bg-transparent !p-0 !shadow-none",
          style: {
            width: CANVAS_ITEM_NODE_WIDTH,
            height: itemHeight,
            background: "transparent",
            border: "none",
            boxShadow: "none",
            padding: 0,
          },
          data: {
            contentSignature: buildNodeContentSignature([
              item.id,
              item.kind,
              item.status || "",
              item.title,
              item.body,
              ...(item.keywords || []),
              item.agenda_id,
              item.point_id,
              item.parent_topic_id || "",
              isTopicCanvasItem(item) && getTopicCollapsed(item) ? "collapsed" : "expanded",
              highlighted,
              ...(item.child_item_ids || []),
              selectedCanvasItemId === item.id,
              editingCanvasItemId === item.id,
              remoteCanvasItemEditPresence?.updated_at || "",
            ]),
            label: makeCanvasItemNodeLabel(
              displayItem,
              selectedCanvasItemId === item.id,
              linkedAgendaTitle,
              handleToggleTopicCollapsed,
              (event) => {
                event.stopPropagation();
                handleQuickEditCanvasItem(item);
              },
              Boolean(remoteCanvasItemEditPresence),
              highlighted,
            ),
          },
        };
      }),
    ],
  };
}
