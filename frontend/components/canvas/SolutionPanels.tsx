"use client";

import { memo, useMemo, type ReactNode, type RefObject } from "react";
import type {
  CanvasEditPresencePayload,
  CanvasFinalSolutionSummary,
  CanvasSummaryStructuredConclusionGroup,
  CanvasSummaryStructuredDiscussionFlow,
  CanvasSummaryStructuredDocument,
  CanvasSummaryStructuredIdeaGroup,
} from "@/lib/types";

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
  body?: string;
};

export type SummaryParticipant = {
  id: string;
  label: string;
  title?: string;
};

type SolutionPresentationModel = CanvasSummaryStructuredDocument;

type SolutionSummarySourceListProps = {
  meetingTitle: string;
  meetingGoal: string;
  participants: SummaryParticipant[];
  document: CanvasFinalSolutionSummary;
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
  draftMarkdown: string;
  draftDirty: boolean;
  editMode: boolean;
  pending: boolean;
  saving: boolean;
  eligibleGroupCount: number;
  presentation: SolutionPresentationModel;
  onSetEditMode: (editMode: boolean) => void;
  onRegenerate: () => void | Promise<void>;
  onCopy: () => void | Promise<void>;
  onSave: () => void | Promise<void>;
  onMarkdownChange: (markdown: string) => void;
  renderPreview: (markdown: string, onEdit: () => void) => ReactNode;
};

function makeEditPresenceKey(targetType: CanvasEditPresencePayload["target_type"], targetId: string, noteId = "") {
  return `${targetType}:${targetId}:${noteId}`;
}

function compactList(items: Array<string | undefined>, limit: number) {
  const seen = new Set<string>();
  const next: string[] = [];
  items.forEach((item) => {
    const text = (item || "").replace(/\s+/g, " ").trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    next.push(text);
  });
  return next.slice(0, limit);
}

function stripMarkdownText(markdown: string) {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.replace(/^#{1,6}\s+/, "").replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+/, "").trim())
    .filter(Boolean);
}

function statusSuffix(group: Pick<CanvasSummaryStructuredConclusionGroup, "status" | "status_label">) {
  if (group.status === "final") return " (확정)";
  if (group.status === "review") return " (검토 중)";
  return "";
}

function normalizePresentation(input: {
  meetingTitle: string;
  meetingGoal: string;
  participants: SummaryParticipant[];
  document: CanvasFinalSolutionSummary;
  groups: SummaryProblemStructureGroup[];
  sectionByGroupId: Map<string, SummaryDocumentSection>;
  nodeById: Map<string, SummaryProblemStructureNode>;
}): SolutionPresentationModel {
  const structured = input.document.structured;
  const markdownLines = stripMarkdownText(input.document.markdown);
  const participantSummary = compactList(
    input.participants.map((participant) => participant.title || participant.label),
    8,
  ).join(" · ");
  const ideaGroups: CanvasSummaryStructuredIdeaGroup[] = input.groups.map((group) => {
    const section = input.sectionByGroupId.get(group.id);
    const nodeItems = group.nodeIds
      .map((nodeId) => input.nodeById.get(nodeId))
      .flatMap((node) => (node ? [node.body, node.title] : []));
    return {
      group_id: group.id,
      title: group.title || section?.title || "주요 아이디어",
      items: compactList([...(section?.node_titles || []), ...nodeItems, section?.rationale], 5),
    };
  });
  const discussionFlows: CanvasSummaryStructuredDiscussionFlow[] = input.groups.map((group) => {
    const section = input.sectionByGroupId.get(group.id);
    const evidence = section?.evidence || [];
    const opinions = evidence.slice(0, 2).map((item, index) => ({
      label: `${String.fromCharCode(65 + index)} 의견`,
      text: item.text,
    }));
    return {
      group_id: group.id,
      title: group.title || section?.title || "논의 흐름",
      opinions,
      conclusion: section?.rationale || compactList(section?.node_titles || [], 1)[0] || "",
    };
  });
  const conclusionGroups: CanvasSummaryStructuredConclusionGroup[] = input.groups.map((group) => {
    const section = input.sectionByGroupId.get(group.id);
    const fallbackItems = ideaGroups.find((item) => item.group_id === group.id)?.items || [];
    return {
      group_id: group.id,
      title: group.title || section?.title || "정리 항목",
      status: group.status || section?.status || "draft",
      status_label: section?.status_label || "",
      bullets: compactList([...(fallbackItems || []), section?.rationale], 5),
    };
  });

  return {
    meeting_overview:
      structured?.meeting_overview ||
      input.meetingGoal ||
      markdownLines[0] ||
      `${input.meetingTitle || "회의"}의 주요 논의를 정리합니다.`,
    attendee_summary: structured?.attendee_summary || participantSummary,
    key_summary:
      structured?.key_summary ||
      markdownLines.find((line) => line.length > 24) ||
      "구조화된 논의 항목을 기준으로 핵심 흐름과 결론을 정리했습니다.",
    idea_groups: structured?.idea_groups?.length ? structured.idea_groups : ideaGroups,
    discussion_flows: structured?.discussion_flows?.length ? structured.discussion_flows : discussionFlows,
    pending_items: structured?.pending_items?.length ? structured.pending_items : [],
    conclusion: {
      title: structured?.conclusion?.title || `${input.meetingTitle || "회의"} 결론`,
      summary: structured?.conclusion?.summary || markdownLines.find((line) => line.length > 30) || "",
      groups: structured?.conclusion?.groups?.length ? structured.conclusion.groups : conclusionGroups,
    },
  };
}

function renderEditPresenceBadge() {
  return (
    <span className="rounded-full bg-[#fff7ed] px-2 py-0.5 text-[10px] font-semibold text-[#c2410c]">
      수정중
    </span>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void | Promise<void>;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={() => void onClick()}
      className="grid h-[28px] w-[28px] place-items-center rounded-full text-[#9a9a9a] transition hover:bg-[#f4f7fb] hover:text-[#236cf3] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function RefreshIcon() {
  return (
    <svg aria-hidden="true" className="h-[14px] w-[14px]" viewBox="0 0 24 24" fill="none">
      <path d="M18.5 9.2A6.8 6.8 0 0 0 6.3 7.1L5 9.1M5.5 14.8a6.8 6.8 0 0 0 12.2 2.1l1.3-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 4.8v4.3h4.3M19 19.2v-4.3h-4.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg aria-hidden="true" className="h-[14px] w-[14px]" viewBox="0 0 24 24" fill="none">
      <path d="m5 17.8.8-3.8 8.7-8.7a2.1 2.1 0 0 1 3 0l1.2 1.2a2.1 2.1 0 0 1 0 3L10 18.2l-3.8.8A1 1 0 0 1 5 17.8Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m13.2 6.6 4.2 4.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg aria-hidden="true" className="h-[14px] w-[14px]" viewBox="0 0 24 24" fill="none">
      <rect x="8" y="8" width="10" height="12" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M6 16H5.8A1.8 1.8 0 0 1 4 14.2V5.8A1.8 1.8 0 0 1 5.8 4h8.4A1.8 1.8 0 0 1 16 5.8V6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function SummaryCardToolIcons() {
  return (
    <div className="absolute right-[18px] top-[24px] flex items-center gap-[9px] text-[#9a9a9a]">
      <EditIcon />
      <CopyIcon />
    </div>
  );
}

export const SolutionSummarySourceList = memo(function SolutionSummarySourceList({
  meetingTitle,
  meetingGoal,
  participants,
  document,
  groups,
  sectionByGroupId,
  nodeById,
  evidenceOpenGroupIds,
  remoteEditPresenceByKey,
  onToggleEvidence,
}: SolutionSummarySourceListProps) {
  const presentation = useMemo(
    () => normalizePresentation({ meetingTitle, meetingGoal, participants, document, groups, sectionByGroupId, nodeById }),
    [document, groups, meetingGoal, meetingTitle, nodeById, participants, sectionByGroupId],
  );

  return (
    <aside className="min-h-0 overflow-hidden border-r border-[#f1f1f1] bg-[#f8f8f8] px-[32px] pb-0 pt-[84px]">
      <div className="mb-[9px]">
        <p className="text-[10px] font-bold uppercase leading-[1.4] text-[#2e77ff]">Summary</p>
        <h3 className="mt-1 text-[16px] font-bold leading-[1.4] text-[#181818]">정리</h3>
        <p className="mt-2 text-[11px] font-extralight leading-[17px] text-[#181818]">
          지금까지 논의 내용을 정리합니다.
        </p>
      </div>

      <div className="relative h-[calc(100vh-158px)] overflow-y-auto rounded-[8px] border border-[#cecccc] bg-white px-[18px] pb-[36px] pt-[24px] shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        <SummaryCardToolIcons />

        <section className="border-b border-[#e6e6e6] pb-[24px] pr-[42px]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h4 className="text-[14px] font-bold leading-[1.4] text-[#181818]">회의 개요</h4>
            {document.used_llm ? <span className="rounded-full bg-[#eef6ff] px-2.5 py-1 text-[10px] font-bold text-[#236cf3]">AI 정리</span> : null}
          </div>
          <dl className="space-y-[11px] text-[11px] leading-[17px] text-[#181818]">
            <div>
              <dt className="font-medium">회의 목적</dt>
              <dd className="mt-1 font-extralight">{presentation.meeting_overview}</dd>
            </div>
            <div>
              <dt className="font-medium">참석자</dt>
              <dd className="mt-1 font-extralight">{presentation.attendee_summary || "참석자 정보가 없습니다."}</dd>
            </div>
          </dl>
        </section>

        <section className="border-b border-[#e6e6e6] py-[24px]">
          <h4 className="text-[16px] font-bold leading-[1.4] text-[#181818]">핵심 요약</h4>
          <p className="mt-[13px] whitespace-pre-wrap text-[11px] font-extralight leading-[17px] text-[#181818]">
            {presentation.key_summary}
          </p>
        </section>

        <section className="border-b border-[#e6e6e6] py-[24px]">
          <h4 className="text-[16px] font-bold leading-[1.4] text-[#181818]">아이디어 및 논의 기록</h4>
          <p className="mt-[14px] text-[11px] font-semibold leading-[1.4] text-[#2e77ff]">주요 아이디어</p>
          <div className="mt-[12px] space-y-[20px]">
            {presentation.idea_groups.map((group, index) => (
              <article key={`summary-idea-${group.group_id || index}`}>
                <div className="flex items-start gap-[8px]">
                  <span className="mt-[2px] grid min-h-[17px] min-w-[17px] place-items-center rounded-[3px] border border-[#aad2ff] bg-[#236cf3] px-[5px] text-[11px] font-bold leading-[1.4] text-white">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <h5 className="text-[13px] font-semibold leading-[1.4] text-[#181818]">{group.title}</h5>
                    {group.items.length > 0 ? (
                      <ul className="mt-[10px] space-y-[2px] text-[11px] font-extralight leading-[17px] text-[#181818]">
                        {group.items.map((item, itemIndex) => (
                          <li key={`summary-idea-${group.group_id || index}-${itemIndex}`}>- {item}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="pt-[24px]">
          <h4 className="text-[16px] font-bold leading-[1.4] text-[#181818]">논의 흐름</h4>
          <div className="mt-[20px] space-y-[30px]">
            {presentation.discussion_flows.map((flow, index) => {
              const remoteGroupEditPresence =
                remoteEditPresenceByKey[makeEditPresenceKey("problem_structure_group", flow.group_id)] || null;
              const evidenceOpen = evidenceOpenGroupIds.has(flow.group_id);
              const section = sectionByGroupId.get(flow.group_id);
              return (
                <article key={`summary-flow-${flow.group_id || index}`} className="text-[#181818]">
                  <div className="flex items-center gap-2">
                    <h5 className="text-[13px] font-semibold leading-[1.4]">
                      쟁점 {index + 1}. {flow.title}
                    </h5>
                    {remoteGroupEditPresence ? renderEditPresenceBadge() : null}
                  </div>
                  <div className="mt-[14px] space-y-[10px]">
                    {flow.opinions.map((opinion, opinionIndex) => (
                      <div key={`summary-flow-opinion-${flow.group_id || index}-${opinionIndex}`}>
                        <p className="text-[11px] font-medium leading-[17px]">{opinion.label}</p>
                        <p className="mt-[2px] text-[11px] font-extralight leading-[17px]">{opinion.text}</p>
                      </div>
                    ))}
                    {flow.conclusion ? (
                      <div>
                        <p className="text-[11px] font-medium leading-[17px]">정리</p>
                        <p className="mt-[2px] text-[11px] font-extralight leading-[17px]">{flow.conclusion}</p>
                      </div>
                    ) : null}
                    {section?.evidence.length ? (
                      <button
                        type="button"
                        onClick={() => onToggleEvidence(flow.group_id)}
                        className="mt-[2px] text-[10px] font-semibold text-[#236cf3]"
                      >
                        근거 발언 {evidenceOpen ? "접기" : "보기"} ({section.evidence.length})
                      </button>
                    ) : null}
                    {evidenceOpen && section?.evidence.length ? (
                      <div className="space-y-2 rounded-[8px] bg-[#f8fafc] p-3">
                        {section.evidence.slice(0, 4).map((item, evidenceIndex) => (
                          <p key={`summary-evidence-${flow.group_id}-${item.utterance_id || evidenceIndex}`} className="text-[10px] leading-[16px] text-[#4d4d4d]">
                            {item.text}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>

          {presentation.pending_items.length > 0 ? (
            <div className="mt-[30px]">
              <h5 className="text-[13px] font-semibold leading-[1.4] text-[#181818]">보류</h5>
              <ul className="mt-[10px] space-y-[2px] text-[11px] font-extralight leading-[17px] text-[#181818]">
                {presentation.pending_items.map((item, index) => (
                  <li key={`summary-pending-${index}`}>- {item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>
    </aside>
  );
});

export const SolutionFinalDocumentPanel = memo(function SolutionFinalDocumentPanel({
  paneRef,
  document,
  draftMarkdown,
  draftDirty,
  editMode,
  pending,
  saving,
  eligibleGroupCount,
  presentation,
  onSetEditMode,
  onRegenerate,
  onCopy,
  onSave,
  onMarkdownChange,
  renderPreview,
}: SolutionFinalDocumentPanelProps) {
  const displayMarkdown = editMode || draftDirty ? draftMarkdown : document.markdown;
  const hasMarkdown = Boolean(displayMarkdown.trim());
  const showEditedMarkdown = document.document_status === "edited" && !editMode && hasMarkdown;

  return (
    <section ref={paneRef} className="min-h-0 overflow-y-auto bg-white px-[28px] pb-24 pt-[84px]">
      <div className="mb-[35px]">
        <p className="text-[10px] font-bold uppercase leading-[1.4] text-[#2e77ff]">Conclusion</p>
        <h3 className="mt-1 text-[16px] font-bold leading-[1.4] text-[#181818]">결론</h3>
      </div>

      <article className="relative h-[calc(100vh-252px)] min-h-[720px] overflow-y-auto rounded-[12px] border border-black/10 bg-[radial-gradient(circle_at_100%_0%,rgba(255,224,237,0.48)_0%,rgba(255,255,255,1)_32%)] px-[34px] pb-[48px] pt-[30px] shadow-[0_1px_5px_rgba(0,0,0,0.05)]">
        <div className="absolute right-[18px] top-[12px] flex items-center gap-1">
          <IconButton label="요약 문서 다시 생성" disabled={pending || saving || eligibleGroupCount === 0} onClick={onRegenerate}>
            <RefreshIcon />
          </IconButton>
          <IconButton label="결론 카드 수정" disabled={pending || saving} onClick={() => onSetEditMode(!editMode)}>
            <EditIcon />
          </IconButton>
          <IconButton label="결론 카드 복사" disabled={!hasMarkdown} onClick={onCopy}>
            <CopyIcon />
          </IconButton>
        </div>

        <div className="inline-flex rounded-full border border-[#f9e1e8] bg-[#e667bc] px-[7px] py-[3px] text-[10px] font-bold leading-[13px] text-white shadow-[inset_0_3px_3px_rgba(255,255,255,0.15)]">
          핵심 요약
        </div>

        {document.warning ? (
          <p className="mt-4 rounded-[8px] bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-700">{document.warning}</p>
        ) : null}

        {editMode ? (
          <div className="mt-[22px]">
            <textarea
              value={draftMarkdown}
              onChange={(event) => onMarkdownChange(event.target.value)}
              placeholder={pending ? "AI가 요약 문서를 생성하는 중입니다." : "결론 문서를 입력해 주세요."}
              className="min-h-[560px] w-full resize-none rounded-[12px] border border-[#dbe3ef] bg-white/90 px-5 py-4 text-[13px] leading-7 text-[#242424] outline-none transition placeholder:text-[#90a1b9] focus:border-[#236cf3] focus:ring-2 focus:ring-[#236cf3]/10"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => onSetEditMode(false)}
                className="rounded-full bg-[#eff0f6] px-4 py-2 text-[12px] font-semibold text-[#505050]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void onSave()}
                disabled={pending || saving || !draftDirty}
                className="rounded-full bg-[#236cf3] px-5 py-2 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#d8d8d8]"
              >
                {saving ? "저장 중" : "저장"}
              </button>
            </div>
          </div>
        ) : showEditedMarkdown ? (
          <div className="mt-[22px] min-h-[560px] overflow-hidden rounded-[12px]">
            {renderPreview(displayMarkdown, () => onSetEditMode(true))}
          </div>
        ) : (
          <div className="mt-[7px]">
            <h2 className="max-w-[274px] text-[24px] font-bold leading-[1.4] text-[#242424]">
              {presentation.conclusion.title || "회의 핵심 결론"}
            </h2>
            <p className="mt-[6px] max-w-[459px] text-[12px] font-medium leading-[1.4] text-[#767676]">
              {presentation.conclusion.summary || presentation.key_summary}
            </p>
            <div className="mt-[24px] h-px bg-[#d8d8d8]" />
            <div className="mt-[30px] space-y-[18px]">
              {presentation.conclusion.groups.length > 0 ? (
                presentation.conclusion.groups.map((group, index) => (
                  <section key={`summary-conclusion-${group.group_id || index}`} className="grid grid-cols-[18px_minmax(0,1fr)] gap-[8px]">
                    <span className="mt-[2px] grid min-h-[18px] min-w-[18px] place-items-center rounded-[4px] border border-white bg-[#909090] px-[6px] text-[12px] font-bold leading-[1.4] text-white">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <h4 className="text-[13px] font-bold leading-[1.4] text-[#3b3b3b]">
                        {group.title}
                        {statusSuffix(group)}
                      </h4>
                      {group.bullets.length > 0 ? (
                        <ul className="mt-[12px] list-disc space-y-[2px] pl-[18px] text-[11px] font-medium leading-[1.51] text-[#767676]">
                          {group.bullets.map((bullet, bulletIndex) => (
                            <li key={`summary-conclusion-${group.group_id || index}-${bulletIndex}`}>{bullet}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </section>
                ))
              ) : (
                <p className="text-[12px] leading-6 text-[#767676]">요약 문서가 아직 없습니다.</p>
              )}
            </div>
          </div>
        )}
      </article>
    </section>
  );
});

export { normalizePresentation as buildSolutionPresentationModel };
