"use client";

import { useMemo } from "react";
import type {
  CanvasHeaderHandlers,
  CanvasHeaderMeetingGoalState,
  CanvasHeaderProps,
  CanvasHeaderViewState,
} from "@/components/canvas/CanvasHeader";

type UseCanvasHeaderModelsInput = CanvasHeaderProps;

export function useCanvasHeaderModels({
  view: incomingView,
  meetingGoal: incomingMeetingGoal,
  handlers: incomingHandlers,
}: UseCanvasHeaderModelsInput): CanvasHeaderProps {
  const view = useMemo<CanvasHeaderViewState>(() => ({
    meetingTitle: incomingView.meetingTitle,
    isRecording: incomingView.isRecording,
    recordingStartedAtMs: incomingView.recordingStartedAtMs,
    endMeetingSaving: incomingView.endMeetingSaving,
    stage: incomingView.stage,
    busy: incomingView.busy,
    problemDefinitionStagePending: incomingView.problemDefinitionStagePending,
    isProblemDefinitionExploreStage: incomingView.isProblemDefinitionExploreStage,
    ideationBubbleDebugEnabled: incomingView.ideationBubbleDebugEnabled,
  }), [
    incomingView.busy,
    incomingView.endMeetingSaving,
    incomingView.ideationBubbleDebugEnabled,
    incomingView.isProblemDefinitionExploreStage,
    incomingView.isRecording,
    incomingView.meetingTitle,
    incomingView.problemDefinitionStagePending,
    incomingView.recordingStartedAtMs,
    incomingView.stage,
  ]);

  const meetingGoal = useMemo<CanvasHeaderMeetingGoalState>(() => ({
    meetingGoalDraft: incomingMeetingGoal.meetingGoalDraft,
    meetingGoalContextDraft: incomingMeetingGoal.meetingGoalContextDraft,
    meetingGoalEditorOpen: incomingMeetingGoal.meetingGoalEditorOpen,
    meetingGoalEditorDraft: incomingMeetingGoal.meetingGoalEditorDraft,
    meetingGoalContextEditorDraft: incomingMeetingGoal.meetingGoalContextEditorDraft,
    meetingGoalSaving: incomingMeetingGoal.meetingGoalSaving,
  }), [
    incomingMeetingGoal.meetingGoalContextDraft,
    incomingMeetingGoal.meetingGoalContextEditorDraft,
    incomingMeetingGoal.meetingGoalDraft,
    incomingMeetingGoal.meetingGoalEditorDraft,
    incomingMeetingGoal.meetingGoalEditorOpen,
    incomingMeetingGoal.meetingGoalSaving,
  ]);

  const handlers = useMemo<CanvasHeaderHandlers>(() => ({
    onEndMeetingClick: incomingHandlers.onEndMeetingClick,
    onRecordingToggle: incomingHandlers.onRecordingToggle,
    onBackToDashboard: incomingHandlers.onBackToDashboard,
    onRecomputeIdeationBubbles: incomingHandlers.onRecomputeIdeationBubbles,
    onToggleIdeationBubbleDebug: incomingHandlers.onToggleIdeationBubbleDebug,
    onRefreshProblemChunkSummaries: incomingHandlers.onRefreshProblemChunkSummaries,
    onDebugRegenerateProblemDefinition: incomingHandlers.onDebugRegenerateProblemDefinition,
    onOpenMeetingGoalEditor: incomingHandlers.onOpenMeetingGoalEditor,
    onCancelMeetingGoalEdit: incomingHandlers.onCancelMeetingGoalEdit,
    onSaveMeetingGoalEdit: incomingHandlers.onSaveMeetingGoalEdit,
    onSaveMeetingTitle: incomingHandlers.onSaveMeetingTitle,
    onMeetingGoalEditorDraftChange: incomingHandlers.onMeetingGoalEditorDraftChange,
    onMeetingGoalContextEditorDraftChange: incomingHandlers.onMeetingGoalContextEditorDraftChange,
    onStageSelect: incomingHandlers.onStageSelect,
  }), [
    incomingHandlers.onBackToDashboard,
    incomingHandlers.onCancelMeetingGoalEdit,
    incomingHandlers.onDebugRegenerateProblemDefinition,
    incomingHandlers.onEndMeetingClick,
    incomingHandlers.onMeetingGoalContextEditorDraftChange,
    incomingHandlers.onMeetingGoalEditorDraftChange,
    incomingHandlers.onOpenMeetingGoalEditor,
    incomingHandlers.onRecomputeIdeationBubbles,
    incomingHandlers.onRecordingToggle,
    incomingHandlers.onRefreshProblemChunkSummaries,
    incomingHandlers.onSaveMeetingGoalEdit,
    incomingHandlers.onSaveMeetingTitle,
    incomingHandlers.onStageSelect,
    incomingHandlers.onToggleIdeationBubbleDebug,
  ]);

  return useMemo<CanvasHeaderProps>(() => ({
    view,
    meetingGoal,
    handlers,
  }), [handlers, meetingGoal, view]);
}
