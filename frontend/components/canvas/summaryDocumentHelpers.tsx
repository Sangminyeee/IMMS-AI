import type { ReactNode } from "react";
import type {
  CanvasFinalSolutionSummary,
  CanvasSummaryDocumentSection,
  CanvasSummaryStructuredDocument,
} from "@/lib/types";

function createEmptyStructuredSummaryDocument(): CanvasSummaryStructuredDocument {
  return {
    meeting_overview: "",
    attendee_summary: "",
    key_summary: "",
    idea_groups: [],
    discussion_flows: [],
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
    markdown,
    document_status: raw.document_status || (markdown ? "ready" : "empty"),
    generated_at: raw.generated_at || "",
    used_llm: Boolean(raw.used_llm),
    warning: raw.warning || "",
    source_signature: raw.source_signature || "",
    sections,
    structured: normalizeStructuredSummaryDocument(raw.structured),
  };
}

export function buildFinalSolutionSummaryPayload(
  summaryDocument?: CanvasFinalSolutionSummary | null,
): CanvasFinalSolutionSummary {
  return normalizeFinalSolutionSummaryPayload(summaryDocument);
}

export function buildSummaryDocumentFromResponse(input: {
  markdown: string;
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
    document_status: input.markdown.trim() ? "ready" : "empty",
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
        <code key={`code-${match.index}`} className="rounded-[4px] bg-[#f7ecfb] px-1.5 py-0.5 font-mono text-[0.92em] text-[#a13ab8]">
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
      className="h-full w-full overflow-y-auto border border-black/10 bg-white px-8 py-7 text-left outline-none transition hover:border-[#a13ab8]/30 focus:border-[#a13ab8]/30 focus:ring-2 focus:ring-[#a13ab8]/10"
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
      border: 1px solid #ead0f2;
      border-radius: 10px;
      background: #f4e8fb;
      color: #6f2b7d;
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
    code { border-radius: 5px; background: #f5f6f8; padding: 1px 5px; color: #6f2b7d; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.92em; }
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
