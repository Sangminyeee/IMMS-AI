import type { ReactNode } from "react";
import type {
  CanvasFinalSolutionSummary,
  CanvasSummaryDocumentBlock,
  CanvasSummaryDocumentSection,
  CanvasSummaryTableColumn,
  CanvasSummaryTableRow,
  CanvasSummaryStructuredDocument,
} from "@/lib/types";

function createEmptyStructuredSummaryDocument(): CanvasSummaryStructuredDocument {
  return {
    meeting_overview: "",
    attendee_summary: "",
    key_summary: "",
    idea_groups: [],
    discussion_flows: [],
    flow_sections: [],
    pending_items: [],
    conclusion: {
      title: "",
      summary: "",
      groups: [],
    },
  };
}

export function createEmptyFinalSolutionSummary(): CanvasFinalSolutionSummary {
  return {
    final_count: 0,
    topics: [],
    items: [],
    markdown: "",
    document_blocks: [],
    document_status: "empty",
    generated_at: "",
    used_llm: false,
    warning: "",
    source_signature: "",
    sections: [],
    structured: createEmptyStructuredSummaryDocument(),
  };
}

function normalizeStringList(value: unknown, limit: number) {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
        .slice(0, limit)
    : [];
}

const MAX_SUMMARY_BULLET_INDENT = 3;

function getSummaryBulletIndent(item: string) {
  const match = item.match(/^\t*/);
  return Math.min(MAX_SUMMARY_BULLET_INDENT, match?.[0].length || 0);
}

function getSummaryBulletText(item: string) {
  return item.replace(/^\t+/, "").trim();
}

function withSummaryBulletIndent(text: string, indent: number) {
  return `${"\t".repeat(Math.max(0, Math.min(MAX_SUMMARY_BULLET_INDENT, indent)))}${text.trim()}`;
}

function normalizeBulletStringList(value: unknown, limit: number) {
  return Array.isArray(value)
    ? value
        .map((item) => {
          if (typeof item !== "string") return "";
          const indent = getSummaryBulletIndent(item);
          const text = getSummaryBulletText(item);
          return text ? withSummaryBulletIndent(text, indent) : "";
        })
        .filter(Boolean)
        .slice(0, limit)
    : [];
}

const SUMMARY_PLACEHOLDER_TEXTS = new Set([
  "...",
  "…",
  "-",
  "실제 회의 흐름에 근거한 항목",
  "회의에서 실제로 정리된 방향",
  "회의에서 실제로 남은 질문",
  "짧은 핵심 논의",
  "그 논의가 나온 근거",
]);

function isSummaryPlaceholderText(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return !text || SUMMARY_PLACEHOLDER_TEXTS.has(text);
}

function stableSummaryBlockId(prefix: string, seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  return `${prefix}-${Math.abs(hash).toString(36) || "0"}`;
}

function createSummaryTableColumn(title: string, seed: string, type: CanvasSummaryTableColumn["type"] = "text"): CanvasSummaryTableColumn {
  return {
    id: stableSummaryBlockId("col", seed),
    title,
    type,
  };
}

function normalizeSummaryTableTitle(title: string) {
  return title === "핵심 결정 사항" || title === "핵심결정사항" ? "핵심 논의 사항" : title;
}

function compactSummaryTableCell(value: string, limit: number) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 1))}…` : text;
}

function normalizeDiscussionSummaryTable(
  blockId: string,
  title: string,
  columns: CanvasSummaryTableColumn[],
  rows: CanvasSummaryTableRow[],
): { columns: CanvasSummaryTableColumn[]; rows: CanvasSummaryTableRow[] } {
  if (title !== "핵심 논의 사항" && blockId !== "table-discussions") {
    return { columns, rows };
  }

  const findColumnId = (...keys: string[]) => {
    const keySet = new Set(keys);
    return columns.find((column) => keySet.has(column.id) || keySet.has(column.title))?.id || "";
  };
  const topicId = findColumnId("col-topic", "항목");
  const discussionId = findColumnId("col-discussion", "논의 내용");
  const evidenceId = findColumnId("col-evidence", "근거", "논의 근거");
  const statusId = findColumnId("col-status", "상태");
  const nextColumns: CanvasSummaryTableColumn[] = [
    { id: "col-discussion", title: "논의 내용", type: "text" },
    { id: "col-evidence", title: "논의 근거", type: "text" },
    { id: "col-status", title: "상태", type: "select" },
  ];
  const nextRows = rows
    .map((row, rowIndex): CanvasSummaryTableRow | null => {
      const oldTopic = topicId ? row.cells[topicId] || "" : "";
      const oldDiscussion = discussionId ? row.cells[discussionId] || "" : "";
      const oldEvidence = evidenceId ? row.cells[evidenceId] || "" : "";
      const discussion = oldTopic || oldDiscussion;
      const evidence = oldTopic && oldDiscussion && oldDiscussion !== oldTopic ? oldDiscussion : oldEvidence;
      if (!discussion && !evidence) return null;
      return {
        id: row.id || stableSummaryBlockId("row", `${blockId}:${rowIndex}`),
        cells: {
          "col-discussion": compactSummaryTableCell(discussion, 34),
          "col-evidence": compactSummaryTableCell(evidence, 72),
          "col-status": compactSummaryTableCell((statusId ? row.cells[statusId] : "") || "검토 필요", 12),
        },
      };
    })
    .filter((row): row is CanvasSummaryTableRow => Boolean(row))
    .slice(0, 6);

  return { columns: nextColumns, rows: nextRows };
}

function defaultSummaryTableColumns(seed: string): CanvasSummaryTableColumn[] {
  return [
    createSummaryTableColumn("항목", `${seed}:item`),
    createSummaryTableColumn("내용", `${seed}:content`),
  ];
}

function normalizeSummaryTableColumns(rawColumns: unknown, blockId: string): CanvasSummaryTableColumn[] {
  if (!Array.isArray(rawColumns)) return defaultSummaryTableColumns(blockId);
  const usedIds = new Set<string>();
  const columns = rawColumns
    .map((column, index): CanvasSummaryTableColumn | null => {
      if (typeof column === "string") {
        const title = column.trim();
        if (!title) return null;
        return createSummaryTableColumn(title, `${blockId}:${index}:${title}`);
      }
      if (!column || typeof column !== "object") return null;
      const source = column as Record<string, unknown>;
      const titleSource = source.title || source.name || source.header || source.text || source.id;
      const title = typeof titleSource === "string" ? titleSource.trim() : "";
      if (!title) return null;
      const rawId = typeof source.id === "string" && source.id.trim()
        ? source.id.trim()
        : stableSummaryBlockId("col", `${blockId}:${index}:${title}`);
      const id = usedIds.has(rawId) ? `${rawId}-${index}` : rawId;
      usedIds.add(id);
      const type = typeof source.type === "string" && source.type.trim() ? source.type.trim() : "text";
      return { id, title, type };
    })
    .filter((column): column is CanvasSummaryTableColumn => Boolean(column))
    .slice(0, 8);
  return columns.length > 0 ? columns : defaultSummaryTableColumns(blockId);
}

function createBlankSummaryTableRow(columns: CanvasSummaryTableColumn[], seed: string): CanvasSummaryTableRow {
  return {
    id: stableSummaryBlockId("row", seed),
    cells: Object.fromEntries(columns.map((column) => [column.id, ""])),
  };
}

function normalizeSummaryTableRows(rawRows: unknown, columns: CanvasSummaryTableColumn[], blockId: string): CanvasSummaryTableRow[] {
  if (!Array.isArray(rawRows)) return [createBlankSummaryTableRow(columns, `${blockId}:blank`)];
  const rows = rawRows
    .map((row, rowIndex): CanvasSummaryTableRow | null => {
      let cells: Record<string, string> = {};
      let rawId = "";
      if (Array.isArray(row)) {
        cells = Object.fromEntries(
          columns.map((column, cellIndex) => {
            const value = row[cellIndex];
            return [column.id, typeof value === "string" ? value.trim() : ""];
          }),
        );
      } else if (row && typeof row === "object") {
        const source = row as Record<string, unknown>;
        rawId = typeof source.id === "string" ? source.id.trim() : "";
        const sourceCells = source.cells && typeof source.cells === "object"
          ? (source.cells as Record<string, unknown>)
          : source;
        cells = Object.fromEntries(
          columns.map((column) => {
            const value = sourceCells[column.id] ?? sourceCells[column.title];
            return [column.id, typeof value === "string" ? value.trim() : ""];
          }),
        );
      } else {
        return null;
      }

      if (!Object.values(cells).some(Boolean)) return null;
      return {
        id: rawId || stableSummaryBlockId("row", `${blockId}:${rowIndex}:${Object.values(cells).join("|")}`),
        cells,
      };
    })
    .filter((row): row is CanvasSummaryTableRow => Boolean(row))
    .slice(0, 40);
  return rows.length > 0 ? rows : [createBlankSummaryTableRow(columns, `${blockId}:blank`)];
}

function filterMeaningfulSummaryTableRows(rows: CanvasSummaryTableRow[], columns: CanvasSummaryTableColumn[]) {
  const statusIds = new Set(columns.filter((column) => column.id === "col-status" || column.title === "상태").map((column) => column.id));
  return rows.filter((row) =>
    Object.entries(row.cells).some(([columnId, value]) => !statusIds.has(columnId) && !isSummaryPlaceholderText(value)),
  );
}

function summaryBlockHasContent(block: CanvasSummaryDocumentBlock) {
  if (block.type === "paragraph") return !isSummaryPlaceholderText(block.text);
  if (block.type === "bullets") return block.items.some((item) => !isSummaryPlaceholderText(getSummaryBulletText(item)));
  if (block.type === "table") return filterMeaningfulSummaryTableRows(block.rows, block.columns).length > 0;
  return !isSummaryPlaceholderText(block.text);
}

function pruneEmptySummarySections(blocks: CanvasSummaryDocumentBlock[]) {
  const normalizedBlocks = blocks
    .map((block): CanvasSummaryDocumentBlock | null => {
      if (block.type === "paragraph") return isSummaryPlaceholderText(block.text) ? null : block;
      if (block.type === "bullets") {
        const items = block.items.filter((item) => !isSummaryPlaceholderText(getSummaryBulletText(item)));
        return items.length > 0 ? { ...block, items } : null;
      }
      if (block.type === "table") {
        const rows = filterMeaningfulSummaryTableRows(block.rows, block.columns);
        return rows.length > 0 ? { ...block, rows } : null;
      }
      return block;
    })
    .filter((block): block is CanvasSummaryDocumentBlock => Boolean(block));

  const contentPrunedBlocks = normalizedBlocks.filter((block, index) => {
    if (block.type !== "heading" || (block.level || 2) === 1) return true;
    for (const nextBlock of normalizedBlocks.slice(index + 1)) {
      if (nextBlock.type === "heading" && (nextBlock.level || 2) <= (block.level || 2)) {
        break;
      }
      if (nextBlock.type !== "heading" && summaryBlockHasContent(nextBlock)) {
        return true;
      }
    }
    return false;
  });

  return contentPrunedBlocks.filter((block, index) => {
    if (block.type !== "heading" || (block.level || 2) === 1) return true;
    const nextBlock = contentPrunedBlocks.slice(index + 1).find((item) => item.type !== "paragraph");
    if (nextBlock?.type === "table" && nextBlock.title?.trim() === block.text.trim()) {
      return false;
    }
    const previousBlock = contentPrunedBlocks[index - 1];
    if (previousBlock?.type === "heading" && previousBlock.text.trim() === block.text.trim()) {
      return false;
    }
    return true;
  });
}

export function createSummaryDocumentBlock(type: CanvasSummaryDocumentBlock["type"]): CanvasSummaryDocumentBlock {
  const id = `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  if (type === "heading") return { id, type, text: "새 제목", level: 2 };
  if (type === "paragraph") return { id, type, text: "새 문단을 입력하세요." };
  if (type === "bullets") return { id, type, items: ["새 항목"] };
  const columns = [
    createSummaryTableColumn("항목", `${id}:item`),
    createSummaryTableColumn("내용", `${id}:content`),
    createSummaryTableColumn("비고", `${id}:memo`),
  ];
  return {
    id,
    type,
    title: "새 표",
    columns,
    rows: [createBlankSummaryTableRow(columns, `${id}:row`)],
  };
}

function normalizeSummaryDocumentBlock(raw: unknown, index: number): CanvasSummaryDocumentBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const type = source.type;
  const id = typeof source.id === "string" && source.id.trim()
    ? source.id.trim()
    : stableSummaryBlockId("block", JSON.stringify(source) || String(index));

  if (type === "heading") {
    const level = source.level === 1 || source.level === 2 || source.level === 3 ? source.level : 2;
    const text = typeof source.text === "string" ? source.text.trim() : "";
    return text ? { id, type, text, level } : null;
  }

  if (type === "paragraph") {
    const text = typeof source.text === "string" ? source.text.trim() : "";
    return !isSummaryPlaceholderText(text) ? { id, type, text } : null;
  }

  if (type === "bullets") {
    const items = normalizeBulletStringList(source.items, 20).filter((item) => !isSummaryPlaceholderText(getSummaryBulletText(item)));
    return items.length > 0 ? { id, type, items } : null;
  }

  if (type === "table") {
    const title = typeof source.title === "string" ? source.title.trim() : "";
    const normalizedTitle = normalizeSummaryTableTitle(title);
    const columns = normalizeSummaryTableColumns(source.columns, id);
    const rows = normalizeSummaryTableRows(source.rows, columns, id);
    const table = normalizeDiscussionSummaryTable(id, normalizedTitle, columns, rows);
    const meaningfulRows = filterMeaningfulSummaryTableRows(table.rows, table.columns);
    if (meaningfulRows.length === 0) return null;
    return {
      id,
      type,
      title: normalizedTitle,
      columns: table.columns,
      rows: meaningfulRows,
    };
  }

  return null;
}

function parseMarkdownTable(lines: string[], startIndex: number): { block: CanvasSummaryDocumentBlock | null; nextIndex: number } {
  const headerLine = lines[startIndex];
  const dividerLine = lines[startIndex + 1] || "";
  if (!headerLine.includes("|") || !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(dividerLine)) {
    return { block: null, nextIndex: startIndex };
  }

  const parseCells = (line: string) =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.replace(/\\\|/g, "|").trim());

  const columns = parseCells(headerLine);
  const rows: string[][] = [];
  let nextIndex = startIndex + 2;
  while (nextIndex < lines.length && lines[nextIndex].includes("|")) {
    const row = parseCells(lines[nextIndex]);
    rows.push(columns.map((_, cellIndex) => row[cellIndex] || ""));
    nextIndex += 1;
  }

  return {
    block: normalizeSummaryDocumentBlock(
      {
        id: stableSummaryBlockId("table", `${startIndex}:${headerLine}`),
        type: "table",
        columns,
        rows,
      },
      startIndex,
    ),
    nextIndex,
  };
}

function markdownToSummaryDocumentBlocks(markdown: string): CanvasSummaryDocumentBlock[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: CanvasSummaryDocumentBlock[] = [];
  let paragraphBuffer: string[] = [];
  let bulletBuffer: string[] = [];

  const flushParagraph = () => {
    const text = paragraphBuffer.join(" ").replace(/\s+/g, " ").trim();
    if (text) {
      blocks.push({ id: stableSummaryBlockId("paragraph", `${blocks.length}:${text}`), type: "paragraph", text });
    }
    paragraphBuffer = [];
  };

  const flushBullets = () => {
    const items = bulletBuffer.map((item) => item.trim()).filter(Boolean);
    if (items.length > 0) {
      blocks.push({ id: stableSummaryBlockId("bullets", `${blocks.length}:${items.join("|")}`), type: "bullets", items });
    }
    bulletBuffer = [];
  };

  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    if (!line) {
      flushParagraph();
      flushBullets();
      index += 1;
      continue;
    }

    const tableResult = parseMarkdownTable(lines, index);
    if (tableResult.block) {
      flushParagraph();
      flushBullets();
      blocks.push(tableResult.block);
      index = tableResult.nextIndex;
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushBullets();
      blocks.push({
        id: stableSummaryBlockId("heading", `${index}:${headingMatch[2]}`),
        type: "heading",
        text: headingMatch[2].trim(),
        level: Math.min(3, headingMatch[1].length) as 1 | 2 | 3,
      });
      index += 1;
      continue;
    }

    const rawLine = lines[index];
    const bulletMatch = rawLine.match(/^(\s*)[-*]\s+(.+)$/) || rawLine.match(/^(\s*)\d+[.)]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      const indentWidth = bulletMatch[1].replace(/\t/g, "  ").length;
      bulletBuffer.push(withSummaryBulletIndent(bulletMatch[2], Math.floor(indentWidth / 2)));
      index += 1;
      continue;
    }

    flushBullets();
    paragraphBuffer.push(line);
    index += 1;
  }

  flushParagraph();
  flushBullets();
  return blocks.slice(0, 80);
}

function buildSummaryDocumentBlocksFromStructured(structured: CanvasSummaryStructuredDocument): CanvasSummaryDocumentBlock[] {
  const blocks: CanvasSummaryDocumentBlock[] = [];
  const title = structured.conclusion.title || "회의 핵심 결론";
  const summary = structured.conclusion.summary || structured.key_summary || structured.meeting_overview;

  if (title) {
    blocks.push({ id: stableSummaryBlockId("heading", title), type: "heading", text: title, level: 1 });
  }
  if (summary) {
    blocks.push({ id: stableSummaryBlockId("paragraph", summary), type: "paragraph", text: summary });
  }

  const conclusionColumns = [
    createSummaryTableColumn("정리 항목", "conclusion:item"),
    createSummaryTableColumn("상태", "conclusion:status"),
    createSummaryTableColumn("핵심 내용", "conclusion:content"),
  ];
  const conclusionRows = (structured.conclusion.groups || []).map((group) => [
    group.title,
    group.status_label || (group.status === "final" ? "확정" : group.status === "review" ? "검토 중" : "초안"),
    group.bullets.join("\n"),
  ]);
  if (conclusionRows.length > 0) {
    blocks.push({
      id: "table-problem-solution",
      type: "table",
      title: "문제정의 & 해결 방향",
      columns: conclusionColumns,
      rows: normalizeSummaryTableRows(conclusionRows, conclusionColumns, "table-problem-solution"),
    });
  }

  const actionRows = normalizeStringList(structured.pending_items, 20).map((item) => [item, "추가 확인 필요", ""]);
  if (actionRows.length > 0) {
    const actionColumns = [
      createSummaryTableColumn("할 일", "actions:item"),
      createSummaryTableColumn("담당", "actions:owner"),
      createSummaryTableColumn("비고", "actions:memo"),
    ];
    blocks.push({
      id: "table-next-actions",
      type: "table",
      title: "앞으로 할 일",
      columns: actionColumns,
      rows: normalizeSummaryTableRows(actionRows, actionColumns, "table-next-actions"),
    });
  }

  return blocks;
}

export function normalizeSummaryDocumentBlocks(
  rawBlocks: unknown,
  structured: CanvasSummaryStructuredDocument,
  markdown: string,
): CanvasSummaryDocumentBlock[] {
  const directBlocks = Array.isArray(rawBlocks)
    ? rawBlocks
        .map((block, index) => normalizeSummaryDocumentBlock(block, index))
        .filter((block): block is CanvasSummaryDocumentBlock => Boolean(block))
        .slice(0, 80)
    : [];
  if (directBlocks.length > 0) return pruneEmptySummarySections(directBlocks);

  const structuredBlocks = buildSummaryDocumentBlocksFromStructured(structured);
  if (structuredBlocks.length > 0) return pruneEmptySummarySections(structuredBlocks);

  return pruneEmptySummarySections(markdownToSummaryDocumentBlocks(markdown));
}

function escapeMarkdownTableCell(value: string) {
  return value.replace(/\r?\n/g, "<br>").replace(/\|/g, "\\|").trim() || " ";
}

export function summaryDocumentBlocksToMarkdown(blocks: CanvasSummaryDocumentBlock[]) {
  const chunks: string[] = [];
  blocks.forEach((block) => {
    if (block.type === "heading") {
      const level = Math.max(1, Math.min(3, block.level || 2));
      chunks.push(`${"#".repeat(level)} ${block.text.trim() || "제목"}`);
      return;
    }
    if (block.type === "paragraph") {
      chunks.push(block.text.trim());
      return;
    }
    if (block.type === "bullets") {
      chunks.push(
        block.items
          .filter((item) => getSummaryBulletText(item))
          .map((item) => `${"  ".repeat(getSummaryBulletIndent(item))}- ${getSummaryBulletText(item)}`)
          .join("\n"),
      );
      return;
    }
    if (block.type === "table") {
      const title = block.title?.trim();
      const columns = block.columns.length > 0 ? block.columns : defaultSummaryTableColumns(block.id);
      const header = `| ${columns.map((column) => escapeMarkdownTableCell(column.title)).join(" | ")} |`;
      const divider = `| ${columns.map(() => "---").join(" | ")} |`;
      const rows = block.rows.map((row) => `| ${columns.map((column) => escapeMarkdownTableCell(row.cells[column.id] || "")).join(" | ")} |`);
      chunks.push([title ? `### ${title}` : "", header, divider, ...rows].filter(Boolean).join("\n"));
    }
  });
  return chunks.filter((chunk) => chunk.trim()).join("\n\n").trim();
}

export function areSummaryDocumentBlocksEqual(
  left: CanvasSummaryDocumentBlock[],
  right: CanvasSummaryDocumentBlock[],
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeStructuredSummaryDocument(
  raw?: CanvasSummaryStructuredDocument | null,
): CanvasSummaryStructuredDocument {
  const fallback = createEmptyStructuredSummaryDocument();
  if (!raw || typeof raw !== "object") return fallback;

  return {
    meeting_overview: typeof raw.meeting_overview === "string" ? raw.meeting_overview : "",
    attendee_summary: typeof raw.attendee_summary === "string" ? raw.attendee_summary : "",
    key_summary: typeof raw.key_summary === "string" ? raw.key_summary : "",
    idea_groups: Array.isArray(raw.idea_groups)
      ? raw.idea_groups
          .map((group) => ({
            group_id: group.group_id || "",
            title: group.title || "주요 아이디어",
            items: normalizeStringList(group.items, 8),
          }))
          .filter((group) => group.title || group.items.length > 0)
          .slice(0, 24)
      : [],
    discussion_flows: Array.isArray(raw.discussion_flows)
      ? raw.discussion_flows
          .map((flow) => ({
            group_id: flow.group_id || "",
            title: flow.title || "논의 흐름",
            opinions: Array.isArray(flow.opinions)
              ? flow.opinions
                  .map((opinion) => ({
                    label: opinion.label || "의견",
                    text: opinion.text || "",
                  }))
                  .filter((opinion) => opinion.text)
                  .slice(0, 4)
              : [],
            conclusion: flow.conclusion || "",
          }))
          .filter((flow) => flow.title || flow.opinions.length > 0 || flow.conclusion)
          .slice(0, 24)
      : [],
    flow_sections: Array.isArray(raw.flow_sections)
      ? raw.flow_sections
          .map((section) => ({
            section_id: section.section_id || section.group_id || "",
            group_id: section.group_id || "",
            title: section.title || "논의 흐름",
            time_range: section.time_range || "",
            trigger: section.trigger || "",
            narrative: section.narrative || "",
            key_points: normalizeStringList(section.key_points, 8),
            opinions: Array.isArray(section.opinions)
              ? section.opinions
                  .map((opinion) => ({
                    label: opinion.label || "의견",
                    text: opinion.text || "",
                  }))
                  .filter((opinion) => opinion.text)
                  .slice(0, 4)
              : [],
            settlement: section.settlement || "",
            open_questions: normalizeStringList(section.open_questions, 8),
          }))
          .filter(
            (section) =>
              section.title ||
              section.trigger ||
              section.narrative ||
              section.key_points.length > 0 ||
              section.opinions.length > 0 ||
              section.settlement ||
              section.open_questions.length > 0,
          )
          .slice(0, 24)
      : [],
    pending_items: normalizeStringList(raw.pending_items, 12),
    conclusion: {
      title: raw.conclusion?.title || "",
      summary: raw.conclusion?.summary || "",
      groups: Array.isArray(raw.conclusion?.groups)
        ? raw.conclusion.groups
            .map((group) => ({
              group_id: group.group_id || "",
              title: group.title || "정리 항목",
              status: group.status || "draft",
              status_label: group.status_label || "",
              bullets: normalizeStringList(group.bullets, 8),
            }))
            .filter((group) => group.title || group.bullets.length > 0)
            .slice(0, 24)
        : [],
    },
  };
}

export function normalizeFinalSolutionSummaryPayload(
  raw?: CanvasFinalSolutionSummary | null,
): CanvasFinalSolutionSummary {
  const fallback = createEmptyFinalSolutionSummary();
  if (!raw || typeof raw !== "object") return fallback;
  const markdown = typeof raw.markdown === "string" ? raw.markdown : "";
  const structured = normalizeStructuredSummaryDocument(raw.structured);
  const documentBlocks = normalizeSummaryDocumentBlocks(
    raw.document_blocks || (raw as { documentBlocks?: unknown }).documentBlocks,
    structured,
    markdown,
  );
  const normalizedMarkdown = markdown || summaryDocumentBlocksToMarkdown(documentBlocks);
  const sections = Array.isArray(raw.sections)
    ? raw.sections.map((section) => ({
        group_id: section.group_id || "",
        title: section.title || "요약 그룹",
        status: section.status || "draft",
        status_label:
          section.status_label || (section.status === "review" ? "검토 중" : section.status === "final" ? "확정" : "초안"),
        rationale: section.rationale || "",
        node_titles: Array.isArray(section.node_titles) ? section.node_titles.filter(Boolean) : [],
        evidence: Array.isArray(section.evidence)
          ? section.evidence
              .map((item) => ({
                utterance_id: item.utterance_id || "",
                speaker: item.speaker || "참가자",
                timestamp: item.timestamp || "",
                text: item.text || "",
              }))
              .filter((item) => item.text)
          : [],
      }))
    : [];

  return {
    final_count: Math.max(Number.isFinite(raw.final_count) ? raw.final_count : raw.items?.length || 0, sections.length),
    topics: Array.isArray(raw.topics) ? raw.topics : [],
    items: Array.isArray(raw.items) ? raw.items : [],
    markdown: normalizedMarkdown,
    document_blocks: documentBlocks,
    document_status: raw.document_status || (normalizedMarkdown || documentBlocks.length > 0 ? "ready" : "empty"),
    generated_at: raw.generated_at || "",
    used_llm: Boolean(raw.used_llm),
    warning: raw.warning || "",
    source_signature: raw.source_signature || "",
    sections,
    structured,
  };
}

export function buildFinalSolutionSummaryPayload(
  summaryDocument?: CanvasFinalSolutionSummary | null,
): CanvasFinalSolutionSummary {
  return normalizeFinalSolutionSummaryPayload(summaryDocument);
}

export function buildSummaryDocumentFromResponse(input: {
  markdown: string;
  documentBlocks?: CanvasSummaryDocumentBlock[];
  sections: CanvasSummaryDocumentSection[];
  generatedAt: string;
  usedLlm: boolean;
  warning?: string;
  sourceSignature: string;
  structured?: CanvasSummaryStructuredDocument;
}): CanvasFinalSolutionSummary {
  return normalizeFinalSolutionSummaryPayload({
    final_count: input.sections.length,
    topics: [],
    items: [],
    markdown: input.markdown,
    document_blocks: input.documentBlocks,
    document_status: input.markdown.trim() || (input.documentBlocks || []).length > 0 ? "ready" : "empty",
    generated_at: input.generatedAt,
    used_llm: input.usedLlm,
    warning: input.warning || "",
    source_signature: input.sourceSignature,
    sections: input.sections,
    structured: input.structured,
  });
}

function renderSummaryMarkdownInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("`")) {
      nodes.push(
        <code key={`code-${match.index}`} className="rounded-[4px] bg-[#eef8ff] px-1.5 py-0.5 font-mono text-[0.92em] text-[#236cf3]">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**")) {
      nodes.push(
        <strong key={`strong-${match.index}`} className="font-semibold text-black">
          {token.slice(2, -2)}
        </strong>,
      );
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

function isMarkdownTableSeparator(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function parseMarkdownTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function renderSummaryMarkdownPreview(markdown: string, onEdit: () => void) {
  const lines = markdown.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let index = 0;
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={`list-${blocks.length}`} className="my-3 space-y-1.5 pl-5 text-[15px] leading-7 text-[#334155]">
        {listItems.map((item, itemIndex) => (
          <li key={`list-${blocks.length}-${itemIndex}`} className="list-disc">
            {renderSummaryMarkdownInline(item)}
          </li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  while (index < lines.length) {
    const rawLine = lines[index] || "";
    const line = rawLine.trim();

    if (!line) {
      flushList();
      index += 1;
      continue;
    }

    if (line.includes("|") && index + 1 < lines.length && isMarkdownTableSeparator(lines[index + 1] || "")) {
      flushList();
      const headers = parseMarkdownTableRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && (lines[index] || "").includes("|") && (lines[index] || "").trim()) {
        rows.push(parseMarkdownTableRow(lines[index] || ""));
        index += 1;
      }
      blocks.push(
        <div key={`table-${blocks.length}`} className="my-4 overflow-x-auto border border-black/10 bg-white">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-[#f5f6f8] text-black">
              <tr>
                {headers.map((header, headerIndex) => (
                  <th key={`table-head-${headerIndex}`} className="border-b border-black/10 px-3 py-2 font-semibold">
                    {renderSummaryMarkdownInline(header)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`table-row-${rowIndex}`} className="border-b border-black/5 last:border-b-0">
                  {headers.map((_, cellIndex) => (
                    <td key={`table-cell-${rowIndex}-${cellIndex}`} className="px-3 py-2 align-top text-[#334155]">
                      {renderSummaryMarkdownInline(row[cellIndex] || "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = heading[1].length;
      const content = heading[2];
      const className =
        level === 1
          ? "mb-5 mt-1 text-3xl font-semibold leading-tight text-black"
          : level === 2
            ? "mb-3 mt-8 border-t border-black/10 pt-5 text-xl font-semibold leading-8 text-black first:mt-0 first:border-t-0 first:pt-0"
            : "mb-2 mt-5 text-base font-semibold leading-7 text-[#1f2937]";
      const headingContent = renderSummaryMarkdownInline(content);
      if (level === 1) {
        blocks.push(<h1 key={`heading-${index}`} className={className}>{headingContent}</h1>);
      } else if (level === 2) {
        blocks.push(<h2 key={`heading-${index}`} className={className}>{headingContent}</h2>);
      } else if (level === 3) {
        blocks.push(<h3 key={`heading-${index}`} className={className}>{headingContent}</h3>);
      } else {
        blocks.push(<h4 key={`heading-${index}`} className={className}>{headingContent}</h4>);
      }
      index += 1;
      continue;
    }

    const listMatch = line.match(/^[-*]\s+(.+)$/) || line.match(/^\d+[.)]\s+(.+)$/);
    if (listMatch) {
      listItems.push(listMatch[1]);
      index += 1;
      continue;
    }

    flushList();
    blocks.push(
      <p key={`paragraph-${index}`} className="my-3 text-[15px] leading-8 text-[#334155]">
        {renderSummaryMarkdownInline(line)}
      </p>,
    );
    index += 1;
  }

  flushList();

  return (
    <button
      type="button"
      onClick={onEdit}
      className="h-full w-full overflow-y-auto border border-black/10 bg-white px-8 py-7 text-left outline-none transition hover:border-[#01a3ff]/30 focus:border-[#01a3ff]/30 focus:ring-2 focus:ring-[#01a3ff]/10"
    >
      {blocks.length > 0 ? blocks : (
        <p className="text-sm leading-7 text-[#999]">요약 문서가 아직 없습니다.</p>
      )}
    </button>
  );
}

function escapeSummaryHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderSummaryMarkdownInlineHtml(value: string) {
  return escapeSummaryHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function summaryMarkdownToPrintableHtml(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const blocks: string[] = [];
  let index = 0;
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push(`<ul>${listItems.map((item) => `<li>${renderSummaryMarkdownInlineHtml(item)}</li>`).join("")}</ul>`);
    listItems = [];
  };

  while (index < lines.length) {
    const rawLine = lines[index] || "";
    const line = rawLine.trim();

    if (!line) {
      flushList();
      index += 1;
      continue;
    }

    if (line.includes("|") && index + 1 < lines.length && isMarkdownTableSeparator(lines[index + 1] || "")) {
      flushList();
      const headers = parseMarkdownTableRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && (lines[index] || "").includes("|") && (lines[index] || "").trim()) {
        rows.push(parseMarkdownTableRow(lines[index] || ""));
        index += 1;
      }
      blocks.push(`
        <div class="table-wrap">
          <table>
            <thead>
              <tr>${headers.map((header) => `<th>${renderSummaryMarkdownInlineHtml(header)}</th>`).join("")}</tr>
            </thead>
            <tbody>
              ${rows
                .map((row) => `<tr>${headers.map((_, cellIndex) => `<td>${renderSummaryMarkdownInlineHtml(row[cellIndex] || "")}</td>`).join("")}</tr>`)
                .join("")}
            </tbody>
          </table>
        </div>
      `);
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = Math.min(heading[1].length, 4);
      blocks.push(`<h${level}>${renderSummaryMarkdownInlineHtml(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    const listMatch = line.match(/^[-*]\s+(.+)$/) || line.match(/^\d+[.)]\s+(.+)$/);
    if (listMatch) {
      listItems.push(listMatch[1]);
      index += 1;
      continue;
    }

    flushList();
    blocks.push(`<p>${renderSummaryMarkdownInlineHtml(line)}</p>`);
    index += 1;
  }

  flushList();
  return blocks.join("\n") || "<p class=\"empty\">요약 문서가 아직 없습니다.</p>";
}

export function buildPrintableSummaryDocumentHtml(markdown: string, options: { includeToolbar?: boolean } = {}) {
  const includeToolbar = options.includeToolbar ?? true;
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>최종 정리 문서</title>
  <style>
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #f5f6f8;
      color: #111;
      font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif;
      line-height: 1.65;
    }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 1px solid rgba(0,0,0,0.1);
      background: rgba(255,255,255,0.94);
      padding: 14px 24px;
      backdrop-filter: blur(12px);
    }
    .toolbar p { margin: 0; color: #4d4d4d; font-size: 13px; }
    .toolbar button {
      border: 1px solid #bfdbfe;
      border-radius: 10px;
      background: #eef8ff;
      color: #236cf3;
      padding: 9px 14px;
      font-weight: 700;
      cursor: pointer;
    }
    .document {
      width: min(860px, calc(100% - 40px));
      margin: 32px auto;
      border: 1px solid rgba(0,0,0,0.1);
      background: #fff;
      padding: 44px 50px;
      box-shadow: 0 20px 70px rgba(15,23,42,0.09);
    }
    .document-title {
      margin: 0 0 28px;
      color: #000;
      font-size: 32px;
      font-weight: 750;
      letter-spacing: 0;
      line-height: 1.25;
    }
    h1 { margin: 26px 0 18px; color: #000; font-size: 30px; line-height: 1.25; }
    h2 { margin: 34px 0 14px; border-top: 1px solid rgba(0,0,0,0.1); padding-top: 22px; color: #000; font-size: 22px; line-height: 1.45; }
    h3 { margin: 24px 0 10px; color: #1f2937; font-size: 17px; line-height: 1.55; }
    h4 { margin: 18px 0 8px; color: #1f2937; font-size: 15px; line-height: 1.55; }
    p { margin: 12px 0; color: #334155; font-size: 15px; line-height: 1.85; }
    ul { margin: 12px 0; padding-left: 24px; color: #334155; font-size: 15px; line-height: 1.8; }
    li { margin: 5px 0; }
    strong { font-weight: 750; color: #111827; }
    em { font-style: italic; }
    code { border-radius: 5px; background: #eef8ff; padding: 1px 5px; color: #236cf3; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.92em; }
    .table-wrap { margin: 18px 0; overflow-x: auto; border: 1px solid rgba(0,0,0,0.1); }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { border-bottom: 1px solid rgba(0,0,0,0.1); background: #f5f6f8; padding: 10px 12px; text-align: left; color: #000; }
    td { border-bottom: 1px solid rgba(0,0,0,0.05); padding: 10px 12px; vertical-align: top; color: #334155; }
    tr:last-child td { border-bottom: 0; }
    .empty { color: #999; }
    @media print {
      body { background: #fff; }
      .toolbar { display: none; }
      .document { width: auto; margin: 0; border: 0; padding: 0; box-shadow: none; }
      h2 { break-after: avoid; }
      h1, h2, h3, h4, p, li, tr { break-inside: avoid; }
    }
  </style>
</head>
<body>
  ${
    includeToolbar
      ? `<div class="toolbar">
    <p>인쇄 대화상자에서 PDF로 저장하면 현재 보이는 문서 형식 그대로 저장됩니다.</p>
    <button type="button" onclick="window.print()">PDF로 저장</button>
  </div>`
      : ""
  }
  <main class="document">
    <h1 class="document-title">최종 정리 문서</h1>
    ${summaryMarkdownToPrintableHtml(markdown)}
  </main>
</body>
</html>`;
}

export function openPrintableSummaryDocumentPdf(markdown: string) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  const frameDocument = iframe.contentDocument || frameWindow?.document;
  if (!frameWindow || !frameDocument) {
    iframe.remove();
    return false;
  }

  frameDocument.open();
  frameDocument.write(buildPrintableSummaryDocumentHtml(markdown, { includeToolbar: false }));
  frameDocument.close();
  frameWindow.focus();
  frameWindow.print();
  window.setTimeout(() => iframe.remove(), 60000);
  return true;
}
