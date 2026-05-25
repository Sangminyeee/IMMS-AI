"use client";

import { useCallback, useMemo, useState, type Dispatch, type DragEvent, type SetStateAction } from "react";
import type { CanvasEditPresencePayload } from "@/lib/types";
import {
  makeProblemStructureGroup,
  makeProblemStructurePairGroupTitle,
  type ProblemStructureDragState,
  type ProblemStructureGroupViewModel,
  type ProblemStructureNodeViewModel,
  type ProblemStructureStatus,
} from "@/components/canvas/problemStructureModel";

const PROBLEM_STRUCTURE_NODE_DRAG_MIME = "application/x-imms-problem-structure-node";

type ProblemStructureEditPresenceTarget = {
  targetType: CanvasEditPresencePayload["target_type"];
  targetId: string;
  noteId?: string;
};

function problemStructureStatusLabel(status: ProblemStructureStatus) {
  if (status === "review") return "검토중";
  if (status === "final") return "확정";
  return "초안";
}

type UseProblemStructureEditorOptions = {
  problemStructureGroups: ProblemStructureGroupViewModel[];
  problemStructureNodes: ProblemStructureNodeViewModel[];
  setActivityMessage: (message: string) => void;
  setLocalEditPresenceTarget: (target: ProblemStructureEditPresenceTarget | null) => void;
  setProblemStructureGroups: Dispatch<SetStateAction<ProblemStructureGroupViewModel[]>>;
  setProblemStructureNodes: Dispatch<SetStateAction<ProblemStructureNodeViewModel[]>>;
};

export function useProblemStructureEditor({
  problemStructureGroups,
  problemStructureNodes,
  setActivityMessage,
  setLocalEditPresenceTarget,
  setProblemStructureGroups,
  setProblemStructureNodes,
}: UseProblemStructureEditorOptions) {
  const [problemStructureDrag, setProblemStructureDrag] = useState<ProblemStructureDragState | null>(null);
  const [editingProblemStructureGroupId, setEditingProblemStructureGroupId] = useState("");
  const [problemStructureGroupDraftTitle, setProblemStructureGroupDraftTitle] = useState("");
  const [problemStructureGroupDraftRationale, setProblemStructureGroupDraftRationale] = useState("");
  const [editingProblemStructureNodeId, setEditingProblemStructureNodeId] = useState("");
  const [problemStructureNodeDraftTitle, setProblemStructureNodeDraftTitle] = useState("");

  const problemStructureNodeById = useMemo(
    () => new Map(problemStructureNodes.map((node) => [node.id, node])),
    [problemStructureNodes],
  );

  const clearProblemStructureGroupEdit = useCallback(() => {
    setLocalEditPresenceTarget(null);
    setEditingProblemStructureGroupId("");
    setProblemStructureGroupDraftTitle("");
    setProblemStructureGroupDraftRationale("");
  }, [setLocalEditPresenceTarget]);

  const clearProblemStructureNodeEdit = useCallback(() => {
    setLocalEditPresenceTarget(null);
    setEditingProblemStructureNodeId("");
    setProblemStructureNodeDraftTitle("");
  }, [setLocalEditPresenceTarget]);

  const clearProblemStructureDrag = useCallback(() => {
    setProblemStructureDrag(null);
  }, []);

  const resetProblemStructureEditorState = useCallback(() => {
    setProblemStructureDrag(null);
    setEditingProblemStructureGroupId("");
    setProblemStructureGroupDraftTitle("");
    setProblemStructureGroupDraftRationale("");
    setEditingProblemStructureNodeId("");
    setProblemStructureNodeDraftTitle("");
  }, []);

  const handleAddProblemStructureGroup = useCallback(() => {
    const nextGroup = makeProblemStructureGroup(problemStructureGroups.length);
    setProblemStructureGroups((prev) => [...prev, nextGroup]);
    setLocalEditPresenceTarget({ targetType: "problem_structure_group", targetId: nextGroup.id });
    setEditingProblemStructureGroupId(nextGroup.id);
    setProblemStructureGroupDraftTitle(nextGroup.title);
    setProblemStructureGroupDraftRationale(nextGroup.rationale);
    setActivityMessage("정의 2단계 구조화 그룹을 추가했습니다. 제목과 이유를 수정한 뒤 저장해 주세요.");
  }, [problemStructureGroups.length, setActivityMessage, setLocalEditPresenceTarget, setProblemStructureGroups]);

  const handleDeleteProblemStructureGroup = useCallback(
    (groupId: string) => {
      setProblemStructureGroups((prev) => prev.filter((group) => group.id !== groupId));
      if (editingProblemStructureGroupId === groupId) {
        clearProblemStructureGroupEdit();
      }
      setActivityMessage("구조화 그룹을 삭제했습니다. 포함된 노드는 묶지 않은 노드로 돌아갑니다.");
    },
    [clearProblemStructureGroupEdit, editingProblemStructureGroupId, setActivityMessage, setProblemStructureGroups],
  );

  const handleAssignProblemStructureNode = useCallback(
    (nodeId: string, groupId: string) => {
      setProblemStructureGroups((prev) =>
        prev.map((group) => {
          const withoutNode = group.nodeIds.filter((item) => item !== nodeId);
          if (group.id !== groupId) {
            return {
              ...group,
              nodeIds: withoutNode,
            };
          }
          return {
            ...group,
            nodeIds: [...withoutNode, nodeId],
            createdBy: "user",
          };
        }),
      );
    },
    [setProblemStructureGroups],
  );

  const handleCreateProblemStructurePairGroup = useCallback(
    (sourceNodeId: string, targetNodeId: string) => {
      if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) return;
      const sourceNode = problemStructureNodeById.get(sourceNodeId);
      const targetNode = problemStructureNodeById.get(targetNodeId);
      if (!sourceNode || !targetNode) return;

      setProblemStructureGroups((prev) => {
        const nextGroup = {
          ...makeProblemStructureGroup(prev.length, "user"),
          title: makeProblemStructurePairGroupTitle(sourceNode, targetNode),
          nodeIds: [targetNodeId, sourceNodeId],
        };
        return [
          ...prev.map((group) => ({
            ...group,
            nodeIds: group.nodeIds.filter((nodeId) => nodeId !== sourceNodeId && nodeId !== targetNodeId),
          })),
          nextGroup,
        ];
      });
      setActivityMessage(`"${sourceNode.title}"와 "${targetNode.title}"로 새 구조화 그룹을 만들었습니다.`);
    },
    [problemStructureNodeById, setActivityMessage, setProblemStructureGroups],
  );

  const getProblemStructureDraggedNodeId = useCallback(
    (event: DragEvent<HTMLElement>) =>
      event.dataTransfer.getData(PROBLEM_STRUCTURE_NODE_DRAG_MIME) ||
      event.dataTransfer.getData("text/plain") ||
      problemStructureDrag?.nodeId ||
      "",
    [problemStructureDrag?.nodeId],
  );

  const handleProblemStructureNodeDragStart = useCallback((event: DragEvent<HTMLElement>, nodeId: string) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, button")) {
      event.preventDefault();
      return;
    }

    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(PROBLEM_STRUCTURE_NODE_DRAG_MIME, nodeId);
    event.dataTransfer.setData("text/plain", nodeId);
    setProblemStructureDrag({ nodeId, overGroupId: "", overNodeId: "", mode: "" });
  }, []);

  const handleProblemStructureNodeDragEnd = useCallback(() => {
    setProblemStructureDrag(null);
  }, []);

  const handleProblemStructureGroupDragOver = useCallback((event: DragEvent<HTMLElement>, groupId: string) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setProblemStructureDrag((prev) => {
      if (!prev?.nodeId) return prev;
      if (prev.mode === "group" && prev.overGroupId === groupId && !prev.overNodeId) return prev;
      return { ...prev, mode: "group", overGroupId: groupId, overNodeId: "" };
    });
  }, []);

  const handleProblemStructureNodeDragOver = useCallback((event: DragEvent<HTMLElement>, targetNodeId: string) => {
    setProblemStructureDrag((prev) => {
      if (!prev?.nodeId || prev.nodeId === targetNodeId) return prev;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      if (prev.mode === "node" && prev.overNodeId === targetNodeId) return prev;
      return { ...prev, mode: "node", overNodeId: targetNodeId, overGroupId: "" };
    });
  }, []);

  const handleProblemStructureGroupDrop = useCallback(
    (event: DragEvent<HTMLElement>, groupId: string) => {
      const draggedNodeId = getProblemStructureDraggedNodeId(event);
      if (!draggedNodeId) return;

      event.preventDefault();
      event.stopPropagation();
      handleAssignProblemStructureNode(draggedNodeId, groupId);
      setProblemStructureDrag(null);

      if (!groupId) {
        setActivityMessage("구조화 노드를 묶지 않은 노드로 이동했습니다.");
        return;
      }

      const targetGroup = problemStructureGroups.find((group) => group.id === groupId);
      setActivityMessage(`구조화 노드를 "${targetGroup?.title || "선택한 그룹"}"에 추가했습니다.`);
    },
    [getProblemStructureDraggedNodeId, handleAssignProblemStructureNode, problemStructureGroups, setActivityMessage],
  );

  const handleProblemStructureNodeDrop = useCallback(
    (event: DragEvent<HTMLElement>, targetNodeId: string) => {
      const draggedNodeId = getProblemStructureDraggedNodeId(event);
      if (!draggedNodeId || draggedNodeId === targetNodeId) {
        setProblemStructureDrag(null);
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      handleCreateProblemStructurePairGroup(draggedNodeId, targetNodeId);
      setProblemStructureDrag(null);
    },
    [getProblemStructureDraggedNodeId, handleCreateProblemStructurePairGroup],
  );

  const handleStartProblemStructureGroupEdit = useCallback(
    (group: ProblemStructureGroupViewModel) => {
      setLocalEditPresenceTarget({ targetType: "problem_structure_group", targetId: group.id });
      setEditingProblemStructureGroupId(group.id);
      setProblemStructureGroupDraftTitle(group.title);
      setProblemStructureGroupDraftRationale(group.rationale || "");
    },
    [setLocalEditPresenceTarget],
  );

  const handleRemoveProblemStructureNode = useCallback(
    (nodeId: string) => {
      setProblemStructureNodes((prev) => prev.filter((node) => node.id !== nodeId));
      setProblemStructureGroups((prev) =>
        prev.map((group) => ({
          ...group,
          nodeIds: group.nodeIds.filter((item) => item !== nodeId),
        })),
      );
      if (editingProblemStructureNodeId === nodeId) {
        clearProblemStructureNodeEdit();
      }
      setActivityMessage("정의 2단계 구조화 레이어에서 노드를 제외했습니다.");
    },
    [
      clearProblemStructureNodeEdit,
      editingProblemStructureNodeId,
      setActivityMessage,
      setProblemStructureGroups,
      setProblemStructureNodes,
    ],
  );

  const handleCancelProblemStructureGroupEdit = useCallback(() => {
    clearProblemStructureGroupEdit();
  }, [clearProblemStructureGroupEdit]);

  const handleSaveProblemStructureGroupEdit = useCallback(
    (groupId: string) => {
      const targetGroup = problemStructureGroups.find((group) => group.id === groupId);
      if (!targetGroup) {
        clearProblemStructureGroupEdit();
        return;
      }

      const nextTitle = problemStructureGroupDraftTitle.trim() || targetGroup.title;
      const nextRationale = problemStructureGroupDraftRationale.trim() || targetGroup.rationale || "";
      setProblemStructureGroups((prev) =>
        prev.map((group) =>
          group.id === groupId
            ? {
                ...group,
                title: nextTitle,
                rationale: nextRationale,
                createdBy: "user",
              }
            : group,
        ),
      );
      clearProblemStructureGroupEdit();
      setActivityMessage("구조화 그룹 텍스트를 수정했습니다.");
    },
    [
      clearProblemStructureGroupEdit,
      problemStructureGroupDraftRationale,
      problemStructureGroupDraftTitle,
      problemStructureGroups,
      setActivityMessage,
      setProblemStructureGroups,
    ],
  );

  const handleStartProblemStructureNodeEdit = useCallback(
    (node: ProblemStructureNodeViewModel) => {
      setLocalEditPresenceTarget({ targetType: "problem_structure_node", targetId: node.id });
      setEditingProblemStructureNodeId(node.id);
      setProblemStructureNodeDraftTitle(node.title);
    },
    [setLocalEditPresenceTarget],
  );

  const handleCancelProblemStructureNodeEdit = useCallback(() => {
    clearProblemStructureNodeEdit();
  }, [clearProblemStructureNodeEdit]);

  const handleSaveProblemStructureNodeEdit = useCallback(
    (nodeId: string) => {
      const targetNode = problemStructureNodeById.get(nodeId);
      if (!targetNode) {
        clearProblemStructureNodeEdit();
        return;
      }

      const nextTitle = problemStructureNodeDraftTitle.trim() || targetNode.title;
      setProblemStructureNodes((prev) =>
        prev.map((node) => (node.id === nodeId ? { ...node, title: nextTitle } : node)),
      );
      clearProblemStructureNodeEdit();
      setActivityMessage("구조화 노드 제목을 수정했습니다.");
    },
    [
      clearProblemStructureNodeEdit,
      problemStructureNodeById,
      problemStructureNodeDraftTitle,
      setActivityMessage,
      setProblemStructureNodes,
    ],
  );

  const handleUpdateProblemStructureGroupStatus = useCallback(
    (groupId: string, status: ProblemStructureStatus) => {
      setProblemStructureGroups((prev) =>
        prev.map((group) => (group.id === groupId ? { ...group, status, createdBy: "user" } : group)),
      );
      setActivityMessage(`구조화 그룹 상태를 ${problemStructureStatusLabel(status)}로 변경했습니다.`);
    },
    [setActivityMessage, setProblemStructureGroups],
  );

  return {
    editingProblemStructureGroupId,
    editingProblemStructureNodeId,
    handleAddProblemStructureGroup,
    handleCancelProblemStructureGroupEdit,
    handleCancelProblemStructureNodeEdit,
    handleDeleteProblemStructureGroup,
    handleProblemStructureGroupDragOver,
    handleProblemStructureGroupDrop,
    handleProblemStructureNodeDragEnd,
    handleProblemStructureNodeDragOver,
    handleProblemStructureNodeDragStart,
    handleProblemStructureNodeDrop,
    handleRemoveProblemStructureNode,
    handleSaveProblemStructureGroupEdit,
    handleSaveProblemStructureNodeEdit,
    handleStartProblemStructureGroupEdit,
    handleStartProblemStructureNodeEdit,
    handleUpdateProblemStructureGroupStatus,
    problemStructureDrag,
    problemStructureGroupDraftRationale,
    problemStructureGroupDraftTitle,
    problemStructureNodeDraftTitle,
    clearProblemStructureDrag,
    resetProblemStructureEditorState,
    setProblemStructureGroupDraftRationale,
    setProblemStructureGroupDraftTitle,
    setProblemStructureNodeDraftTitle,
  };
}
