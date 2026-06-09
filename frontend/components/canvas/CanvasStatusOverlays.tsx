"use client";

import { memo, useEffect, useState } from "react";

type CanvasStageEmptyOverlayProps = {
  eyebrow: string;
  exiting?: boolean;
  message: string;
  tone: "problem" | "summary";
};

export const CanvasStageEmptyOverlay = memo(function CanvasStageEmptyOverlay({
  eyebrow,
  exiting = false,
  message,
  tone,
}: CanvasStageEmptyOverlayProps) {
  const eyebrowClassName =
    tone === "summary"
      ? "text-sm font-semibold uppercase tracking-[0.16em] text-[#236cf3]"
      : "text-sm font-semibold uppercase tracking-[0.16em] text-[#236cf3]";

  return (
    <div className="moa-popover-backdrop pointer-events-none absolute inset-0 z-[5] flex items-center justify-center bg-white/70 backdrop-blur-[1px]" data-exiting={exiting}>
      <div className="moa-popover-panel rounded-2xl border border-slate-200 bg-white px-6 py-5 text-center shadow-lg shadow-slate-200/70" data-exiting={exiting}>
        <p className={eyebrowClassName}>{eyebrow}</p>
        <p className="mt-2 text-base text-slate-700">
          {message}
        </p>
      </div>
    </div>
  );
});

export const ProblemDefinitionPreparingOverlay = memo(function ProblemDefinitionPreparingOverlay({
  exiting = false,
  detail = "",
}: {
  exiting?: boolean;
  detail?: string;
}) {
  return (
    <div className="moa-popover-backdrop absolute inset-0 z-[6] flex items-center justify-center bg-white/78 backdrop-blur-[2px]" data-exiting={exiting}>
      <div className="moa-popover-panel w-[min(440px,90%)] rounded-[28px] border border-slate-200 bg-white px-8 py-7 text-center shadow-[0_24px_60px_rgba(15,23,42,0.12)]" data-exiting={exiting}>
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#eef8ff] text-4xl">
          ⏳
        </div>
        <p className="mt-5 text-sm font-semibold uppercase tracking-[0.18em] text-[#236cf3]">
          Problem Definition
        </p>
        <h3 className="mt-2 text-2xl font-semibold text-slate-900">
          문제정의 단계를 준비하고 있습니다
        </h3>
        <p className="mt-3 text-base leading-7 text-slate-500">
          {detail || "아이디어 단계의 STT 발화를 바탕으로 큰 분류를 만드는 중입니다."}
        </p>
      </div>
    </div>
  );
});

export const SummaryDocumentPendingOverlay = memo(function SummaryDocumentPendingOverlay({
  exiting = false,
  detail = "",
}: {
  exiting?: boolean;
  detail?: string;
}) {
  return (
    <div className="moa-popover-backdrop absolute inset-0 z-[6] flex items-center justify-center bg-white/78 backdrop-blur-[2px]" data-exiting={exiting}>
      <div className="moa-popover-panel w-[min(520px,92%)] rounded-[28px] border border-slate-200 bg-white px-8 py-7 text-center shadow-[0_28px_70px_rgba(15,23,42,0.12)]" data-exiting={exiting}>
        <div className="mx-auto flex w-full max-w-[320px] items-center justify-center gap-5">
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((item) => (
              <div
                key={`loading-problem-${item}`}
                className="h-16 w-16 animate-pulse rounded-2xl bg-[#eef8ff] shadow-sm"
              />
            ))}
          </div>
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-slate-200 border-t-slate-700" />
            <span className="text-xs font-semibold uppercase tracking-[0.18em]">AI</span>
          </div>
          <div className="space-y-3">
            <div className="h-8 w-28 animate-pulse rounded-2xl bg-emerald-100" />
            <div className="h-16 w-28 animate-pulse rounded-2xl bg-emerald-50" />
          </div>
        </div>
        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-emerald-700">
          Summary Stage
        </p>
        <h3 className="mt-2 text-2xl font-semibold text-slate-900">
          요약 문서를 생성하고 있습니다
        </h3>
        <p className="mt-3 text-base leading-7 text-slate-500">
          {detail || "2단계 구조화의 모든 그룹과 회의 흐름을 바탕으로 문서 초안을 작성하는 중입니다."}
        </p>
      </div>
    </div>
  );
});

export const CanvasGenerationBanner = memo(function CanvasGenerationBanner({ message }: { message: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[24px] z-[7] flex justify-center px-4" aria-live="polite">
      <div key={message} className="moa-toast-pop max-w-[min(720px,calc(100%-32px))] rounded-full border border-[#b9dcff] bg-white/95 px-4 py-2 text-center text-[12px] font-semibold leading-5 text-[#236cf3] shadow-[0_8px_24px_rgba(35,108,243,0.12)] backdrop-blur">
        {message}
      </div>
    </div>
  );
});

export const CanvasStatusToast = memo(function CanvasStatusToast({ message }: { message: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setVisible(false);
    }, 1000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-[clamp(84px,12vh,112px)] z-10 flex justify-center px-4 transition-[opacity,transform] duration-700 ease-out ${
        visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
      }`}
      aria-live="polite"
    >
      <div key={message} className="moa-toast-pop max-w-[min(640px,calc(100%-32px))] rounded-full border border-black/10 bg-white/95 px-4 py-2 text-center text-xs leading-5 text-[#4d4d4d] shadow-[0_5.64px_22.56px_rgba(0,0,0,0.05)] backdrop-blur-sm">
        {message}
      </div>
    </div>
  );
});
