"use client";

import { useCallback, useMemo } from "react";
import type {
  CanvasEndMeetingDialogsHandlers,
  CanvasEndMeetingDialogsProps,
  CanvasEndMeetingDialogsViewState,
} from "@/components/canvas/CanvasEndMeetingDialogs";
import type { CanvasFinalSolutionSummary } from "@/lib/types";

type UseCanvasEndMeetingDialogModelsOptions = {
  view: CanvasEndMeetingDialogsViewState;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  onDownloadPdf: () => void;
  onBackToConfirm: () => void;
  onSaveAndEnd: (snapshot: CanvasFinalSolutionSummary) => void | Promise<void>;
  getFinalSummarySnapshot: () => CanvasFinalSolutionSummary;
};

export function useCanvasEndMeetingDialogModels({
  view: incomingView,
  onCancel,
  onConfirm,
  onDownloadPdf,
  onBackToConfirm,
  onSaveAndEnd,
  getFinalSummarySnapshot,
}: UseCanvasEndMeetingDialogModelsOptions): CanvasEndMeetingDialogsProps {
  const view = useMemo<CanvasEndMeetingDialogsViewState>(() => ({
    confirmOpen: incomingView.confirmOpen,
    saving: incomingView.saving,
    preview: incomingView.preview,
    summaryPreviewMarkdown: incomingView.summaryPreviewMarkdown,
    summaryPreviewHtml: incomingView.summaryPreviewHtml,
  }), [
    incomingView.confirmOpen,
    incomingView.preview,
    incomingView.saving,
    incomingView.summaryPreviewHtml,
    incomingView.summaryPreviewMarkdown,
  ]);

  const handleConfirm = useCallback(() => {
    void onConfirm();
  }, [onConfirm]);

  const handleSaveAndEnd = useCallback(() => {
    void onSaveAndEnd(getFinalSummarySnapshot());
  }, [getFinalSummarySnapshot, onSaveAndEnd]);

  const handlers = useMemo<CanvasEndMeetingDialogsHandlers>(() => ({
    onCancel,
    onConfirm: handleConfirm,
    onDownloadPdf,
    onBackToConfirm,
    onSaveAndEnd: handleSaveAndEnd,
  }), [
    handleConfirm,
    handleSaveAndEnd,
    onBackToConfirm,
    onCancel,
    onDownloadPdf,
  ]);

  return useMemo<CanvasEndMeetingDialogsProps>(() => ({
    view,
    handlers,
  }), [handlers, view]);
}
