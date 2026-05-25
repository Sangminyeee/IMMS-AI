import {
  estimateProblemTopicNodeHeight,
} from "@/components/canvas/CanvasNodeLabels";
import type {
  CanvasNodePosition,
  CanvasProblemDefinitionGroup,
} from "@/lib/types";

type ProblemGroupStatus = "draft" | "review" | "final";

export type CanvasProblemGroupLayoutModel = CanvasProblemDefinitionGroup & {
  status: ProblemGroupStatus;
};

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

export function buildProblemExploreLayout(input: {
  problemGroups: CanvasProblemGroupLayoutModel[];
  selectedProblemGroupId: string;
  collapsedProblemGroupIds: Set<string>;
  problemGroupHeightOverrides?: Record<string, number>;
}): ProblemExploreLayout {
  const { collapsedProblemGroupIds, problemGroupHeightOverrides = {}, problemGroups, selectedProblemGroupId } = input;
  const activeGroup =
    problemGroups.find((group) => group.group_id === selectedProblemGroupId) ||
    problemGroups[0] ||
    null;
  const problemGroupHeightById = new Map(
    problemGroups.map((group) => [
      group.group_id,
      Math.max(estimateProblemTopicNodeHeight(group), problemGroupHeightOverrides[group.group_id] || 0),
    ] as const),
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
  const problemLevelHeight = Math.max(272, Math.max(...problemGroupHeightById.values(), 0) + 96);
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
