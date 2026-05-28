"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { generateProblemGroupingRationale } from "@/lib/api";

type ProblemGroupingRationaleGroupModel = {
  group_id: string;
};

export type ProblemGroupingRationaleModel = {
  groupId: string;
  rationale: string;
  basisItems: string[];
  usedLlm: boolean;
  warning?: string;
  generatedAt?: string;
};

type UseProblemGroupingRationaleOptions<
  TGroup extends ProblemGroupingRationaleGroupModel,
  TRationale extends ProblemGroupingRationaleModel,
> = {
  buildProblemGroupingRationalePayload: (group: TGroup) => Parameters<typeof generateProblemGroupingRationale>[0];
  meetingId: string;
  problemGroupingRationaleById: Record<string, TRationale>;
  setActivityMessage: (message: string) => void;
  setProblemGroupingRationaleById: Dispatch<SetStateAction<Record<string, TRationale>>>;
  setProblemGroupingRationaleOpenGroupId: Dispatch<SetStateAction<string>>;
  setProblemGroupingRationalePendingId: Dispatch<SetStateAction<string>>;
};

export function useProblemGroupingRationale<
  TGroup extends ProblemGroupingRationaleGroupModel,
  TRationale extends ProblemGroupingRationaleModel,
>({
  buildProblemGroupingRationalePayload,
  meetingId,
  problemGroupingRationaleById,
  setActivityMessage,
  setProblemGroupingRationaleById,
  setProblemGroupingRationaleOpenGroupId,
  setProblemGroupingRationalePendingId,
}: UseProblemGroupingRationaleOptions<TGroup, TRationale>) {
  const handleShowProblemGroupingRationale = useCallback(
    async (group: TGroup) => {
      if (!meetingId) return;
      const cached = problemGroupingRationaleById[group.group_id];
      if (cached) {
        setProblemGroupingRationaleOpenGroupId(group.group_id);
        return;
      }

      setProblemGroupingRationalePendingId(group.group_id);
      try {
        const result = await generateProblemGroupingRationale(buildProblemGroupingRationalePayload(group));
        const nextRationale = {
          groupId: result.group_id || group.group_id,
          rationale: result.rationale || "이 분류를 묶은 기준을 찾지 못했습니다.",
          basisItems: result.basis_items || [],
          usedLlm: result.used_llm,
          warning: result.warning || "",
          generatedAt: result.generated_at,
        } as TRationale;
        setProblemGroupingRationaleById((prev) => ({
          ...prev,
          [group.group_id]: nextRationale,
        }));
        setProblemGroupingRationaleOpenGroupId(group.group_id);
        setActivityMessage(result.warning || "문제정의 그룹의 묶은 기준을 확인했습니다.");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setActivityMessage(`묶은 기준 생성 실패: ${message}`);
      } finally {
        setProblemGroupingRationalePendingId("");
      }
    },
    [
      buildProblemGroupingRationalePayload,
      meetingId,
      problemGroupingRationaleById,
      setActivityMessage,
      setProblemGroupingRationaleById,
      setProblemGroupingRationaleOpenGroupId,
      setProblemGroupingRationalePendingId,
    ],
  );

  return {
    handleShowProblemGroupingRationale,
  };
}
