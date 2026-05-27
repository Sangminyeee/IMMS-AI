"use client";

import { memo, useMemo, type ReactNode, type RefObject } from "react";
import {
  createSummaryDocumentBlock,
} from "@/components/canvas/summaryDocumentHelpers";
import type {
  CanvasEditPresencePayload,
  CanvasFinalSolutionSummary,
  CanvasSummaryDocumentBlock,
  CanvasSummaryStructuredConclusionGroup,
  CanvasSummaryStructuredDiscussionFlow,
  CanvasSummaryStructuredDocument,
  CanvasSummaryStructuredFlowSection,
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
  draftBlocks: CanvasSummaryDocumentBlock[];
  draftMarkdown: string;
  draftDirty: boolean;
  editMode: boolean;
  pending: boolean;
  saving: boolean;
  eligibleGroupCount: number;
  presentation: SolutionPresentationModel;
  remoteEditPresenceByKey: Record<string, CanvasEditPresencePayload>;
  onSetEditMode: (editMode: boolean) => void;
  onRegenerate: () => void | Promise<void>;
  onCopy: () => void | Promise<void>;
  onSave: () => void | Promise<void>;
  onBlocksChange: (blocks: CanvasSummaryDocumentBlock[]) => void;
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
  const flowSections: CanvasSummaryStructuredFlowSection[] = input.groups.map((group, index) => {
    const section = input.sectionByGroupId.get(group.id);
    const evidence = section?.evidence || [];
    const groupIdea = ideaGroups.find((item) => item.group_id === group.id);
    const keyPoints = compactList([...(groupIdea?.items || []), section?.rationale], 6);
    const opinions = evidence.slice(0, 2).map((item, opinionIndex) => ({
      label: `${String.fromCharCode(65 + opinionIndex)} 의견`,
      text: item.text,
    }));
    return {
      section_id: `flow-${group.id || index}`,
      group_id: group.id,
      title: group.title || section?.title || "논의 흐름",
      time_range: "",
      trigger: keyPoints[0] || "",
      narrative: keyPoints.slice(0, 3).join(" "),
      key_points: keyPoints,
      opinions,
      settlement: section?.rationale || keyPoints[keyPoints.length - 1] || "",
      open_questions: group.status === "final" ? [] : compactList([group.title || section?.title], 1),
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
    flow_sections: structured?.flow_sections?.length ? structured.flow_sections : flowSections,
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

function PlusIcon() {
  return (
    <svg aria-hidden="true" className="h-[13px] w-[13px]" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" className="h-[13px] w-[13px]" viewBox="0 0 24 24" fill="none">
      <path d="M4 7h16M9 7V5.8A1.8 1.8 0 0 1 10.8 4h2.4A1.8 1.8 0 0 1 15 5.8V7m-8 0 .7 12.2A2 2 0 0 0 9.7 21h4.6a2 2 0 0 0 2-1.8L17 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SummaryCardToolIcons() {
  return (
    <div className="absolute right-[18px] top-[24px] flex items-center gap-[9px] text-[#9a9a9a]">
      <CopyIcon />
    </div>
  );
}

function summaryBlockLabel(type: CanvasSummaryDocumentBlock["type"]) {
  if (type === "heading") return "제목";
  if (type === "paragraph") return "문단";
  if (type === "bullets") return "목록";
  return "표";
}

function normalizeTableRow(row: string[], columnCount: number) {
  return Array.from({ length: columnCount }, (_, index) => row[index] || "");
}

function updateSummaryDocumentBlock(
  blocks: CanvasSummaryDocumentBlock[],
  blockId: string,
  updater: (block: CanvasSummaryDocumentBlock) => CanvasSummaryDocumentBlock,
) {
  return blocks.map((block) => (block.id === blockId ? updater(block) : block));
}

function moveSummaryDocumentBlock(blocks: CanvasSummaryDocumentBlock[], blockId: string, direction: -1 | 1) {
  const index = blocks.findIndex((block) => block.id === blockId);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= blocks.length) return blocks;
  const next = blocks.slice();
  const [block] = next.splice(index, 1);
  next.splice(targetIndex, 0, block);
  return next;
}

function DocumentToolButton({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-[30px] items-center gap-[5px] rounded-full border border-[#dce7fb] bg-white px-3 text-[11px] font-bold leading-none text-[#236cf3] shadow-[0_1px_3px_rgba(35,108,243,0.08)] transition hover:bg-[#f5f9ff] disabled:cursor-not-allowed disabled:opacity-45"
    >
      <PlusIcon />
      {children}
    </button>
  );
}

function DocumentMiniButton({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-[26px] items-center justify-center rounded-full border border-[#dbe3ef] bg-white px-2.5 text-[10px] font-bold text-[#767676] transition hover:border-[#236cf3] hover:text-[#236cf3] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function DocumentInput({
  value,
  disabled,
  placeholder,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className="h-[34px] w-full rounded-[8px] border border-[#dbe3ef] bg-white px-3 text-[12px] font-medium leading-none text-[#242424] outline-none transition placeholder:text-[#a8b3c4] focus:border-[#236cf3] focus:ring-2 focus:ring-[#236cf3]/10 disabled:bg-[#f6f7fa]"
    />
  );
}

function DocumentTextarea({
  value,
  disabled,
  placeholder,
  minHeight = 96,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  placeholder?: string;
  minHeight?: number;
  onChange: (value: string) => void;
}) {
  return (
    <textarea
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      style={{ minHeight }}
      className="w-full resize-y rounded-[8px] border border-[#dbe3ef] bg-white px-3 py-2 text-[12px] font-medium leading-[20px] text-[#242424] outline-none transition placeholder:text-[#a8b3c4] focus:border-[#236cf3] focus:ring-2 focus:ring-[#236cf3]/10 disabled:bg-[#f6f7fa]"
    />
  );
}

function SolutionDocumentBlocksView({
  blocks,
  fallbackTitle,
  fallbackSummary,
}: {
  blocks: CanvasSummaryDocumentBlock[];
  fallbackTitle: string;
  fallbackSummary: string;
}) {
  if (blocks.length === 0) {
    return (
      <div className="mt-[7px]">
        <h2 className="max-w-[420px] text-[24px] font-bold leading-[1.4] text-[#242424]">{fallbackTitle}</h2>
        {fallbackSummary ? (
          <p className="mt-[6px] max-w-[520px] whitespace-pre-wrap text-[12px] font-medium leading-[1.55] text-[#767676]">
            {fallbackSummary}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-[7px] space-y-[18px]">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          const level = block.level || (index === 0 ? 1 : 2);
          const headingClass =
            level === 1
              ? "text-[24px] font-bold leading-[1.4] text-[#242424]"
              : level === 2
                ? "text-[15px] font-bold leading-[1.45] text-[#242424]"
                : "text-[13px] font-bold leading-[1.45] text-[#3b3b3b]";
          return (
            <h2 key={block.id} className={headingClass}>
              {block.text}
            </h2>
          );
        }

        if (block.type === "paragraph") {
          return (
            <p key={block.id} className="max-w-[560px] whitespace-pre-wrap text-[12px] font-medium leading-[1.62] text-[#767676]">
              {block.text}
            </p>
          );
        }

        if (block.type === "bullets") {
          return (
            <ul key={block.id} className="list-disc space-y-[5px] pl-[18px] text-[12px] font-medium leading-[1.58] text-[#767676]">
              {block.items.map((item, itemIndex) => (
                <li key={`${block.id}-item-${itemIndex}`}>{item}</li>
              ))}
            </ul>
          );
        }

        const columns = block.columns.length > 0 ? block.columns : ["항목", "내용"];
        const rows = block.rows.length > 0 ? block.rows : [];
        return (
          <section key={block.id} className="space-y-[10px]">
            {block.title ? <h3 className="text-[13px] font-bold leading-[1.45] text-[#3b3b3b]">{block.title}</h3> : null}
            <div className="overflow-x-auto rounded-[10px] border border-[#dbe3ef] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.03)]">
              <table className="min-w-full border-collapse text-left text-[11px] leading-[1.45]">
                <thead>
                  <tr className="bg-[#f4f8ff] text-[#236cf3]">
                    {columns.map((column, columnIndex) => (
                      <th key={`${block.id}-head-${columnIndex}`} className="border-b border-[#dbe3ef] px-3 py-2 font-bold">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-[#4d4d4d]">
                  {rows.map((row, rowIndex) => (
                    <tr key={`${block.id}-row-${rowIndex}`} className="border-t border-[#edf1f6] first:border-t-0">
                      {normalizeTableRow(row, columns.length).map((cell, cellIndex) => (
                        <td key={`${block.id}-cell-${rowIndex}-${cellIndex}`} className="px-3 py-2 align-top font-medium">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function SolutionDocumentBlockEditor({
  blocks,
  disabled,
  onChange,
}: {
  blocks: CanvasSummaryDocumentBlock[];
  disabled?: boolean;
  onChange: (blocks: CanvasSummaryDocumentBlock[]) => void;
}) {
  const addBlock = (type: CanvasSummaryDocumentBlock["type"]) => {
    onChange([...blocks, createSummaryDocumentBlock(type)]);
  };

  const removeBlock = (blockId: string) => {
    onChange(blocks.filter((block) => block.id !== blockId));
  };

  return (
    <div className="mt-[22px] space-y-[14px]">
      <div className="flex flex-wrap gap-2">
        {(["heading", "paragraph", "bullets", "table"] as const).map((type) => (
          <DocumentToolButton key={type} disabled={disabled} onClick={() => addBlock(type)}>
            {summaryBlockLabel(type)}
          </DocumentToolButton>
        ))}
      </div>

      {blocks.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-[#dbe3ef] bg-white/70 px-4 py-8 text-center text-[12px] font-medium text-[#90a1b9]">
          문서 블록이 없습니다.
        </div>
      ) : (
        <div className="space-y-[12px]">
          {blocks.map((block, index) => (
            <section key={block.id} className="rounded-[12px] border border-[#dbe3ef] bg-white/90 p-[14px] shadow-[0_1px_4px_rgba(0,0,0,0.03)]">
              <div className="mb-[10px] flex items-center justify-between gap-3">
                <span className="rounded-full bg-[#f4f8ff] px-2.5 py-1 text-[10px] font-bold text-[#236cf3]">
                  {summaryBlockLabel(block.type)}
                </span>
                <div className="flex items-center gap-1.5">
                  <DocumentMiniButton disabled={disabled || index === 0} onClick={() => onChange(moveSummaryDocumentBlock(blocks, block.id, -1))}>
                    위로
                  </DocumentMiniButton>
                  <DocumentMiniButton disabled={disabled || index === blocks.length - 1} onClick={() => onChange(moveSummaryDocumentBlock(blocks, block.id, 1))}>
                    아래로
                  </DocumentMiniButton>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => removeBlock(block.id)}
                    className="grid h-[26px] w-[26px] place-items-center rounded-full border border-[#f0d8d8] bg-white text-[#cf3d3d] transition hover:bg-[#fff5f5] disabled:cursor-not-allowed disabled:opacity-45"
                    aria-label="블록 삭제"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>

              {block.type === "heading" ? (
                <div className="grid grid-cols-[86px_minmax(0,1fr)] gap-2">
                  <select
                    value={block.level || 2}
                    disabled={disabled}
                    onChange={(event) => {
                      const level = Number(event.target.value) as 1 | 2 | 3;
                      onChange(updateSummaryDocumentBlock(blocks, block.id, (current) => (current.type === "heading" ? { ...current, level } : current)));
                    }}
                    className="h-[34px] rounded-[8px] border border-[#dbe3ef] bg-white px-2 text-[12px] font-bold text-[#4d4d4d] outline-none focus:border-[#236cf3] disabled:bg-[#f6f7fa]"
                  >
                    <option value={1}>H1</option>
                    <option value={2}>H2</option>
                    <option value={3}>H3</option>
                  </select>
                  <DocumentInput
                    value={block.text}
                    disabled={disabled}
                    placeholder="제목"
                    onChange={(text) =>
                      onChange(updateSummaryDocumentBlock(blocks, block.id, (current) => (current.type === "heading" ? { ...current, text } : current)))
                    }
                  />
                </div>
              ) : null}

              {block.type === "paragraph" ? (
                <DocumentTextarea
                  value={block.text}
                  disabled={disabled}
                  placeholder="문단"
                  onChange={(text) =>
                    onChange(updateSummaryDocumentBlock(blocks, block.id, (current) => (current.type === "paragraph" ? { ...current, text } : current)))
                  }
                />
              ) : null}

              {block.type === "bullets" ? (
                <div className="space-y-2">
                  {(block.items.length > 0 ? block.items : [""]).map((item, itemIndex) => (
                    <div key={`${block.id}-edit-item-${itemIndex}`} className="grid grid-cols-[minmax(0,1fr)_26px] gap-2">
                      <DocumentInput
                        value={item}
                        disabled={disabled}
                        placeholder="항목"
                        onChange={(text) =>
                          onChange(
                            updateSummaryDocumentBlock(blocks, block.id, (current) => {
                              if (current.type !== "bullets") return current;
                              const items = current.items.length > 0 ? current.items.slice() : [""];
                              items[itemIndex] = text;
                              return { ...current, items };
                            }),
                          )
                        }
                      />
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          onChange(
                            updateSummaryDocumentBlock(blocks, block.id, (current) => {
                              if (current.type !== "bullets") return current;
                              const items = current.items.filter((_, index) => index !== itemIndex);
                              return { ...current, items: items.length > 0 ? items : [""] };
                            }),
                          )
                        }
                        className="grid h-[34px] w-[26px] place-items-center rounded-full text-[#cf3d3d] transition hover:bg-[#fff5f5] disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="항목 삭제"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  ))}
                  <DocumentMiniButton
                    disabled={disabled}
                    onClick={() =>
                      onChange(updateSummaryDocumentBlock(blocks, block.id, (current) => (current.type === "bullets" ? { ...current, items: [...current.items, ""] } : current)))
                    }
                  >
                    항목 추가
                  </DocumentMiniButton>
                </div>
              ) : null}

              {block.type === "table" ? (
                <TableBlockEditor block={block} blocks={blocks} disabled={disabled} onChange={onChange} />
              ) : null}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function TableBlockEditor({
  block,
  blocks,
  disabled,
  onChange,
}: {
  block: Extract<CanvasSummaryDocumentBlock, { type: "table" }>;
  blocks: CanvasSummaryDocumentBlock[];
  disabled?: boolean;
  onChange: (blocks: CanvasSummaryDocumentBlock[]) => void;
}) {
  const columns = block.columns.length > 0 ? block.columns : ["항목", "내용"];
  const rows = block.rows.length > 0 ? block.rows.map((row) => normalizeTableRow(row, columns.length)) : [columns.map(() => "")];

  const updateTable = (updater: (table: Extract<CanvasSummaryDocumentBlock, { type: "table" }>) => Extract<CanvasSummaryDocumentBlock, { type: "table" }>) => {
    onChange(updateSummaryDocumentBlock(blocks, block.id, (current) => (current.type === "table" ? updater(current) : current)));
  };

  return (
    <div className="space-y-[10px]">
      <DocumentInput value={block.title || ""} disabled={disabled} placeholder="표 제목" onChange={(title) => updateTable((current) => ({ ...current, title }))} />

      <div className="overflow-x-auto rounded-[10px] border border-[#dbe3ef] bg-white">
        <table className="min-w-full border-collapse text-left">
          <thead>
            <tr className="bg-[#f4f8ff]">
              {columns.map((column, columnIndex) => (
                <th key={`${block.id}-edit-column-${columnIndex}`} className="min-w-[118px] border-b border-[#dbe3ef] px-2 py-2 align-top">
                  <div className="flex items-center gap-1.5">
                    <DocumentInput
                      value={column}
                      disabled={disabled}
                      placeholder="열"
                      onChange={(text) =>
                        updateTable((current) => {
                          const nextColumns = columns.slice();
                          nextColumns[columnIndex] = text;
                          return { ...current, columns: nextColumns, rows };
                        })
                      }
                    />
                    <button
                      type="button"
                      disabled={disabled || columns.length <= 1}
                      onClick={() =>
                        updateTable((current) => ({
                          ...current,
                          columns: columns.filter((_, index) => index !== columnIndex),
                          rows: rows.map((row) => row.filter((_, index) => index !== columnIndex)),
                        }))
                      }
                      className="grid h-[28px] w-[24px] shrink-0 place-items-center rounded-full text-[#cf3d3d] transition hover:bg-[#fff5f5] disabled:cursor-not-allowed disabled:opacity-35"
                      aria-label="열 삭제"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </th>
              ))}
              <th className="w-[60px] border-b border-[#dbe3ef] px-2 py-2">
                <DocumentMiniButton
                  disabled={disabled}
                  onClick={() =>
                    updateTable((current) => ({
                      ...current,
                      columns: [...columns, "새 열"],
                      rows: rows.map((row) => [...row, ""]),
                    }))
                  }
                >
                  열
                </DocumentMiniButton>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`${block.id}-edit-row-${rowIndex}`} className="border-t border-[#edf1f6] first:border-t-0">
                {row.map((cell, cellIndex) => (
                  <td key={`${block.id}-edit-cell-${rowIndex}-${cellIndex}`} className="min-w-[118px] px-2 py-2 align-top">
                    <DocumentTextarea
                      value={cell}
                      disabled={disabled}
                      minHeight={58}
                      placeholder="내용"
                      onChange={(text) =>
                        updateTable((current) => {
                          const nextRows = rows.map((currentRow, currentRowIndex) =>
                            currentRowIndex === rowIndex ? currentRow.map((currentCell, currentCellIndex) => (currentCellIndex === cellIndex ? text : currentCell)) : currentRow,
                          );
                          return { ...current, columns, rows: nextRows };
                        })
                      }
                    />
                  </td>
                ))}
                <td className="w-[60px] px-2 py-2 align-top">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      updateTable((current) => {
                        const nextRows = rows.filter((_, index) => index !== rowIndex);
                        return { ...current, columns, rows: nextRows.length > 0 ? nextRows : [columns.map(() => "")] };
                      })
                    }
                    className="grid h-[30px] w-[30px] place-items-center rounded-full text-[#cf3d3d] transition hover:bg-[#fff5f5] disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="행 삭제"
                  >
                    <TrashIcon />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DocumentMiniButton disabled={disabled} onClick={() => updateTable((current) => ({ ...current, columns, rows: [...rows, columns.map(() => "")] }))}>
        행 추가
      </DocumentMiniButton>
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
            {presentation.flow_sections.map((flow, index) => {
              const remoteGroupEditPresence =
                remoteEditPresenceByKey[makeEditPresenceKey("problem_structure_group", flow.group_id)] || null;
              const evidenceOpen = evidenceOpenGroupIds.has(flow.group_id);
              const section = sectionByGroupId.get(flow.group_id);
              return (
                <article key={`summary-flow-${flow.section_id || flow.group_id || index}`} className="text-[#181818]">
                  <div className="flex items-start gap-2">
                    <span className="mt-[1px] text-[11px] font-bold leading-[1.4] text-[#2e77ff]">{index + 1}</span>
                    <div className="min-w-0">
                      <h5 className="text-[13px] font-semibold leading-[1.4]">{flow.title}</h5>
                      {flow.time_range ? (
                        <p className="mt-[2px] text-[10px] font-medium leading-[1.4] text-[#90a1b9]">{flow.time_range}</p>
                      ) : null}
                    </div>
                    {remoteGroupEditPresence ? renderEditPresenceBadge() : null}
                  </div>
                  <div className="mt-[12px] space-y-[12px]">
                    {flow.trigger ? (
                      <div>
                        <p className="text-[11px] font-medium leading-[17px]">논점이 나온 이유</p>
                        <p className="mt-[2px] text-[11px] font-extralight leading-[17px]">{flow.trigger}</p>
                      </div>
                    ) : null}
                    {flow.narrative ? (
                      <p className="rounded-[8px] bg-[#f9f9f9] px-3 py-2 text-[11px] font-extralight leading-[17px]">
                        {flow.narrative}
                      </p>
                    ) : null}
                    {flow.key_points.length > 0 ? (
                      <div>
                        <p className="text-[11px] font-medium leading-[17px]">핵심 논의</p>
                        <ul className="mt-[4px] space-y-[2px] text-[11px] font-extralight leading-[17px]">
                          {flow.key_points.map((item, pointIndex) => (
                            <li key={`summary-flow-point-${flow.section_id || flow.group_id || index}-${pointIndex}`}>- {item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {flow.opinions.map((opinion, opinionIndex) => (
                      <div key={`summary-flow-opinion-${flow.group_id || index}-${opinionIndex}`}>
                        <p className="text-[11px] font-medium leading-[17px]">{opinion.label}</p>
                        <p className="mt-[2px] text-[11px] font-extralight leading-[17px]">{opinion.text}</p>
                      </div>
                    ))}
                    {flow.settlement ? (
                      <div>
                        <p className="text-[11px] font-medium leading-[17px]">정리된 방향</p>
                        <p className="mt-[2px] text-[11px] font-extralight leading-[17px]">{flow.settlement}</p>
                      </div>
                    ) : null}
                    {flow.open_questions.length > 0 ? (
                      <div>
                        <p className="text-[11px] font-medium leading-[17px]">남은 확인 사항</p>
                        <ul className="mt-[4px] space-y-[2px] text-[11px] font-extralight leading-[17px]">
                          {flow.open_questions.map((item, questionIndex) => (
                            <li key={`summary-flow-question-${flow.section_id || flow.group_id || index}-${questionIndex}`}>- {item}</li>
                          ))}
                        </ul>
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
  draftBlocks,
  draftMarkdown,
  draftDirty,
  editMode,
  pending,
  saving,
  eligibleGroupCount,
  presentation,
  remoteEditPresenceByKey,
  onSetEditMode,
  onRegenerate,
  onCopy,
  onSave,
  onBlocksChange,
  onMarkdownChange,
  renderPreview,
}: SolutionFinalDocumentPanelProps) {
  const displayMarkdown = editMode || draftDirty ? draftMarkdown : document.markdown;
  const displayBlocks = editMode || draftDirty ? draftBlocks : document.document_blocks || [];
  const hasMarkdown = Boolean(displayMarkdown.trim());
  const hasBlocks = displayBlocks.length > 0;
  const hasDocumentContent = hasMarkdown || hasBlocks;
  const showLegacyMarkdown = !editMode && !hasBlocks && hasMarkdown;
  const remoteSummaryEditPresence = remoteEditPresenceByKey[makeEditPresenceKey("summary_document", "final")] || null;
  const remoteSummaryEditor = remoteSummaryEditPresence?.updated_by || "다른 사용자";
  const editDisabled = pending || saving || Boolean(remoteSummaryEditPresence && !editMode);

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
          <IconButton label="결론 카드 수정" disabled={editDisabled} onClick={() => onSetEditMode(!editMode)}>
            <EditIcon />
          </IconButton>
          <IconButton label="결론 카드 복사" disabled={!hasDocumentContent} onClick={onCopy}>
            <CopyIcon />
          </IconButton>
        </div>

        <div className="inline-flex rounded-full border border-[#f9e1e8] bg-[#e667bc] px-[7px] py-[3px] text-[10px] font-bold leading-[13px] text-white shadow-[inset_0_3px_3px_rgba(255,255,255,0.15)]">
          핵심 요약
        </div>

        {document.warning ? (
          <p className="mt-4 rounded-[8px] bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-700">{document.warning}</p>
        ) : null}

        {remoteSummaryEditPresence && !editMode ? (
          <p className="mt-4 rounded-[8px] bg-[#eef6ff] px-3 py-2 text-[11px] font-medium leading-5 text-[#236cf3]">
            {remoteSummaryEditor}님이 결론을 수정 중입니다.
          </p>
        ) : null}

        {editMode ? (
          <div className="mt-[22px]">
            {showLegacyMarkdown && draftBlocks.length === 0 ? (
              <div className="mb-4 overflow-hidden rounded-[12px] border border-[#dbe3ef]">
                {renderPreview(displayMarkdown, () => undefined)}
              </div>
            ) : null}
            <SolutionDocumentBlockEditor blocks={draftBlocks} disabled={pending || saving} onChange={onBlocksChange} />
            <textarea
              value={draftMarkdown}
              onChange={(event) => onMarkdownChange(event.target.value)}
              aria-hidden="true"
              tabIndex={-1}
              className="sr-only"
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
        ) : showLegacyMarkdown ? (
          <div className="mt-[22px] min-h-[560px] overflow-hidden rounded-[12px]">
            {renderPreview(displayMarkdown, () => onSetEditMode(true))}
          </div>
        ) : (
          <SolutionDocumentBlocksView
            blocks={displayBlocks}
            fallbackTitle={presentation.conclusion.title || "회의 핵심 결론"}
            fallbackSummary={presentation.conclusion.summary || presentation.key_summary}
          />
        )}
      </article>
    </section>
  );
});

export { normalizePresentation as buildSolutionPresentationModel };
