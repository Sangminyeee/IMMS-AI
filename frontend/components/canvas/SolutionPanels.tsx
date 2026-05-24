"use client";

import { memo, type ReactNode, type RefObject } from "react";
import type { CanvasEditPresencePayload, CanvasFinalSolutionSummary } from "@/lib/types";

type SummaryDocumentSection = NonNullable<CanvasFinalSolutionSummary["sections"]>[number];

export type SummaryProblemStructureGroup = {
  id: string;
  title: string;
  nodeIds: string[];
  status: string;
};

export type SummaryProblemStructureNode = {
  id: string;
  title: string;
};

type SolutionSummarySourceListProps = {
  groups: SummaryProblemStructureGroup[];
  sectionByGroupId: Map<string, SummaryDocumentSection>;
  nodeById: Map<string, SummaryProblemStructureNode>;
  evidenceOpenGroupIds: Set<string>;
  remoteEditPresenceByKey: Record<string, CanvasEditPresencePayload>;
  onToggleEvidence: (groupId: string) => void;
};

type SolutionFinalDocumentPanelProps = {
  paneRef: RefObject<HTMLElement | null>;
  document: CanvasFinalSolutionSummary;
  editMode: boolean;
  pending: boolean;
  eligibleGroupCount: number;
  onSetEditMode: (editMode: boolean) => void;
  onRegenerate: () => void | Promise<void>;
  onCopy: () => void | Promise<void>;
  onMarkdownChange: (markdown: string) => void;
  renderPreview: (markdown: string, onEdit: () => void) => ReactNode;
};

function makeEditPresenceKey(targetType: CanvasEditPresencePayload["target_type"], targetId: string, noteId = "") {
  return `${targetType}:${targetId}:${noteId}`;
}

function renderEditPresenceBadge(label = "수정중") {
  return (
    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
      {label}
    </span>
  );
}

function problemStructureStatusLabel(status: string) {
  if (status === "final") return "확정";
  if (status === "review") return "검토 중";
  return "초안";
}

export const SolutionSummarySourceList = memo(function SolutionSummarySourceList({
  groups,
  sectionByGroupId,
  nodeById,
  evidenceOpenGroupIds,
  remoteEditPresenceByKey,
  onToggleEvidence,
}: SolutionSummarySourceListProps) {
  return (
    <aside className="flex min-h-[280px] flex-col overflow-hidden border-b border-black/10 bg-white xl:border-b-0 xl:border-r">
      <div className="border-b border-black/10 px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#a13ab8]">Summary Source</p>
        <h4 className="mt-1 text-lg font-semibold text-black">구조화 결과</h4>
        <p className="mt-1 text-sm leading-6 text-[#4d4d4d]">
          검토 중/확정 그룹 {groups.length}개가 요약 문서에 포함됩니다.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {groups.length > 0 ? (
          <div className="space-y-3">
            {groups.map((group, index) => {
              const section = sectionByGroupId.get(group.id);
              const evidenceOpen = evidenceOpenGroupIds.has(group.id);
              const remoteGroupEditPresence =
                remoteEditPresenceByKey[makeEditPresenceKey("problem_structure_group", group.id)] || null;
              const groupNodes = group.nodeIds
                .map((nodeId) => nodeById.get(nodeId))
                .filter((node): node is SummaryProblemStructureNode => Boolean(node));

              return (
                <div key={`summary-source-${group.id}`} className="border border-black/10 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#777]">#{index + 1}</p>
                      <h5 className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-black">
                        {group.title}
                      </h5>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          group.status === "final" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {problemStructureStatusLabel(group.status)}
                      </span>
                      {remoteGroupEditPresence ? renderEditPresenceBadge() : null}
                    </div>
                  </div>
                  {groupNodes.length > 0 ? (
                    <div className="mt-3 space-y-1.5">
                      {groupNodes.slice(0, 4).map((node) => {
                        const remoteNodeEditPresence =
                          remoteEditPresenceByKey[makeEditPresenceKey("problem_structure_node", node.id)] || null;
                        return (
                          <div key={`summary-node-${group.id}-${node.id}`} className="bg-[#f5f6f8] px-3 py-2">
                            <p className="line-clamp-2 text-xs leading-5 text-[#4d4d4d]">
                              {node.title}
                            </p>
                            {remoteNodeEditPresence ? (
                              <div className="mt-1">{renderEditPresenceBadge()}</div>
                            ) : null}
                          </div>
                        );
                      })}
                      {groupNodes.length > 4 ? (
                        <p className="px-1 text-[11px] font-medium text-[#777]">+ {groupNodes.length - 4}개 더 있음</p>
                      ) : null}
                    </div>
                  ) : null}
                  {section && section.evidence.length > 0 ? (
                    <div className="mt-3 border-t border-black/10 pt-3">
                      <button
                        type="button"
                        onClick={() => onToggleEvidence(group.id)}
                        className="text-xs font-semibold text-[#a13ab8] transition hover:text-[#8d2fa3]"
                      >
                        근거 발언 {evidenceOpen ? "접기" : "보기"} ({section.evidence.length})
                      </button>
                      {evidenceOpen ? (
                        <div className="mt-2 space-y-2">
                          {section.evidence.map((item, evidenceIndex) => (
                            <p
                              key={`summary-evidence-${group.id}-${item.utterance_id || evidenceIndex}`}
                              className="bg-[#f7ecfb] px-3 py-2 text-xs leading-5 text-[#334155]"
                            >
                              <span className="font-semibold text-[#a13ab8]">{item.speaker}</span>
                              {item.timestamp ? <span className="ml-2 text-[#777]">{item.timestamp}</span> : null}
                              <span className="mt-1 block">{item.text}</span>
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="border border-dashed border-black/10 bg-[#fafafa] px-4 py-5 text-sm leading-6 text-[#777]">
            정의 2단계에서 그룹을 검토 중 또는 확정 상태로 바꾸면 요약 문서에 포함됩니다.
          </div>
        )}
      </div>
    </aside>
  );
});

export const SolutionFinalDocumentPanel = memo(function SolutionFinalDocumentPanel({
  paneRef,
  document,
  editMode,
  pending,
  eligibleGroupCount,
  onSetEditMode,
  onRegenerate,
  onCopy,
  onMarkdownChange,
  renderPreview,
}: SolutionFinalDocumentPanelProps) {
  const hasMarkdown = Boolean(document.markdown.trim());

  return (
    <section ref={paneRef} className="flex min-h-[420px] flex-col overflow-hidden bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 px-5 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#a13ab8]">Final Document</p>
          <h4 className="mt-1 text-lg font-semibold text-black">최종 정리 문서</h4>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {document.used_llm ? (
            <span className="rounded-full bg-[#f7ecfb] px-3 py-1 text-xs font-semibold text-[#a13ab8]">AI 초안</span>
          ) : null}
          {document.document_status === "edited" ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">사용자 수정됨</span>
          ) : null}
          <div className="flex overflow-hidden rounded-[8px] border border-black/10 bg-[#f5f6f8]">
            <button
              type="button"
              onClick={() => onSetEditMode(false)}
              disabled={!hasMarkdown}
              className={`px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                !editMode ? "bg-white text-[#a13ab8]" : "text-[#4d4d4d] hover:bg-white/70"
              }`}
            >
              보기
            </button>
            <button
              type="button"
              onClick={() => onSetEditMode(true)}
              className={`border-l border-black/10 px-3 py-1.5 text-xs font-semibold transition ${
                editMode ? "bg-white text-[#a13ab8]" : "text-[#4d4d4d] hover:bg-white/70"
              }`}
            >
              편집
            </button>
          </div>
          <button
            type="button"
            onClick={() => void onRegenerate()}
            disabled={pending || eligibleGroupCount === 0}
            className="rounded-[8px] border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#4d4d4d] transition hover:bg-[#f5f6f8] disabled:cursor-not-allowed disabled:opacity-50"
          >
            다시 생성
          </button>
          <button
            type="button"
            onClick={() => void onCopy()}
            disabled={!hasMarkdown}
            className="rounded-[8px] border border-[#ead0f2] bg-[#f4e8fb] px-3 py-1.5 text-xs font-semibold text-[#6f2b7d] transition hover:border-[#d9b7e5] hover:bg-[#ecd9f7] disabled:cursor-not-allowed disabled:opacity-50"
          >
            복사
          </button>
        </div>
      </div>
      {document.warning ? (
        <div className="border-b border-amber-100 bg-amber-50 px-5 py-2 text-xs leading-5 text-amber-700">
          {document.warning}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-hidden bg-[#f5f6f8] p-5">
        {editMode || !hasMarkdown ? (
          <textarea
            value={document.markdown}
            onChange={(event) => onMarkdownChange(event.target.value)}
            placeholder={
              pending
                ? "AI가 요약 문서를 생성하는 중입니다."
                : "요약 단계로 들어오면 구조화 그룹을 기준으로 문서 초안이 자동 생성됩니다."
            }
            className="h-full min-h-[360px] w-full resize-none border border-black/10 bg-white px-6 py-5 font-mono text-sm leading-7 text-[#1f2937] outline-none transition placeholder:font-sans placeholder:text-[#999] focus:border-[#a13ab8]/30 focus:ring-2 focus:ring-[#a13ab8]/10"
          />
        ) : (
          renderPreview(document.markdown, () => onSetEditMode(true))
        )}
      </div>
    </section>
  );
});
