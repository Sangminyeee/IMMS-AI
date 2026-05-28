"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { CanvasHeaderHandlers } from "@/components/canvas/CanvasHeader";

type CanvasStage = Parameters<CanvasHeaderHandlers["onStageSelect"]>[0];

type RouterLike = {
  push: (href: string) => void;
};

type UseCanvasHeaderActionsOptions = {
  router: RouterLike;
  isRecording?: boolean;
  onToggleRecording?: () => void | Promise<void>;
  onStopRecordingClick: () => void | Promise<void>;
  onEndMeetingClick: () => void | Promise<void>;
  onRefreshProblemChunkSummaries: () => void | Promise<void>;
  onDebugRegenerateProblemDefinition: () => void | Promise<void>;
  onSaveMeetingGoalEdit: () => void | Promise<void>;
  onStageSelect: (stage: CanvasStage) => void | Promise<void>;
  onOpenMeetingGoalEditor: () => void;
  onCancelMeetingGoalEdit: () => void;
  setMeetingGoalEditorDraft: Dispatch<SetStateAction<string>>;
  setMeetingGoalContextEditorDraft: Dispatch<SetStateAction<string>>;
  setIdeationBubbleLayoutRevision: Dispatch<SetStateAction<number>>;
  setIdeationBubbleDebugEnabled: Dispatch<SetStateAction<boolean>>;
  setActivityMessage: (message: string) => void;
};

export function useCanvasHeaderActions({
  router,
  isRecording,
  onToggleRecording,
  onStopRecordingClick,
  onEndMeetingClick,
  onRefreshProblemChunkSummaries,
  onDebugRegenerateProblemDefinition,
  onSaveMeetingGoalEdit,
  onStageSelect,
  onOpenMeetingGoalEditor,
  onCancelMeetingGoalEdit,
  setMeetingGoalEditorDraft,
  setMeetingGoalContextEditorDraft,
  setIdeationBubbleLayoutRevision,
  setIdeationBubbleDebugEnabled,
  setActivityMessage,
}: UseCanvasHeaderActionsOptions): CanvasHeaderHandlers {
  const handleEndMeetingClick = useCallback(() => {
    void onEndMeetingClick();
  }, [onEndMeetingClick]);

  const handleRecordingToggle = useCallback(() => {
    if (isRecording) {
      void onStopRecordingClick();
      return;
    }
    void onToggleRecording?.();
  }, [isRecording, onStopRecordingClick, onToggleRecording]);

  const handleBackToDashboard = useCallback(() => {
    router.push("/dashboard");
  }, [router]);

  const handleRecomputeIdeationBubbles = useCallback(() => {
    setIdeationBubbleLayoutRevision((current) => current + 1);
    setActivityMessage("아이디어 버블 배치를 다시 계산했습니다.");
  }, [setActivityMessage, setIdeationBubbleLayoutRevision]);

  const handleToggleIdeationBubbleDebug = useCallback(() => {
    setIdeationBubbleDebugEnabled((current) => !current);
  }, [setIdeationBubbleDebugEnabled]);

  const handleRefreshProblemChunkSummaries = useCallback(() => {
    void onRefreshProblemChunkSummaries();
  }, [onRefreshProblemChunkSummaries]);

  const handleDebugRegenerateProblemDefinition = useCallback(() => {
    void onDebugRegenerateProblemDefinition();
  }, [onDebugRegenerateProblemDefinition]);

  const handleSaveMeetingGoalEdit = useCallback(() => {
    void onSaveMeetingGoalEdit();
  }, [onSaveMeetingGoalEdit]);

  const handleStageSelect = useCallback((nextStage: CanvasStage) => {
    void onStageSelect(nextStage);
  }, [onStageSelect]);

  return {
    onEndMeetingClick: handleEndMeetingClick,
    onRecordingToggle: handleRecordingToggle,
    onBackToDashboard: handleBackToDashboard,
    onRecomputeIdeationBubbles: handleRecomputeIdeationBubbles,
    onToggleIdeationBubbleDebug: handleToggleIdeationBubbleDebug,
    onRefreshProblemChunkSummaries: handleRefreshProblemChunkSummaries,
    onDebugRegenerateProblemDefinition: handleDebugRegenerateProblemDefinition,
    onOpenMeetingGoalEditor,
    onCancelMeetingGoalEdit,
    onSaveMeetingGoalEdit: handleSaveMeetingGoalEdit,
    onMeetingGoalEditorDraftChange: setMeetingGoalEditorDraft,
    onMeetingGoalContextEditorDraftChange: setMeetingGoalContextEditorDraft,
    onStageSelect: handleStageSelect,
  };
}
