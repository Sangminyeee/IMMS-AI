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
  onCreateFinalReportQr: () => void | Promise<void>;
  onCloseFinalReportQr: () => void;
  onCopyFinalReportQrUrl: () => void | Promise<void>;
  onBackToConfirm: () => void;
  onSaveAndEnd: (snapshot: CanvasFinalSolutionSummary) => void | Promise<void>;
  getFinalSummarySnapshot: () => CanvasFinalSolutionSummary;
};

export function useCanvasEndMeetingDialogModels({
  view: incomingView,
  onCancel,
  onConfirm,
  onDownloadPdf,
  onCreateFinalReportQr,
  onCloseFinalReportQr,
  onCopyFinalReportQrUrl,
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
    finalReportQrOpen: incomingView.finalReportQrOpen,
    finalReportQrLoading: incomingView.finalReportQrLoading,
    finalReportQrUrl: incomingView.finalReportQrUrl,
    finalReportQrImageDataUrl: incomingView.finalReportQrImageDataUrl,
    finalReportQrError: incomingView.finalReportQrError,
    finalReportQrCopied: incomingView.finalReportQrCopied,
  }), [
    incomingView.confirmOpen,
    incomingView.finalReportQrCopied,
    incomingView.finalReportQrError,
    incomingView.finalReportQrImageDataUrl,
    incomingView.finalReportQrLoading,
    incomingView.finalReportQrOpen,
    incomingView.finalReportQrUrl,
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

  const handleCreateFinalReportQr = useCallback(() => {
    void onCreateFinalReportQr();
  }, [onCreateFinalReportQr]);

  const handleCopyFinalReportQrUrl = useCallback(() => {
    void onCopyFinalReportQrUrl();
  }, [onCopyFinalReportQrUrl]);

  const handlers = useMemo<CanvasEndMeetingDialogsHandlers>(() => ({
    onCancel,
    onConfirm: handleConfirm,
    onDownloadPdf,
    onCreateFinalReportQr: handleCreateFinalReportQr,
    onCloseFinalReportQr,
    onCopyFinalReportQrUrl: handleCopyFinalReportQrUrl,
    onBackToConfirm,
    onSaveAndEnd: handleSaveAndEnd,
  }), [
    handleCopyFinalReportQrUrl,
    handleCreateFinalReportQr,
    handleConfirm,
    handleSaveAndEnd,
    onBackToConfirm,
    onCancel,
    onCloseFinalReportQr,
    onDownloadPdf,
  ]);

  return useMemo<CanvasEndMeetingDialogsProps>(() => ({
    view,
    handlers,
  }), [handlers, view]);
}
