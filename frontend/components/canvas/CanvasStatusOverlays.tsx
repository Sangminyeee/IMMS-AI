"use client";

import { memo } from "react";

type PlacementFeedback = {
  x: number;
  y: number;
  label: string;
};

type CanvasPlacementPreview = {
  x: number;
  y: number;
  label: string;
  hint: string;
  tone: string;
};

type CanvasStageEmptyOverlayProps = {
  eyebrow: string;
  message: string;
  tone: "problem" | "summary";
};

type ProblemIdeaDragPreviewProps = {
  x: number;
  y: number;
  cardKind: "summary" | string;
  title: string;
};

export const PlacementFeedbackOverlay = memo(function PlacementFeedbackOverlay({ feedback }: { feedback: PlacementFeedback }) {
  return (
    <div
      className="pointer-events-none absolute z-[9] -translate-x-1/2 -translate-y-1/2"
      style={{ left: feedback.x, top: feedback.y }}
    >
      <div className="rounded-full bg-[#10243f] px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-slate-300/80">
        {feedback.label} 생성됨
      </div>
    </div>
  );
});

export const CanvasPlacementPreviewOverlay = memo(function CanvasPlacementPreviewOverlay({
  preview,
}: {
  preview: CanvasPlacementPreview;
}) {
  return (
    <div
      className="pointer-events-none absolute z-[9]"
      style={{ left: preview.x, top: preview.y }}
    >
      <div className={`w-[232px] rounded-[24px] border px-4 py-3 shadow-lg backdrop-blur ${preview.tone}`}>
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold">
            {preview.label}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-70">
            Preview
          </span>
        </div>
        <p className="mt-3 text-sm font-semibold">
          {preview.hint}
        </p>
        <p className="mt-1 text-xs leading-5 opacity-75">
          클릭하면 이 위치에 공용 아이템이 생성됩니다.
        </p>
      </div>
    </div>
  );
});

export const ProblemIdeaDragPreview = memo(function ProblemIdeaDragPreview({
  x,
  y,
  cardKind,
  title,
}: ProblemIdeaDragPreviewProps) {
  return (
    <div
      className="pointer-events-none fixed z-[80] w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-[16px] border border-violet-200 bg-white/95 px-4 py-3 shadow-[0_18px_42px_rgba(15,23,42,0.20)] backdrop-blur"
      style={{
        left: x,
        top: y,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
          {cardKind === "summary" ? "요약/토픽" : "아이디어"}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          이동 중
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-slate-900">
        {title || "이동 중인 카드"}
      </p>
    </div>
  );
});

export const CanvasStageEmptyOverlay = memo(function CanvasStageEmptyOverlay({
  eyebrow,
  message,
  tone,
}: CanvasStageEmptyOverlayProps) {
  const eyebrowClassName =
    tone === "summary"
      ? "text-sm font-semibold uppercase tracking-[0.16em] text-[#a13ab8]"
      : "text-sm font-semibold uppercase tracking-[0.16em] text-violet-600";

  return (
    <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 text-center shadow-lg shadow-slate-200/70">
        <p className={eyebrowClassName}>{eyebrow}</p>
        <p className="mt-2 text-base text-slate-700">
          {message}
        </p>
      </div>
    </div>
  );
});

export const ProblemDefinitionPreparingOverlay = memo(function ProblemDefinitionPreparingOverlay() {
  return (
    <div className="absolute inset-0 z-[6] flex items-center justify-center bg-white/78 backdrop-blur-[2px]">
      <div className="w-[min(440px,90%)] rounded-[28px] border border-slate-200 bg-white px-8 py-7 text-center shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-violet-100 text-4xl">
          ⏳
        </div>
        <p className="mt-5 text-sm font-semibold uppercase tracking-[0.18em] text-violet-700">
          Problem Definition
        </p>
        <h3 className="mt-2 text-2xl font-semibold text-slate-900">
          문제정의 단계를 준비하고 있습니다
        </h3>
        <p className="mt-3 text-base leading-7 text-slate-500">
          아이디어 단계의 STT 발화를 바탕으로 큰 분류를 만드는 중입니다.
        </p>
      </div>
    </div>
  );
});

export const SolutionStagePendingOverlay = memo(function SolutionStagePendingOverlay() {
  return (
    <div className="absolute inset-0 z-[6] flex items-center justify-center bg-white/78 backdrop-blur-[2px]">
      <div className="w-[min(520px,92%)] rounded-[28px] border border-slate-200 bg-white px-8 py-7 text-center shadow-[0_28px_70px_rgba(15,23,42,0.12)]">
        <div className="mx-auto flex w-full max-w-[320px] items-center justify-center gap-5">
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((item) => (
              <div
                key={`loading-problem-${item}`}
                className="h-16 w-16 animate-pulse rounded-2xl bg-violet-100 shadow-sm"
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
          구조화 단계의 검토 중/확정 그룹과 회의 흐름을 바탕으로 문서 초안을 작성하는 중입니다.
        </p>
      </div>
    </div>
  );
});

export const CanvasStatusToast = memo(function CanvasStatusToast({ message }: { message: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[clamp(84px,12vh,112px)] z-10 flex justify-center px-4">
      <div className="max-w-[min(640px,calc(100%-32px))] rounded-full border border-black/10 bg-white/95 px-4 py-2 text-center text-xs leading-5 text-[#4d4d4d] shadow-[0_5.64px_22.56px_rgba(0,0,0,0.05)] backdrop-blur-sm">
        {message}
      </div>
    </div>
  );
});
