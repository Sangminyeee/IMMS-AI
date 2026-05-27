"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { generateCanvasProblemTaxonomy } from "@/lib/api";
import type { CanvasProblemDefinitionGroup } from "@/lib/types";
import { isDuplicateProblemTaxonomyGroup } from "@/components/canvas/CanvasIdeationBubbles";

type ProblemGroupStatus = "draft" | "review" | "final";

export type ProblemChildGenerationGroupModel = CanvasProblemDefinitionGroup & {
  status: ProblemGroupStatus;
};

type ExistingProblemTaxonomyGroupPayload = {
  group_id: string;
  parent_group_id: string;
  depth: number;
  topic: string;
  evidence_utterance_ids: string[];
  source_summary_items: string[];
};

type UseProblemChildGenerationOptions<TGroup extends ProblemChildGenerationGroupModel> = {
  buildExistingGroupsPayload: (groups: TGroup[]) => ExistingProblemTaxonomyGroupPayload[];
  commitProblemGroupsSnapshot: (nextGroups: TGroup[], message: string, selectedGroupId?: string) => void;
  hydrateProblemGroups: (
    groups: Array<CanvasProblemDefinitionGroup & { status?: string }>,
    previousGroups: TGroup[],
  ) => TGroup[];
  meetingId: string;
  meetingTopicForAi: string;
  problemGroups: TGroup[];
  setActivityMessage: (message: string) => void;
  setCollapsedProblemGroupIds: Dispatch<SetStateAction<Set<string>>>;
};

export function useProblemChildGeneration<TGroup extends ProblemChildGenerationGroupModel>({
  buildExistingGroupsPayload,
  commitProblemGroupsSnapshot,
  hydrateProblemGroups,
  meetingId,
  meetingTopicForAi,
  problemGroups,
  setActivityMessage,
  setCollapsedProblemGroupIds,
}: UseProblemChildGenerationOptions<TGroup>) {
  const [problemChildGenerationPendingId, setProblemChildGenerationPendingId] = useState("");

  const handleGenerateProblemChildren = useCallback(
    async (group: TGroup) => {
      if (!meetingId || problemChildGenerationPendingId) return;

      setProblemChildGenerationPendingId(group.group_id);
      try {
        const groupById = new Map(problemGroups.map((item) => [item.group_id, item]));
        const resolveGroupDepth = (target: TGroup) => {
          let depth = 0;
          let cursor: TGroup | undefined = target;
          const visited = new Set<string>();

          while (cursor?.parent_group_id && !visited.has(cursor.group_id)) {
            visited.add(cursor.group_id);
            const parent = groupById.get(cursor.parent_group_id);
            if (!parent) break;
            depth += 1;
            cursor = parent;
          }

          return depth;
        };
        const parentDepth = resolveGroupDepth(group);
        const result = await generateCanvasProblemTaxonomy({
          meeting_id: meetingId,
          meeting_topic: meetingTopicForAi,
          parent_group_id: group.group_id,
          parent_topic: group.topic,
          parent_depth: parentDepth,
          parent_evidence_utterance_ids: group.evidence_utterance_ids || [],
          existing_group_ids: problemGroups.map((item) => item.group_id),
          existing_groups: buildExistingGroupsPayload(problemGroups),
          max_groups: 5,
        });
        const existingIds = new Set(problemGroups.map((item) => item.group_id));
        const generatedGroups = hydrateProblemGroups(result.groups || [], problemGroups);
        const childGroups = generatedGroups
          .filter((item) => !existingIds.has(item.group_id))
          .filter((item) => !isDuplicateProblemTaxonomyGroup(item, problemGroups, group.group_id, group.topic))
          .map((item) => ({
            ...item,
            parent_group_id: group.group_id,
            depth: parentDepth + 1,
            status: "draft" as ProblemGroupStatus,
          }) as TGroup);

        if (childGroups.length === 0) {
          setActivityMessage(
            result.warning ||
              (generatedGroups.length > 0
                ? "이미 생성된 세부 분류와 겹쳐 새로 추가할 노드가 없습니다."
                : "실제 발화 안에서 추가 세부 분류를 찾지 못했습니다."),
          );
          return;
        }

        setCollapsedProblemGroupIds((prev) => {
          if (!prev.has(group.group_id)) return prev;
          const next = new Set(prev);
          next.delete(group.group_id);
          return next;
        });
        commitProblemGroupsSnapshot(
          [...problemGroups, ...childGroups],
          result.warning || `"${group.topic}" 아래에 세부 분류 ${childGroups.length}개를 추가했습니다.`,
          childGroups[0].group_id,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setActivityMessage(`세부 분류 생성 실패: ${message}`);
      } finally {
        setProblemChildGenerationPendingId("");
      }
    },
    [
      buildExistingGroupsPayload,
      commitProblemGroupsSnapshot,
      hydrateProblemGroups,
      meetingId,
      meetingTopicForAi,
      problemChildGenerationPendingId,
      problemGroups,
      setActivityMessage,
      setCollapsedProblemGroupIds,
    ],
  );

  return {
    handleGenerateProblemChildren,
    problemChildGenerationPendingId,
  };
}
