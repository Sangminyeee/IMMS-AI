"use client";

import { useCallback, useState } from "react";

type UseCanvasMeetingGoalEditorOptions = {
  initialMeetingGoal: string;
  initialMeetingGoalContext: string;
  meetingId: string;
  onSave: (goal: string, context: string) => Promise<void>;
  onSaveError: (error: unknown) => void;
};

type SetMeetingGoalDraftsOptions = {
  syncEditor?: boolean;
};

export function useCanvasMeetingGoalEditor({
  initialMeetingGoal,
  initialMeetingGoalContext,
  meetingId,
  onSave,
  onSaveError,
}: UseCanvasMeetingGoalEditorOptions) {
  const [meetingGoalDraft, setMeetingGoalDraft] = useState(initialMeetingGoal);
  const [meetingGoalContextDraft, setMeetingGoalContextDraft] = useState(initialMeetingGoalContext);
  const [meetingGoalEditorDraft, setMeetingGoalEditorDraft] = useState(initialMeetingGoal);
  const [meetingGoalContextEditorDraft, setMeetingGoalContextEditorDraft] = useState(initialMeetingGoalContext);
  const [meetingGoalEditorOpen, setMeetingGoalEditorOpen] = useState(false);
  const [meetingGoalSaving, setMeetingGoalSaving] = useState(false);

  const setMeetingGoalDrafts = useCallback(
    (goal: string, context: string, options: SetMeetingGoalDraftsOptions = {}) => {
      const shouldSyncEditor = options.syncEditor ?? true;
      setMeetingGoalDraft(goal);
      setMeetingGoalContextDraft(context);
      if (shouldSyncEditor) {
        setMeetingGoalEditorDraft(goal);
        setMeetingGoalContextEditorDraft(context);
      }
    },
    [],
  );

  const resetMeetingGoalState = useCallback(() => {
    setMeetingGoalDraft("");
    setMeetingGoalContextDraft("");
    setMeetingGoalEditorDraft("");
    setMeetingGoalContextEditorDraft("");
    setMeetingGoalEditorOpen(false);
    setMeetingGoalSaving(false);
  }, []);

  const handleOpenMeetingGoalEditor = useCallback(() => {
    setMeetingGoalEditorDraft(meetingGoalDraft);
    setMeetingGoalContextEditorDraft(meetingGoalContextDraft);
    setMeetingGoalEditorOpen(true);
  }, [meetingGoalContextDraft, meetingGoalDraft]);

  const handleCancelMeetingGoalEdit = useCallback(() => {
    setMeetingGoalEditorDraft(meetingGoalDraft);
    setMeetingGoalContextEditorDraft(meetingGoalContextDraft);
    setMeetingGoalEditorOpen(false);
  }, [meetingGoalContextDraft, meetingGoalDraft]);

  const handleSaveMeetingGoalEdit = useCallback(async () => {
    if (!meetingId || meetingGoalSaving) {
      return;
    }

    const nextGoal = meetingGoalEditorDraft.trim();
    const nextContext = meetingGoalContextEditorDraft.trim();
    setMeetingGoalSaving(true);

    try {
      setMeetingGoalDrafts(nextGoal, nextContext);
      await onSave(nextGoal, nextContext);
      setMeetingGoalEditorOpen(false);
    } catch (error) {
      onSaveError(error);
    } finally {
      setMeetingGoalSaving(false);
    }
  }, [
    meetingGoalContextEditorDraft,
    meetingGoalEditorDraft,
    meetingGoalSaving,
    meetingId,
    onSave,
    onSaveError,
    setMeetingGoalDrafts,
  ]);

  return {
    meetingGoalDraft,
    setMeetingGoalDraft,
    meetingGoalContextDraft,
    setMeetingGoalContextDraft,
    meetingGoalEditorDraft,
    setMeetingGoalEditorDraft,
    meetingGoalContextEditorDraft,
    setMeetingGoalContextEditorDraft,
    meetingGoalEditorOpen,
    meetingGoalSaving,
    setMeetingGoalDrafts,
    resetMeetingGoalState,
    handleOpenMeetingGoalEditor,
    handleCancelMeetingGoalEdit,
    handleSaveMeetingGoalEdit,
  };
}
