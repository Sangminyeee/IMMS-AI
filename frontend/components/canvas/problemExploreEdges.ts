import type { Edge } from "@xyflow/react";

type ProblemExploreEdgeGroupModel = {
  group_id: string;
  parent_group_id?: string;
};

type BuildProblemExploreEdgesOptions<TGroup extends ProblemExploreEdgeGroupModel> = {
  collapsedProblemGroupIds: Set<string>;
  problemDefinitionPhase: string;
  problemGroups: TGroup[];
  stage: string;
};

export function buildProblemExploreEdges<TGroup extends ProblemExploreEdgeGroupModel>(
  options: BuildProblemExploreEdgesOptions<TGroup>,
) {
  void options;
  return {
    left: [] as Edge[],
    right: [] as Edge[],
  };
}
