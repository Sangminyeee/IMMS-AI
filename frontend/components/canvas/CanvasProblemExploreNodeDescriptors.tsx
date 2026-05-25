import { Position } from "@xyflow/react";
import {
  estimateProblemTopicNodeHeight,
  makeProblemTopicNodeLabel,
} from "@/components/canvas/CanvasNodeLabels";
import {
  buildNodeContentSignature,
  type CanvasGraphBlueprint,
  type CanvasNodeDescriptor,
} from "@/components/canvas/CanvasGraphTypes";
import type { CanvasNodePosition, CanvasNodePositionsByStage } from "@/lib/types";

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
  positionedProblemGroups: Array<{
    group: TGroup;
    position: CanvasNodePosition;
    rootIndex: number;
  }>;
  problemGroupHeightById: Map<string, number>;
  problemNodeWidth: number;
};

type RemoteEditPresence = {
  updated_at?: string;
};

function makeProblemExploreEditPresenceKey(groupId: string) {
  return `problem_group:${groupId}:`;
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
  pendingProblemGroupLinkId: string;
  problemChildGenerationPendingId: string;
  editingProblemGroupId: string;
  problemExploreLayout: ProblemExploreLayoutModel<TGroup>;
  problemGroupDraftConclusion: string;
  problemGroupDraftInsight: string;
  problemGroupDraftTopic: string;
  problemGroupingRationaleById: Record<string, unknown>;
  problemGroupingRationalePendingId: string;
  problemGroups: TGroup[];
  remoteEditPresenceByKey: Record<string, RemoteEditPresence | null | undefined>;
  stage: string;
}): CanvasGraphBlueprint {
  const {
    collapsedProblemGroupIds,
    dropProblemGroupId,
    getProblemGroupSourceCount,
    loadingProblemGroupIds,
    nodePositions,
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
    onShowProblemGroupingRationale,
    onToggleProblemChildren,
    pendingProblemGroupLinkId,
    problemChildGenerationPendingId,
    editingProblemGroupId,
    problemExploreLayout,
    problemGroupDraftConclusion,
    problemGroupDraftInsight,
    problemGroupDraftTopic,
    problemGroupingRationaleById,
    problemGroupingRationalePendingId,
    problemGroups,
    remoteEditPresenceByKey,
    stage,
  } = input;
  const {
    activeGroup,
    childCountByGroupId,
    positionedProblemGroups,
    problemGroupHeightById,
    problemNodeWidth,
  } = problemExploreLayout;

  const nodeDescriptors: CanvasNodeDescriptor[] = positionedProblemGroups.map(({ group, position, rootIndex }) => {
    const selected = activeGroup?.group_id === group.group_id || pendingProblemGroupLinkId === group.group_id;
    const loading = loadingProblemGroupIds.includes(group.group_id);
    const dropTarget = dropProblemGroupId === group.group_id;
    const nodeId = `problem-${group.group_id}`;
    const sourceCount = getProblemGroupSourceCount(group);
    const opinionCount = (group.discussion_items || []).length;
    const editing = editingProblemGroupId === group.group_id;
    const nodeHeight = editing
      ? Math.max(problemGroupHeightById.get(group.group_id) || estimateProblemTopicNodeHeight(group), 420)
      : problemGroupHeightById.get(group.group_id) || estimateProblemTopicNodeHeight(group);
    const savedPosition = nodePositions["problem-definition"]?.[nodeId];
    const childCount = childCountByGroupId.get(group.group_id) || 0;
    const childCollapsed = collapsedProblemGroupIds.has(group.group_id);
    const criteriaLoading = problemGroupingRationalePendingId === group.group_id;
    const hasGroupingRationale = Boolean(problemGroupingRationaleById[group.group_id]);
    const remoteProblemGroupEditPresence =
      remoteEditPresenceByKey[makeProblemExploreEditPresenceKey(group.group_id)] || null;

    return {
      id: nodeId,
      position: savedPosition || position,
      positionSource: savedPosition ? "persisted" : "computed",
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      className: "!border-0 !bg-transparent !p-0 !shadow-none",
      style: { width: problemNodeWidth, minHeight: nodeHeight, padding: 0 },
      draggable: !editing,
      data: {
        contentSignature: buildNodeContentSignature([
          "problem-topic",
          group.group_id,
          group.parent_group_id || "",
          group.depth || 0,
          group.topic,
          group.status,
          selected,
          loading,
          dropTarget,
          pendingProblemGroupLinkId === group.group_id,
          group.insight_lens,
          group.conclusion,
          ...(group.linked_group_ids || []),
          sourceCount,
          opinionCount,
          childCount,
          childCollapsed,
          problemChildGenerationPendingId === group.group_id,
          criteriaLoading,
          hasGroupingRationale,
          editing,
          editing ? problemGroupDraftTopic : "",
          editing ? problemGroupDraftInsight : "",
          editing ? problemGroupDraftConclusion : "",
          remoteProblemGroupEditPresence?.updated_at || "",
        ]),
        label: makeProblemTopicNodeLabel(
          group,
          rootIndex,
          selected,
          loading,
          dropTarget,
          sourceCount,
          opinionCount,
          childCount,
          childCollapsed,
          problemChildGenerationPendingId === group.group_id,
          criteriaLoading,
          hasGroupingRationale,
          editing,
          problemGroupDraftTopic,
          problemGroupDraftInsight,
          problemGroupDraftConclusion,
          Boolean(remoteProblemGroupEditPresence),
          (event) => {
            event.stopPropagation();
            onShowProblemGroupingRationale(group);
          },
          (event) => {
            event.stopPropagation();
            onGenerateProblemChildren(group);
          },
          (event) => {
            event.stopPropagation();
            onToggleProblemChildren(group.group_id);
          },
          (event) => {
            event.stopPropagation();
            onQuickEditProblemGroup(group);
          },
          () => onCancelProblemGroupEdit(),
          () => onSaveProblemGroupEdit(group.group_id),
          onProblemGroupDraftTopicChange,
          onProblemGroupDraftInsightChange,
          onProblemGroupDraftConclusionChange,
          (event) => {
            event.stopPropagation();
            onDeleteProblemGroup(group);
          },
          (event) => {
            const types = Array.from(event.dataTransfer.types || []);
            const isNoteDrag =
              types.includes("application/x-imms-note-id") ||
              types.includes("text/plain");
            if (!isNoteDrag) return;
            event.preventDefault();
            event.stopPropagation();
            onDropProblemGroupChange(group.group_id);
          },
          () => {
            if (dropProblemGroupId === group.group_id) {
              onDropProblemGroupChange("");
            }
          },
          (event) => {
            event.preventDefault();
            event.stopPropagation();
            const noteId =
              event.dataTransfer.getData("application/x-imms-note-id") ||
              event.dataTransfer.getData("text/plain");
            if (!noteId) return;
            onAttachPersonalNoteToProblemGroup(group.group_id, noteId);
          },
        ),
      },
    };
  });

  return {
    layoutSignature: buildNodeContentSignature([
      stage,
      activeGroup?.group_id || "",
      ...Array.from(collapsedProblemGroupIds),
      ...problemGroups.flatMap((group) => [
        group.group_id,
        group.topic,
        group.status,
        group.insight_lens || "",
        group.conclusion || "",
        editingProblemGroupId === group.group_id,
        editingProblemGroupId === group.group_id ? problemGroupDraftTopic : "",
        editingProblemGroupId === group.group_id ? problemGroupDraftInsight : "",
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
