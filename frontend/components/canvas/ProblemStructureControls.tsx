"use client";

import { memo } from "react";

type ProblemStructureMethodId = "affinity" | "card-sorting";
type ProblemDefinitionModeId = "" | "manual" | "ai";
type ConcreteProblemDefinitionMode = Exclude<ProblemDefinitionModeId, "">;

export type ProblemCanvasToolbarActionId =
  | "structure-start"
  | "structure-back"
  | "structure-ai-group"
  | "structure-add-group";

type ProblemStructureSetupModalProps = {
  draftMethod: ProblemStructureMethodId;
  draftMode: ProblemDefinitionModeId;
  exiting?: boolean;
  problemGroupsCount: number;
  pending: boolean;
  onClose: () => void;
  onDraftMethodChange: (method: ProblemStructureMethodId) => void;
  onDraftModeChange: (mode: ConcreteProblemDefinitionMode) => void;
  onStart: () => void | Promise<void>;
};

type ProblemStructureFloatingToolbarProps = {
  method: ProblemStructureMethodId;
  mode: ProblemDefinitionModeId;
  pending: boolean;
  onMethodChange: (method: ProblemStructureMethodId) => void;
  onModeChange: (mode: ConcreteProblemDefinitionMode) => void;
};

type ProblemCanvasToolbarProps = {
  actions: ProblemCanvasToolbarActionId[];
  exiting?: boolean;
  getActionLabel: (action: ProblemCanvasToolbarActionId) => string;
  isActionActive: (action: ProblemCanvasToolbarActionId) => boolean;
  isActionDisabled: (action: ProblemCanvasToolbarActionId) => boolean;
  onAction: (action: ProblemCanvasToolbarActionId) => void;
};

const PROBLEM_STRUCTURE_METHODS: ProblemStructureMethodId[] = ["affinity", "card-sorting"];
const PROBLEM_DEFINITION_MODES: ConcreteProblemDefinitionMode[] = ["ai", "manual"];

function problemStructureMethodLabel(method: ProblemStructureMethodId) {
  return method === "card-sorting" ? "Card Sorting" : "Affinity Diagram";
}

function problemDefinitionModeLabel(mode: ProblemDefinitionModeId) {
  if (mode === "ai") return "AI 초안";
  if (mode === "manual") return "직접 구성";
  return "미선택";
}

export const ProblemStructureSetupModal = memo(function ProblemStructureSetupModal({
  draftMethod,
  draftMode,
  exiting = false,
  problemGroupsCount,
  pending,
  onClose,
  onDraftMethodChange,
  onDraftModeChange,
  onStart,
}: ProblemStructureSetupModalProps) {
  return (
    <div className="moa-popover-backdrop absolute inset-0 z-[7] flex items-center justify-center bg-white/82 px-4 backdrop-blur-[2px]" data-exiting={exiting}>
      <div className="moa-popover-panel w-[min(820px,94%)] rounded-[20px] border border-black/10 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.14)]" data-exiting={exiting}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#236cf3]">Problem Structure</p>
            <h3 className="mt-2 text-2xl font-semibold text-black">정의 2단계 시작 설정</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-[8px] border border-black/10 bg-[#f9f9f9] px-3 py-2 text-xs font-semibold text-[#4d4d4d] transition hover:border-[#01a3ff]/30 hover:bg-[#eef8ff] hover:text-[#236cf3]"
          >
            닫기
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-black">구조화 방식</p>
            <div className="mt-3 grid gap-3">
              {PROBLEM_STRUCTURE_METHODS.map((method) => {
                const active = draftMethod === method;
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() => onDraftMethodChange(method)}
                    className={`rounded-[14px] border px-5 py-4 text-left transition ${
                      active
                        ? "border-[#01a3ff]/35 bg-[#eef8ff] text-[#236cf3]"
                        : "border-black/10 bg-[#f9f9f9] text-[#333] hover:border-[#01a3ff]/30 hover:bg-[#eef8ff]"
                    }`}
                  >
                    <span className="text-base font-semibold">{problemStructureMethodLabel(method)}</span>
                    <span className="mt-1 block text-sm leading-6 text-[#4d4d4d]">
                      {method === "affinity"
                        ? "비슷한 의미의 노드를 자유로운 그룹으로 묶습니다."
                        : "그룹 컬럼 위에 설명 카드를 두고 노드를 분류합니다."}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-black">시작 방식</p>
            <div className="mt-3 grid gap-3">
              {PROBLEM_DEFINITION_MODES.map((mode) => {
                const active = draftMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onDraftModeChange(mode)}
                    className={`rounded-[14px] border px-5 py-4 text-left transition ${
                      active
                        ? "border-[#01a3ff]/35 bg-[#eef8ff] text-[#236cf3]"
                        : "border-black/10 bg-[#f9f9f9] text-[#333] hover:border-[#01a3ff]/30 hover:bg-[#eef8ff]"
                    }`}
                  >
                    <span className="text-base font-semibold">
                      {mode === "ai" ? "AI가 초안을 만들기" : "직접 구성하기"}
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-[#4d4d4d]">
                      {mode === "ai"
                        ? "AI가 현재 노드들을 먼저 묶고, 사용자가 이후에 수정합니다."
                        : "사용자가 그룹을 만들고 노드를 옮기며 구조화합니다."}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-4">
          <p className="text-sm leading-6 text-[#4d4d4d]">
            정의 1단계 캔버스의 현재 노드 {problemGroupsCount}개를 기준으로 구조화를 시작합니다.
          </p>
          <button
            type="button"
            onClick={() => void onStart()}
            disabled={pending}
            className="rounded-[10px] border border-[#01a3ff] bg-[linear-gradient(90deg,#54c1ff_32.705%,#2f70e9_157.88%)] px-5 py-2.5 text-sm font-semibold tracking-[-0.035px] text-white shadow-[0_-4px_3px_rgba(255,255,255,0.29),0_2px_6px_rgba(1,231,255,0.3)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:border-[#d8d8d8] disabled:bg-none disabled:bg-[#d8d8d8] disabled:shadow-none"
          >
            {pending ? "AI 묶는 중" : "정의 2단계로 이동"}
          </button>
        </div>
      </div>
    </div>
  );
});

export const ProblemStructureFloatingToolbar = memo(function ProblemStructureFloatingToolbar({
  method,
  mode,
  pending,
  onMethodChange,
  onModeChange,
}: ProblemStructureFloatingToolbarProps) {
  return (
    <div className="pointer-events-none absolute left-4 top-4 z-[8] w-[min(38rem,calc(100%-2rem))]">
      <div className="pointer-events-auto rounded-[16px] border border-black/10 bg-white/95 p-3 shadow-[0_14px_38px_rgba(15,23,42,0.12)] backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[12rem] flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#236cf3]">
              정의 2단계
            </p>
            <p className="mt-1 text-sm font-semibold text-black">
              {problemStructureMethodLabel(method)} · {problemDefinitionModeLabel(mode)}
            </p>
            {pending ? (
              <p className="mt-1 text-xs font-medium text-[#236cf3]">AI가 구조화 그룹을 생성하는 중입니다.</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PROBLEM_STRUCTURE_METHODS.map((nextMethod) => {
              const active = method === nextMethod;
              return (
                <button
                  key={`structure-method-${nextMethod}`}
                  type="button"
                  disabled={pending}
                  onClick={() => onMethodChange(nextMethod)}
                  className={`rounded-[9px] px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? "border border-[#01a3ff]/35 bg-[#eef8ff] text-[#236cf3]"
                      : "border border-transparent bg-[#f5f6f8] text-[#4d4d4d] hover:bg-[#eef8ff] hover:text-[#236cf3]"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {problemStructureMethodLabel(nextMethod)}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PROBLEM_DEFINITION_MODES.map((nextMode) => {
              const active = mode === nextMode;
              return (
                <button
                  key={`structure-mode-${nextMode}`}
                  type="button"
                  disabled={pending}
                  onClick={() => onModeChange(nextMode)}
                  className={`rounded-[9px] px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? "border border-[#01a3ff]/35 bg-[#eef8ff] text-[#236cf3]"
                      : "border border-transparent bg-[#f5f6f8] text-[#4d4d4d] hover:bg-[#eef8ff] hover:text-[#236cf3]"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {problemDefinitionModeLabel(nextMode)}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});

export const ProblemCanvasToolbar = memo(function ProblemCanvasToolbar({
  actions,
  exiting = false,
  getActionLabel,
  isActionActive,
  isActionDisabled,
  onAction,
}: ProblemCanvasToolbarProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[clamp(16px,3vh,32px)] z-10 flex justify-center px-3">
      <div className="moa-toast-pop pointer-events-auto flex min-h-[clamp(48px,6.4vh,56px)] w-auto max-w-[min(860px,calc(100vw-24px))] flex-wrap items-center justify-center gap-2 rounded-[16px] border border-black/10 bg-white px-[clamp(10px,1.2vw,12px)] py-2 text-[#4d4d4d] shadow-[0_5.64px_22.56px_rgba(0,0,0,0.05)]" data-exiting={exiting}>
        {actions.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onAction(item)}
            disabled={isActionDisabled(item)}
            className={`flex h-[clamp(34px,4vh,38px)] min-w-[clamp(110px,10vw,150px)] shrink-0 items-center justify-center rounded-[12px] px-[clamp(10px,1vw,14px)] text-[clamp(12px,0.92vw,14px)] font-medium transition-all duration-150 ease-out ${
              isActionActive(item)
                ? "bg-[#01a3ff]/10 text-[#236cf3]"
                : "text-[#4d4d4d] hover:bg-[#eef8ff] hover:text-[#236cf3]"
            } disabled:cursor-not-allowed disabled:opacity-45`}
          >
            <span>{getActionLabel(item)}</span>
          </button>
        ))}
      </div>
    </div>
  );
});
