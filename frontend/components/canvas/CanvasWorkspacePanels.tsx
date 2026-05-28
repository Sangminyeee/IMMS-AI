"use client";

import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { MoaLogo } from "@/components/moa-ui/MoaLogo";
import type {
  CanvasHeaderProps,
} from "@/components/canvas/CanvasHeader";
import type {
  CanvasRightDrawerComposerHandlers,
  CanvasRightDrawerComposerState,
  CanvasRightDrawerLayoutHandlers,
  CanvasRightDrawerLayoutState,
  CanvasRightDrawerNoteHandlers,
  CanvasRightDrawerNotesState,
  CanvasRightDrawerPersonalNote,
} from "@/components/canvas/CanvasRightDrawer";
import {
  CanvasSurface,
  type CanvasSurfaceFlowHandlers,
  type CanvasSurfaceProblemHandlers,
  type CanvasSurfaceProblemState,
  type CanvasSurfaceSolutionHandlers,
  type CanvasSurfaceSolutionState,
  type CanvasSurfaceViewState,
} from "@/components/canvas/CanvasSurface";
import type { CanvasQuickAskMessage } from "@/components/canvas/useCanvasQuickAsk";

type CanvasStage = "ideation" | "problem-definition" | "solution";
type ProblemDefinitionPhase = "explore" | "structure";

const CANVAS_SHELL_STAGES: CanvasStage[] = ["ideation", "problem-definition", "solution"];
const AI_GUIDE_BACKGROUND_STYLE: CSSProperties = {
  backgroundImage: "url('/figma-assets/AI-background.png')",
};
const canvasShellStyle: CSSProperties & Record<`--${string}`, string> = {
  "--canvas-left-panel": "clamp(328px, 17.083vw, 437px)",
  "--canvas-right-panel": "clamp(340px, 17.708vw, 453px)",
  "--canvas-left-pad": "clamp(38px, 1.979vw, 51px)",
  "--canvas-left-content": "clamp(243px, 12.656vw, 324px)",
  "--canvas-left-logo-top": "clamp(35px, 3.241vh, 45px)",
  "--canvas-left-title-gap": "clamp(11px, 1.019vh, 15px)",
  "--canvas-left-keyword-gap": "clamp(12px, 1.111vh, 16px)",
  "--canvas-note-composer-pt": "clamp(16px, 1.481vh, 21px)",
  "--canvas-note-composer-pb": "clamp(26px, 2.407vh, 35px)",
  "--canvas-note-list-pt": "clamp(29px, 2.685vh, 39px)",
  "--canvas-note-card-gap": "clamp(15px, 1.389vh, 20px)",
  "--canvas-input-height": "clamp(33px, 3.056vh, 44px)",
  "--canvas-textarea-height": "clamp(85px, 7.87vh, 113px)",
  "--canvas-right-pad": "clamp(23px, 1.198vw, 31px)",
  "--canvas-right-header": "clamp(76px, 7.037vh, 101px)",
  "--canvas-ai-bg-width": "clamp(296px, 15.417vw, 395px)",
  "--canvas-ai-bg-height": "clamp(527px, 48.796vh, 703px)",
  "--canvas-transport-bottom": "clamp(39px, 3.611vh, 52px)",
  "--canvas-transport-width": "clamp(198px, 10.313vw, 264px)",
  "--canvas-transport-height": "clamp(47px, 4.352vh, 63px)",
  "--canvas-transport-fab": "clamp(55px, 2.865vw, 73px)",
  "--canvas-transport-fab-top": "clamp(-20px, -1.389vh, -15px)",
  "--canvas-transport-inner": "clamp(46px, 2.396vw, 61px)",
  "--canvas-transport-side": "clamp(27px, 1.406vw, 36px)",
  "--canvas-transport-left-x": "clamp(24px, 1.25vw, 32px)",
  "--canvas-transport-right-x": "clamp(25px, 1.302vw, 33px)",
  "--canvas-transport-mic": "clamp(25px, 1.302vw, 33px)",
  "--canvas-transport-wave": "clamp(29px, 1.51vw, 39px)",
  "--canvas-transport-arrow": "clamp(18px, 0.938vw, 24px)",
  "--canvas-transport-skip": "clamp(22px, 1.146vw, 29px)",
};

const panelButtonClasses = {
  save:
    "ml-auto flex h-[24px] w-[52px] items-center justify-center rounded-[34.535px] bg-[#eff0f6] px-[6.907px] py-[6.907px] transition hover:bg-[#e3e5ee]",
  share:
    "flex h-[32.4px] items-center justify-center gap-[8.1px] overflow-hidden rounded-[67.5px] bg-[#4b4b50] py-[2.7px] pl-[10.8px] pr-[14.175px] transition-[width,background-color] hover:bg-[#3f3f43]",
  stageBase:
    "flex h-[33px] w-[292px] max-w-full items-center rounded-[17213890px] px-[12.312px] text-left transition",
  stageActive:
    "border-[0.781px] border-[#01a3ff] bg-[linear-gradient(90deg,#54c1ff_32.705%,#2f70e9_157.88%)] shadow-[0_-4.05px_2.7px_rgba(255,255,255,0.29),0_1.953px_6.007px_rgba(130,158,161,0.3)]",
  stageInactive:
    "border-[0.8px] border-[rgba(1,163,255,0.33)] bg-white shadow-[0_0.675px_2.835px_rgba(144,185,208,0.41)] hover:border-[#01a3ff] hover:bg-[#f4fbff]",
  stageNumber:
    "grid h-[20.521px] w-[20.521px] shrink-0 place-items-center rounded-full text-[10.125px] font-semibold leading-[15.39px]",
  primary:
    "flex h-[33px] w-[300px] max-w-none items-center justify-center rounded-[674.999px] border-[0.781px] border-[#01a3ff] bg-[linear-gradient(90deg,#54c1ff_32.705%,#2f70e9_157.88%)] shadow-[0_-4.05px_2.7px_rgba(255,255,255,0.29),0_1.953px_6.007px_rgba(130,158,161,0.3)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:border-[#d8d8d8] disabled:bg-none disabled:bg-[#d8d8d8] disabled:shadow-none",
  aiInput:
    "-ml-[4px] flex h-[47.936px] w-[303px] max-w-none items-center rounded-[8483.116px] border-[0.848px] border-[#cbd5e1] bg-white px-[9px] shadow-[0_4px_8px_-2px_rgba(23,23,23,0.1),0_2px_4px_-2px_rgba(23,23,23,0.06)]",
  aiSend:
    "ml-[5px] grid h-[29px] w-[29px] shrink-0 place-items-center rounded-[575.735px] border-[0.666px] border-[#01a3ff] bg-[linear-gradient(90deg,#3db0f2_32.705%,#427ce9_157.88%)] text-white shadow-[0_-3.454px_2.303px_rgba(255,255,255,0.29),0_1.666px_5.124px_rgba(130,158,161,0.3)] transition hover:brightness-105 disabled:border-[#d8d8d8] disabled:bg-none disabled:bg-[#d8d8d8] disabled:shadow-none",
};

const panelButtonTextClasses = {
  save: "moa-font-pretendard text-center text-[10px] font-semibold leading-[1.4] tracking-[-0.025px] text-[#505050]",
  share: "moa-font-pretendard shrink-0 whitespace-nowrap text-center text-[12px] font-semibold leading-[20.008px] tracking-[-0.03px] text-[#ededed]",
  stage: "moa-font-pretendard text-[12px] font-semibold leading-[1.4] tracking-[-0.03px]",
  primary: "moa-font-pretendard text-[12px] font-bold leading-[1.4] tracking-[-0.03px] text-white",
};

export type CanvasWorkspaceParticipant = {
  id: string;
  label: string;
  title?: string;
};

function stageLabel(stage: CanvasStage, problemDefinitionPhase: ProblemDefinitionPhase) {
  if (stage === "ideation") return "아이디어 발산";
  if (stage === "problem-definition") {
    return problemDefinitionPhase === "structure" ? "문제정의 · 2단계" : "문제정의 · 1단계";
  }
  return "요약 및 정리";
}

function stageNumber(stage: CanvasStage) {
  return CANVAS_SHELL_STAGES.indexOf(stage) + 1;
}

function formatRecordingElapsed(elapsedMs: number) {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function ClockIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 7.5V12l3 1.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MicIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path d="M12 4.2a3.2 3.2 0 0 0-3.2 3.2v4.4a3.2 3.2 0 1 0 6.4 0V7.4A3.2 3.2 0 0 0 12 4.2Z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M6.8 11.6a5.2 5.2 0 0 0 10.4 0M12 16.8v3M9.2 20h5.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ArrowLeftIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path d="M15 6 9 12l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SkipForwardIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path d="M7 6.8v10.4L15 12 7 6.8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M17 7v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SendIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path d="M5 12h13M13 7l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShareIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 13 13" fill="none">
      <g clipPath="url(#canvas-share-icon-clip)">
        <path d="M9.61777 4.27656C10.5032 4.27656 11.2209 3.55882 11.2209 2.67344C11.2209 1.78806 10.5032 1.07031 9.61777 1.07031C8.73239 1.07031 8.01465 1.78806 8.01465 2.67344C8.01465 3.55882 8.73239 4.27656 9.61777 4.27656Z" stroke="#EDEDED" strokeWidth="1.19703" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3.20542 8.01484C4.0908 8.01484 4.80855 7.2971 4.80855 6.41172C4.80855 5.52634 4.0908 4.80859 3.20542 4.80859C2.32004 4.80859 1.60229 5.52634 1.60229 6.41172C1.60229 7.2971 2.32004 8.01484 3.20542 8.01484Z" stroke="#EDEDED" strokeWidth="1.19703" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9.61777 11.757C10.5032 11.757 11.2209 11.0393 11.2209 10.1539C11.2209 9.26852 10.5032 8.55078 9.61777 8.55078C8.73239 8.55078 8.01465 9.26852 8.01465 10.1539C8.01465 11.0393 8.73239 11.757 9.61777 11.757Z" stroke="#EDEDED" strokeWidth="1.19703" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4.58667 7.21875L8.23645 9.34556" stroke="#EDEDED" strokeWidth="1.19703" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8.23111 3.48047L4.58667 5.60728" stroke="#EDEDED" strokeWidth="1.19703" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <defs>
        <clipPath id="canvas-share-icon-clip">
          <rect width="12.825" height="12.825" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

function PencilIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path d="m5 17.8.8-3.8 8.7-8.7a2.1 2.1 0 0 1 3 0l1.2 1.2a2.1 2.1 0 0 1 0 3L10 18.2l-3.8.8A1 1 0 0 1 5 17.8Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m13.2 6.6 4.2 4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path d="M6.5 8h11M10 8V6.5h4V8M8.2 8l.7 10.2h6.2L15.8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path d="m6 12.5 4 4L18 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function XIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function RecordingWaveIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 32 32" fill="none">
      <rect x="7" y="10" width="4" height="12" rx="2" fill="currentColor" opacity="0.92" />
      <rect x="13" y="5" width="4" height="22" rx="2" fill="currentColor" />
      <rect x="19" y="8" width="4" height="19" rx="2" fill="currentColor" opacity="0.96" />
      <rect x="25" y="12" width="3" height="10" rx="1.5" fill="currentColor" opacity="0.88" />
      <rect x="4" y="15" width="2" height="4" rx="1" fill="currentColor" opacity="0.72" />
    </svg>
  );
}

function StageSteps({
  activeStage,
  problemDefinitionPhase,
  onStageSelect,
}: {
  activeStage: CanvasStage;
  problemDefinitionPhase: ProblemDefinitionPhase;
  onStageSelect: (stage: CanvasStage) => void;
}) {
  return (
    <div className="relative space-y-[16px]">
      <span className="absolute left-[21px] top-[33px] h-[16px] w-px bg-gradient-to-b from-[#01a3ff] to-[rgba(1,163,255,0)]" />
      <span className="absolute left-[21px] top-[82px] h-[18px] w-px bg-gradient-to-b from-[#01a3ff] to-[rgba(1,163,255,0)]" />
      {CANVAS_SHELL_STAGES.map((item) => {
        const active = activeStage === item;
        return (
          <button
            key={item}
            type="button"
            onClick={() => onStageSelect(item)}
            className={`${panelButtonClasses.stageBase} ${active ? panelButtonClasses.stageActive : panelButtonClasses.stageInactive}`}
          >
            <span className={`${panelButtonClasses.stageNumber} ${active ? "bg-white text-[#01a3ff]" : "bg-white text-[#7c7c7c] shadow-[0_2px_1px_rgba(52,43,79,0.05)]"}`}>
              {stageNumber(item)}
            </span>
            <span className={`ml-[8px] ${panelButtonTextClasses.stage} ${active ? "text-white" : "text-[#7c7c7c]"}`}>{stageLabel(item, problemDefinitionPhase)}</span>
            {!active ? <ChevronRightIcon className="ml-auto h-[12px] w-[7px] text-[#90a1b9]" /> : null}
          </button>
        );
      })}
    </div>
  );
}

function MeetingGoalOverlay({ header }: { header: CanvasHeaderProps }) {
  const { view, meetingGoal, handlers } = header;
  const {
    meetingTitle,
    isRecording,
    recordingStartedAtMs,
  } = view;
  const {
    meetingGoalDraft,
    meetingGoalContextDraft,
    meetingGoalEditorOpen,
    meetingGoalEditorDraft,
    meetingGoalContextEditorDraft,
    meetingGoalSaving,
  } = meetingGoal;
  const {
    onOpenMeetingGoalEditor,
    onCancelMeetingGoalEdit,
    onSaveMeetingGoalEdit,
    onMeetingGoalEditorDraftChange,
    onMeetingGoalContextEditorDraftChange,
  } = handlers;

  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!isRecording || !recordingStartedAtMs) {
      return undefined;
    }

    const updateNow = () => setNowMs(Date.now());
    const frameId = window.requestAnimationFrame(updateNow);
    const intervalId = window.setInterval(updateNow, 1000);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearInterval(intervalId);
    };
  }, [isRecording, recordingStartedAtMs]);

  const recordingElapsedText = formatRecordingElapsed(
    isRecording && recordingStartedAtMs ? nowMs - recordingStartedAtMs : 0,
  );

  return (
    <div className="pointer-events-none absolute left-1/2 top-[31px] z-20 flex -translate-x-1/2 flex-col items-center">
      <button
        type="button"
        onClick={meetingGoalEditorOpen ? onCancelMeetingGoalEdit : onOpenMeetingGoalEditor}
        className="pointer-events-auto flex h-[39px] w-[212px] items-center justify-center rounded-full border border-white bg-white px-[12px] shadow-[0_1.35px_1.35px_rgba(0,0,0,0.1)] transition hover:border-[#01a3ff]/25"
      >
        <span className="moa-font-pretendard truncate text-center text-[13px] font-semibold leading-[1.4] tracking-[-0.0325px] text-[#363636]">
          {meetingGoalDraft.trim() || meetingTitle || "회의 목표 입력란"}
        </span>
      </button>
      <div className="mt-[9px] inline-flex h-[32px] w-[110px] items-center justify-center gap-[8px] rounded-full border border-[#d8d8d8] bg-white px-[12px] text-[12px] font-semibold leading-[1.4] tracking-[-0.03px] text-[#363636] shadow-[0_1.35px_1.35px_rgba(0,0,0,0.1)]">
        <ClockIcon className={`h-[16.4px] w-[16.4px] ${isRecording ? "text-[#01a3ff]" : "text-[#7c7c7c]"}`} />
        <span>{recordingElapsedText}</span>
      </div>

      {meetingGoalEditorOpen ? (
        <div className="pointer-events-auto mt-3 w-[min(520px,calc(100vw-64px))] rounded-[16px] border border-black/10 bg-white p-4 text-left shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
          <p className="text-[15px] font-bold text-[#111]">회의 목표 설정</p>
          <input
            value={meetingGoalEditorDraft}
            onChange={(event) => onMeetingGoalEditorDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onCancelMeetingGoalEdit();
              if (event.key === "Enter") {
                event.preventDefault();
                onSaveMeetingGoalEdit();
              }
            }}
            placeholder="회의 목표"
            className="mt-3 h-[40px] w-full rounded-[10px] border border-[#cecccc] bg-white px-3 text-[13px] text-[#111] outline-none focus:border-[#01a3ff]"
          />
          <textarea
            value={meetingGoalContextEditorDraft}
            onChange={(event) => onMeetingGoalContextEditorDraftChange(event.target.value)}
            placeholder="관련 맥락"
            className="mt-2 min-h-[78px] w-full resize-none rounded-[10px] border border-[#cecccc] bg-white px-3 py-2 text-[13px] leading-5 text-[#4d4d4d] outline-none focus:border-[#01a3ff]"
          />
          <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-[#90a1b9]">
            {meetingGoalContextDraft.trim() ? `현재 맥락: ${meetingGoalContextDraft.trim()}` : "목표와 맥락은 AI 분석의 참고 정보로 사용됩니다."}
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={onCancelMeetingGoalEdit} className="rounded-full bg-[#eff0f6] px-4 py-2">
              <span className="moa-font-pretendard text-[12px] font-semibold leading-[1.4] text-[#505050]">취소</span>
            </button>
            <button type="button" onClick={onSaveMeetingGoalEdit} disabled={meetingGoalSaving} className="rounded-full border border-[#01a3ff] bg-[linear-gradient(90deg,#54c1ff_32.705%,#2f70e9_157.88%)] px-5 py-2 shadow-[0_-4px_3px_rgba(255,255,255,0.29),0_2px_6px_rgba(1,231,255,0.3)] disabled:border-[#d8d8d8] disabled:bg-none disabled:bg-[#d8d8d8] disabled:shadow-none">
              <span className="moa-font-pretendard text-[12px] font-semibold leading-[1.4] tracking-[-0.03px] text-white">
                {meetingGoalSaving ? "저장 중" : "저장"}
              </span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CenterTransportControls({ header }: { header: CanvasHeaderProps }) {
  const { view, handlers } = header;
  return (
    <div className="pointer-events-none absolute bottom-[var(--canvas-transport-bottom)] left-1/2 z-20 -translate-x-1/2">
      <div className="pointer-events-auto relative h-[var(--canvas-transport-height)] w-[var(--canvas-transport-width)] rounded-full bg-[#f9f9f9] shadow-[0_-0.675px_6.8px_rgba(0,0,0,0.07),0_0.675px_2.025px_rgba(133,133,133,0.15),0_3.375px_3.375px_rgba(133,133,133,0.13),0_7.425px_4.725px_rgba(133,133,133,0.08),0_12.825px_5.4px_rgba(133,133,133,0.02)]">
        <button
          type="button"
          onClick={handlers.onBackToDashboard}
          aria-label="대시보드로 돌아가기"
          className="absolute left-[var(--canvas-transport-left-x)] top-1/2 grid h-[var(--canvas-transport-side)] w-[var(--canvas-transport-side)] -translate-y-1/2 place-items-center rounded-full text-[#90a1b9] transition hover:bg-white hover:text-[#01a3ff]"
        >
          <ArrowLeftIcon className="h-[var(--canvas-transport-arrow)] w-[var(--canvas-transport-arrow)]" />
        </button>
        <button
          type="button"
          onClick={handlers.onRecordingToggle}
          aria-label={view.isRecording ? "녹음 중지" : "녹음 시작"}
          className="absolute left-1/2 top-[var(--canvas-transport-fab-top)] grid h-[var(--canvas-transport-fab)] w-[var(--canvas-transport-fab)] -translate-x-1/2 place-items-center rounded-full bg-white text-white shadow-[0_-2.025px_2.7px_rgba(255,255,255,0.25),0_0.675px_2.7px_rgba(209,79,167,0.27)] transition"
        >
          <span className="grid h-[var(--canvas-transport-inner)] w-[var(--canvas-transport-inner)] place-items-center rounded-full border border-white/30 bg-[linear-gradient(180deg,#01a3ff_0%,#236cf3_100%)] shadow-[0_-3.44px_2.29px_rgba(255,255,255,0.29),0_1.66px_5.1px_rgba(1,231,255,0.3)]">
            {view.isRecording ? <RecordingWaveIcon className="h-[var(--canvas-transport-wave)] w-[var(--canvas-transport-wave)]" /> : <MicIcon className="h-[var(--canvas-transport-mic)] w-[var(--canvas-transport-mic)]" />}
          </span>
        </button>
        <button
          type="button"
          onClick={handlers.onEndMeetingClick}
          disabled={view.endMeetingSaving}
          aria-label="회의 종료"
          className="absolute right-[var(--canvas-transport-right-x)] top-1/2 grid h-[var(--canvas-transport-side)] w-[var(--canvas-transport-side)] -translate-y-1/2 place-items-center rounded-full text-[#90a1b9] transition hover:bg-white hover:text-[#01a3ff] disabled:opacity-50"
        >
          <SkipForwardIcon className="h-[var(--canvas-transport-skip)] w-[var(--canvas-transport-skip)]" />
        </button>
      </div>
    </div>
  );
}

function PersonalNoteComposerPanel({
  composer,
  handlers,
}: {
  composer: CanvasRightDrawerComposerState;
  handlers: CanvasRightDrawerComposerHandlers;
}) {
  const {
    title: composerTitle,
    body: composerBody,
    bodyRef: composerBodyRef,
  } = composer;

  return (
    <section className="border-b border-[#dfdfdf] pb-[var(--canvas-note-composer-pb)] pl-[var(--canvas-left-pad)] pr-0 pt-[var(--canvas-note-composer-pt)]">
      <div className="w-[var(--canvas-left-content)]">
        <div className="flex flex-col gap-[3px]">
          <p className="text-[10px] font-medium leading-[11.5px] tracking-[-0.25px] text-black/50">Personal note</p>
          <h3 className="text-[14px] font-bold leading-[14.5px] tracking-[-0.35px] text-[#111]">개인 노트</h3>
        </div>
        <div className="mt-[11px] space-y-[8.7px]">
          <input
            value={composerTitle}
            onChange={(event) => handlers.onTitleChange(event.target.value)}
            placeholder="메모 제목"
            className="h-[var(--canvas-input-height)] w-full rounded-[8.66px] border border-[#cecccc] bg-white px-[8px] text-[12px] tracking-[-0.3px] text-[#4d4d4d] outline-none placeholder:text-black/50 focus:border-[#01a3ff]"
          />
          <textarea
            ref={composerBodyRef}
            value={composerBody}
            onChange={(event) => handlers.onBodyChange(event.target.value)}
            placeholder="메모 내용"
            className="h-[var(--canvas-textarea-height)] w-full resize-none rounded-[11.55px] border border-[#cecccc] bg-white px-[8px] py-[9px] text-[12px] leading-[20px] tracking-[-0.3px] text-[#4d4d4d] outline-none placeholder:text-[#4d4d4d]/50 focus:border-[#01a3ff]"
          />
          <button
            type="button"
            onClick={handlers.onSave}
            className={panelButtonClasses.save}
          >
            <span className={panelButtonTextClasses.save}>저장</span>
          </button>
        </div>
      </div>
    </section>
  );
}

function PersonalNoteCard({
  note,
  stage,
  isEditing,
  dragging,
  draftTitle,
  draftBody,
  handlers,
}: {
  note: CanvasRightDrawerPersonalNote;
  stage: CanvasStage;
  isEditing: boolean;
  dragging: boolean;
  draftTitle: string;
  draftBody: string;
  handlers: CanvasRightDrawerNoteHandlers;
}) {
  const bodyText = note.body.trim();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!isEditing || !textareaRef.current) return;
    const textarea = textareaRef.current;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [draftBody, isEditing]);

  return (
    <article
      draggable={stage === "problem-definition" && !isEditing}
      onDragStart={(event) => {
        if (stage !== "problem-definition" || isEditing) return;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-imms-note-id", note.id);
        event.dataTransfer.setData("text/plain", note.id);
        handlers.onDragStart(note.id);
      }}
      onDragEnd={handlers.onDragEnd}
      className={`min-h-[72px] rounded-[8.66px] border border-[#cecccc] bg-white px-[12px] py-[14px] shadow-[0_0.72px_0_rgba(0,0,0,0.04)] ${stage === "problem-definition" && !isEditing ? "cursor-grab active:cursor-grabbing" : ""} ${dragging ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        {isEditing ? (
          <input
            value={draftTitle}
            onChange={(event) => handlers.onDraftTitleChange(event.target.value)}
            autoFocus
            className="-mx-1 min-w-0 flex-1 rounded-[4px] bg-transparent px-1 py-0 text-[12px] font-bold leading-[1.4] tracking-[-0.3px] text-[#2c3448] outline-none transition focus:bg-[#f8fbff]"
          />
        ) : (
          <h4 className="min-w-0 truncate text-[12px] font-bold leading-[1.4] tracking-[-0.3px] text-[#2c3448]">{note.title}</h4>
        )}
        <div className="flex shrink-0 gap-1 text-[10px] font-semibold text-[#90a1b9]">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={handlers.onCancelEdit}
                aria-label="메모 수정 취소"
                title="취소"
                className="grid h-[22px] w-[22px] place-items-center rounded-full bg-[#eff0f6] text-[#737982] transition hover:bg-[#e3e5ee] hover:text-[#505050]"
              >
                <XIcon className="h-[12px] w-[12px]" />
              </button>
              <button
                type="button"
                onClick={() => handlers.onSaveEdit(note.id)}
                aria-label="메모 저장"
                title="저장"
                className="grid h-[22px] w-[22px] place-items-center rounded-full border border-[#01a3ff] bg-[linear-gradient(90deg,#54c1ff_32.705%,#2f70e9_157.88%)] text-white shadow-[0_-3px_2px_rgba(255,255,255,0.25),0_1.5px_4px_rgba(1,231,255,0.25)] transition hover:brightness-105"
              >
                <CheckIcon className="h-[13px] w-[13px]" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => handlers.onStartEdit(note)}
                aria-label="메모 수정"
                title="수정"
                className="grid h-[22px] w-[22px] place-items-center rounded-full text-[#90a1b9] transition hover:bg-[#f5f7fb] hover:text-[#01a3ff]"
              >
                <PencilIcon className="h-[13px] w-[13px]" />
              </button>
              <button
                type="button"
                onClick={() => handlers.onDelete(note.id)}
                aria-label="메모 삭제"
                title="삭제"
                className="grid h-[22px] w-[22px] place-items-center rounded-full text-[#90a1b9] transition hover:bg-[#fff4f4] hover:text-[#ef4e4e]"
              >
                <TrashIcon className="h-[13px] w-[13px]" />
              </button>
            </>
          )}
        </div>
      </div>
      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={draftBody}
          onChange={(event) => handlers.onDraftBodyChange(event.target.value)}
          placeholder="내용 없음"
          rows={1}
          className="mt-[12px] block min-h-[18px] w-full resize-none overflow-hidden rounded-[4px] bg-transparent p-0 text-[10px] leading-[1.4] tracking-[-0.25px] text-[#737982] outline-none transition placeholder:text-[#a3aab5] focus:bg-[#f8fbff]"
        />
      ) : bodyText ? (
        <p className="mt-[12px] whitespace-pre-wrap break-words text-[10px] leading-[1.4] tracking-[-0.25px] text-[#737982]">
          {note.body}
        </p>
      ) : (
        <p className="mt-[8px] text-[10px] leading-[1.4] tracking-[-0.25px] text-[#a3aab5]">내용 없음</p>
      )}
    </article>
  );
}

function LeftMeetingPanel({
  header,
  keywordSummary,
  composer,
  notesState,
  composerHandlers,
  noteHandlers,
}: {
  header: CanvasHeaderProps;
  keywordSummary: string;
  composer: CanvasRightDrawerComposerState;
  notesState: CanvasRightDrawerNotesState;
  composerHandlers: CanvasRightDrawerComposerHandlers;
  noteHandlers: CanvasRightDrawerNoteHandlers;
}) {
  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-r border-[#cecccc] bg-white">
      <header className="shrink-0 border-b border-[#dfdfdf] px-[var(--canvas-left-pad)] pb-[20px] pt-[var(--canvas-left-logo-top)]">
        <Link
          href="/dashboard"
          aria-label="대시보드로 이동"
          className="inline-flex w-fit rounded-[8px] outline-none transition focus-visible:ring-2 focus-visible:ring-[#01a3ff] focus-visible:ring-offset-4 focus-visible:ring-offset-white"
        >
          <MoaLogo size="figma" className="moa-dt-logo" />
        </Link>
        <div className="mt-[var(--canvas-left-title-gap)]">
          <div className="flex items-center gap-[9px]">
            <h2 className="min-w-0 truncate text-[17.55px] font-bold leading-[1.4] tracking-[-0.4387px] text-[#181818]">{header.view.meetingTitle || "회의 제목"}</h2>
            <PencilIcon className="h-[12px] w-[12px] shrink-0 text-[#737982]" />
          </div>
          <p className="mt-[var(--canvas-left-keyword-gap)] max-w-[var(--canvas-left-content)] truncate text-[12px] font-medium leading-[1.4] tracking-[-0.03px] text-[rgba(77,77,77,0.9)]">
            {keywordSummary || "키워드가 추출되면 이곳에 표시됩니다"}
          </p>
        </div>
      </header>

      <PersonalNoteComposerPanel composer={composer} handlers={composerHandlers} />
      <section className="imms-overlay-scroll min-h-0 flex-1 overflow-y-auto pb-[22px] pl-[var(--canvas-left-pad)] pr-0 pt-[var(--canvas-note-list-pt)]">
        <div className="w-[var(--canvas-left-content)]">
          <div className="mb-[14px] flex items-center gap-[7px]">
            <h3 className="text-[14px] font-bold leading-[1.4] tracking-[-0.35px] text-[#111]">내 메모 목록</h3>
            <span className="text-[12px] font-bold tracking-[-0.3px] text-black/50">{notesState.notes.length}</span>
          </div>
          {notesState.notes.length === 0 ? (
            <p className="rounded-[8.66px] border border-dashed border-[#cecccc] bg-white px-3 py-5 text-[11px] leading-5 text-[#737982]">
              저장한 개인 메모가 없습니다.
            </p>
          ) : (
            <div className="space-y-[var(--canvas-note-card-gap)]">
              {notesState.notes.map((note) => (
                <PersonalNoteCard
                  key={note.id}
                  note={note}
                  stage={notesState.stage}
                  isEditing={notesState.editingPersonalNoteId === note.id}
                  dragging={notesState.draggingPersonalNoteId === note.id}
                  draftTitle={notesState.personalNoteDraftTitle}
                  draftBody={notesState.personalNoteDraftBody}
                  handlers={noteHandlers}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </aside>
  );
}

export type CanvasWorkspaceQuickAskState = {
  open: boolean;
  messages: CanvasQuickAskMessage[];
  draft: string;
  unreadCount: number;
  pendingCount: number;
  scrollRef: RefObject<HTMLDivElement | null>;
};

export type CanvasWorkspaceQuickAskHandlers = {
  onClose: () => void;
  onToggle: () => void;
  onDraftChange: (value: string) => void;
  onSubmit: (event?: FormEvent<HTMLFormElement>) => void;
};

function CurrentStagePanel({
  header,
  problem,
  problemHandlers,
}: {
  header: CanvasHeaderProps;
  problem: CanvasSurfaceProblemState;
  problemHandlers: CanvasSurfaceProblemHandlers;
}) {
  const stage = header.view.stage;
  const problemDefinitionPhase = problem.problemDefinitionPhase as ProblemDefinitionPhase;
  const isProblemExplore = stage === "problem-definition" && problemDefinitionPhase !== "structure";
  const isProblemStructure = stage === "problem-definition" && problemDefinitionPhase === "structure";

  let title = stageLabel(stage, problemDefinitionPhase);
  let description = (
    <>
      현재 회의 흐름을 확인하고,
      <br />
      다음 단계로 진행할 수 있습니다.
    </>
  );
  let buttonLabel = "";
  let buttonDisabled = false;
  let onButtonClick: (() => void) | null = null;

  if (stage === "ideation") {
    title = "아이디어 발산";
    description = (
      <>
        회의 중 나온 핵심 키워드를 정리합니다.
        <br />
        충분히 모이면 문제정의를 시작하세요.
      </>
    );
    buttonLabel = "문제정의 시작하기";
    buttonDisabled = header.view.busy || header.view.problemDefinitionStagePending;
    onButtonClick = () => header.handlers.onStageSelect("problem-definition");
  } else if (isProblemExplore) {
    title = "문제정의 · 1단계";
    description = (
      <>
        문제 후보를 검토하고, 필요 없는 항목만 삭제하세요.
        <br />
        남은 후보는 모두 다음 단계로 이동합니다.
      </>
    );
    buttonLabel = problem.problemStructurePending ? "구조화 생성 중" : "2단계 · 구조화 시작하기";
    buttonDisabled = problem.problemStructurePending || problem.problemGroupsCount === 0;
    onButtonClick = () => {
      void problemHandlers.onStartProblemStructure();
    };
  } else if (isProblemStructure) {
    title = "문제정의 · 2단계";
    description = (
      <>
        구조화된 문제 묶음을 검토하고,
        <br />
        요약 및 정리 단계로 넘깁니다.
      </>
    );
    buttonLabel = "요약 및 정리 시작하기";
    buttonDisabled = header.view.busy;
    onButtonClick = () => {
      void header.handlers.onStageSelect("solution");
    };
  } else if (stage === "solution") {
    title = "요약 및 정리";
    description = (
      <>
        최종 회의록 내용을 확인한 뒤,
        <br />
        회의를 종료하고 결과를 생성합니다.
      </>
    );
    buttonLabel = header.view.endMeetingSaving ? "회의 종료 중" : "회의를 종료하고 회의록 생성하기";
    buttonDisabled = header.view.endMeetingSaving;
    onButtonClick = header.handlers.onEndMeetingClick;
  }

  return (
    <section className="relative z-10 border-b border-[#dfdfdf] bg-white px-[var(--canvas-right-pad)] py-[20px] text-left">
      <div className="flex items-start gap-[12px]">
        <h3 className="text-[14px] font-bold leading-[1.4] text-[#111]">현재 단계</h3>
        <p className="mt-[4px] text-[11px] font-semibold leading-[1.4] text-[#414141]">{title}</p>
      </div>
      <p className="mt-[7px] text-[10px] font-medium leading-[1.5] text-[#90a1b9]">
        {description}
      </p>
      {buttonLabel && onButtonClick ? (
        <button
          type="button"
          onClick={onButtonClick}
          disabled={buttonDisabled}
          className={`mt-[20px] ${panelButtonClasses.primary}`}
        >
          <span className={panelButtonTextClasses.primary}>{buttonLabel}</span>
        </button>
      ) : null}
    </section>
  );
}

function RightAiPanel({
  header,
  participants,
  problem,
  problemHandlers,
  quickAskState,
  quickAskHandlers,
  onShareMeetingLink,
}: {
  header: CanvasHeaderProps;
  participants: CanvasWorkspaceParticipant[];
  problem: CanvasSurfaceProblemState;
  problemHandlers: CanvasSurfaceProblemHandlers;
  quickAskState: CanvasWorkspaceQuickAskState;
  quickAskHandlers: CanvasWorkspaceQuickAskHandlers;
  onShareMeetingLink: () => Promise<boolean>;
}) {
  const {
    open: quickAskOpen,
    messages: quickAskMessages,
    draft: quickAskDraft,
    pendingCount: quickAskPendingCount,
    scrollRef: quickAskScrollRef,
  } = quickAskState;
  const visibleParticipants = useMemo(() => participants.slice(0, 5), [participants]);
  const hiddenParticipantCount = Math.max(0, participants.length - visibleParticipants.length);
  const recentMessages = quickAskMessages.slice(-4);
  const quickAskHasMessages = quickAskMessages.length > 0;
  const aiGuideStatusText = quickAskPendingCount > 0 ? `${quickAskPendingCount}개 응답 대기 중` : "무엇이든 질문할 수 있습니다";
  const [shareCopied, setShareCopied] = useState(false);
  const shareCopiedResetTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (shareCopiedResetTimerRef.current !== null) {
      window.clearTimeout(shareCopiedResetTimerRef.current);
    }
  }, []);

  const handleShareClick = async () => {
    const copied = await onShareMeetingLink();
    if (!copied) return;
    setShareCopied(true);
    if (shareCopiedResetTimerRef.current !== null) {
      window.clearTimeout(shareCopiedResetTimerRef.current);
    }
    shareCopiedResetTimerRef.current = window.setTimeout(() => {
      setShareCopied(false);
      shareCopiedResetTimerRef.current = null;
    }, 1600);
  };

  return (
    <aside className="relative flex h-full min-h-0 flex-col overflow-hidden border-l border-[#cecccc] bg-white">
      <header className="relative z-10 flex h-[var(--canvas-right-header)] shrink-0 items-center justify-between border-b border-[#dfdfdf] bg-white px-[var(--canvas-right-pad)]">
        <div className="flex items-center">
          {visibleParticipants.map((participant, index) => (
            <span
              key={participant.id}
              className="grid h-[32.4px] w-[32.4px] place-items-center rounded-full border border-white text-[10.8px] font-semibold tracking-[-0.027px] text-white"
              title={participant.title || participant.label}
              style={{
                marginLeft: index === 0 ? 0 : -8,
                backgroundColor: ["#236cf3", "#9d9d9d", "#3a52bc", "#010978", "#83acc5"][index],
              }}
            >
              {participant.label.slice(0, 2).toUpperCase()}
            </span>
          ))}
          {hiddenParticipantCount > 0 ? (
            <span className="-ml-2 grid h-[32.4px] w-[32.4px] place-items-center rounded-full border border-white bg-[#ececec] text-[10.8px] font-semibold text-[#5c5c5c]">
              +{hiddenParticipantCount}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className={`${panelButtonClasses.share} ${shareCopied ? "w-[94px]" : "w-[66.9px]"}`}
          aria-label={shareCopied ? "회의 링크 복사 완료" : "회의 공유"}
          onClick={() => void handleShareClick()}
        >
          <ShareIcon className="h-[13px] w-[13px] shrink-0" />
          <span className={panelButtonTextClasses.share} aria-live="polite">
            {shareCopied ? "복사완료" : "공유"}
          </span>
        </button>
      </header>

      <section className="relative z-10 shrink-0 border-b border-[#dfdfdf] bg-white px-[var(--canvas-right-pad)] py-[21px]">
        <h3 className="text-[14px] font-bold leading-[1.4] tracking-[-0.035px] text-[#111]">회의 단계 이동</h3>
        <div className="mt-[21px]">
          <StageSteps
            activeStage={header.view.stage}
            problemDefinitionPhase={problem.problemDefinitionPhase}
            onStageSelect={header.handlers.onStageSelect}
          />
        </div>
      </section>

      <CurrentStagePanel header={header} problem={problem} problemHandlers={problemHandlers} />

      <section className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden bg-white px-[var(--canvas-right-pad)] pb-[22px] pt-[24px]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-[-180px] top-[18px] z-0 h-[var(--canvas-ai-bg-height)] w-[var(--canvas-ai-bg-width)] bg-contain bg-no-repeat opacity-95"
          style={AI_GUIDE_BACKGROUND_STYLE}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[-330px] left-[-160px] z-0 h-[var(--canvas-ai-bg-height)] w-[var(--canvas-ai-bg-width)] bg-contain bg-no-repeat opacity-70"
          style={AI_GUIDE_BACKGROUND_STYLE}
        />

        <div className="relative z-10 shrink-0 text-left">
          <h3 className="flex items-center gap-[6px] text-[14px] font-bold leading-[1.4] tracking-[-0.035px] text-[#111]">
            AI 가이드
            <span className="text-[13px] font-bold text-[#01a3ff]">+</span>
          </h3>
          <p className="mt-[4px] text-[10.8px] leading-[1.4] tracking-[-0.027px] text-[#90a1b9]">
            {aiGuideStatusText}
          </p>
        </div>

        {recentMessages.length > 0 ? (
          <div
            ref={quickAskScrollRef}
            className="imms-overlay-scroll relative z-10 mt-[18px] min-h-0 flex-1 space-y-2 overflow-y-auto text-left"
          >
            {recentMessages.map((message) => (
              <div key={message.id} className={`rounded-[12px] px-3 py-2 text-[11px] leading-5 ${message.role === "user" ? "ml-8 bg-[#01a3ff] text-white" : "mr-8 border border-[#d9e8f3] bg-white text-[#505050]"}`}>
                {message.text}
              </div>
            ))}
          </div>
        ) : (
          <div className="relative z-10 min-h-[120px] flex-1" />
        )}

        {!quickAskHasMessages ? (
          <div className="pointer-events-none absolute inset-x-[var(--canvas-right-pad)] top-1/2 z-10 -translate-y-1/2 text-center">
            <h4 className="text-[22px] font-medium leading-[1.4] tracking-[-0.55px] text-[#181818]">AI 가이드 시작하기</h4>
            <p className="mt-[10px] text-[12px] font-medium leading-[1.4] tracking-[-0.3px] text-[#90a1b9]">
              글쓰기, 요약, 번역, 코드, 아이디어 등<br />
              필요한 도움을 요청할 수 있습니다
            </p>
          </div>
        ) : null}

        <div className="relative z-10 mt-auto shrink-0 pt-[24px] text-center">
          <form onSubmit={quickAskHandlers.onSubmit} className={panelButtonClasses.aiInput}>
            <input
              value={quickAskDraft}
              onChange={(event) => quickAskHandlers.onDraftChange(event.target.value)}
              onFocus={() => {
                if (!quickAskOpen) quickAskHandlers.onToggle();
              }}
              placeholder="무엇이든 물어보세요"
              className="min-w-0 flex-1 bg-transparent px-1 text-[14px] font-normal leading-[1.6] text-[#111] outline-none placeholder:text-[#90a1b9]"
            />
            <button
              type="submit"
              disabled={!quickAskDraft.trim()}
              aria-label="AI 가이드 질문 보내기"
              className={panelButtonClasses.aiSend}
            >
              <SendIcon className="h-[17.4px] w-[17.4px]" />
            </button>
          </form>
        </div>
      </section>
    </aside>
  );
}

export type CanvasWorkspacePanelsProps = {
  header: CanvasHeaderProps;
  keywordSummary: string;
  participants: CanvasWorkspaceParticipant[];
  isDesktopLayout: boolean;
  workspaceGridColumns: string;
  canvasSurfaceRef: RefObject<HTMLDivElement | null>;
  surfaceView: CanvasSurfaceViewState;
  surfaceSolution: CanvasSurfaceSolutionState;
  surfaceProblem: CanvasSurfaceProblemState;
  surfaceFlowHandlers: CanvasSurfaceFlowHandlers;
  surfaceSolutionHandlers: CanvasSurfaceSolutionHandlers;
  surfaceProblemHandlers: CanvasSurfaceProblemHandlers;
  renderSummaryMarkdownPreview: (markdown: string, onEdit: () => void) => ReactNode;
  rightDrawerLayout: CanvasRightDrawerLayoutState;
  rightDrawerComposer: CanvasRightDrawerComposerState;
  rightDrawerNotesState: CanvasRightDrawerNotesState;
  rightDrawerLayoutHandlers: CanvasRightDrawerLayoutHandlers;
  rightDrawerComposerHandlers: CanvasRightDrawerComposerHandlers;
  rightDrawerNoteHandlers: CanvasRightDrawerNoteHandlers;
  quickAskState: CanvasWorkspaceQuickAskState;
  quickAskHandlers: CanvasWorkspaceQuickAskHandlers;
  onShareMeetingLink: () => Promise<boolean>;
};

export const CanvasWorkspacePanels = memo(function CanvasWorkspacePanels({
  header,
  keywordSummary,
  participants,
  canvasSurfaceRef,
  surfaceView,
  surfaceSolution,
  surfaceProblem,
  surfaceFlowHandlers,
  surfaceSolutionHandlers,
  surfaceProblemHandlers,
  renderSummaryMarkdownPreview,
  rightDrawerComposer,
  rightDrawerNotesState,
  rightDrawerComposerHandlers,
  rightDrawerNoteHandlers,
  quickAskState,
  quickAskHandlers,
  onShareMeetingLink,
}: CanvasWorkspacePanelsProps) {
  return (
    <div
      className="grid h-full min-h-0 grid-cols-1 overflow-hidden bg-[#f8f8f8] xl:grid-cols-[var(--canvas-left-panel)_minmax(0,1fr)_var(--canvas-right-panel)]"
      style={canvasShellStyle}
    >
      <LeftMeetingPanel
        header={header}
        keywordSummary={keywordSummary}
        composer={rightDrawerComposer}
        notesState={rightDrawerNotesState}
        composerHandlers={rightDrawerComposerHandlers}
        noteHandlers={rightDrawerNoteHandlers}
      />

      <main className="relative min-h-0 overflow-hidden bg-[#fbfbfb]">
        {header.view.stage === "solution" ? null : <MeetingGoalOverlay header={header} />}
        <CanvasSurface
          canvasSurfaceRef={canvasSurfaceRef}
          view={surfaceView}
          solution={surfaceSolution}
          problem={surfaceProblem}
          flowHandlers={surfaceFlowHandlers}
          solutionHandlers={surfaceSolutionHandlers}
          problemHandlers={surfaceProblemHandlers}
          renderSummaryMarkdownPreview={renderSummaryMarkdownPreview}
        />
        {header.view.stage === "solution" ? null : <CenterTransportControls header={header} />}
      </main>

      <RightAiPanel
        header={header}
        participants={participants}
        problem={surfaceProblem}
        problemHandlers={surfaceProblemHandlers}
        quickAskState={quickAskState}
        quickAskHandlers={quickAskHandlers}
        onShareMeetingLink={onShareMeetingLink}
      />
    </div>
  );
});
