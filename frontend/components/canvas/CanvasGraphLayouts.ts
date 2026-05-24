import {
  CANVAS_AGENDA_BLOCK_GAP_X,
  CANVAS_AGENDA_BLOCK_GAP_Y,
  CANVAS_AGENDA_TO_ITEMS_GAP_Y,
  CANVAS_ITEM_NODE_WIDTH,
  CANVAS_TOPIC_CHILD_GAP_X,
  CANVAS_TOPIC_CHILD_GAP_Y,
  CANVAS_TOPIC_CHILDS_PER_ROW,
  CANVAS_TOP_LEVEL_GAP_Y,
  buildGridPositions,
  estimateAgendaNodeHeight,
  estimateCanvasItemNodeHeight,
  estimateProblemTopicNodeHeight,
  isTopicCanvasItem,
} from "@/components/canvas/CanvasNodeLabels";
import type {
  CanvasNodePosition,
  CanvasProblemDefinitionGroup,
  CanvasWorkspaceItem,
} from "@/lib/types";

type ProblemGroupStatus = "draft" | "review" | "final";

export type CanvasProblemGroupLayoutModel = CanvasProblemDefinitionGroup & {
  status: ProblemGroupStatus;
};

export type CanvasAgendaLayoutModel = {
  id: string;
  title: string;
  status: string;
  keywords: string[];
  summaryBullets: string[];
};

export type CanvasItemLayoutModel = CanvasWorkspaceItem;

export type ProblemExploreLayout = {
  activeGroup: CanvasProblemGroupLayoutModel | null;
  childCountByGroupId: Map<string, number>;
  positionedProblemGroups: Array<{
    group: CanvasProblemGroupLayoutModel;
    position: CanvasNodePosition;
    rootIndex: number;
  }>;
  problemGroupHeightById: Map<string, number>;
  problemNodeWidth: number;
};

export type IdeationGraphLayout = {
  agendaHeights: number[];
  agendaTitleById: Map<string, string>;
  canvasItemHeights: Map<string, number>;
  computedCanvasPositions: Map<string, CanvasNodePosition>;
  positions: CanvasNodePosition[];
  visibleCanvasItems: CanvasItemLayoutModel[];
};

function stripLeadingTimestamp(text: string) {
  return text
    .replace(
      /^\s*\[?\s*(?:\d{4}-\d{2}-\d{2}[T\s]\d{1,2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?|\d{1,2}:\d{2}(?::\d{2})?)\s*\]?\s*/,
      "",
    )
    .trim();
}

export function buildProblemExploreLayout(input: {
  problemGroups: CanvasProblemGroupLayoutModel[];
  selectedProblemGroupId: string;
  collapsedProblemGroupIds: Set<string>;
}): ProblemExploreLayout {
  const { collapsedProblemGroupIds, problemGroups, selectedProblemGroupId } = input;
  const activeGroup =
    problemGroups.find((group) => group.group_id === selectedProblemGroupId) ||
    problemGroups[0] ||
    null;
  const problemGroupHeightById = new Map(
    problemGroups.map((group) => [group.group_id, estimateProblemTopicNodeHeight(group)] as const),
  );
  const childGroupsByParentId = new Map<string, CanvasProblemGroupLayoutModel[]>();
  problemGroups.forEach((group) => {
    const parentId = group.parent_group_id || "";
    const children = childGroupsByParentId.get(parentId) || [];
    children.push(group);
    childGroupsByParentId.set(parentId, children);
  });

  const problemNodeWidth = 336;
  const problemNodeGapX = 72;
  const problemLevelHeight = 272;
  const problemBaseX = 64;
  const problemBaseY = 56;
  const problemGroupIds = new Set(problemGroups.map((group) => group.group_id));
  const rootProblemGroupCandidates = problemGroups.filter(
    (group) => !group.parent_group_id || !problemGroupIds.has(group.parent_group_id),
  );
  const rootProblemGroups = rootProblemGroupCandidates.length > 0 ? rootProblemGroupCandidates : problemGroups;
  const subtreeWidthCache = new Map<string, number>();
  const getVisibleChildren = (group: CanvasProblemGroupLayoutModel) =>
    collapsedProblemGroupIds.has(group.group_id) ? [] : childGroupsByParentId.get(group.group_id) || [];
  const measureProblemSubtree = (group: CanvasProblemGroupLayoutModel, trail = new Set<string>()): number => {
    if (trail.has(group.group_id)) return problemNodeWidth;
    const cachedWidth = subtreeWidthCache.get(group.group_id);
    if (cachedWidth !== undefined) return cachedWidth;
    const nextTrail = new Set(trail);
    nextTrail.add(group.group_id);
    const children = getVisibleChildren(group);
    if (children.length === 0) {
      subtreeWidthCache.set(group.group_id, problemNodeWidth);
      return problemNodeWidth;
    }
    const childrenWidth = children.reduce(
      (total, child, childIndex) =>
        total + measureProblemSubtree(child, nextTrail) + (childIndex > 0 ? problemNodeGapX : 0),
      0,
    );
    const width = Math.max(problemNodeWidth, childrenWidth);
    subtreeWidthCache.set(group.group_id, width);
    return width;
  };
  const positionedProblemGroups: ProblemExploreLayout["positionedProblemGroups"] = [];
  const layoutProblemSubtree = (
    group: CanvasProblemGroupLayoutModel,
    leftX: number,
    depth: number,
    rootIndex: number,
    trail = new Set<string>(),
  ) => {
    if (trail.has(group.group_id)) return;
    const nextTrail = new Set(trail);
    nextTrail.add(group.group_id);
    const subtreeWidth = measureProblemSubtree(group, trail);
    positionedProblemGroups.push({
      group,
      rootIndex,
      position: {
        x: Math.round(leftX + subtreeWidth / 2 - problemNodeWidth / 2),
        y: problemBaseY + depth * problemLevelHeight,
      },
    });
    const children = getVisibleChildren(group);
    let childLeftX = leftX;
    children.forEach((child) => {
      const childWidth = measureProblemSubtree(child, nextTrail);
      layoutProblemSubtree(child, childLeftX, depth + 1, rootIndex, nextTrail);
      childLeftX += childWidth + problemNodeGapX;
    });
  };

  let nextRootX = problemBaseX;
  rootProblemGroups.forEach((group, rootIndex) => {
    const subtreeWidth = measureProblemSubtree(group);
    layoutProblemSubtree(group, nextRootX, 0, rootIndex);
    nextRootX += subtreeWidth + problemNodeGapX;
  });

  return {
    activeGroup,
    childCountByGroupId: new Map(
      problemGroups.map((group) => [group.group_id, childGroupsByParentId.get(group.group_id)?.length || 0] as const),
    ),
    positionedProblemGroups,
    problemGroupHeightById,
    problemNodeWidth,
  };
}

export function buildIdeationGraphLayout(input: {
  agendaModels: CanvasAgendaLayoutModel[];
  canvasItems: CanvasItemLayoutModel[];
  getTopicCollapsed: (item: CanvasItemLayoutModel) => boolean;
  ideationNodePositions?: Record<string, CanvasNodePosition>;
}): IdeationGraphLayout {
  const { agendaModels, canvasItems, getTopicCollapsed, ideationNodePositions } = input;
  const agendaHeights = agendaModels.map((agenda) =>
    estimateAgendaNodeHeight(
      agenda.title,
      stripLeadingTimestamp(agenda.summaryBullets[0] || "요약이 아직 없습니다."),
      agenda.keywords.length,
    ),
  );
  const canvasItemById = new Map(canvasItems.map((item) => [item.id, item]));
  const canvasItemHeights = new Map(canvasItems.map((item) => [item.id, estimateCanvasItemNodeHeight(item)]));
  const topicById = new Map(canvasItems.filter((item) => isTopicCanvasItem(item)).map((item) => [item.id, item]));
  const childIdsByTopic = new Map<string, string[]>();
  canvasItems.forEach((item) => {
    if (item.parent_topic_id) {
      const current = childIdsByTopic.get(item.parent_topic_id) || [];
      if (!current.includes(item.id)) current.push(item.id);
      childIdsByTopic.set(item.parent_topic_id, current);
    }
  });
  topicById.forEach((topic) => {
    const explicitIds = (topic.child_item_ids || []).filter(Boolean);
    const derivedIds = childIdsByTopic.get(topic.id) || [];
    childIdsByTopic.set(topic.id, [...new Set([...explicitIds, ...derivedIds])]);
  });
  const visibleCanvasItems = canvasItems.filter((item) => {
    if (!item.parent_topic_id) return true;
    const parentTopic = topicById.get(item.parent_topic_id);
    return Boolean(parentTopic && !getTopicCollapsed(parentTopic));
  });
  const originalOrder = new Map(canvasItems.map((item, index) => [item.id, index]));
  const sortAgendaLaneItems = (items: CanvasItemLayoutModel[]) =>
    [...items].sort((left, right) => {
      const leftTopic = isTopicCanvasItem(left) ? 0 : 1;
      const rightTopic = isTopicCanvasItem(right) ? 0 : 1;
      if (leftTopic !== rightTopic) return leftTopic - rightTopic;
      return (originalOrder.get(left.id) || 0) - (originalOrder.get(right.id) || 0);
    });
  const getAgendaTopLevelItems = (agendaId: string) =>
    sortAgendaLaneItems(canvasItems.filter((item) => item.agenda_id === agendaId && !item.parent_topic_id));
  const getTopicChildItems = (topicId: string) =>
    (childIdsByTopic.get(topicId) || [])
      .map((childId) => canvasItemById.get(childId))
      .filter((item): item is CanvasItemLayoutModel => Boolean(item));
  const estimateTopicChildLaneHeight = (topic: CanvasItemLayoutModel) => {
    if (getTopicCollapsed(topic)) return 0;

    const childItems = getTopicChildItems(topic.id);
    if (childItems.length === 0) return 0;

    const rowHeights: number[] = [];
    childItems.forEach((child, index) => {
      const row = Math.floor(index / CANVAS_TOPIC_CHILDS_PER_ROW);
      rowHeights[row] = Math.max(
        rowHeights[row] || 0,
        canvasItemHeights.get(child.id) || estimateCanvasItemNodeHeight(child),
      );
    });

    return rowHeights.reduce(
      (sum, height, index) => sum + height + (index === 0 ? 0 : CANVAS_TOPIC_CHILD_GAP_Y),
      0,
    );
  };

  const agendaBlockHeights = agendaModels.map((agenda, agendaIndex) => {
    const topLevelItems = getAgendaTopLevelItems(agenda.id);
    if (topLevelItems.length === 0) return agendaHeights[agendaIndex];

    const itemStackHeight = topLevelItems.reduce((sum, item, itemIndex) => {
      const itemHeight = canvasItemHeights.get(item.id) || estimateCanvasItemNodeHeight(item);
      const childChainHeight = isTopicCanvasItem(item) ? estimateTopicChildLaneHeight(item) : 0;
      const rowHeight = Math.max(itemHeight, childChainHeight);
      const gap = itemIndex === 0 ? 0 : CANVAS_TOP_LEVEL_GAP_Y;
      return sum + gap + rowHeight;
    }, 0);

    return agendaHeights[agendaIndex] + CANVAS_AGENDA_TO_ITEMS_GAP_Y + itemStackHeight;
  });
  const positions = buildGridPositions(
    agendaBlockHeights,
    CANVAS_AGENDA_BLOCK_GAP_X,
    CANVAS_AGENDA_BLOCK_GAP_Y,
    120,
    80,
  );
  const agendaPositionById = new Map(
    agendaModels.map((agenda, agendaIndex) => {
      const nodeId = `agenda-${agenda.id}`;
      return [
        agenda.id,
        ideationNodePositions?.[nodeId] || positions[agendaIndex],
      ] as const;
    }),
  );
  const agendaTitleById = new Map(agendaModels.map((agenda) => [agenda.id, agenda.title] as const));
  const computedCanvasPositions = new Map<string, CanvasNodePosition>();
  agendaModels.forEach((agenda, agendaIndex) => {
    const agendaPosition = agendaPositionById.get(agenda.id) || positions[agendaIndex];
    const topLevelItems = getAgendaTopLevelItems(agenda.id);
    let nextTopY = agendaPosition.y + agendaHeights[agendaIndex] + CANVAS_AGENDA_TO_ITEMS_GAP_Y;

    topLevelItems.forEach((item) => {
      const itemHeight = canvasItemHeights.get(item.id) || estimateCanvasItemNodeHeight(item);
      const topPosition = {
        x: agendaPosition.x + 20,
        y: nextTopY,
      };
      computedCanvasPositions.set(item.id, topPosition);

      let childChainHeight = 0;
      if (isTopicCanvasItem(item) && !getTopicCollapsed(item)) {
        const childItems = getTopicChildItems(item.id);
        const childRowHeights: number[] = [];
        let childBaseY = topPosition.y;

        childItems.forEach((child, childIndex) => {
          const childHeight = canvasItemHeights.get(child.id) || estimateCanvasItemNodeHeight(child);
          const row = Math.floor(childIndex / CANVAS_TOPIC_CHILDS_PER_ROW);
          const column = childIndex % CANVAS_TOPIC_CHILDS_PER_ROW;
          if (column === 0 && row > 0) {
            childBaseY += (childRowHeights[row - 1] || childHeight) + CANVAS_TOPIC_CHILD_GAP_Y;
          }
          const computedChildPosition = {
            x: topPosition.x + CANVAS_ITEM_NODE_WIDTH + CANVAS_TOPIC_CHILD_GAP_X + column * (CANVAS_ITEM_NODE_WIDTH + CANVAS_TOPIC_CHILD_GAP_X),
            y: childBaseY,
          };
          computedCanvasPositions.set(child.id, computedChildPosition);
          childRowHeights[row] = Math.max(childRowHeights[row] || 0, childHeight);
          childChainHeight = Math.max(
            childChainHeight,
            childBaseY - topPosition.y + childHeight,
          );
        });
      }

      const rowHeight = Math.max(itemHeight, childChainHeight);
      nextTopY = Math.max(nextTopY, topPosition.y + rowHeight + CANVAS_TOP_LEVEL_GAP_Y);
    });
  });

  return {
    agendaHeights,
    agendaTitleById,
    canvasItemHeights,
    computedCanvasPositions,
    positions,
    visibleCanvasItems,
  };
}
