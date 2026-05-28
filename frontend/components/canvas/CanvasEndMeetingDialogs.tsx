"use client";

import Image from "next/image";
import { MoaLogo } from "@/components/moa-ui/MoaLogo";

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
  finalReportQrOpen: boolean;
  finalReportQrLoading: boolean;
  finalReportQrUrl: string;
  finalReportQrImageDataUrl: string;
  finalReportQrError: string;
  finalReportQrCopied: boolean;
};

export type CanvasEndMeetingDialogsHandlers = {
  onCancel: () => void;
  onConfirm: () => void;
  onDownloadPdf: () => void;
  onCreateFinalReportQr: () => void;
  onCloseFinalReportQr: () => void;
  onCopyFinalReportQrUrl: () => void;
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
    finalReportQrOpen,
    finalReportQrLoading,
    finalReportQrUrl,
    finalReportQrImageDataUrl,
    finalReportQrError,
    finalReportQrCopied,
  } = view;
  const {
    onCancel,
    onConfirm,
    onDownloadPdf,
    onCreateFinalReportQr,
    onCloseFinalReportQr,
    onCopyFinalReportQrUrl,
    onBackToConfirm,
    onSaveAndEnd,
  } = handlers;

  return (
    <>
      {confirmOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0f172a]/42 p-5 backdrop-blur-[3px]">
          <div className="moa-font-pretendard w-full max-w-[592px] overflow-hidden rounded-[28px] border border-[#dbe7f5] bg-white shadow-[0_30px_90px_rgba(15,23,42,0.18)]">
            <div className="relative overflow-hidden border-b border-[#e7edf6] px-8 pb-7 pt-7">
              <div className="moa-dashboard-primary-button absolute inset-x-0 top-0 h-[5px]" />
              <div className="flex items-center justify-between gap-4">
                <MoaLogo showText={false} markClassName="h-[24px] w-[39px]" />
                <span className="inline-flex h-[30px] items-center rounded-full border border-[#d8e7ff] bg-[#f3f9ff] px-3">
                  <span className="text-[12px] font-semibold leading-[1.4] tracking-[-0.03px] text-[#067bf8]">
                    회의 종료 확인
                  </span>
                </span>
              </div>
              <h2 className="mt-8 text-[26px] font-bold leading-[1.35] tracking-[-0.65px] text-[#181818]">
                {(preview?.finalCount || 0) > 0 ? "회의를 종료할까요?" : "최종 정리 문서 없이 종료할까요?"}
              </h2>
              <p className="mt-3 max-w-[470px] text-[14px] font-medium leading-[1.8] tracking-[-0.35px] text-[#667085]">
                {(preview?.finalCount || 0) > 0
                  ? "현재 최종 정리 문서가 대시보드 결과 확인에 저장됩니다."
                  : "현재 저장할 최종 정리 문서가 없습니다. 그대로 종료하면 대시보드 결과 확인에 표시할 내용이 없습니다."}
              </p>
            </div>
            <div className="space-y-4 px-8 py-6">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[18px] border border-[#e3e8f1] bg-[#fbfdff] px-4 py-4">
                  <p className="text-[12px] font-semibold leading-[1.4] tracking-[-0.03px] text-[#90a1b9]">
                    저장될 문서 항목
                  </p>
                  <p className="mt-2 text-[24px] font-bold leading-none tracking-[-0.6px] text-[#181818]">
                    {preview?.finalCount || 0}
                    <span className="ml-1 text-[13px] font-semibold text-[#7c7c7c]">개</span>
                  </p>
                </div>
                <div className="rounded-[18px] border border-[#e3e8f1] bg-[#fbfdff] px-4 py-4">
                  <p className="text-[12px] font-semibold leading-[1.4] tracking-[-0.03px] text-[#90a1b9]">
                    포함된 문서 섹션
                  </p>
                  <p className="mt-2 text-[24px] font-bold leading-none tracking-[-0.6px] text-[#181818]">
                    {preview?.topicCount || 0}
                    <span className="ml-1 text-[13px] font-semibold text-[#7c7c7c]">개</span>
                  </p>
                </div>
              </div>
              {(preview?.finalCount || 0) === 0 ? (
                <p className="rounded-[18px] border border-[#d8e7ff] bg-[#f3f9ff] px-4 py-3 text-[13px] font-medium leading-[1.7] tracking-[-0.325px] text-[#236cf3]">
                  결과를 남기려면 요약 단계에서 최종 정리 문서를 생성하거나 직접 작성해 주세요.
                </p>
              ) : null}
            </div>
            <div className="flex justify-end gap-3 border-t border-[#e7edf6] bg-[#fbfdff] px-8 py-5">
              <button
                type="button"
                onClick={onCancel}
                disabled={saving}
                className="inline-flex h-[42px] min-w-[104px] items-center justify-center rounded-full border border-[#c9c9c9] bg-white px-5 transition hover:bg-[#f5f8ff] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="text-[12px] font-semibold leading-[1.4] tracking-[-0.03px] text-[#505050]">
                  돌아가기
                </span>
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={saving}
                className={`inline-flex h-[42px] min-w-[148px] items-center justify-center rounded-full px-6 shadow-[0_12px_28px_rgba(5,66,255,0.22)] transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  (preview?.finalCount || 0) > 0
                    ? "moa-dashboard-primary-button"
                    : "bg-[#484e54] hover:bg-[#3c4147]"
                }`}
              >
                <span className="relative z-[1] block whitespace-nowrap text-[12px] font-bold leading-[1.4] tracking-[-0.03px] text-white">
                  {saving ? "저장 중" : (preview?.finalCount || 0) > 0 ? "저장하고 종료" : "결과 없이 종료"}
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {summaryPreviewMarkdown ? (
        <div className="moa-font-pretendard fixed inset-0 z-[85] flex flex-col bg-[#f8f8f8]">
          <header className="flex min-h-[76px] items-center justify-between gap-5 border-b border-[#e1e7f2] bg-white px-[clamp(24px,3.2vw,56px)] shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
            <div className="flex min-w-0 items-center gap-4">
              <MoaLogo showText={false} markClassName="h-[24px] w-[39px]" />
              <div className="min-w-0">
                <p className="text-[12px] font-semibold leading-[1.4] tracking-[-0.03px] text-[#90a1b9]">
                  회의 결과 미리보기
                </p>
                <h2 className="mt-[2px] truncate text-[20px] font-bold leading-[1.4] tracking-[-0.5px] text-[#181818]">
                  최종 정리 문서
                </h2>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={onCreateFinalReportQr}
                disabled={saving || finalReportQrLoading}
                className="inline-flex h-[40px] items-center justify-center rounded-full border border-[#d8e7ff] bg-[#f3f9ff] px-5 transition hover:border-[#9ecbff] hover:bg-[#eaf5ff] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="text-[12px] font-semibold leading-[1.4] tracking-[-0.03px] text-[#067bf8]">
                  {finalReportQrLoading ? "QR 생성 중" : "QR코드 생성"}
                </span>
              </button>
              <button
                type="button"
                onClick={onDownloadPdf}
                disabled={saving}
                className="inline-flex h-[40px] items-center justify-center rounded-full border border-[#d8e7ff] bg-[#f3f9ff] px-5 transition hover:border-[#9ecbff] hover:bg-[#eaf5ff] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="text-[12px] font-semibold leading-[1.4] tracking-[-0.03px] text-[#067bf8]">
                  PDF 다운
                </span>
              </button>
              <button
                type="button"
                onClick={onBackToConfirm}
                disabled={saving}
                className="inline-flex h-[40px] items-center justify-center rounded-full border border-[#c9c9c9] bg-white px-5 transition hover:bg-[#f5f8ff] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="text-[12px] font-semibold leading-[1.4] tracking-[-0.03px] text-[#505050]">
                  돌아가기
                </span>
              </button>
              <button
                type="button"
                onClick={onSaveAndEnd}
                disabled={saving}
                className="moa-dashboard-primary-button inline-flex h-[40px] items-center justify-center rounded-full px-6 shadow-[0_12px_28px_rgba(5,66,255,0.18)] transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="relative z-[1] block whitespace-nowrap text-[12px] font-bold leading-[1.4] tracking-[-0.03px] text-white">
                  {saving ? "저장 중" : "저장하고 종료"}
                </span>
              </button>
            </div>
          </header>
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(220px,280px)_minmax(0,1fr)] gap-[22px] px-[clamp(24px,3.2vw,56px)] py-[26px]">
            <aside className="min-h-0 rounded-[28px] border border-[#e1e7f2] bg-white px-5 py-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <p className="text-[12px] font-semibold leading-[1.4] tracking-[-0.03px] text-[#90a1b9]">
                저장 정보
              </p>
              <div className="mt-5 space-y-3">
                <div className="rounded-[18px] bg-[#f7f9fc] px-4 py-4">
                  <p className="text-[11px] font-semibold leading-[1.4] tracking-[-0.028px] text-[#90a1b9]">
                    문서 항목
                  </p>
                  <p className="mt-2 text-[24px] font-bold leading-none tracking-[-0.6px] text-[#181818]">
                    {preview?.finalCount || 0}
                    <span className="ml-1 text-[13px] font-semibold text-[#7c7c7c]">개</span>
                  </p>
                </div>
                <div className="rounded-[18px] bg-[#f7f9fc] px-4 py-4">
                  <p className="text-[11px] font-semibold leading-[1.4] tracking-[-0.028px] text-[#90a1b9]">
                    문서 섹션
                  </p>
                  <p className="mt-2 text-[24px] font-bold leading-none tracking-[-0.6px] text-[#181818]">
                    {preview?.topicCount || 0}
                    <span className="ml-1 text-[13px] font-semibold text-[#7c7c7c]">개</span>
                  </p>
                </div>
              </div>
              <p className="mt-5 rounded-[18px] border border-[#d8e7ff] bg-[#f3f9ff] px-4 py-3 text-[12px] font-medium leading-[1.7] tracking-[-0.3px] text-[#236cf3]">
                저장하고 종료하면 이 문서가 대시보드의 결과 확인 화면에 저장됩니다.
              </p>
            </aside>
            <main className="min-h-0 rounded-[30px] border border-[#e1e7f2] bg-white p-3 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
              <iframe
                title="최종 정리 문서 미리보기"
                srcDoc={summaryPreviewHtml}
                className="h-full w-full rounded-[22px] border border-[#edf1f6] bg-white"
              />
            </main>
          </div>
          {finalReportQrOpen ? (
            <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0f172a]/42 p-5 backdrop-blur-[3px]">
              <div className="moa-font-pretendard w-full max-w-[420px] overflow-hidden rounded-[28px] border border-[#dbe7f5] bg-white shadow-[0_30px_90px_rgba(15,23,42,0.18)]">
                <div className="relative border-b border-[#e7edf6] px-6 pb-5 pt-6">
                  <div className="moa-dashboard-primary-button absolute inset-x-0 top-0 h-[5px]" />
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-[20px] font-bold leading-[1.4] tracking-[-0.5px] text-[#181818]">
                      QR코드로 문서 열기
                    </h3>
                    <button
                      type="button"
                      onClick={onCloseFinalReportQr}
                      className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border border-[#e1e7f2] bg-white text-[18px] font-semibold leading-none text-[#505050] transition hover:bg-[#f5f8ff]"
                      aria-label="QR코드 닫기"
                    >
                      ×
                    </button>
                  </div>
                  <p className="mt-2 text-[13px] font-medium leading-[1.7] tracking-[-0.325px] text-[#667085]">
                    로그인 없이 최종 정리 문서만 읽기 전용으로 열립니다. 열린 문서에서 PDF로 저장할 수 있습니다.
                  </p>
                </div>
                <div className="px-6 py-6">
                  {finalReportQrLoading ? (
                    <div className="flex min-h-[248px] items-center justify-center rounded-[24px] border border-[#e1e7f2] bg-[#f8f8f8]">
                      <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-[#d8e7ff] border-t-[#067bf8]" />
                    </div>
                  ) : finalReportQrImageDataUrl ? (
                    <div className="rounded-[24px] border border-[#e1e7f2] bg-[#f8f8f8] p-4">
                      <Image
                        src={finalReportQrImageDataUrl}
                        alt="최종 정리 문서 QR코드"
                        width={220}
                        height={220}
                        unoptimized
                        className="mx-auto h-[220px] w-[220px] rounded-[18px] bg-white"
                      />
                    </div>
                  ) : (
                    <div className="rounded-[18px] border border-[#f0c6c6] bg-[#fff5f5] px-4 py-4 text-[13px] font-medium leading-[1.7] tracking-[-0.325px] text-[#b23b3b]">
                      {finalReportQrError || "QR코드를 생성할 수 없습니다."}
                    </div>
                  )}
                  {finalReportQrError && finalReportQrImageDataUrl ? (
                    <p className="mt-3 rounded-[18px] border border-[#f0c6c6] bg-[#fff5f5] px-4 py-3 text-[12px] font-medium leading-[1.7] tracking-[-0.3px] text-[#b23b3b]">
                      {finalReportQrError}
                    </p>
                  ) : null}
                  {finalReportQrUrl ? (
                    <div className="mt-4 rounded-[18px] border border-[#e1e7f2] bg-[#fbfdff] px-4 py-3">
                      <p className="truncate text-[12px] font-medium leading-[1.6] tracking-[-0.3px] text-[#667085]">
                        {finalReportQrUrl}
                      </p>
                    </div>
                  ) : null}
                </div>
                <div className="flex justify-end gap-2 border-t border-[#e7edf6] bg-[#fbfdff] px-6 py-4">
                  <button
                    type="button"
                    onClick={onCopyFinalReportQrUrl}
                    disabled={!finalReportQrUrl}
                    className="inline-flex h-[40px] items-center justify-center rounded-full border border-[#d8e7ff] bg-[#f3f9ff] px-5 transition hover:border-[#9ecbff] hover:bg-[#eaf5ff] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="block whitespace-nowrap text-[12px] font-semibold leading-[1.4] tracking-[-0.03px] text-[#067bf8]">
                      {finalReportQrCopied ? "복사완료" : "링크 복사"}
                    </span>
                  </button>
                  <a
                    href={finalReportQrUrl || undefined}
                    target="_blank"
                    rel="noreferrer"
                    className={`moa-dashboard-primary-button inline-flex h-[40px] items-center justify-center rounded-full px-5 shadow-[0_12px_28px_rgba(5,66,255,0.18)] transition ${
                      finalReportQrUrl ? "" : "pointer-events-none opacity-40"
                    }`}
                  >
                    <span className="relative z-[1] block whitespace-nowrap text-[12px] font-bold leading-[1.4] tracking-[-0.03px] text-white">
                      문서 열기
                    </span>
                  </a>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
