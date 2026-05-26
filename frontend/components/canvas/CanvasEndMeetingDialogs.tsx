"use client";

type CanvasEndMeetingDialogPreview = {
  finalCount: number;
  topicCount: number;
} | null;

export type CanvasEndMeetingDialogsViewState = {
  confirmOpen: boolean;
  saving: boolean;
  preview: CanvasEndMeetingDialogPreview;
  summaryPreviewMarkdown: string;
  summaryPreviewHtml: string;
};

export type CanvasEndMeetingDialogsHandlers = {
  onCancel: () => void;
  onConfirm: () => void;
  onDownloadPdf: () => void;
  onBackToConfirm: () => void;
  onSaveAndEnd: () => void;
};

export type CanvasEndMeetingDialogsProps = {
  view: CanvasEndMeetingDialogsViewState;
  handlers: CanvasEndMeetingDialogsHandlers;
};

export function CanvasEndMeetingDialogs({
  view,
  handlers,
}: CanvasEndMeetingDialogsProps) {
  const {
    confirmOpen,
    saving,
    preview,
    summaryPreviewMarkdown,
    summaryPreviewHtml,
  } = view;
  const {
    onCancel,
    onConfirm,
    onDownloadPdf,
    onBackToConfirm,
    onSaveAndEnd,
  } = handlers;

  return (
    <>
      {confirmOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-[560px] overflow-hidden rounded-[18px] border border-black/10 bg-white shadow-2xl">
            <div className="border-b border-black/10 px-7 py-6">
              <p className="text-sm font-semibold text-[#ef4e4e]">회의 종료 확인</p>
              <h2 className="mt-2 text-2xl font-semibold text-black">
                {(preview?.finalCount || 0) > 0 ? "회의를 종료할까요?" : "최종 정리 문서 없이 종료할까요?"}
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#4d4d4d]">
                {(preview?.finalCount || 0) > 0
                  ? "현재 최종 정리 문서가 대시보드 결과 확인에 저장됩니다."
                  : "현재 저장할 최종 정리 문서가 없습니다. 그대로 종료하면 대시보드 결과 확인에 표시할 내용이 없습니다."}
              </p>
            </div>
            <div className="space-y-3 px-7 py-5">
              <div className="rounded-[14px] bg-[#f9f9f9] px-4 py-3">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="font-medium text-[#4d4d4d]">저장될 문서 항목</span>
                  <span className="font-semibold text-black">{preview?.finalCount || 0}개</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-4 text-sm">
                  <span className="font-medium text-[#4d4d4d]">포함된 문서 섹션</span>
                  <span className="font-semibold text-black">{preview?.topicCount || 0}개</span>
                </div>
              </div>
              {(preview?.finalCount || 0) === 0 ? (
                <p className="rounded-[14px] border border-[#f0c6c6] bg-[#fff5f5] px-4 py-3 text-sm font-medium leading-6 text-[#b23b3b]">
                  결과를 남기려면 요약 단계에서 최종 정리 문서를 생성하거나 직접 작성해 주세요.
                </p>
              ) : null}
            </div>
            <div className="flex justify-end gap-3 border-t border-black/10 px-7 py-5">
              <button
                type="button"
                onClick={onCancel}
                disabled={saving}
                className="inline-flex h-11 items-center justify-center rounded-[12px] bg-[#eff0f6] px-5 text-sm font-semibold text-[#4d4d4d] transition hover:bg-[#e3e5ee] disabled:cursor-not-allowed disabled:opacity-50"
              >
                돌아가기
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={saving}
                className="inline-flex h-11 items-center justify-center rounded-[12px] bg-[#ef4e4e] px-5 text-sm font-semibold text-white transition hover:bg-[#df3f3f] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "저장 중" : (preview?.finalCount || 0) > 0 ? "저장하고 종료" : "결과 없이 종료"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {summaryPreviewMarkdown ? (
        <div className="fixed inset-0 z-[85] flex flex-col bg-[#f5f6f8]">
          <div className="flex min-h-[64px] items-center justify-between gap-4 border-b border-black/10 bg-white px-5 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#a13ab8]">Preview</p>
              <h2 className="mt-1 truncate text-lg font-semibold text-black">최종 정리 문서</h2>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={onDownloadPdf}
                disabled={saving}
                className="inline-flex h-10 items-center justify-center rounded-[10px] border border-[#ead0f2] bg-[#f4e8fb] px-4 text-sm font-semibold text-[#6f2b7d] transition hover:border-[#d9b7e5] hover:bg-[#ecd9f7] disabled:cursor-not-allowed disabled:opacity-50"
              >
                PDF 다운
              </button>
              <button
                type="button"
                onClick={onBackToConfirm}
                disabled={saving}
                className="inline-flex h-10 items-center justify-center rounded-[10px] border border-black/10 bg-white px-4 text-sm font-semibold text-[#4d4d4d] transition hover:bg-[#f7ecfb] hover:text-[#6f2b7d] disabled:cursor-not-allowed disabled:opacity-50"
              >
                돌아가기
              </button>
              <button
                type="button"
                onClick={onSaveAndEnd}
                disabled={saving}
                className="inline-flex h-10 items-center justify-center rounded-[10px] bg-[#ef4e4e] px-4 text-sm font-semibold text-white transition hover:bg-[#df3f3f] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "저장 중" : "저장하고 종료"}
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 p-4">
            <iframe
              title="최종 정리 문서 미리보기"
              srcDoc={summaryPreviewHtml}
              className="h-full w-full rounded-[16px] border border-black/10 bg-white shadow-[0_20px_70px_rgba(15,23,42,0.09)]"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
