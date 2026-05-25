import { MarkerType, type Edge } from "@xyflow/react";

type ProblemExploreEdgeGroupModel = {
  group_id: string;
  parent_group_id?: string;
  linked_group_ids?: string[];
};

type BuildProblemExploreEdgesOptions<TGroup extends ProblemExploreEdgeGroupModel> = {
  collapsedProblemGroupIds: Set<string>;
  problemDefinitionPhase: string;
  problemGroups: TGroup[];
  stage: string;
};

export function buildProblemExploreEdges<TGroup extends ProblemExploreEdgeGroupModel>({
  collapsedProblemGroupIds,
  problemDefinitionPhase,
  problemGroups,
  stage,
}: BuildProblemExploreEdgesOptions<TGroup>) {
  if (stage !== "problem-definition" || problemDefinitionPhase === "structure") {
    return { left: [] as Edge[], right: [] as Edge[] };
  }

  const problemGroupIds = new Set(problemGroups.map((group) => group.group_id));
  const childGroupsByParentId = new Map<string, TGroup[]>();
  problemGroups.forEach((group) => {
    const parentId = group.parent_group_id || "";
    childGroupsByParentId.set(parentId, [...(childGroupsByParentId.get(parentId) || []), group]);
  });
  const rootProblemGroupCandidates = problemGroups.filter(
    (group) => !group.parent_group_id || !problemGroupIds.has(group.parent_group_id),
  );
  const rootProblemGroups = rootProblemGroupCandidates.length > 0 ? rootProblemGroupCandidates : problemGroups;
  const visibleProblemGroupIds = new Set<string>();

  const visitVisible = (group: TGroup, trail = new Set<string>()) => {
    if (trail.has(group.group_id)) return;
    const nextTrail = new Set(trail);
    nextTrail.add(group.group_id);
    visibleProblemGroupIds.add(group.group_id);
    if (!collapsedProblemGroupIds.has(group.group_id)) {
      (childGroupsByParentId.get(group.group_id) || []).forEach((child) => {
        visitVisible(child, nextTrail);
      });
    }
  };
  rootProblemGroups.forEach((group) => {
    visitVisible(group);
  });

  const hierarchyEdges = problemGroups
    .filter(
      (group) =>
        Boolean(group.parent_group_id) &&
        problemGroupIds.has(group.parent_group_id || "") &&
        visibleProblemGroupIds.has(group.group_id) &&
        visibleProblemGroupIds.has(group.parent_group_id || ""),
    )
    .map((group): Edge => ({
      id: `problem-parent-edge::${group.parent_group_id}::${group.group_id}`,
      source: `problem-${group.parent_group_id}`,
      target: `problem-${group.group_id}`,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, color: "#a3a3a3" },
      interactionWidth: 0,
      selectable: false,
      style: { stroke: "#a3a3a3", strokeOpacity: 0.62, strokeWidth: 1.6 },
    }));
  const groupLinkEdges = problemGroups.flatMap((group) =>
    (group.linked_group_ids || [])
      .filter(
        (linkedGroupId) =>
          linkedGroupId !== group.group_id &&
          problemGroupIds.has(linkedGroupId) &&
          visibleProblemGroupIds.has(group.group_id) &&
          visibleProblemGroupIds.has(linkedGroupId),
      )
      .map((linkedGroupId): Edge => ({
        id: `problem-group-link::${group.group_id}::${linkedGroupId}`,
        source: `problem-${group.group_id}`,
        target: `problem-${linkedGroupId}`,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, color: "#a13ab8" },
        interactionWidth: 0,
        selectable: false,
        style: { stroke: "#a13ab8", strokeOpacity: 0.58, strokeWidth: 2, strokeDasharray: "5 5" },
      })),
  );

  return {
    left: [...hierarchyEdges, ...groupLinkEdges],
    right: [] as Edge[],
  };
}
