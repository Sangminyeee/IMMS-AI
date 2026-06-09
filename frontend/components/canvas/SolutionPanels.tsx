"use client";

import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import Placeholder from "@tiptap/extension-placeholder";
import type {
  CanvasArtifactGenerationStatus,
  CanvasEditPresencePayload,
  CanvasFinalSolutionSummary,
  CanvasSummaryDocumentBlock,
  CanvasSummaryTableColumn,
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
  generationStatus: CanvasArtifactGenerationStatus;
  generationError: string;
  generationDetail?: string;
  generationPhase?: string;
  generationRetryable?: boolean;
  saving: boolean;
  eligibleGroupCount: number;
  presentation: SolutionPresentationModel;
  remoteEditPresenceByKey: Record<string, CanvasEditPresencePayload>;
  onSetEditMode: (editMode: boolean) => void;
  onRegenerate: () => void | Promise<void>;
  onRefreshCache: () => void | Promise<void>;
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

function SparkleIcon({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" fill="currentColor" />
      <path d="m18.5 14 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2ZM5.5 14.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6.6-1.6Z" fill="currentColor" />
    </svg>
  );
}

function SummaryCardToolIcons() {
  return (
    <div className="absolute right-[18px] top-[24px] flex items-center gap-[9px] text-[#9a9a9a]" aria-hidden="true">
      <CopyIcon />
    </div>
  );
}

function fallbackDocumentTableColumns(blockId: string): CanvasSummaryTableColumn[] {
  return [
    { id: `${blockId}-col-item`, title: "항목", type: "text" },
    { id: `${blockId}-col-content`, title: "내용", type: "text" },
  ];
}

const MAX_BULLET_INDENT = 3;

function getBulletIndent(item: string) {
  const match = item.match(/^\t*/);
  return Math.min(MAX_BULLET_INDENT, match?.[0].length || 0);
}

function getBulletText(item: string) {
  return item.replace(/^\t+/, "");
}

function withBulletIndent(text: string, indent: number) {
  return `${"\t".repeat(Math.max(0, Math.min(MAX_BULLET_INDENT, indent)))}${text}`;
}

function stableEditorId(prefix: string, seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  return `${prefix}-${Math.abs(hash).toString(36)}`;
}

function createTiptapTextContent(text: string): JSONContent[] {
  return text ? [{ type: "text", text }] : [];
}

function createTiptapParagraph(text = ""): JSONContent {
  return { type: "paragraph", content: createTiptapTextContent(text) };
}

function createTiptapTableCell(type: "tableCell" | "tableHeader", text: string): JSONContent {
  return {
    type,
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: [createTiptapParagraph(text)],
  };
}

function summaryBlocksToTiptapContent(blocks: CanvasSummaryDocumentBlock[]): JSONContent {
  const content: JSONContent[] = [];

  blocks.forEach((block) => {
    if (block.type === "heading") {
      content.push({
        type: "heading",
        attrs: { level: block.level || 2 },
        content: createTiptapTextContent(block.text),
      });
      return;
    }

    if (block.type === "paragraph") {
      content.push(createTiptapParagraph(block.text));
      return;
    }

    if (block.type === "bullets") {
      content.push({
        type: "bulletList",
        content: block.items.map((item) => ({
          type: "listItem",
          content: [createTiptapParagraph(getBulletText(item))],
        })),
      });
      return;
    }

    if (block.type === "table") {
      if (block.title?.trim()) {
        content.push({
          type: "heading",
          attrs: { level: 3 },
          content: createTiptapTextContent(block.title.trim()),
        });
      }

      const columns = block.columns.length > 0 ? block.columns : fallbackDocumentTableColumns(block.id);
      const rows = block.rows.length > 0 ? block.rows : [];
      content.push({
        type: "table",
        content: [
          {
            type: "tableRow",
            content: columns.map((column) => createTiptapTableCell("tableHeader", column.title)),
          },
          ...rows.map((row) => ({
            type: "tableRow",
            content: columns.map((column) => createTiptapTableCell("tableCell", row.cells?.[column.id] || "")),
          })),
        ],
      });
    }
  });

  return { type: "doc", content: content.length > 0 ? content : [createTiptapParagraph()] };
}

function tiptapNodeText(node: JSONContent | undefined): string {
  if (!node) return "";
  if (typeof node.text === "string") return node.text;
  return (node.content || []).map((child) => tiptapNodeText(child)).join("");
}

function extractTiptapBulletItems(node: JSONContent, depth = 0): string[] {
  if (node.type === "listItem") {
    const paragraphText = (node.content || [])
      .filter((child) => child.type === "paragraph")
      .map((child) => tiptapNodeText(child).trim())
      .filter(Boolean);
    const nested = (node.content || [])
      .filter((child) => child.type === "bulletList")
      .flatMap((child) => extractTiptapBulletItems(child, depth + 1));
    return [
      ...paragraphText.map((text) => withBulletIndent(text, depth)),
      ...nested,
    ];
  }

  return (node.content || []).flatMap((child) => extractTiptapBulletItems(child, depth));
}

function tiptapTableToSummaryBlock(node: JSONContent, index: number, title = ""): CanvasSummaryDocumentBlock | null {
  const rows = (node.content || []).filter((child) => child.type === "tableRow");
  if (rows.length === 0) return null;

  const firstRowCells = rows[0].content || [];
  const columns = firstRowCells.map((cell, cellIndex) => ({
    id: stableEditorId("col", `${index}:${cellIndex}:${tiptapNodeText(cell) || cellIndex}`),
    title: tiptapNodeText(cell).trim() || `열 ${cellIndex + 1}`,
    type: "text",
  }));
  const nextColumns = columns.length > 0 ? columns : fallbackDocumentTableColumns(`tiptap-table-${index}`);
  const bodyRows = rows.slice(1).map((row, rowIndex) => ({
    id: stableEditorId("row", `${index}:${rowIndex}:${tiptapNodeText(row)}`),
    cells: Object.fromEntries(
      nextColumns.map((column, cellIndex) => [column.id, tiptapNodeText(row.content?.[cellIndex]).trim()]),
    ),
  }));

  return {
    id: stableEditorId("table", `${index}:${title}:${tiptapNodeText(node)}`),
    type: "table",
    title,
    columns: nextColumns,
    rows: bodyRows,
  };
}

function tiptapContentToSummaryBlocks(content: JSONContent): CanvasSummaryDocumentBlock[] {
  const blocks: CanvasSummaryDocumentBlock[] = [];
  const nodes = content.content || [];

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.type === "heading") {
      const text = tiptapNodeText(node).trim();
      const nextNode = nodes[index + 1];
      if (text && nextNode?.type === "table" && (node.attrs?.level || 2) >= 3) {
        const tableBlock = tiptapTableToSummaryBlock(nextNode, index + 1, text);
        if (tableBlock) blocks.push(tableBlock);
        index += 1;
        continue;
      }
      if (text) {
        const level = node.attrs?.level === 1 || node.attrs?.level === 2 || node.attrs?.level === 3 ? node.attrs.level : 2;
        blocks.push({ id: stableEditorId("heading", `${index}:${text}`), type: "heading", text, level });
      }
      continue;
    }

    if (node.type === "paragraph") {
      const text = tiptapNodeText(node).trim();
      if (text) blocks.push({ id: stableEditorId("paragraph", `${index}:${text}`), type: "paragraph", text });
      continue;
    }

    if (node.type === "bulletList") {
      const items = extractTiptapBulletItems(node).filter((item) => getBulletText(item).trim());
      if (items.length > 0) blocks.push({ id: stableEditorId("bullets", `${index}:${items.join("|")}`), type: "bullets", items });
      continue;
    }

    if (node.type === "table") {
      const tableBlock = tiptapTableToSummaryBlock(node, index);
      if (tableBlock) blocks.push(tableBlock);
    }
  }

  return blocks.slice(0, 80);
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
  const visibleBlocks = useMemo(() => blocks.filter((block, index) => {
    if (block.type !== "heading" || (block.level || 2) === 1) return true;
    const nextBlock = blocks.slice(index + 1).find((item) => item.type !== "paragraph");
    if (nextBlock?.type === "table" && nextBlock.title?.trim() === block.text.trim()) {
      return false;
    }
    const previousBlock = blocks[index - 1];
    if (previousBlock?.type === "heading" && previousBlock.text.trim() === block.text.trim()) {
      return false;
    }
    return true;
  }), [blocks]);

  const sectionNumberByBlockId = useMemo(() => {
    const nextMap = new Map<string, number>();
    let nextNumber = 0;
    visibleBlocks.forEach((block) => {
      if (block.type === "heading") {
        const level = block.level || 2;
        if (level === 1) return;
      } else if (block.type !== "table" || !block.title) {
        return;
      }
      nextNumber += 1;
      nextMap.set(block.id, nextNumber);
    });
    return nextMap;
  }, [visibleBlocks]);

  if (visibleBlocks.length === 0) {
    return (
      <div className="mt-[7px]">
        <h2 className="max-w-[560px] text-[24px] font-bold leading-[1.42] tracking-[-0.6px] text-[#181818]">{fallbackTitle}</h2>
        {fallbackSummary ? (
          <p className="mt-[10px] max-w-[620px] whitespace-pre-wrap text-[12px] font-medium leading-[1.7] tracking-[-0.03px] text-[#767676]">
            {fallbackSummary}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-[7px] space-y-[30px]">
      {visibleBlocks.map((block, index) => {
        if (block.type === "heading") {
          const level = block.level || (index === 0 ? 1 : 2);
          if (level === 1) {
            return (
              <h2 key={block.id} className="max-w-[570px] text-[24px] font-bold leading-[1.42] tracking-[-0.6px] text-[#181818]">
                {block.text}
              </h2>
            );
          }

          const sectionNumber = sectionNumberByBlockId.get(block.id) || 1;
          return (
            <h2 key={block.id} className="flex items-center gap-[10px] text-[16px] font-bold leading-[1.4] tracking-[-0.04px] text-[#181818]">
              <span className="grid h-[17px] min-w-[17px] place-items-center rounded-[3px] bg-[#8f8f8f] px-[4px] text-[11px] font-bold leading-none text-white">
                {sectionNumber}
              </span>
              {block.text}
            </h2>
          );
        }

        if (block.type === "paragraph") {
          const previousBlock = blocks[index - 1];
          const nextIsSection =
            index === 1 &&
            previousBlock?.type === "heading" &&
            (previousBlock.level || 1) === 1;
          return (
            <div key={block.id} className={nextIsSection ? "border-b border-[#d7dce5] pb-[19px]" : ""}>
              <p className="max-w-[620px] whitespace-pre-wrap text-[12px] font-medium leading-[1.7] tracking-[-0.03px] text-[#767676]">
                {block.text}
              </p>
            </div>
          );
        }

        if (block.type === "bullets") {
          return (
            <ul key={block.id} className="space-y-[5px] pl-[27px] text-[12px] font-medium leading-[1.65] tracking-[-0.03px] text-[#767676]">
              {block.items.map((item, itemIndex) => (
                <li key={`${block.id}-item-${itemIndex}`} className="list-disc" style={{ marginLeft: getBulletIndent(item) * 18 }}>
                  {getBulletText(item)}
                </li>
              ))}
            </ul>
          );
        }

        const columns = block.columns.length > 0 ? block.columns : fallbackDocumentTableColumns(block.id);
        const rows = block.rows.length > 0 ? block.rows : [];
        const sectionNumber = sectionNumberByBlockId.get(block.id) || 1;
        return (
          <section key={block.id} className="space-y-[12px]">
            {block.title ? (
              <h3 className="flex items-center gap-[10px] text-[16px] font-bold leading-[1.4] tracking-[-0.04px] text-[#181818]">
                <span className="grid h-[17px] min-w-[17px] place-items-center rounded-[3px] bg-[#8f8f8f] px-[4px] text-[11px] font-bold leading-none text-white">
                  {sectionNumber}
                </span>
                {block.title}
              </h3>
            ) : null}
            <div className="overflow-x-auto rounded-[4px] border border-[#bfc3ca] bg-white">
              <table className="w-full table-fixed border-collapse text-left text-[11px] leading-[1.5] tracking-[-0.03px]">
                <thead>
                  <tr className="bg-[#f3f4f7] text-[#181818]">
                    {columns.map((column) => (
                      <th
                        key={`${block.id}-head-${column.id}`}
                        className={`break-words border-b border-r border-[#bfc3ca] px-[10px] py-[9px] font-semibold last:border-r-0 ${
                          column.title === "상태" ? "w-[72px] text-center" : ""
                        }`}
                      >
                        {column.title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-[#4d4d4d]">
                  {rows.map((row, rowIndex) => (
                    <tr key={`${block.id}-row-${row.id || rowIndex}`} className="border-t border-[#cdd0d5] first:border-t-0">
                      {columns.map((column) => (
                        <td
                          key={`${block.id}-cell-${row.id || rowIndex}-${column.id}`}
                          className={`whitespace-pre-line break-words border-r border-[#cdd0d5] px-[10px] py-[9px] align-top font-medium last:border-r-0 ${
                            column.title === "상태" ? "text-center" : ""
                          }`}
                        >
                          {row.cells?.[column.id] || ""}
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
  const editorRootRef = useRef<HTMLDivElement | null>(null);
  const onChangeRef = useRef(onChange);
  const [initialContent] = useState(() => summaryBlocksToTiptapContent(blocks));
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashMenuIndex, setSlashMenuIndex] = useState(0);
  const [slashMenuPosition, setSlashMenuPosition] = useState({ left: 0, top: 0 });

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const extensions = useMemo(() => [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Table.configure({
      resizable: true,
    }),
    TableRow,
    TableHeader,
    TableCell,
    Placeholder.configure({
      placeholder: ({ node }) => {
        if (node.type.name === "heading") return "제목";
        return "내용을 입력하거나 / 를 눌러 블록을 선택하세요";
      },
    }),
  ], []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    editable: !disabled,
    content: initialContent,
    onUpdate: ({ editor: currentEditor }) => {
      onChangeRef.current(tiptapContentToSummaryBlocks(currentEditor.getJSON()));
    },
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  const openSlashMenu = () => {
    if (!editor || !editorRootRef.current) return;
    const rootBounds = editorRootRef.current.getBoundingClientRect();
    const selectionCoords = editor.view.coordsAtPos(editor.state.selection.from);
    const left = Math.max(0, Math.min(selectionCoords.left - rootBounds.left, rootBounds.width - 160));
    const top = Math.max(0, selectionCoords.bottom - rootBounds.top + 6);
    setSlashMenuPosition({ left, top });
    setSlashMenuIndex(0);
    setSlashMenuOpen(true);
  };

  const closeSlashMenu = () => {
    setSlashMenuOpen(false);
    setSlashMenuIndex(0);
  };

  const slashCommands = useMemo(() => [
    {
      label: "문단",
      description: "기본 텍스트",
      run: () => {
        editor?.chain().focus().setParagraph().run();
        closeSlashMenu();
      },
    },
    {
      label: "제목",
      description: "섹션 제목",
      run: () => {
        editor?.chain().focus().setHeading({ level: 2 }).run();
        closeSlashMenu();
      },
    },
    {
      label: "목록",
      description: "불릿 리스트",
      run: () => {
        editor?.chain().focus().toggleBulletList().run();
        closeSlashMenu();
      },
    },
    {
      label: "표",
      description: "3 x 3 표",
      run: () => {
        editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        closeSlashMenu();
      },
    },
  ], [editor]);

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || !editor) return;

    if (slashMenuOpen) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSlashMenu();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSlashMenuIndex((current) => (current + 1) % slashCommands.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSlashMenuIndex((current) => (current - 1 + slashCommands.length) % slashCommands.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        slashCommands[slashMenuIndex]?.run();
      }
      return;
    }

    if (event.key === "/") {
      event.preventDefault();
      openSlashMenu();
    }
  };

  return (
    <div
      ref={editorRootRef}
      className="summary-tiptap-editor relative mt-[22px] min-h-[560px] text-[#181818] [&_.ProseMirror]:min-h-[560px] [&_.ProseMirror]:outline-none [&_.ProseMirror>*+*]:mt-[14px] [&_.ProseMirror_h1]:text-[24px] [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h1]:leading-[1.42] [&_.ProseMirror_h1]:tracking-[-0.6px] [&_.ProseMirror_h2]:text-[16px] [&_.ProseMirror_h2]:font-bold [&_.ProseMirror_h2]:leading-[1.4] [&_.ProseMirror_h2]:tracking-[-0.04px] [&_.ProseMirror_h3]:text-[14px] [&_.ProseMirror_h3]:font-bold [&_.ProseMirror_h3]:leading-[1.4] [&_.ProseMirror_p]:text-[12px] [&_.ProseMirror_p]:font-medium [&_.ProseMirror_p]:leading-[1.7] [&_.ProseMirror_p]:tracking-[-0.03px] [&_.ProseMirror_p]:text-[#767676] [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:space-y-[5px] [&_.ProseMirror_ul]:pl-[27px] [&_.ProseMirror_li_p]:m-0 [&_.ProseMirror_table]:w-full [&_.ProseMirror_table]:table-fixed [&_.ProseMirror_table]:border-collapse [&_.ProseMirror_table]:text-left [&_.ProseMirror_table]:text-[11px] [&_.ProseMirror_table]:leading-[1.5] [&_.ProseMirror_table]:tracking-[-0.03px] [&_.ProseMirror_th]:border [&_.ProseMirror_th]:border-[#bfc3ca] [&_.ProseMirror_th]:bg-[#f3f4f7] [&_.ProseMirror_th]:px-[10px] [&_.ProseMirror_th]:py-[9px] [&_.ProseMirror_th]:font-semibold [&_.ProseMirror_td]:border [&_.ProseMirror_td]:border-[#cdd0d5] [&_.ProseMirror_td]:px-[10px] [&_.ProseMirror_td]:py-[9px] [&_.ProseMirror_td]:align-top [&_.is-empty:first-child::before]:pointer-events-none [&_.is-empty:first-child::before]:float-left [&_.is-empty:first-child::before]:h-0 [&_.is-empty:first-child::before]:text-[#b5bfcd] [&_.is-empty:first-child::before]:content-[attr(data-placeholder)]"
      onKeyDown={handleEditorKeyDown}
    >
      <EditorContent editor={editor} />
      {slashMenuOpen ? (
        <div
          className="absolute z-30 w-[172px] overflow-hidden rounded-[10px] border border-[#dbe3ef] bg-white py-[5px] shadow-[0_12px_30px_rgba(23,23,23,0.14)]"
          style={{ left: slashMenuPosition.left, top: slashMenuPosition.top }}
        >
          {slashCommands.map((command, index) => (
            <button
              key={command.label}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                command.run();
              }}
              className={`flex w-full flex-col px-[12px] py-[8px] text-left transition ${
                index === slashMenuIndex ? "bg-[#f6f9ff]" : "hover:bg-[#f6f9ff]"
              }`}
            >
              <span className="text-[12px] font-semibold leading-none tracking-[-0.03px] text-[#181818]">{command.label}</span>
              <span className="mt-[4px] text-[10px] font-medium leading-none tracking-[-0.025px] text-[#90a1b9]">{command.description}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DocumentHeaderActionButton({
  children,
  disabled,
  variant = "secondary",
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  onClick: () => void | Promise<void>;
}) {
  const className =
    variant === "primary"
      ? "inline-flex h-[28px] min-w-[58px] items-center justify-center rounded-full border border-[#01a3ff] bg-[linear-gradient(90deg,#54c1ff_32.705%,#2f70e9_157.88%)] px-[14px] text-white shadow-[0_-3px_2px_rgba(255,255,255,0.24),0_2px_6px_rgba(130,158,161,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:border-[#d8d8d8] disabled:bg-none disabled:bg-[#d8d8d8] disabled:shadow-none"
      : "inline-flex h-[28px] min-w-[58px] items-center justify-center rounded-full border border-[#dbe3ef] bg-white px-[14px] text-[#505050] shadow-[0_1px_3px_rgba(23,23,23,0.04)] transition hover:bg-[#f6f9ff] disabled:cursor-not-allowed disabled:opacity-45";

  return (
    <button type="button" disabled={disabled} onClick={() => void onClick()} className={className}>
      <span className="moa-font-pretendard text-[11px] font-semibold leading-none tracking-[-0.027px]">
        {children}
      </span>
    </button>
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
    <aside className="min-h-0 overflow-hidden border-r border-[#f1f1f1] bg-[#f8f8f8] px-[32px] pb-0 pt-[42px]">
      <div className="mb-[25px]">
        <p className="text-[10px] font-bold uppercase leading-[1.4] text-[#2e77ff]">Summary</p>
        <h3 className="mt-1 text-[20px] font-bold leading-[1.4] tracking-[-0.5px] text-[#181818]">정리</h3>
        <p className="mt-[5px] text-[11px] font-normal leading-[1.45] tracking-[-0.03px] text-[#505050]">
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
  generationStatus,
  generationError,
  generationDetail,
  generationPhase,
  generationRetryable,
  saving,
  eligibleGroupCount,
  presentation,
  remoteEditPresenceByKey,
  onSetEditMode,
  onRegenerate,
  onRefreshCache,
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
  const generationFailed = generationStatus === "failed";
  const generationStatusDetail = generationDetail || (pending ? "요약 문서를 생성하고 있습니다." : "");

  return (
    <section ref={paneRef} className="min-h-0 overflow-y-auto bg-white px-[30px] pb-[38px] pt-[42px]">
      <div className="mb-[28px] flex items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase leading-[1.4] text-[#2e77ff]">Conclusion</p>
          <h3 className="mt-1 text-[20px] font-bold leading-[1.4] tracking-[-0.5px] text-[#181818]">결론</h3>
          <p className="mt-[5px] text-[11px] font-normal leading-[1.45] tracking-[-0.03px] text-[#505050]">
            정리된 논의 내용을 바탕으로 핵심 결론과 후속 실행 항목을 작성합니다.
          </p>
        </div>
        <span className="mb-[2px] inline-flex h-[27px] shrink-0 items-center gap-[6px] rounded-full bg-[linear-gradient(90deg,#1aa7ff_0%,#4d6ff2_100%)] px-[12px] text-[12px] font-bold leading-none text-white shadow-[0_4px_10px_rgba(46,119,255,0.18)]">
          <SparkleIcon className="h-[13px] w-[13px]" />
          AI 초안
        </span>
      </div>

      <article className="relative h-[calc(100vh-166px)] min-h-[760px] overflow-y-auto rounded-[12px] border border-[#cecccc] bg-white px-[34px] pb-[48px] pt-[30px] shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
        <div className="absolute right-[18px] top-[15px] flex items-center gap-1">
          {editMode ? (
            <>
              <DocumentHeaderActionButton disabled={saving} onClick={() => onSetEditMode(false)}>
                취소
              </DocumentHeaderActionButton>
              <DocumentHeaderActionButton
                variant="primary"
                disabled={pending || saving || !draftDirty}
                onClick={onSave}
              >
                {saving ? "저장 중" : "저장"}
              </DocumentHeaderActionButton>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={pending || saving || eligibleGroupCount === 0}
                onClick={() => void onRefreshCache()}
                className="mr-1 inline-flex h-[28px] items-center rounded-full border border-[#d5e5ff] bg-white px-3 text-[#236cf3] transition hover:bg-[#eef6ff] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="moa-font-pretendard text-[11px] font-semibold leading-none tracking-[-0.027px]">캐시 재생성</span>
              </button>
              <IconButton label="요약 문서 다시 생성" disabled={pending || saving || eligibleGroupCount === 0} onClick={onRegenerate}>
                <RefreshIcon />
              </IconButton>
              <IconButton label="결론 카드 수정" disabled={editDisabled} onClick={() => onSetEditMode(true)}>
                <EditIcon />
              </IconButton>
              <IconButton label="결론 카드 복사" disabled={!hasDocumentContent} onClick={onCopy}>
                <CopyIcon />
              </IconButton>
            </>
          )}
        </div>

        <div className="inline-flex rounded-full border border-[#d5e5ff] bg-[linear-gradient(90deg,#2e77ff_0%,#4d6ff2_100%)] px-[9px] py-[5px] text-[10px] font-bold leading-none text-white shadow-[inset_0_3px_3px_rgba(255,255,255,0.15)]">
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

        {pending && generationStatusDetail ? (
          <p className="mt-4 rounded-[8px] border border-[#d5e5ff] bg-[#f5f9ff] px-3 py-2 text-[11px] font-semibold leading-5 text-[#236cf3]">
            {generationStatusDetail}
            {generationPhase ? <span className="ml-1 text-[#6b8fb8]">({generationPhase})</span> : null}
          </p>
        ) : null}

        {generationFailed ? (
          <p className="mt-4 rounded-[8px] border border-[#fecaca] bg-[#fff5f5] px-3 py-2 text-[11px] font-semibold leading-5 text-[#dc2626]">
            {generationRetryable
              ? "요약 문서 생성이 완료되지 않았습니다. 다시 생성 버튼으로 재시도할 수 있습니다."
              : "요약 문서 생성에 실패했습니다. 다시 생성 버튼을 눌러 재시도할 수 있습니다."}
            {generationDetail ? ` ${generationDetail}` : generationError ? ` ${generationError}` : ""}
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
