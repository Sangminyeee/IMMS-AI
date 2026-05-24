"use client";

import { useCallback, useState } from "react";

export type CanvasEndMeetingPreview<TSolutionTopic> = {
  finalCount: number;
  topicCount: number;
  solutionTopics: TSolutionTopic[];
};

export function useCanvasEndMeetingState<TSolutionTopic>() {
  const [endMeetingConfirmOpen, setEndMeetingConfirmOpen] = useState(false);
  const [endMeetingSaving, setEndMeetingSaving] = useState(false);
  const [endMeetingPreview, setEndMeetingPreview] = useState<CanvasEndMeetingPreview<TSolutionTopic> | null>(null);
  const [endMeetingSummaryPreviewMarkdown, setEndMeetingSummaryPreviewMarkdown] = useState("");

  const resetEndMeetingState = useCallback(() => {
    setEndMeetingConfirmOpen(false);
    setEndMeetingSaving(false);
    setEndMeetingPreview(null);
    setEndMeetingSummaryPreviewMarkdown("");
  }, []);

  const openEndMeetingConfirm = useCallback((preview: CanvasEndMeetingPreview<TSolutionTopic>) => {
    setEndMeetingPreview(preview);
    setEndMeetingSummaryPreviewMarkdown("");
    setEndMeetingConfirmOpen(true);
  }, []);

  const showEndMeetingSummaryPreview = useCallback((markdown: string) => {
    setEndMeetingConfirmOpen(false);
    setEndMeetingSummaryPreviewMarkdown(markdown);
  }, []);

  const handleCancelEndMeeting = useCallback(() => {
    if (endMeetingSaving) return;
    resetEndMeetingState();
  }, [endMeetingSaving, resetEndMeetingState]);

  const handleBackToEndMeetingConfirm = useCallback(() => {
    if (endMeetingSaving) return;
    setEndMeetingSummaryPreviewMarkdown("");
    setEndMeetingConfirmOpen(true);
  }, [endMeetingSaving]);

  return {
    endMeetingConfirmOpen,
    endMeetingSaving,
    setEndMeetingSaving,
    endMeetingPreview,
    endMeetingSummaryPreviewMarkdown,
    resetEndMeetingState,
    openEndMeetingConfirm,
    showEndMeetingSummaryPreview,
    handleCancelEndMeeting,
    handleBackToEndMeetingConfirm,
  };
}
