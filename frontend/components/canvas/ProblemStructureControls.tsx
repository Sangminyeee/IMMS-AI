"use client";

import { memo } from "react";

type ProblemStructureMethodId = "affinity" | "card-sorting";
type ProblemDefinitionModeId = "" | "manual" | "ai";
type ConcreteProblemDefinitionMode = Exclude<ProblemDefinitionModeId, "">;

export type ProblemCanvasToolbarActionId =
  | "structure-start"
  | "structure-back"
  | "structure-ai-group"
  | "structure-add-group"
  | "structure-refresh";

type ProblemStructureSetupModalProps = {
  draftMethod: ProblemStructureMethodId;
  draftMode: ProblemDefinitionModeId;
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
  problemGroupsCount,
  pending,
  onClose,
  onDraftMethodChange,
  onDraftModeChange,
  onStart,
}: ProblemStructureSetupModalProps) {
  return (
    <div className="absolute inset-0 z-[7] flex items-center justify-center bg-white/82 px-4 backdrop-blur-[2px]">
      <div className="w-[min(820px,94%)] rounded-[20px] border border-black/10 bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.14)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#a13ab8]">Problem Structure</p>
            <h3 className="mt-2 text-2xl font-semibold text-black">정의 2단계 시작 설정</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-[8px] border border-black/10 bg-[#f9f9f9] px-3 py-2 text-xs font-semibold text-[#4d4d4d] transition hover:bg-[#f7ecfb] hover:text-[#a13ab8]"
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
                        ? "border-[#a13ab8]/30 bg-[#f7ecfb] text-[#a13ab8]"
                        : "border-black/10 bg-[#f9f9f9] text-[#333] hover:border-[#a13ab8]/30 hover:bg-[#f7ecfb]"
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
                        ? "border-[#a13ab8]/30 bg-[#f7ecfb] text-[#a13ab8]"
                        : "border-black/10 bg-[#f9f9f9] text-[#333] hover:border-[#a13ab8]/30 hover:bg-[#f7ecfb]"
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
            정의 1단계 캔버스의 현재 노드 {problemGroupsCount}개를 모두 가져옵니다.
          </p>
          <button
            type="button"
            onClick={() => void onStart()}
            disabled={pending}
            className="rounded-[10px] border border-[#ead0f2] bg-[#f4e8fb] px-5 py-2.5 text-sm font-semibold text-[#6f2b7d] transition hover:border-[#d9b7e5] hover:bg-[#ecd9f7] disabled:cursor-not-allowed disabled:opacity-50"
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#a13ab8]">
              정의 2단계
            </p>
            <p className="mt-1 text-sm font-semibold text-black">
              {problemStructureMethodLabel(method)} · {problemDefinitionModeLabel(mode)}
            </p>
            {pending ? (
              <p className="mt-1 text-xs font-medium text-[#a13ab8]">AI가 구조화 그룹을 생성하는 중입니다.</p>
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
                      ? "border border-[#ead0f2] bg-[#f4e8fb] text-[#6f2b7d]"
                      : "border border-transparent bg-[#f5f6f8] text-[#4d4d4d] hover:bg-[#f7ecfb] hover:text-[#a13ab8]"
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
                      ? "border border-black/10 bg-white text-black shadow-[0_1px_0_rgba(0,0,0,0.04)]"
                      : "border border-transparent bg-[#f5f6f8] text-[#4d4d4d] hover:bg-black/5 hover:text-black"
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
  getActionLabel,
  isActionActive,
  isActionDisabled,
  onAction,
}: ProblemCanvasToolbarProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[clamp(16px,3vh,32px)] z-10 flex justify-center px-3">
      <div className="pointer-events-auto flex min-h-[clamp(48px,6.4vh,56px)] w-auto max-w-[min(860px,calc(100vw-24px))] flex-wrap items-center justify-center gap-2 rounded-[16px] border border-black/10 bg-white px-[clamp(10px,1.2vw,12px)] py-2 text-[#4d4d4d] shadow-[0_5.64px_22.56px_rgba(0,0,0,0.05)]">
        {actions.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onAction(item)}
            disabled={isActionDisabled(item)}
            className={`flex h-[clamp(34px,4vh,38px)] min-w-[clamp(110px,10vw,150px)] shrink-0 items-center justify-center rounded-[12px] px-[clamp(10px,1vw,14px)] text-[clamp(12px,0.92vw,14px)] font-medium transition-all duration-150 ease-out ${
              isActionActive(item)
                ? "bg-[#a13ab8]/10 text-[#a13ab8]"
                : "text-[#4d4d4d] hover:bg-black/5"
            } disabled:cursor-not-allowed disabled:opacity-45`}
          >
            <span>{getActionLabel(item)}</span>
          </button>
        ))}
      </div>
    </div>
  );
});
