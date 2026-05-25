import type { CanvasProblemStructureState } from "@/lib/types";

export type ProblemDefinitionMode = "" | "manual" | "ai";
export type ConcreteProblemDefinitionMode = Exclude<ProblemDefinitionMode, "">;
export type ProblemDefinitionPhase = "explore" | "structure";
export type ProblemStructureMethod = "affinity" | "card-sorting";
export type ProblemStructureStatus = "draft" | "review" | "final";

export type ProblemStructureSourceGroup = {
  group_id: string;
  parent_group_id?: string;
  depth?: number;
  topic?: string;
  insight_lens?: string;
  conclusion?: string;
  status?: string;
  source_summary_items?: string[];
};

export type ProblemStructureNodeViewModel = {
  id: string;
  sourceGroupId: string;
  title: string;
  body: string;
  status: ProblemStructureStatus;
  depth: number;
};

export type ProblemStructureGroupViewModel = {
  id: string;
  title: string;
  nodeIds: string[];
  rationale: string;
  status: ProblemStructureStatus;
  createdBy: "ai" | "user";
};

export type ProblemStructureDragState = {
  nodeId: string;
  overGroupId: string;
  overNodeId: string;
  mode: "group" | "node" | "";
};

function stripLeadingTimestamp(text: string) {
  return text
    .replace(
      /^\s*\[?\s*(?:\d{4}-\d{2}-\d{2}[T\s]\d{1,2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?|\d{1,2}:\d{2}(?::\d{2})?)\s*\]?\s*/,
      "",
    )
    .trim();
}

function normalizeProblemStructureStatus(raw: string | undefined): ProblemStructureStatus {
  if (raw === "review" || raw === "final") return raw;
  return "draft";
}

export function problemStructureMethodLabel(method: ProblemStructureMethod) {
  return method === "card-sorting" ? "Card Sorting" : "Affinity Diagram";
}

export function problemDefinitionModeLabel(mode: ProblemDefinitionMode) {
  if (mode === "ai") return "AI 초안";
  if (mode === "manual") return "직접 구성";
  return "미선택";
}

export function makeProblemStructureNode(group: ProblemStructureSourceGroup): ProblemStructureNodeViewModel {
  const body =
    group.conclusion ||
    group.insight_lens ||
    (group.source_summary_items || []).find(Boolean) ||
    "정의 1단계에서 가져온 노드입니다.";
  return {
    id: group.group_id,
    sourceGroupId: group.group_id,
    title: group.topic || "문제정의 노드",
    body: stripLeadingTimestamp(body),
    status: normalizeProblemStructureStatus(group.status),
    depth: Math.max(0, group.depth || 0),
  };
}

export function buildProblemStructureNodesFromGroups(groups: ProblemStructureSourceGroup[]) {
  return groups.map(makeProblemStructureNode);
}

export function makeProblemStructureGroup(
  index: number,
  createdBy: "ai" | "user" = "user",
): ProblemStructureGroupViewModel {
  const id = `structure-group-${Date.now()}-${index}-${Math.random().toString(16).slice(2, 6)}`;
  return {
    id,
    title: `구조화 그룹 ${index + 1}`,
    nodeIds: [],
    rationale: "",
    status: "draft",
    createdBy,
  };
}

export function makeProblemStructurePairGroupTitle(
  sourceNode: ProblemStructureNodeViewModel,
  targetNode: ProblemStructureNodeViewModel,
) {
  const sourceTitle = sourceNode.title.trim();
  const targetTitle = targetNode.title.trim();
  if (!sourceTitle && !targetTitle) return "새 구조화 그룹";
  return [targetTitle, sourceTitle]
    .filter(Boolean)
    .map((title) => (title.length > 14 ? `${title.slice(0, 14)}...` : title))
    .join(" + ");
}

export function pruneProblemStructureGroups(
  groups: ProblemStructureGroupViewModel[],
  nodes: ProblemStructureNodeViewModel[],
) {
  const validNodeIds = new Set(nodes.map((node) => node.id));
  return groups.map((group) => ({
    ...group,
    nodeIds: group.nodeIds.filter((nodeId) => validNodeIds.has(nodeId)),
  }));
}

export function normalizeProblemStructureGroupsFromResponse(
  groups: Array<{
    id?: string;
    title?: string;
    node_ids?: string[];
    rationale?: string;
    status?: string;
    created_by?: string;
  }>,
  nodes: ProblemStructureNodeViewModel[],
): ProblemStructureGroupViewModel[] {
  const validNodeIds = new Set(nodes.map((node) => node.id));
  const usedNodeIds = new Set<string>();
  const usedGroupIds = new Set<string>();

  return groups
    .map((group, index) => {
      const nodeIds = (group.node_ids || []).filter((nodeId) => {
        if (!validNodeIds.has(nodeId) || usedNodeIds.has(nodeId)) {
          return false;
        }
        usedNodeIds.add(nodeId);
        return true;
      });
      if (nodeIds.length === 0) {
        return null;
      }
      const baseId = group.id || `structure-ai-group-${index + 1}`;
      let id = baseId;
      let suffix = 2;
      while (usedGroupIds.has(id)) {
        id = `${baseId}-${suffix}`;
        suffix += 1;
      }
      usedGroupIds.add(id);
      return {
        id,
        title: group.title?.trim() || `AI 구조화 그룹 ${index + 1}`,
        nodeIds,
        rationale: group.rationale?.trim() || "",
        status: normalizeProblemStructureStatus(group.status),
        createdBy: group.created_by === "user" ? "user" : "ai",
      } satisfies ProblemStructureGroupViewModel;
    })
    .filter((group): group is ProblemStructureGroupViewModel => Boolean(group));
}

export function buildProblemStructureStatePayload(input: {
  phase: ProblemDefinitionPhase;
  method: ProblemStructureMethod;
  mode: ProblemDefinitionMode;
  nodes: ProblemStructureNodeViewModel[];
  groups: ProblemStructureGroupViewModel[];
}): CanvasProblemStructureState {
  return {
    phase: input.phase,
    method: input.method,
    mode: input.mode,
    nodes: input.nodes.map((node) => ({
      id: node.id,
      source_group_id: node.sourceGroupId,
      title: node.title,
      body: node.body,
      status: node.status,
      depth: node.depth,
    })),
    groups: input.groups.map((group) => ({
      id: group.id,
      title: group.title,
      node_ids: group.nodeIds,
      rationale: group.rationale,
      status: group.status,
      created_by: group.createdBy,
    })),
  };
}

export function createDefaultProblemStructureState(): CanvasProblemStructureState {
  return buildProblemStructureStatePayload({
    phase: "explore",
    method: "affinity",
    mode: "",
    nodes: [],
    groups: [],
  });
}

export function hydrateProblemStructureState(
  raw: CanvasProblemStructureState | null | undefined,
  fallbackProblemGroups: ProblemStructureSourceGroup[] = [],
): {
  phase: ProblemDefinitionPhase;
  method: ProblemStructureMethod;
  mode: ProblemDefinitionMode;
  nodes: ProblemStructureNodeViewModel[];
  groups: ProblemStructureGroupViewModel[];
} {
  const phase: ProblemDefinitionPhase = raw?.phase === "structure" ? "structure" : "explore";
  const method: ProblemStructureMethod = raw?.method === "card-sorting" ? "card-sorting" : "affinity";
  const mode: ProblemDefinitionMode = raw?.mode === "ai" || raw?.mode === "manual" ? raw.mode : "";
  const nodes = (raw?.nodes || [])
    .map((node) => ({
      id: node.id?.trim() || "",
      sourceGroupId: node.source_group_id?.trim() || node.id?.trim() || "",
      title: node.title?.trim() || "문제정의 노드",
      body: node.body?.trim() || "정의 1단계에서 가져온 노드입니다.",
      status: normalizeProblemStructureStatus(node.status),
      depth: Math.max(0, Number(node.depth || 0)),
    }))
    .filter((node) => node.id && node.title);
  const fallbackNodes = nodes.length > 0 ? nodes : buildProblemStructureNodesFromGroups(fallbackProblemGroups);
  const validNodeIds = new Set(fallbackNodes.map((node) => node.id));
  const groups = (raw?.groups || [])
    .map((group) => ({
      id: group.id?.trim() || "",
      title: group.title?.trim() || "구조화 그룹",
      nodeIds: (group.node_ids || []).filter((nodeId) => validNodeIds.has(nodeId)),
      rationale: group.rationale?.trim() || "",
      status: normalizeProblemStructureStatus(group.status),
      createdBy: group.created_by === "ai" ? ("ai" as const) : ("user" as const),
    }))
    .filter((group) => group.id && (group.title || group.nodeIds.length > 0));

  return {
    phase: fallbackNodes.length > 0 ? phase : "explore",
    method,
    mode,
    nodes: fallbackNodes,
    groups: pruneProblemStructureGroups(groups, fallbackNodes),
  };
}

export function getSummaryEligibleStructureGroups(groups: ProblemStructureGroupViewModel[]) {
  return groups.filter((group) => group.status === "final" || group.status === "review");
}

export function buildSummaryDocumentSourceSignature(
  groups: ProblemStructureGroupViewModel[],
  nodes: ProblemStructureNodeViewModel[],
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  return JSON.stringify(
    getSummaryEligibleStructureGroups(groups).map((group) => ({
      id: group.id,
      title: group.title,
      status: group.status,
      rationale: group.rationale,
      nodeIds: group.nodeIds,
      nodes: group.nodeIds.map((nodeId) => {
        const node = nodeById.get(nodeId);
        return {
          id: nodeId,
          sourceGroupId: node?.sourceGroupId || "",
          title: node?.title || "",
          body: node?.body || "",
        };
      }),
    })),
  );
}
