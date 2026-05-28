"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { CanvasEditPresencePayload, CanvasProblemDefinitionGroup } from "@/lib/types";

type ProblemGroupStatus = "draft" | "review" | "final";

export type ProblemGroupActionModel = CanvasProblemDefinitionGroup & {
  status: ProblemGroupStatus;
};

type LocalEditPresenceTarget = {
  targetType: CanvasEditPresencePayload["target_type"];
  targetId: string;
  noteId?: string;
};

type UseProblemGroupActionsOptions<TGroup extends ProblemGroupActionModel> = {
  commitProblemGroupsSnapshot: (nextGroups: TGroup[], message: string, selectedGroupId?: string) => void;
  generationLocked?: boolean;
  problemGroupDraftConclusion: string;
  problemGroupDraftTopic: string;
  problemDefinitionPhase: string;
  problemGroups: TGroup[];
  selectedProblemGroupId: string;
  setActivityMessage: (message: string) => void;
  setCollapsedProblemGroupIds: Dispatch<SetStateAction<Set<string>>>;
  setEditingProblemGroupId: Dispatch<SetStateAction<string>>;
  setLocalEditPresenceTarget: Dispatch<SetStateAction<LocalEditPresenceTarget | null>>;
  setProblemGroupDraftConclusion: Dispatch<SetStateAction<string>>;
  setProblemGroupDraftInsight: Dispatch<SetStateAction<string>>;
  setProblemGroupDraftTopic: Dispatch<SetStateAction<string>>;
  setProblemGroups: Dispatch<SetStateAction<TGroup[]>>;
  setSelectedNodeId: Dispatch<SetStateAction<string>>;
  setSelectedProblemGroupId: Dispatch<SetStateAction<string>>;
};

function problemGroupStatusLabel(status: ProblemGroupStatus) {
  if (status === "review") return "검토중";
  if (status === "final") return "확정";
  return "초안";
}

export function useProblemGroupActions<TGroup extends ProblemGroupActionModel>({
  commitProblemGroupsSnapshot,
  generationLocked = false,
  problemGroupDraftConclusion,
  problemGroupDraftTopic,
  problemDefinitionPhase,
  problemGroups,
  selectedProblemGroupId,
  setActivityMessage,
  setCollapsedProblemGroupIds,
  setEditingProblemGroupId,
  setLocalEditPresenceTarget,
  setProblemGroupDraftConclusion,
  setProblemGroupDraftInsight,
  setProblemGroupDraftTopic,
  setProblemGroups,
  setSelectedNodeId,
  setSelectedProblemGroupId,
}: UseProblemGroupActionsOptions<TGroup>) {
  const handleQuickEditProblemGroup = useCallback(
    (group: TGroup) => {
      if (generationLocked) {
        setActivityMessage("현재 재생성 중이라 수정할 수 없습니다. 완료 후 다시 시도해 주세요.");
        return;
      }
      setSelectedProblemGroupId(group.group_id);
      setSelectedNodeId(`problem-${group.group_id}`);
      setLocalEditPresenceTarget({ targetType: "problem_group", targetId: group.group_id });
      setEditingProblemGroupId(group.group_id);
      setProblemGroupDraftTopic(group.topic);
      setProblemGroupDraftInsight("");
      setProblemGroupDraftConclusion((group.conclusion && group.conclusion !== group.topic ? group.conclusion : "") || group.insight_lens || "");
      setActivityMessage("문제정의 노드 수정 모드를 열었습니다. 저장해야 다른 참가자에게 반영됩니다.");
    },
    [
      generationLocked,
      setActivityMessage,
      setEditingProblemGroupId,
      setLocalEditPresenceTarget,
      setProblemGroupDraftConclusion,
      setProblemGroupDraftInsight,
      setProblemGroupDraftTopic,
      setSelectedNodeId,
      setSelectedProblemGroupId,
    ],
  );

  const handleDeleteProblemGroup = useCallback(
    (group: TGroup) => {
      if (generationLocked) {
        setActivityMessage("현재 재생성 중이라 삭제할 수 없습니다. 완료 후 다시 시도해 주세요.");
        return;
      }
      const childIdsByParent = new Map<string, string[]>();
      problemGroups.forEach((item) => {
        if (!item.parent_group_id) return;
        const ids = childIdsByParent.get(item.parent_group_id) || [];
        ids.push(item.group_id);
        childIdsByParent.set(item.parent_group_id, ids);
      });

      const removedIds = new Set<string>([group.group_id]);
      const visit = (groupId: string) => {
        (childIdsByParent.get(groupId) || []).forEach((childId) => {
          if (removedIds.has(childId)) return;
          removedIds.add(childId);
          visit(childId);
        });
      };
      visit(group.group_id);

      const nextGroups = problemGroups.filter((item) => !removedIds.has(item.group_id));
      commitProblemGroupsSnapshot(
        nextGroups,
        removedIds.size > 1 ? `문제정의 노드와 하위 ${removedIds.size - 1}개를 삭제했습니다.` : "문제정의 노드를 삭제했습니다.",
        nextGroups[0]?.group_id || "",
      );
    },
    [commitProblemGroupsSnapshot, generationLocked, problemGroups, setActivityMessage],
  );

  const handleCancelProblemGroupEdit = useCallback(() => {
    setEditingProblemGroupId("");
    setProblemGroupDraftTopic("");
    setProblemGroupDraftInsight("");
    setProblemGroupDraftConclusion("");
    setLocalEditPresenceTarget(null);
    setActivityMessage("문제정의 노드 수정을 취소했습니다.");
  }, [
    setActivityMessage,
    setEditingProblemGroupId,
    setLocalEditPresenceTarget,
    setProblemGroupDraftConclusion,
    setProblemGroupDraftInsight,
    setProblemGroupDraftTopic,
  ]);

  const handleSaveProblemGroupEdit = useCallback(
    (groupId: string) => {
      if (generationLocked) {
        setActivityMessage("현재 재생성 중이라 저장할 수 없습니다. 완료 후 다시 시도해 주세요.");
        return;
      }
      const group = problemGroups.find((item) => item.group_id === groupId);
      if (!group) return;

      const nextTopic = problemGroupDraftTopic.trim() || group.topic;
      const nextInsight = "";
      const nextConclusion = problemGroupDraftConclusion.trim();
      const nextGroups = problemGroups.map((item) =>
        item.group_id === groupId
          ? ({
              ...item,
              topic: nextTopic,
              insight_lens: nextInsight,
              insight_user_edited:
                nextInsight !== (item.insight_lens || "") ? true : item.insight_user_edited,
              conclusion: nextConclusion,
              conclusion_user_edited:
                nextConclusion !== (item.conclusion || "") ? true : item.conclusion_user_edited,
            } as TGroup)
          : item,
      );

      commitProblemGroupsSnapshot(nextGroups, "문제정의 노드를 수정했습니다.", groupId);
      setEditingProblemGroupId("");
      setProblemGroupDraftTopic("");
      setProblemGroupDraftInsight("");
      setProblemGroupDraftConclusion("");
      setLocalEditPresenceTarget(null);
    },
    [
      commitProblemGroupsSnapshot,
      problemGroupDraftConclusion,
      problemGroupDraftTopic,
      problemGroups,
      generationLocked,
      setActivityMessage,
      setEditingProblemGroupId,
      setLocalEditPresenceTarget,
      setProblemGroupDraftConclusion,
      setProblemGroupDraftInsight,
      setProblemGroupDraftTopic,
    ],
  );

  const handleToggleProblemChildren = useCallback(
    (groupId: string) => {
      setCollapsedProblemGroupIds((prev) => {
        const next = new Set(prev);
        if (next.has(groupId)) {
          next.delete(groupId);
        } else {
          next.add(groupId);
        }
        return next;
      });
    },
    [setCollapsedProblemGroupIds],
  );

  const handleSetProblemGroupStatus = useCallback(
    (status: ProblemGroupStatus) => {
      if (generationLocked) {
        setActivityMessage("현재 재생성 중이라 상태를 바꿀 수 없습니다. 완료 후 다시 시도해 주세요.");
        return;
      }
      if (problemDefinitionPhase === "structure") return;

      const selectedGroup =
        (selectedProblemGroupId ? problemGroups.find((group) => group.group_id === selectedProblemGroupId) : null) ||
        problemGroups[0] ||
        null;
      if (!selectedGroup) return;

      setProblemGroups((prev) =>
        prev.map((group) =>
          group.group_id === selectedGroup.group_id
            ? ({
                ...group,
                status,
              } as TGroup)
            : group,
        ),
      );
      setActivityMessage(`문제 정의 그룹 상태를 ${problemGroupStatusLabel(status)}로 변경했습니다.`);
    },
    [generationLocked, problemDefinitionPhase, problemGroups, selectedProblemGroupId, setActivityMessage, setProblemGroups],
  );

  return {
    handleCancelProblemGroupEdit,
    handleDeleteProblemGroup,
    handleQuickEditProblemGroup,
    handleSaveProblemGroupEdit,
    handleSetProblemGroupStatus,
    handleToggleProblemChildren,
  };
}
