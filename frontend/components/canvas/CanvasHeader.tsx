"use client";

type CanvasStage = "ideation" | "problem-definition" | "solution";

const CANVAS_HEADER_STAGES: CanvasStage[] = ["ideation", "problem-definition", "solution"];

function stageLabel(stage: CanvasStage) {
  if (stage === "ideation") return "아이디어";
  if (stage === "problem-definition") return "문제정의";
  return "해결책";
}

type CanvasHeaderProps = {
  meetingTitle: string;
  isRecording: boolean;
  endMeetingSaving: boolean;
  stage: CanvasStage;
  busy: boolean;
  problemDefinitionStagePending: boolean;
  isProblemDefinitionExploreStage: boolean;
  ideationBubbleDebugEnabled: boolean;
  meetingGoalDraft: string;
  meetingGoalContextDraft: string;
  meetingGoalEditorOpen: boolean;
  meetingGoalEditorDraft: string;
  meetingGoalContextEditorDraft: string;
  meetingGoalSaving: boolean;
  onEndMeetingClick: () => void;
  onRecordingToggle: () => void;
  onBackToDashboard: () => void;
  onRecomputeIdeationBubbles: () => void;
  onToggleIdeationBubbleDebug: () => void;
  onRefreshProblemChunkSummaries: () => void;
  onDebugRegenerateProblemDefinition: () => void;
  onOpenMeetingGoalEditor: () => void;
  onCancelMeetingGoalEdit: () => void;
  onSaveMeetingGoalEdit: () => void;
  onMeetingGoalEditorDraftChange: (value: string) => void;
  onMeetingGoalContextEditorDraftChange: (value: string) => void;
  onStageSelect: (stage: CanvasStage) => void;
};

export function CanvasHeader({
  meetingTitle,
  isRecording,
  endMeetingSaving,
  stage,
  busy,
  problemDefinitionStagePending,
  isProblemDefinitionExploreStage,
  ideationBubbleDebugEnabled,
  meetingGoalDraft,
  meetingGoalContextDraft,
  meetingGoalEditorOpen,
  meetingGoalEditorDraft,
  meetingGoalContextEditorDraft,
  meetingGoalSaving,
  onEndMeetingClick,
  onRecordingToggle,
  onBackToDashboard,
  onRecomputeIdeationBubbles,
  onToggleIdeationBubbleDebug,
  onRefreshProblemChunkSummaries,
  onDebugRegenerateProblemDefinition,
  onOpenMeetingGoalEditor,
  onCancelMeetingGoalEdit,
  onSaveMeetingGoalEdit,
  onMeetingGoalEditorDraftChange,
  onMeetingGoalContextEditorDraftChange,
  onStageSelect,
}: CanvasHeaderProps) {
  return (
    <div className="relative z-20 border border-black/10 bg-white shadow-[0_1px_0_rgba(0,0,0,0.04)]">
      <div className="grid min-h-[clamp(96px,13vh,141px)] grid-cols-1 items-center justify-items-center gap-3 px-[clamp(16px,2.4vw,33px)] py-[clamp(12px,1.8vh,16px)] lg:grid-cols-[minmax(0,1fr)_minmax(260px,1.35fr)_minmax(0,1fr)] lg:justify-items-stretch">
        <div className="flex w-full flex-wrap items-center justify-center gap-2 lg:justify-start lg:justify-self-start">
          <button
            type="button"
            onClick={onEndMeetingClick}
            disabled={endMeetingSaving}
            className="h-[clamp(36px,4.4vh,43px)] rounded-[8px] bg-[#ef4e4e] px-[clamp(14px,1.7vw,24px)] text-[clamp(16px,1.2vw,20px)] font-semibold text-white hover:bg-[#df3f3f] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {endMeetingSaving ? "종료 중" : "종료"}
          </button>
          <button
            type="button"
            onClick={onRecordingToggle}
            className={`h-[clamp(36px,4.4vh,43px)] rounded-[8px] px-[clamp(12px,1.2vw,16px)] text-[clamp(12px,0.95vw,14px)] font-semibold ${
              isRecording
                ? "bg-red-50 text-[#ef4e4e] ring-1 ring-red-100"
                : "border border-[#ead0f2] bg-[#f4e8fb] text-[#6f2b7d] hover:border-[#d9b7e5] hover:bg-[#ecd9f7]"
            }`}
          >
            {isRecording ? "녹음 중지" : "녹음 시작"}
          </button>
          <button
            type="button"
            onClick={onBackToDashboard}
            className="h-[clamp(36px,4.4vh,43px)] rounded-[8px] bg-[#eff0f6] px-[clamp(10px,1vw,12px)] text-[clamp(12px,0.95vw,14px)] font-semibold text-[#4d4d4d] hover:bg-[#e3e5ee]"
          >
            메인화면으로 돌아가기
          </button>
          {stage === "ideation" ? (
            <>
              <button
                type="button"
                onClick={onRecomputeIdeationBubbles}
                className="h-[clamp(36px,4.4vh,43px)] rounded-[8px] border border-black/10 bg-white px-[clamp(10px,1vw,12px)] text-[clamp(12px,0.95vw,14px)] font-semibold text-[#4d4d4d] transition hover:bg-[#f7ecfb] hover:text-[#6f2b7d]"
              >
                버블 재배치
              </button>
              <button
                type="button"
                aria-pressed={ideationBubbleDebugEnabled}
                onClick={onToggleIdeationBubbleDebug}
                className={`h-[clamp(36px,4.4vh,43px)] rounded-[8px] border px-[clamp(10px,1vw,12px)] text-[clamp(12px,0.95vw,14px)] font-semibold transition ${
                  ideationBubbleDebugEnabled
                    ? "border-[#ead0f2] bg-[#f4e8fb] text-[#6f2b7d] hover:bg-[#ecd9f7]"
                    : "border-black/10 bg-white text-[#4d4d4d] hover:bg-[#f7ecfb] hover:text-[#6f2b7d]"
                }`}
              >
                {ideationBubbleDebugEnabled ? "디버그 ON" : "디버그"}
              </button>
            </>
          ) : null}
          {isProblemDefinitionExploreStage ? (
            <>
              <button
                type="button"
                onClick={onRefreshProblemChunkSummaries}
                disabled={busy || problemDefinitionStagePending}
                className="h-[clamp(36px,4.4vh,43px)] rounded-[8px] border border-[#ead0f2] bg-[#f4e8fb] px-[clamp(10px,1vw,12px)] text-[clamp(12px,0.95vw,14px)] font-semibold text-[#6f2b7d] transition hover:border-[#d9b7e5] hover:bg-[#ecd9f7] disabled:cursor-not-allowed disabled:opacity-50"
              >
                요약캐시 재생성
              </button>
              <button
                type="button"
                onClick={onDebugRegenerateProblemDefinition}
                disabled={busy || problemDefinitionStagePending}
                className="h-[clamp(36px,4.4vh,43px)] rounded-[8px] border border-black/10 bg-white px-[clamp(10px,1vw,12px)] text-[clamp(12px,0.95vw,14px)] font-semibold text-[#4d4d4d] transition hover:bg-[#f7ecfb] hover:text-[#6f2b7d] disabled:cursor-not-allowed disabled:opacity-50"
              >
                디버그 재생성
              </button>
            </>
          ) : null}
        </div>

        <div className="relative min-w-0 justify-self-center text-center">
          <div className="flex items-center justify-center gap-2 text-[clamp(14px,1.2vw,20px)] font-normal leading-[1.25] text-[#4d4d4d]">
            <span>{meetingTitle || "회의 제목"}</span>
            <span className={`h-2.5 w-2.5 rounded-full ${isRecording ? "bg-[#34c759]" : "bg-[#d9d9d9]"}`} />
          </div>
          <button
            type="button"
            onClick={meetingGoalEditorOpen ? onCancelMeetingGoalEdit : onOpenMeetingGoalEditor}
            className="mx-auto mt-2 block w-full max-w-[min(760px,100%)] rounded-xl border border-transparent px-3 py-1 text-center transition hover:border-black/10 hover:bg-[#f9f9f9] focus:border-[#a13ab8]/30 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#a13ab8]/10"
          >
            <span
              className={`block truncate text-[clamp(20px,2.2vw,32px)] font-semibold leading-[1.2] tracking-normal ${
                meetingGoalDraft.trim() ? "text-black" : "text-black/30"
              }`}
            >
              {meetingGoalDraft.trim() || "회의 목표를 입력해 주세요"}
            </span>
            <span className="mt-1 block truncate text-[clamp(11px,0.85vw,13px)] font-normal leading-[1.35] text-[#4d4d4d]">
              {meetingGoalContextDraft.trim()
                ? `관련 맥락: ${meetingGoalContextDraft.trim()}`
                : "클릭해서 회의 목표와 관련 맥락을 입력"}
            </span>
          </button>

          {meetingGoalEditorOpen ? (
            <div className="absolute left-1/2 top-[calc(100%+12px)] z-30 w-[min(560px,calc(100vw-32px))] -translate-x-1/2 rounded-[16px] border border-black/10 bg-white p-4 text-left shadow-[0_5.64px_22.56px_rgba(0,0,0,0.08)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[18px] font-semibold leading-[24.811px] text-black">회의 목표 설정</p>
                  <p className="mt-1 text-[13px] leading-5 text-[#4d4d4d]">
                    입력한 내용은 저장을 누른 뒤 STT와 AI 분석의 참고 정보로 사용됩니다.
                  </p>
                </div>
              </div>
              <label className="mt-4 block">
                <span className="text-xs font-semibold text-[#4d4d4d]">회의 목표</span>
                <input
                  value={meetingGoalEditorDraft}
                  onChange={(event) => onMeetingGoalEditorDraftChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      onCancelMeetingGoalEdit();
                    }
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onSaveMeetingGoalEdit();
                    }
                  }}
                  placeholder="예: 신규 회의 관리 시스템의 핵심 기능 우선순위 결정"
                  className="mt-2 w-full rounded-[12px] border border-black/10 bg-[#f9f9f9] px-4 py-3 text-[16px] leading-6 text-black outline-none transition placeholder:text-black/30 focus:border-[#a13ab8]/30 focus:bg-white focus:ring-2 focus:ring-[#a13ab8]/10"
                />
              </label>
              <label className="mt-3 block">
                <span className="text-xs font-semibold text-[#4d4d4d]">관련 맥락</span>
                <textarea
                  value={meetingGoalContextEditorDraft}
                  onChange={(event) => onMeetingGoalContextEditorDraftChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      onCancelMeetingGoalEdit();
                    }
                  }}
                  placeholder="회의에서 자주 나올 제품명, 고유명사, 참가자 역할, 논의 범위 등을 입력해 주세요."
                  className="mt-2 min-h-[92px] w-full resize-none rounded-[12px] border border-black/10 bg-[#f9f9f9] px-4 py-3 text-[15px] leading-6 text-[#4d4d4d] outline-none transition placeholder:text-black/30 focus:border-[#a13ab8]/30 focus:bg-white focus:ring-2 focus:ring-[#a13ab8]/10"
                />
              </label>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onCancelMeetingGoalEdit}
                  disabled={meetingGoalSaving}
                  className="rounded-[8px] bg-[#eff0f6] px-4 py-2 text-sm font-semibold text-[#4d4d4d] transition hover:bg-[#e3e5ee] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={onSaveMeetingGoalEdit}
                  disabled={meetingGoalSaving}
                  className="rounded-[8px] border border-[#ead0f2] bg-[#f4e8fb] px-5 py-2 text-sm font-semibold text-[#6f2b7d] transition hover:border-[#d9b7e5] hover:bg-[#ecd9f7] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {meetingGoalSaving ? "저장 중" : "저장"}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex w-full flex-wrap items-center justify-center gap-3 lg:justify-end lg:justify-self-end">
          <div className="flex flex-wrap items-center justify-center gap-[clamp(8px,1.4vw,20px)]">
            {CANVAS_HEADER_STAGES.map((item, index) => (
              <div key={item} className="flex items-center gap-[clamp(6px,1vw,16px)]">
                <button
                  type="button"
                  onClick={() => onStageSelect(item)}
                  className={`rounded-[8px] border px-[clamp(12px,1.2vw,16px)] py-[clamp(7px,0.9vh,8px)] text-[clamp(14px,1.2vw,20px)] font-semibold leading-[1.25] transition ${
                    stage === item
                      ? "border-[#a13ab8]/20 bg-[rgba(161,58,184,0.1)] text-[#a13ab8]"
                      : "border-black/10 bg-white text-black/50 hover:border-[#a13ab8]/20 hover:bg-[rgba(161,58,184,0.1)] hover:text-[#a13ab8]"
                  }`}
                >
                  {stageLabel(item)}
                </button>
                {index < 2 ? <span className="text-[clamp(18px,1.5vw,24px)] text-black/30">›</span> : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
