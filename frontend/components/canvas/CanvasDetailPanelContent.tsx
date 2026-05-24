"use client";

import { memo } from "react";
import type { CanvasEditPresencePayload } from "@/lib/types";

type CanvasStage = "ideation" | "problem-definition" | "solution";
type ProblemGroupStatus = "draft" | "review" | "final";
type ComposerTool = "note" | "comment" | "topic";

type CanvasDetailItem = {
  label: string;
  value: string;
};

type CanvasDetailLinkedItem = CanvasDetailItem & {
  id: string;
  keywords?: string[];
};

type CanvasDetailMergedItem = CanvasDetailLinkedItem & {
  sourceCount: number;
};

type CanvasDetailRefinedItem = CanvasDetailItem & {
  id: string;
  sourceItemId: string;
};

type CanvasDetailNoteItem = CanvasDetailItem & {
  id: string;
  kind: string;
};

export type CanvasDetailPanelModel = {
  title: string;
  subtitle: string;
  badges: string[];
  keywords: string[];
  summaryItems: CanvasDetailItem[];
  organizeItems: CanvasDetailItem[];
  organizeTitle?: string;
  mergedItems?: CanvasDetailMergedItem[];
  refinedItems?: CanvasDetailRefinedItem[];
  commentItems?: CanvasDetailLinkedItem[];
  evidenceItems?: CanvasDetailItem[];
  noteItems?: CanvasDetailNoteItem[];
};

type CanvasDetailSolutionSuggestion = {
  id: string;
  text: string;
  status: "draft" | "selected" | "dismissed";
};

export type CanvasDetailSolutionNote = {
  id: string;
  text: string;
  source?: "ai" | "user" | string;
  source_ai_id?: string;
  is_final_candidate?: boolean;
  final_comment?: string;
};

type CanvasDetailSolutionTopic = {
  group_id: string;
  status: ProblemGroupStatus;
  conclusion: string;
  problem_topic: string;
  problem_insight: string;
  problem_conclusion: string;
  agenda_titles: string[];
  ai_suggestions: CanvasDetailSolutionSuggestion[];
  notes: CanvasDetailSolutionNote[];
};

type CanvasDetailFinalNote = CanvasDetailSolutionNote & {
  topicId: string;
  topicTitle: string;
};

type CanvasDetailPanelContentProps = {
  detail: CanvasDetailPanelModel;
  stage: CanvasStage;
  hasSelectedCanvasItem: boolean;
  selectedCanvasItemId: string;
  hasSelectedAgenda: boolean;
  hasSelectedProblemGroup: boolean;
  selectedProblemStatus: ProblemGroupStatus | "";
  selectedProblemInsightUserEdited: boolean;
  selectedProblemConclusionUserEdited: boolean;
  selectedSolutionTopic: CanvasDetailSolutionTopic | null;
  selectedRemoteEditPresence: boolean;
  isEditingSelectedAgenda: boolean;
  isEditingSelectedCanvasItem: boolean;
  isEditingSelectedProblemGroup: boolean;
  isEditingSelectedSolutionTopic: boolean;
  agendaDraftTitle: string;
  agendaDraftKeywords: string;
  agendaDraftSummary: string;
  canvasItemDraftTitle: string;
  canvasItemDraftBody: string;
  problemGroupDraftTopic: string;
  problemGroupDraftInsight: string;
  problemGroupDraftConclusion: string;
  solutionTopicDraftTitle: string;
  solutionTopicDraftConclusion: string;
  solutionTopicDraftIdeas: string;
  solutionNoteDraft: string;
  editingSolutionNoteKey: string;
  solutionNoteTextDraft: string;
  solutionNoteFinalCommentDraft: string;
  finalSolutionCount: number;
  allSolutionFinalNotes: CanvasDetailFinalNote[];
  remoteEditPresenceByKey: Record<string, CanvasEditPresencePayload>;
  onAgendaDraftTitleChange: (value: string) => void;
  onAgendaDraftKeywordsChange: (value: string) => void;
  onAgendaDraftSummaryChange: (value: string) => void;
  onCanvasItemDraftTitleChange: (value: string) => void;
  onCanvasItemDraftBodyChange: (value: string) => void;
  onProblemGroupDraftTopicChange: (value: string) => void;
  onProblemGroupDraftInsightChange: (value: string) => void;
  onProblemGroupDraftConclusionChange: (value: string) => void;
  onSolutionTopicDraftTitleChange: (value: string) => void;
  onSolutionTopicDraftConclusionChange: (value: string) => void;
  onSolutionTopicDraftIdeasChange: (value: string) => void;
  onSolutionNoteDraftChange: (value: string) => void;
  onSolutionNoteTextDraftChange: (value: string) => void;
  onSolutionNoteFinalCommentDraftChange: (value: string) => void;
  onStartAgendaEdit: () => void;
  onCancelAgendaEdit: () => void;
  onSaveAgendaEdit: () => void;
  onStartCanvasItemEdit: () => void;
  onCancelCanvasItemEdit: () => void;
  onSaveCanvasItemEdit: () => void;
  onDeleteCanvasItem: () => void;
  onExtractCanvasItemKeywords: (itemId: string) => void;
  onStartProblemGroupEdit: () => void;
  onCancelProblemGroupEdit: () => void;
  onSaveProblemGroupEdit: () => void;
  onSetProblemGroupStatus: (status: ProblemGroupStatus) => void;
  onStartSolutionTopicEdit: () => void;
  onCancelSolutionTopicEdit: () => void;
  onSaveSolutionTopicEdit: () => void;
  onSetSolutionTopicStatus: (status: ProblemGroupStatus) => void;
  onAdoptAiSuggestion: (topicId: string, suggestionId: string) => void;
  onToggleFinalSolutionNote: (topicId: string, noteId: string) => void;
  onCancelSolutionNoteEdit: () => void;
  onSaveSolutionNoteEdit: () => void | Promise<void>;
  onStartSolutionNoteEdit: (topicId: string, note: CanvasDetailSolutionNote) => void;
  onAddSolutionUserNote: () => void;
  onCopyFinalSolutionMarkdown: () => void | Promise<void>;
  onSelectFinalSolutionNote: (topicId: string) => void;
  onFocusCanvasItemInIdeation: (itemId: string, reason: string) => void;
  stripLeadingTimestamp: (text: string) => string;
  getToolLabel: (tool: ComposerTool) => string;
};

const PROBLEM_STATUSES: ProblemGroupStatus[] = ["draft", "review", "final"];

function makeEditPresenceKey(targetType: CanvasEditPresencePayload["target_type"], targetId: string, noteId = "") {
  return `${targetType}:${targetId}:${noteId}`;
}

function makeSolutionNoteEditKey(topicId: string, noteId: string) {
  return `${topicId}:${noteId}`;
}

function problemGroupStatusLabel(status: ProblemGroupStatus) {
  if (status === "final") return "확정";
  if (status === "review") return "검토 중";
  return "초안";
}

function renderEditPresenceBadge(label = "수정중") {
  return (
    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
      {label}
    </span>
  );
}

export const CanvasDetailPanelContent = memo(function CanvasDetailPanelContent({
  detail,
  stage,
  hasSelectedCanvasItem,
  selectedCanvasItemId,
  hasSelectedAgenda,
  hasSelectedProblemGroup,
  selectedProblemStatus,
  selectedProblemInsightUserEdited,
  selectedProblemConclusionUserEdited,
  selectedSolutionTopic,
  selectedRemoteEditPresence,
  isEditingSelectedAgenda,
  isEditingSelectedCanvasItem,
  isEditingSelectedProblemGroup,
  isEditingSelectedSolutionTopic,
  agendaDraftTitle,
  agendaDraftKeywords,
  agendaDraftSummary,
  canvasItemDraftTitle,
  canvasItemDraftBody,
  problemGroupDraftTopic,
  problemGroupDraftInsight,
  problemGroupDraftConclusion,
  solutionTopicDraftTitle,
  solutionTopicDraftConclusion,
  solutionTopicDraftIdeas,
  solutionNoteDraft,
  editingSolutionNoteKey,
  solutionNoteTextDraft,
  solutionNoteFinalCommentDraft,
  finalSolutionCount,
  allSolutionFinalNotes,
  remoteEditPresenceByKey,
  onAgendaDraftTitleChange,
  onAgendaDraftKeywordsChange,
  onAgendaDraftSummaryChange,
  onCanvasItemDraftTitleChange,
  onCanvasItemDraftBodyChange,
  onProblemGroupDraftTopicChange,
  onProblemGroupDraftInsightChange,
  onProblemGroupDraftConclusionChange,
  onSolutionTopicDraftTitleChange,
  onSolutionTopicDraftConclusionChange,
  onSolutionTopicDraftIdeasChange,
  onSolutionNoteDraftChange,
  onSolutionNoteTextDraftChange,
  onSolutionNoteFinalCommentDraftChange,
  onStartAgendaEdit,
  onCancelAgendaEdit,
  onSaveAgendaEdit,
  onStartCanvasItemEdit,
  onCancelCanvasItemEdit,
  onSaveCanvasItemEdit,
  onDeleteCanvasItem,
  onExtractCanvasItemKeywords,
  onStartProblemGroupEdit,
  onCancelProblemGroupEdit,
  onSaveProblemGroupEdit,
  onSetProblemGroupStatus,
  onStartSolutionTopicEdit,
  onCancelSolutionTopicEdit,
  onSaveSolutionTopicEdit,
  onSetSolutionTopicStatus,
  onAdoptAiSuggestion,
  onToggleFinalSolutionNote,
  onCancelSolutionNoteEdit,
  onSaveSolutionNoteEdit,
  onStartSolutionNoteEdit,
  onAddSolutionUserNote,
  onCopyFinalSolutionMarkdown,
  onSelectFinalSolutionNote,
  onFocusCanvasItemInIdeation,
  stripLeadingTimestamp,
  getToolLabel,
}: CanvasDetailPanelContentProps) {
  const isEditingAnyDetail =
    isEditingSelectedAgenda ||
    isEditingSelectedCanvasItem ||
    isEditingSelectedProblemGroup ||
    isEditingSelectedSolutionTopic;

  return (
    <>
      <section className="border-b border-slate-200/80 pb-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Detail</p>
            {isEditingAnyDetail ? (
              <input
                value={
                  isEditingSelectedAgenda
                    ? agendaDraftTitle
                    : isEditingSelectedCanvasItem
                      ? canvasItemDraftTitle
                      : isEditingSelectedProblemGroup
                        ? problemGroupDraftTopic
                        : solutionTopicDraftTitle
                }
                onChange={(event) => {
                  if (isEditingSelectedAgenda) {
                    onAgendaDraftTitleChange(event.target.value);
                    return;
                  }
                  if (isEditingSelectedCanvasItem) {
                    onCanvasItemDraftTitleChange(event.target.value);
                    return;
                  }
                  if (isEditingSelectedProblemGroup) {
                    onProblemGroupDraftTopicChange(event.target.value);
                    return;
                  }
                  onSolutionTopicDraftTitleChange(event.target.value);
                }}
                className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-lg font-semibold text-slate-900"
              />
            ) : (
              <h4 className="mt-3 text-xl font-semibold text-slate-900">{detail.title}</h4>
            )}
            <p className="mt-2 text-base text-slate-500">{detail.subtitle}</p>
          </div>
          {stage === "ideation" && hasSelectedCanvasItem ? (
            <div className="flex shrink-0 gap-2">
              {isEditingSelectedCanvasItem ? (
                <>
                  <button type="button" onClick={onCancelCanvasItemEdit} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                    취소
                  </button>
                  <button type="button" onClick={onSaveCanvasItemEdit} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
                    저장
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={onStartCanvasItemEdit} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                    수정
                  </button>
                  <button type="button" onClick={onDeleteCanvasItem} className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50">
                    삭제
                  </button>
                </>
              )}
            </div>
          ) : stage === "ideation" && hasSelectedAgenda ? (
            <div className="flex shrink-0 gap-2">
              {isEditingSelectedAgenda ? (
                <>
                  <button type="button" onClick={onCancelAgendaEdit} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                    취소
                  </button>
                  <button type="button" onClick={onSaveAgendaEdit} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
                    저장
                  </button>
                </>
              ) : (
                <button type="button" onClick={onStartAgendaEdit} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                  수정
                </button>
              )}
            </div>
          ) : stage === "problem-definition" && hasSelectedProblemGroup ? (
            <div className="flex shrink-0 gap-2">
              {isEditingSelectedProblemGroup ? (
                <>
                  <button type="button" onClick={onCancelProblemGroupEdit} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                    취소
                  </button>
                  <button type="button" onClick={onSaveProblemGroupEdit} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
                    저장
                  </button>
                </>
              ) : (
                <button type="button" onClick={onStartProblemGroupEdit} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                  수정
                </button>
              )}
            </div>
          ) : stage === "solution" && selectedSolutionTopic ? (
            <div className="flex shrink-0 gap-2">
              {isEditingSelectedSolutionTopic ? (
                <>
                  <button type="button" onClick={onCancelSolutionTopicEdit} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                    취소
                  </button>
                  <button type="button" onClick={onSaveSolutionTopicEdit} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
                    저장
                  </button>
                </>
              ) : (
                <button type="button" onClick={onStartSolutionTopicEdit} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                  수정
                </button>
              )}
            </div>
          ) : null}
        </div>
        {detail.badges.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {detail.badges.map((badge) => (
              <span key={`${detail.title}-${badge}`} className="rounded-full bg-white px-3 py-1 text-sm text-slate-600">
                {badge}
              </span>
            ))}
          </div>
        ) : null}
        {stage === "problem-definition" && selectedProblemStatus ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {PROBLEM_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => onSetProblemGroupStatus(status)}
                className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                  selectedProblemStatus === status ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                {problemGroupStatusLabel(status)}
              </button>
            ))}
          </div>
        ) : stage === "solution" && selectedSolutionTopic ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {PROBLEM_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => onSetSolutionTopicStatus(status)}
                className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                  selectedSolutionTopic.status === status ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                {problemGroupStatusLabel(status)}
              </button>
            ))}
          </div>
        ) : null}
        {selectedRemoteEditPresence ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
            다른 참가자가 이 항목을 수정 중입니다. 저장 전에 내용이 바뀔 수 있으니 확인 후 저장해 주세요.
          </div>
        ) : null}
      </section>

      <section className="border-b border-slate-200/80 py-6">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-lg font-semibold text-slate-900">키워드</h4>
          {stage === "ideation" && hasSelectedCanvasItem ? (
            <button
              type="button"
              onClick={() => onExtractCanvasItemKeywords(selectedCanvasItemId)}
              disabled={isEditingSelectedCanvasItem}
              title={isEditingSelectedCanvasItem ? "편집을 저장한 뒤 키워드를 추출할 수 있습니다." : "제목과 내용에서 키워드를 추출합니다."}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              키워드 추출
            </button>
          ) : null}
        </div>
        {isEditingSelectedAgenda ? (
          <>
            <input
              value={agendaDraftKeywords}
              onChange={(event) => onAgendaDraftKeywordsChange(event.target.value)}
              placeholder="쉼표로 구분해 키워드를 입력합니다."
              className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base text-slate-700"
            />
            <p className="mt-3 text-sm leading-6 text-slate-500">예: 고객 경험, 협업 흐름, 실행 우선순위</p>
          </>
        ) : detail.keywords.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {detail.keywords.map((keyword) => (
              <span key={`${detail.title}-${keyword}`} className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                #{keyword}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-base leading-7 text-slate-500">아직 정리된 키워드가 없습니다.</p>
        )}
      </section>

      {stage === "problem-definition" && hasSelectedProblemGroup ? (
        <section className="border-b border-slate-200/80 py-6">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-lg font-semibold text-slate-900">Insight</h4>
            {selectedProblemInsightUserEdited ? (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                수동 수정됨
              </span>
            ) : null}
          </div>
          {isEditingSelectedProblemGroup ? (
            <>
              <textarea
                value={problemGroupDraftInsight}
                onChange={(event) => onProblemGroupDraftInsightChange(event.target.value)}
                className="mt-4 min-h-[110px] w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base leading-7 text-slate-700"
                placeholder="이 그룹의 인사이트를 직접 정리할 수 있습니다."
              />
              <p className="mt-3 text-sm leading-6 text-slate-500">
                저장하면 이 Insight는 이후 AI 재생성으로 덮어쓰지 않습니다.
              </p>
            </>
          ) : (
            <p className="mt-4 text-base leading-7 text-slate-500">
              Insight는 노드 내부에서 확인하고, 수정 모드에서 직접 편집할 수 있습니다.
            </p>
          )}
        </section>
      ) : null}

      {stage !== "solution" ? (
        <section className="border-b border-slate-200/80 py-6">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-lg font-semibold text-slate-900">
              {stage === "ideation" ? (hasSelectedCanvasItem ? "내용" : "요약") : "결론"}
            </h4>
            {stage === "problem-definition" && selectedProblemConclusionUserEdited ? (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                수동 수정됨
              </span>
            ) : null}
          </div>
          {stage === "ideation" && isEditingSelectedAgenda ? (
            <>
              <textarea
                value={agendaDraftSummary}
                onChange={(event) => onAgendaDraftSummaryChange(event.target.value)}
                className="mt-4 min-h-[180px] w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base leading-7 text-slate-700"
                placeholder="한 줄에 하나씩 요약 또는 맥락을 입력합니다."
              />
              <p className="mt-3 text-sm leading-6 text-slate-500">
                줄 단위로 저장되며, ideation 안건 노드와 상세 맥락에 함께 반영됩니다.
              </p>
            </>
          ) : stage === "ideation" && isEditingSelectedCanvasItem ? (
            <>
              <textarea
                value={canvasItemDraftBody}
                onChange={(event) => onCanvasItemDraftBodyChange(event.target.value)}
                className="mt-4 min-h-[180px] w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base leading-7 text-slate-700"
                placeholder="공용 canvas 아이템 내용을 입력합니다."
              />
              <p className="mt-3 text-sm leading-6 text-slate-500">
                저장하면 선택한 공용 canvas 노드 본문이 바로 갱신됩니다.
              </p>
            </>
          ) : (
            <div className="mt-4 space-y-3">
              {detail.summaryItems.map((item, index) => (
                <div key={`${detail.title}-summary-${index}`} className="rounded-xl bg-[#fafafa] px-4 py-3">
                  <p className="text-sm font-semibold text-slate-500">{item.label}</p>
                  {stage === "problem-definition" && index === 0 && isEditingSelectedProblemGroup ? (
                    <textarea
                      value={problemGroupDraftConclusion}
                      onChange={(event) => onProblemGroupDraftConclusionChange(event.target.value)}
                      className="mt-2 min-h-[120px] w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base leading-7 text-slate-700"
                    />
                  ) : (
                    <p className="mt-1 text-base leading-7 text-slate-700">{item.value}</p>
                  )}
                </div>
              ))}
            </div>
          )}
          {stage === "problem-definition" && isEditingSelectedProblemGroup ? (
            <p className="mt-3 text-sm leading-6 text-slate-500">
              저장하면 이 결론은 이후 AI 재생성으로 덮어쓰지 않습니다.
            </p>
          ) : null}
        </section>
      ) : null}

      {stage === "solution" && selectedSolutionTopic ? (
        <>
          <section className="border-b border-slate-200/80 py-6">
            <h4 className="text-lg font-semibold text-slate-900">해결 방향</h4>
            {isEditingSelectedSolutionTopic ? (
              <textarea
                value={solutionTopicDraftConclusion}
                onChange={(event) => onSolutionTopicDraftConclusionChange(event.target.value)}
                className="mt-4 min-h-[120px] w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base leading-7 text-slate-700"
              />
            ) : (
              <div className="mt-4 rounded-xl bg-[#fafafa] px-4 py-3">
                <p className="text-base leading-7 text-slate-700">
                  {selectedSolutionTopic.conclusion || "아직 정리된 해결 방향이 없습니다."}
                </p>
              </div>
            )}
          </section>

          <section className="border-b border-slate-200/80 py-6">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-lg font-semibold text-slate-900">AI 초안</h4>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
                {selectedSolutionTopic.ai_suggestions.length}개
              </span>
            </div>
            {isEditingSelectedSolutionTopic ? (
              <>
                <textarea
                  value={solutionTopicDraftIdeas}
                  onChange={(event) => onSolutionTopicDraftIdeasChange(event.target.value)}
                  className="mt-4 min-h-[180px] w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base leading-7 text-slate-700"
                  placeholder="한 줄에 하나씩 아이디어를 입력합니다."
                />
                <p className="mt-3 text-sm leading-6 text-slate-500">각 줄이 하나의 실행 아이디어로 저장됩니다.</p>
              </>
            ) : (
              <div className="mt-4 space-y-3">
                {selectedSolutionTopic.ai_suggestions.length > 0 ? (
                  selectedSolutionTopic.ai_suggestions.map((idea, index) => (
                    <div key={idea.id} className="rounded-xl bg-[#fafafa] px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-500">AI 제안 {index + 1}</p>
                          <p className={`mt-1 text-base leading-7 ${idea.status === "selected" ? "text-fuchsia-700" : "text-slate-700"}`}>
                            {idea.text}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onAdoptAiSuggestion(selectedSolutionTopic.group_id, idea.id)}
                          disabled={idea.status === "selected"}
                          className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                        >
                          {idea.status === "selected" ? "채택됨" : "채택"}
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-base leading-7 text-slate-500">아직 제안된 AI 초안이 없습니다.</p>
                )}
              </div>
            )}
          </section>

          <section className="border-b border-slate-200/80 py-6">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-lg font-semibold text-slate-900">채택 메모</h4>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
                {selectedSolutionTopic.notes.length}개
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {selectedSolutionTopic.notes.length > 0 ? (
                selectedSolutionTopic.notes.map((note, index) => {
                  const noteEditKey = makeSolutionNoteEditKey(selectedSolutionTopic.group_id, note.id);
                  const noteEditing = editingSolutionNoteKey === noteEditKey;
                  const remoteNoteEditPresence =
                    remoteEditPresenceByKey[makeEditPresenceKey("solution_note", selectedSolutionTopic.group_id, note.id)] || null;
                  return (
                    <div key={note.id} className="rounded-xl border border-amber-100 bg-amber-50/70 px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-amber-700">
                              {note.source === "ai" ? `채택 메모 ${index + 1}` : `사용자 메모 ${index + 1}`}
                            </p>
                            {remoteNoteEditPresence ? renderEditPresenceBadge() : null}
                          </div>
                          {noteEditing ? (
                            <textarea
                              value={solutionNoteTextDraft}
                              onChange={(event) => onSolutionNoteTextDraftChange(event.target.value)}
                              placeholder="해결책 카드 내용을 입력합니다."
                              className="mt-2 min-h-[92px] w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base leading-7 text-slate-700"
                            />
                          ) : (
                            <p className="mt-2 text-base leading-7 text-slate-700">{note.text}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <button
                            type="button"
                            onClick={() => onToggleFinalSolutionNote(selectedSolutionTopic.group_id, note.id)}
                            className={`rounded-xl px-3 py-2 text-sm font-medium ${
                              note.is_final_candidate
                                ? "bg-slate-900 text-white"
                                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            {note.is_final_candidate ? "최종 결론" : "결론 후보"}
                          </button>
                          {noteEditing ? (
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={onCancelSolutionNoteEdit} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                                취소
                              </button>
                              <button type="button" onClick={() => void onSaveSolutionNoteEdit()} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
                                저장
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onStartSolutionNoteEdit(selectedSolutionTopic.group_id, note)}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                            >
                              편집
                            </button>
                          )}
                        </div>
                      </div>
                      {note.is_final_candidate && noteEditing ? (
                        <textarea
                          value={solutionNoteFinalCommentDraft}
                          onChange={(event) => onSolutionNoteFinalCommentDraftChange(event.target.value)}
                          placeholder="추가 설명을 입력할 수 있습니다."
                          className="mt-3 min-h-[84px] w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-700"
                        />
                      ) : note.is_final_candidate ? (
                        <p className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-500">
                          {note.final_comment || "최종 결론 설명은 편집을 눌러 추가할 수 있습니다."}
                        </p>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <p className="text-base leading-7 text-slate-500">아직 채택된 메모가 없습니다. AI 초안이나 사용자 메모를 추가해 보세요.</p>
              )}
            </div>

            <div className="mt-5 rounded-xl bg-[#fafafa] px-4 py-4">
              <p className="text-sm font-semibold text-slate-600">사용자 메모 추가</p>
              <textarea
                value={solutionNoteDraft}
                onChange={(event) => onSolutionNoteDraftChange(event.target.value)}
                placeholder="직접 해결책 메모를 추가합니다."
                className="mt-3 min-h-[110px] w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base leading-7 text-slate-700"
              />
              <button type="button" onClick={onAddSolutionUserNote} className="mt-3 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800">
                메모 추가
              </button>
            </div>
          </section>

          <section className="border-b border-slate-200/80 py-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-lg font-semibold text-slate-900">최종 결론 모음</h4>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  회의 종료 시 이 내용이 결과 요약으로 저장됩니다.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => void onCopyFinalSolutionMarkdown()}
                  disabled={finalSolutionCount === 0}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  마크다운 복사
                </button>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
                  {finalSolutionCount}개
                </span>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {allSolutionFinalNotes.length > 0 ? (
                allSolutionFinalNotes.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => onSelectFinalSolutionNote(note.topicId)}
                    className={`w-full rounded-xl border px-4 py-3 text-left ${
                      note.topicId === selectedSolutionTopic.group_id ? "border-slate-300 bg-white" : "border-slate-200 bg-[#fafafa]"
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-700">{note.topicTitle}</p>
                    <p className="mt-1 text-base leading-7 text-slate-700">{note.text}</p>
                    {note.final_comment ? (
                      <p className="mt-2 text-sm leading-6 text-slate-500">{note.final_comment}</p>
                    ) : null}
                  </button>
                ))
              ) : (
                <p className="text-base leading-7 text-slate-500">최종 결론으로 표시된 메모가 아직 없습니다.</p>
              )}
            </div>
          </section>

          <section className="pt-6">
            <h4 className="text-lg font-semibold text-slate-900">연결 문제정의</h4>
            <div className="mt-4 space-y-3">
              <div className="rounded-xl bg-[#fafafa] px-4 py-3">
                <p className="text-sm font-semibold text-slate-500">문제 정의 주제</p>
                <p className="mt-1 text-base leading-7 text-slate-700">
                  {selectedSolutionTopic.problem_topic || "연결된 문제정의가 아직 없습니다."}
                </p>
              </div>
              <div className="rounded-xl bg-[#fafafa] px-4 py-3">
                <p className="text-sm font-semibold text-slate-500">소결론</p>
                <p className="mt-1 text-base leading-7 text-slate-700">
                  {selectedSolutionTopic.problem_insight || "연결된 소결론이 아직 없습니다."}
                </p>
              </div>
              <div className="rounded-xl bg-[#fafafa] px-4 py-3">
                <p className="text-sm font-semibold text-slate-500">문제 정의 결론</p>
                <p className="mt-1 text-base leading-7 text-slate-700">
                  {selectedSolutionTopic.problem_conclusion || "연결된 결론이 아직 없습니다."}
                </p>
              </div>
              <div className="rounded-xl bg-[#fafafa] px-4 py-3">
                <p className="text-sm font-semibold text-slate-500">연결 안건</p>
                <p className="mt-1 text-base leading-7 text-slate-700">
                  {selectedSolutionTopic.agenda_titles.length > 0 ? selectedSolutionTopic.agenda_titles.join(", ") : "연결된 안건이 아직 없습니다."}
                </p>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {stage !== "solution" && detail.organizeItems.length > 0 ? (
        <section className="pt-6">
          <h4 className="text-lg font-semibold text-slate-900">{detail.organizeTitle || "안건 정리"}</h4>
          <div className="mt-4 space-y-3">
            {detail.organizeItems.map((item, index) => (
              <div key={`${detail.title}-organize-${index}`} className="rounded-xl bg-[#fafafa] px-4 py-3">
                <p className="text-sm font-semibold text-slate-500">{item.label}</p>
                <p className="mt-1 text-base leading-7 text-slate-700">{stripLeadingTimestamp(item.value)}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {stage === "ideation" && hasSelectedCanvasItem ? (
        <>
          {detail.mergedItems?.length ? (
            <section className="pt-6">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-lg font-semibold text-slate-900">포함된 하위 아이디어</h4>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
                  {detail.mergedItems.length}개 묶음
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {detail.mergedItems.map((item) => (
                  <div key={`${detail.title}-merged-${item.id}`} className="rounded-xl border border-slate-200 bg-[#fafafa] px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-700">{item.label}</p>
                        <p className="mt-1 whitespace-pre-wrap text-base leading-7 text-slate-700">
                          {stripLeadingTimestamp(item.value)}
                        </p>
                      </div>
                      {item.sourceCount > 1 ? (
                        <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs text-slate-500">
                          {item.sourceCount}개
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => onFocusCanvasItemInIdeation(item.id, "하위 아이디어 위치로 이동했습니다.")}
                        className="shrink-0 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#4d4d4d] hover:bg-[#eff0f6]"
                      >
                        원문 이동
                      </button>
                    </div>
                    {item.keywords?.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.keywords.slice(0, 4).map((keyword) => (
                          <span key={`${item.id}-${keyword}`} className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-500">
                            #{keyword}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {detail.refinedItems?.length ? (
            <section className="pt-6">
              <h4 className="text-lg font-semibold text-slate-900">정리된 발화</h4>
              <div className="mt-4 space-y-3">
                {detail.refinedItems.map((item, index) => (
                  <div key={`${detail.title}-refined-${index}`} className="rounded-xl bg-[#fafafa] px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-500">{item.label}</p>
                      <button
                        type="button"
                        onClick={() => onFocusCanvasItemInIdeation(item.sourceItemId, "정리된 발화의 원문 노드로 이동했습니다.")}
                        className="shrink-0 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#4d4d4d] hover:bg-[#eff0f6]"
                      >
                        원문 이동
                      </button>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-base leading-7 text-slate-700">{stripLeadingTimestamp(item.value)}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          <section className="pt-6">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-lg font-semibold text-slate-900">댓글</h4>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
                {detail.commentItems?.length || 0}개
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {detail.commentItems?.length ? (
                detail.commentItems.map((item) => (
                  <div key={`${detail.title}-comment-${item.id}`} className="rounded-xl border border-sky-100 bg-sky-50/60 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-700">{item.label}</p>
                        <p className="mt-1 whitespace-pre-wrap text-base leading-7 text-slate-700">
                          {stripLeadingTimestamp(item.value)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onFocusCanvasItemInIdeation(item.id, "댓글 위치로 이동했습니다.")}
                        className="shrink-0 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#4d4d4d] hover:bg-[#eff0f6]"
                      >
                        원문 이동
                      </button>
                    </div>
                    {item.keywords?.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.keywords.slice(0, 4).map((keyword) => (
                          <span key={`${item.id}-comment-keyword-${keyword}`} className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-500">
                            #{keyword}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 bg-[#fafafa] px-4 py-4 text-sm leading-6 text-slate-500">
                  아직 이 내용에 연결된 댓글이 없습니다.
                </p>
              )}
            </div>
          </section>
        </>
      ) : null}

      {stage === "problem-definition" ? (
        <>
          {detail.evidenceItems?.length ? (
            <section className="pt-6">
              <h4 className="text-lg font-semibold text-slate-900">근거 요약</h4>
              <div className="mt-4 space-y-3">
                {detail.evidenceItems.map((item, index) => (
                  <div key={`${detail.title}-evidence-${index}`} className="rounded-xl bg-[#fafafa] px-4 py-3">
                    <p className="text-sm font-semibold text-slate-500">{item.label}</p>
                    <p className="mt-1 text-base leading-7 text-slate-700">{item.value}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          <section className="pt-6">
            <h4 className="text-lg font-semibold text-slate-900">연결 메모</h4>
            <div className="mt-4 space-y-3">
              {detail.noteItems?.length ? (
                detail.noteItems.map((item, index) => (
                  <div key={`${detail.title}-note-${item.id}-${index}`} className="rounded-xl bg-[#fafafa] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-700">{item.label}</p>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-500">{getToolLabel((item.kind as ComposerTool) || "note")}</span>
                    </div>
                    <p className="mt-2 text-base leading-7 text-slate-600">{item.value || "메모 내용이 없습니다."}</p>
                  </div>
                ))
              ) : (
                <p className="text-base leading-7 text-slate-500">아직 연결된 메모가 없습니다. 오른쪽 개인 메모를 그룹 카드로 드래그하면 여기에 표시됩니다.</p>
              )}
            </div>
          </section>
        </>
      ) : null}
    </>
  );
});
