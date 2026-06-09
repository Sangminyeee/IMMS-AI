"use client";

import {
  Background,
  BackgroundVariant,
  ReactFlow,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MoaLogo } from "@/components/moa-ui/MoaLogo";
import { MoaRouteTransitionLink } from "@/components/moa-ui/MoaRouteTransitionLink";
import { buildIdeationKeywordBubbleBlueprint } from "@/components/canvas/CanvasIdeationNodeDescriptors";
import type { IdeationKeywordBubbleVisual } from "@/components/canvas/CanvasIdeationBubbles";
import type {
  CanvasFinalSolutionSummary,
  CanvasSummaryDocumentBlock,
  CanvasWorkspaceProblemGroup,
} from "@/lib/types";
import type {
  ProblemDefinitionPhase,
  ProblemStructureGroupViewModel,
  ProblemStructureNodeViewModel,
} from "@/components/canvas/problemStructureModel";

type CanvasStage = "ideation" | "problem-definition" | "solution";
export type MobileMeetingViewStage = "ideation" | "problem-explore" | "problem-structure" | "summary";

type MobileProblemGroup = CanvasWorkspaceProblemGroup & {
  status?: "draft" | "review" | "final" | string;
};

type ProblemExploreListItem = {
  root: MobileProblemGroup;
  descendants: Array<{ group: MobileProblemGroup; depth: number }>;
};

type MobileMeetingReadOnlyViewProps = {
  actualStage: CanvasStage;
  actualProblemPhase: ProblemDefinitionPhase;
  demoBalanceMode?: boolean;
  finalSummaryDocument: CanvasFinalSolutionSummary;
  ideationBubbleVisuals: IdeationKeywordBubbleVisual[];
  meetingStatus: string;
  meetingTimerEndedAtMs: number | null;
  meetingTimerStartedAtMs: number | null;
  meetingTitle: string;
  onViewedStageChange: (stage: MobileMeetingViewStage) => void;
  problemDefinitionPending: boolean;
  problemGroups: MobileProblemGroup[];
  problemStructureGroups: ProblemStructureGroupViewModel[];
  problemStructureNodes: ProblemStructureNodeViewModel[];
  problemStructurePending: boolean;
  summaryDocumentPending: boolean;
  viewedStage: MobileMeetingViewStage;
};

const EMPTY_EDGES: Edge[] = [];
const REACT_FLOW_PRO_OPTIONS = { hideAttribution: true } as const;

const MOBILE_STAGE_TABS: Array<{ stage: MobileMeetingViewStage; label: string }> = [
  { stage: "ideation", label: "아이디어" },
  { stage: "problem-explore", label: "문제정의 1" },
  { stage: "problem-structure", label: "문제정의 2" },
  { stage: "summary", label: "요약" },
];
const DEMO_MOBILE_STAGE_TABS: Array<{ stage: MobileMeetingViewStage; label: string }> = [
  { stage: "ideation", label: "아이디어" },
  { stage: "problem-explore", label: "문제정의" },
  { stage: "summary", label: "요약" },
];

function actualMobileStage(stage: CanvasStage, phase: ProblemDefinitionPhase, demoBalanceMode = false): MobileMeetingViewStage {
  if (stage === "ideation") return "ideation";
  if (stage === "solution") return "summary";
  if (demoBalanceMode) return "problem-explore";
  return phase === "structure" ? "problem-structure" : "problem-explore";
}

function mobileStageTitle(stage: MobileMeetingViewStage, demoBalanceMode = false) {
  if (stage === "ideation") return "아이디어";
  if (demoBalanceMode && (stage === "problem-explore" || stage === "problem-structure")) return "문제정의";
  if (stage === "problem-explore") return "문제정의 1단계";
  if (stage === "problem-structure") return "문제정의 2단계";
  return "요약 및 정리";
}

function formatElapsedTime(startedAtMs: number | null, endedAtMs: number | null) {
  if (!startedAtMs) return "00:00:00";
  const end = endedAtMs || Date.now();
  const totalSeconds = Math.max(0, Math.floor((end - startedAtMs) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function problemStatusLabel(status?: string) {
  if (status === "final") return "확정";
  if (status === "review") return "검토";
  return "보류";
}

function problemStatusClassName(status?: string) {
  if (status === "final") return "bg-[#01a3ff] text-white";
  if (status === "review") return "bg-[#8a9aaa] text-white";
  return "bg-[#484e54] text-white";
}

function buildProblemExploreList(problemGroups: MobileProblemGroup[]): ProblemExploreListItem[] {
  if (problemGroups.length === 0) return [];

  const groupIds = new Set(problemGroups.map((group) => group.group_id));
  const childrenByParentId = new Map<string, MobileProblemGroup[]>();
  problemGroups.forEach((group) => {
    const parentId = group.parent_group_id || "";
    const children = childrenByParentId.get(parentId) || [];
    children.push(group);
    childrenByParentId.set(parentId, children);
  });

  const roots = problemGroups.filter((group) => !group.parent_group_id || !groupIds.has(group.parent_group_id || ""));
  const rootGroups = roots.length > 0 ? roots : problemGroups.slice(0, 1);

  return rootGroups.map((root) => {
    const descendants: Array<{ group: MobileProblemGroup; depth: number }> = [];
    const queue = (childrenByParentId.get(root.group_id) || []).map((group) => ({ group, depth: 1 }));
    const seen = new Set<string>([root.group_id]);
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item || seen.has(item.group.group_id)) continue;
      seen.add(item.group.group_id);
      descendants.push(item);
      (childrenByParentId.get(item.group.group_id) || []).forEach((child) => {
        queue.push({ group: child, depth: item.depth + 1 });
      });
    }

    return { root, descendants };
  });
}

function MobileStatusBadge({ status }: { status?: string }) {
  return (
    <span className={`inline-flex h-[22px] shrink-0 items-center rounded-full px-2.5 text-[10px] font-bold leading-none tracking-[-0.025px] ${problemStatusClassName(status)}`}>
      {problemStatusLabel(status)}
    </span>
  );
}

function MobileDepthBadge({ depth }: { depth: number }) {
  return (
    <span className="inline-flex h-[21px] shrink-0 items-center rounded-full bg-[#01a3ff] px-2.5 text-[9px] font-semibold leading-none tracking-[-0.022px] text-white">
      {depth}차
    </span>
  );
}

function MobileChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 text-[#90a1b9] transition-transform ${expanded ? "rotate-180" : ""}`}
      viewBox="0 0 16 16"
      fill="none"
    >
      <path d="M4 6.25 8 10l4-3.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MobileStageSummaryBar({
  description,
  meta,
  title,
}: {
  description: string;
  meta: string;
  title: string;
}) {
  return (
    <section className="rounded-[20px] border border-[#d8e3f0] bg-white px-4 py-4 shadow-[0_14px_42px_rgba(15,23,42,0.07)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold leading-none tracking-[-0.025px] text-[#236cf3]">{meta}</p>
          <h2 className="mt-2 text-[20px] font-bold leading-[1.25] tracking-[-0.55px] text-[#111]">{title}</h2>
        </div>
      </div>
      <p className="mt-3 text-[13px] font-medium leading-6 tracking-[-0.03px] text-[#526070]">{description}</p>
    </section>
  );
}

function MobileProblemExploreChildRow({ depth, group }: { depth: number; group: MobileProblemGroup }) {
  const displayDepth = Math.max(2, (group.depth ?? depth) + 1);
  const body = group.conclusion || group.insight_lens || group.source_summary_items?.find(Boolean) || "";

  return (
    <article className="rounded-[14px] border border-[#e5edf6] bg-[#fbfdff] px-3.5 py-3">
      <div className="flex items-center gap-2">
        <MobileDepthBadge depth={displayDepth} />
        <h4 className="min-w-0 flex-1 text-[13px] font-bold leading-[1.35] tracking-[-0.03px] text-[#111]">
          {group.topic || "세부 후보"}
        </h4>
      </div>
      {body ? (
        <p className="mt-2 text-[12px] font-medium leading-5 tracking-[-0.02px] text-[#526070]">{body}</p>
      ) : null}
    </article>
  );
}

function MobileProblemExploreCard({
  expanded,
  index,
  item,
  onToggle,
}: {
  expanded: boolean;
  index: number;
  item: ProblemExploreListItem;
  onToggle: () => void;
}) {
  const body = item.root.conclusion || item.root.insight_lens || item.root.source_summary_items?.find(Boolean) || "";
  const previewChildren = item.descendants.slice(0, 2);

  return (
    <article className="overflow-hidden rounded-[22px] border border-[#d8e3f0] bg-white shadow-[0_14px_42px_rgba(15,23,42,0.07)]">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-4 py-4 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-start gap-2">
            <span className="mt-0.5 inline-flex h-[24px] shrink-0 items-center rounded-full bg-[#eff6ff] px-2.5 text-[10px] font-bold leading-none tracking-[-0.025px] text-[#236cf3]">
              분류{index + 1}
            </span>
            <span className="min-w-0 flex-1 text-[16px] font-bold leading-[1.38] tracking-[-0.42px] text-[#111]">
              {item.root.topic || "문제 후보 분류"}
            </span>
          </span>
          {body ? (
            <span className="mt-2 block line-clamp-2 text-[12px] font-medium leading-5 tracking-[-0.02px] text-[#526070]">
              {body}
            </span>
          ) : null}
          <span className="mt-3 flex w-full flex-wrap items-center gap-2">
            <MobileStatusBadge status={item.root.status} />
            <span className="text-[11px] font-semibold leading-none tracking-[-0.025px] text-[#90a1b9]">
              세부 후보 {item.descendants.length}개
            </span>
          </span>
        </span>
        <MobileChevronIcon expanded={expanded} />
      </button>

      {!expanded && previewChildren.length > 0 ? (
        <div className="border-t border-[#eef2f7] px-4 py-3">
          <div className="flex gap-2 overflow-hidden">
            {previewChildren.map(({ group, depth }) => (
              <span
                key={group.group_id}
                className="min-w-0 rounded-full border border-[#d8e3f0] bg-[#fbfdff] px-3 py-1.5 text-[11px] font-semibold leading-none tracking-[-0.025px] text-[#526070]"
              >
                {Math.max(2, (group.depth ?? depth) + 1)}차 · {group.topic || "세부 후보"}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {expanded ? (
        <div className="space-y-2 border-t border-[#eef2f7] bg-[#f8fbff] px-4 py-3">
          {item.descendants.length > 0 ? (
            item.descendants.map(({ group, depth }) => (
              <MobileProblemExploreChildRow key={group.group_id} depth={depth} group={group} />
            ))
          ) : (
            <p className="rounded-[14px] border border-dashed border-[#d8e3f0] bg-white px-4 py-5 text-center text-[12px] font-medium leading-5 text-[#90a1b9]">
              아직 세부 후보가 없습니다.
            </p>
          )}
        </div>
      ) : null}
    </article>
  );
}

function MobileProblemExploreList({ demoBalanceMode = false, items }: { demoBalanceMode?: boolean; items: ProblemExploreListItem[] }) {
  const [expandedId, setExpandedId] = useState<string>("");
  const totalChildren = items.reduce((sum, item) => sum + item.descendants.length, 0);

  return (
    <section className="h-full overflow-y-auto bg-[#f8fbff] px-4 py-4">
      <div className="mx-auto max-w-[720px] space-y-3 pb-[calc(env(safe-area-inset-bottom)+18px)]">
        <MobileStageSummaryBar
          title={demoBalanceMode ? "문제정의" : "문제정의 1단계"}
          meta={`분류 ${items.length}개 · 세부 후보 ${totalChildren}개`}
          description={
            demoBalanceMode
              ? "A/B 선택 의견을 선택지별 논점과 근거 중심으로 정리했습니다."
              : "전체 회의 흐름에서 뽑힌 문제 후보를 분류 단위로 정리했습니다."
          }
        />
        {items.map((item, index) => (
          <MobileProblemExploreCard
            key={item.root.group_id}
            expanded={expandedId === item.root.group_id}
            index={index}
            item={item}
            onToggle={() => setExpandedId((current) => (current === item.root.group_id ? "" : item.root.group_id))}
          />
        ))}
      </div>
    </section>
  );
}

function MobileProblemStructureNodeRow({ node }: { node: ProblemStructureNodeViewModel }) {
  return (
    <article className="rounded-[14px] border border-[#e5edf6] bg-[#fbfdff] px-3.5 py-3">
      <div className="flex items-center gap-2">
        <MobileDepthBadge depth={Math.max(2, (node.depth || 0) + 2)} />
        <h4 className="min-w-0 flex-1 text-[13px] font-bold leading-[1.35] tracking-[-0.03px] text-[#111]">
          {node.title || "구조화 노드"}
        </h4>
        <MobileStatusBadge status={node.status} />
      </div>
      {node.body ? (
        <p className="mt-2 text-[12px] font-medium leading-5 tracking-[-0.02px] text-[#526070]">{node.body}</p>
      ) : null}
    </article>
  );
}

function MobileProblemStructureCard({
  expanded,
  group,
  index,
  nodes,
  onToggle,
}: {
  expanded: boolean;
  group: ProblemStructureGroupViewModel;
  index: number;
  nodes: ProblemStructureNodeViewModel[];
  onToggle: () => void;
}) {
  const previewNodes = nodes.slice(0, 2);

  return (
    <article className="overflow-hidden rounded-[22px] border border-[#d8e3f0] bg-white shadow-[0_14px_42px_rgba(15,23,42,0.07)]">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-4 py-4 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-start gap-2">
            <span className="mt-0.5 inline-flex h-[24px] shrink-0 items-center rounded-full bg-[#eff6ff] px-2.5 text-[10px] font-bold leading-none tracking-[-0.025px] text-[#236cf3]">
              묶음{index + 1}
            </span>
            <span className="min-w-0 flex-1 text-[16px] font-bold leading-[1.38] tracking-[-0.42px] text-[#111]">
              {group.title || "구조화 그룹"}
            </span>
          </span>
          <span className="mt-3 flex w-full flex-wrap items-center gap-2">
            <MobileStatusBadge status={group.status} />
            <span className="text-[11px] font-semibold leading-none tracking-[-0.025px] text-[#90a1b9]">
              포함 노드 {nodes.length}개
            </span>
          </span>
        </span>
        <MobileChevronIcon expanded={expanded} />
      </button>

      {!expanded && previewNodes.length > 0 ? (
        <div className="border-t border-[#eef2f7] px-4 py-3">
          <div className="space-y-2">
            {previewNodes.map((node) => (
              <p key={node.id} className="line-clamp-1 text-[12px] font-semibold leading-5 tracking-[-0.02px] text-[#526070]">
                {node.title || "구조화 노드"}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      {expanded ? (
        <div className="space-y-2 border-t border-[#eef2f7] bg-[#f8fbff] px-4 py-3">
          {nodes.length > 0 ? (
            nodes.map((node) => <MobileProblemStructureNodeRow key={node.id} node={node} />)
          ) : (
            <p className="rounded-[14px] border border-dashed border-[#d8e3f0] bg-white px-4 py-5 text-center text-[12px] font-medium leading-5 text-[#90a1b9]">
              포함된 노드가 없습니다.
            </p>
          )}
        </div>
      ) : null}
    </article>
  );
}

function MobileProblemStructureList({
  groups,
  nodes,
}: {
  groups: ProblemStructureGroupViewModel[];
  nodes: ProblemStructureNodeViewModel[];
}) {
  const [expandedId, setExpandedId] = useState<string>("");
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const finalCount = groups.filter((group) => group.status === "final").length;
  const reviewCount = groups.filter((group) => group.status === "review").length;

  return (
    <section className="h-full overflow-y-auto bg-[#f8fbff] px-4 py-4">
      <div className="mx-auto max-w-[720px] space-y-3 pb-[calc(env(safe-area-inset-bottom)+18px)]">
        <MobileStageSummaryBar
          title="문제정의 2단계"
          meta={`묶음 ${groups.length}개 · 확정 ${finalCount}개 · 검토 ${reviewCount}개`}
          description="1단계 후보를 묶음 단위로 구조화한 결과입니다."
        />
        {groups.map((group, index) => {
          const cards = group.nodeIds.map((nodeId) => nodeById.get(nodeId)).filter(Boolean) as ProblemStructureNodeViewModel[];
          return (
            <MobileProblemStructureCard
              key={group.id}
              expanded={expandedId === group.id}
              group={group}
              index={index}
              nodes={cards}
              onToggle={() => setExpandedId((current) => (current === group.id ? "" : group.id))}
            />
          );
        })}
      </div>
    </section>
  );
}

function simpleInlineTokens(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={`${part}-${index}`} className="rounded bg-[#eef4ff] px-1 py-0.5 text-[#236cf3]">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

function parseMarkdownTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isMarkdownTableSeparator(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function renderMarkdownBlocks(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let index = 0;
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={`list-${blocks.length}`} className="my-2.5 space-y-1.5 pl-4 text-[12px] leading-6 text-[#334155]">
        {listItems.map((item, itemIndex) => (
          <li key={`${item}-${itemIndex}`} className="list-disc">
            {simpleInlineTokens(item)}
          </li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  while (index < lines.length) {
    const line = (lines[index] || "").trim();
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
      blocks.push(<MobileTable key={`table-${blocks.length}`} headers={headers} rows={rows} />);
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = heading[1].length;
      const text = heading[2];
      if (level === 1) {
        blocks.push(<p key={`heading-${index}`} className="mb-3 mt-1 text-[18px] font-extrabold leading-[1.3] tracking-[-0.54px] text-[#111]">{simpleInlineTokens(text)}</p>);
      } else if (level === 2) {
        blocks.push(<p key={`heading-${index}`} className="mb-2 mt-5 border-t border-[#d8e3f0] pt-4 text-[16px] font-extrabold leading-[1.35] tracking-[-0.45px] text-[#111]">{simpleInlineTokens(text)}</p>);
      } else {
        blocks.push(<p key={`heading-${index}`} className="mb-1.5 mt-3 text-[14px] font-bold leading-[1.4] tracking-[-0.03px] text-[#1f2937]">{simpleInlineTokens(text)}</p>);
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
      <p key={`paragraph-${index}`} className="my-2.5 text-[12px] font-medium leading-6 tracking-[-0.02px] text-[#334155]">
        {simpleInlineTokens(line)}
      </p>,
    );
    index += 1;
  }

  flushList();
  return blocks;
}

type MobileTableViewMode = "cards" | "table";

function MobileTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  const [viewMode, setViewMode] = useState<MobileTableViewMode>("cards");
  const titleHeader = headers[0] || "항목";
  const detailHeaders = headers.slice(1);

  return (
    <section className="my-3 overflow-hidden rounded-[14px] border border-[#d8e3f0] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[#eef2f7] bg-[#fbfdff] px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-extrabold leading-[1.35] tracking-[-0.03px] text-[#111]">{titleHeader}</p>
          <p className="mt-0.5 text-[10px] font-semibold leading-none tracking-[-0.02px] text-[#90a1b9]">
            {rows.length}개 항목 · {headers.length}개 컬럼
          </p>
        </div>
        <div className="grid shrink-0 grid-cols-2 rounded-full bg-[#eef4fb] p-0.5">
          {([
            ["cards", "카드"],
            ["table", "표"],
          ] as const).map(([mode, label]) => {
            const active = viewMode === mode;
            return (
              <button
                key={mode}
                type="button"
                aria-pressed={active}
                onClick={() => setViewMode(mode)}
                className={`h-[26px] rounded-full px-3 transition ${
                  active
                    ? "bg-[linear-gradient(90deg,#54c1ff_32.705%,#2f70e9_157.88%)] text-white shadow-[0_5px_14px_rgba(35,108,243,0.16)]"
                    : "text-[#526070]"
                }`}
              >
                <span className="text-[10px] font-bold leading-none tracking-[-0.02px]">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12px] font-medium leading-5 text-[#90a1b9]">표 내용이 없습니다.</p>
      ) : viewMode === "cards" ? (
        <div className="space-y-2 bg-[#f8fbff] p-2.5">
          {rows.map((row, rowIndex) => {
            const title = row[0] || `${rowIndex + 1}번째 항목`;
            return (
              <article key={`card-${rowIndex}`} className="rounded-[12px] border border-[#e5edf6] bg-white px-3 py-3 shadow-[0_8px_22px_rgba(15,23,42,0.04)]">
                <p className="text-[10px] font-bold leading-none tracking-[-0.02px] text-[#236cf3]">{titleHeader}</p>
                <p className="mt-1.5 text-[13px] font-extrabold leading-[1.35] tracking-[-0.03px] text-[#111]">
                  {simpleInlineTokens(title)}
                </p>
                {detailHeaders.length > 0 ? (
                  <dl className="mt-3 space-y-2">
                    {detailHeaders.map((header, detailIndex) => {
                      const value = row[detailIndex + 1] || "-";
                      return (
                        <div key={`${header}-${detailIndex}`} className="rounded-[10px] bg-[#f8fbff] px-3 py-2">
                          <dt className="text-[10px] font-bold leading-none tracking-[-0.02px] text-[#90a1b9]">{header}</dt>
                          <dd className="mt-1.5 text-[12px] font-medium leading-5 tracking-[-0.02px] text-[#526070]">
                            {simpleInlineTokens(value)}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="imms-overlay-scroll overflow-x-auto">
          <table className="moa-mobile-summary-table min-w-[520px] table-fixed border-collapse text-left text-[12px]">
            <thead className="bg-[#f3f8ff] text-[#111]">
              <tr>
                {headers.map((header, index) => (
                  <th key={`${header}-${index}`} className="border-b border-[#d8e3f0] px-2.5 py-2.5 text-[12px] font-extrabold leading-[1.25] tracking-[-0.03px]">
                    {simpleInlineTokens(header)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`} className="border-b border-[#eef2f7] last:border-b-0">
                  {headers.map((_, cellIndex) => (
                    <td key={`cell-${rowIndex}-${cellIndex}`} className="break-words px-2.5 py-2.5 align-top text-[12px] font-medium leading-[1.45] tracking-[-0.03px] text-[#526070]">
                      {simpleInlineTokens(row[cellIndex] || "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function renderDocumentBlocks(blocks: CanvasSummaryDocumentBlock[]) {
  return blocks.map((block) => {
    if (block.type === "heading") {
      const className =
        block.level === 1
          ? "mb-3 mt-1 text-[18px] font-extrabold leading-[1.3] tracking-[-0.54px] text-[#111]"
          : block.level === 2
            ? "mb-2 mt-5 border-t border-[#d8e3f0] pt-4 text-[16px] font-extrabold leading-[1.35] tracking-[-0.45px] text-[#111]"
            : "mb-1.5 mt-3 text-[14px] font-bold leading-[1.4] tracking-[-0.03px] text-[#1f2937]";
      return <p key={block.id} className={className}>{block.text}</p>;
    }
    if (block.type === "paragraph") {
      return <p key={block.id} className="my-2.5 text-[12px] font-medium leading-6 tracking-[-0.02px] text-[#334155]">{block.text}</p>;
    }
    if (block.type === "bullets") {
      return (
        <ul key={block.id} className="my-2.5 space-y-1.5 pl-4 text-[12px] leading-6 text-[#334155]">
          {block.items.map((item, index) => <li key={`${block.id}-${index}`} className="list-disc">{item}</li>)}
        </ul>
      );
    }
    return (
      <section key={block.id} className="my-3">
        {block.title ? <p className="mb-2 text-[16px] font-extrabold leading-[1.35] tracking-[-0.45px] text-[#111]">{block.title}</p> : null}
        <MobileTable
          headers={block.columns.map((column) => column.title)}
          rows={block.rows.map((row) => block.columns.map((column) => row.cells[column.id] || ""))}
        />
      </section>
    );
  });
}

function MobileSummaryDocument({ document }: { document: CanvasFinalSolutionSummary }) {
  const blocks = document.markdown.trim()
    ? renderMarkdownBlocks(document.markdown)
    : document.document_blocks?.length
      ? renderDocumentBlocks(document.document_blocks)
      : [];

  return (
    <article className="h-full overflow-y-auto bg-[#f8fbff] px-4 py-5">
      <div className="mx-auto min-h-full max-w-[720px] rounded-[18px] border border-[#d8e3f0] bg-white px-5 py-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
        {blocks.length > 0 ? blocks : (
          <p className="py-12 text-center text-[14px] font-medium leading-7 text-[#90a1b9]">
            요약 문서가 아직 없습니다.
          </p>
        )}
      </div>
    </article>
  );
}

function MobileEmptyState({ message, title }: { message: string; title: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-[#f8fbff] px-6">
      <div className="w-full max-w-[360px] rounded-[22px] border border-[#d8e3f0] bg-white px-6 py-8 text-center shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
        <p className="text-[12px] font-bold leading-none tracking-[-0.03px] text-[#236cf3]">{title}</p>
        <p className="mt-4 text-[15px] font-semibold leading-7 tracking-[-0.03px] text-[#334155]">{message}</p>
      </div>
    </div>
  );
}

export const MobileMeetingReadOnlyView = memo(function MobileMeetingReadOnlyView({
  actualProblemPhase,
  actualStage,
  demoBalanceMode = false,
  finalSummaryDocument,
  ideationBubbleVisuals,
  meetingStatus,
  meetingTimerEndedAtMs,
  meetingTimerStartedAtMs,
  meetingTitle,
  onViewedStageChange,
  problemDefinitionPending,
  problemGroups,
  problemStructureGroups,
  problemStructureNodes,
  problemStructurePending,
  summaryDocumentPending,
  viewedStage,
}: MobileMeetingReadOnlyViewProps) {
  const flowRef = useRef<ReactFlowInstance<Node, Edge> | null>(null);
  const stageTabs = demoBalanceMode ? DEMO_MOBILE_STAGE_TABS : MOBILE_STAGE_TABS;
  const currentActualMobileStage = actualMobileStage(actualStage, actualProblemPhase, demoBalanceMode);
  const hasProblemExplore = problemGroups.length > 0;
  const hasProblemStructure = problemStructureGroups.length > 0;
  const hasSummaryDocument =
    finalSummaryDocument.markdown.trim().length > 0 || Boolean(finalSummaryDocument.document_blocks?.length);
  const elapsed = formatElapsedTime(meetingTimerStartedAtMs, meetingTimerEndedAtMs);

  const ideationNodes = useMemo(
    () =>
      buildIdeationKeywordBubbleBlueprint({
        bubbles: ideationBubbleVisuals,
        debugGrowthById: {},
        layoutRevision: 0,
        stage: "ideation",
        demoBalanceMode,
      }).nodeDescriptors as Node[],
    [demoBalanceMode, ideationBubbleVisuals],
  );
  const problemExploreItems = useMemo(() => buildProblemExploreList(problemGroups), [problemGroups]);
  const ideationNodeSignature = ideationNodes.map((node) => `${node.id}:${node.position.x}:${node.position.y}`).join("|");

  useEffect(() => {
    if (demoBalanceMode && viewedStage === "problem-structure") {
      onViewedStageChange("problem-explore");
    }
  }, [demoBalanceMode, onViewedStageChange, viewedStage]);

  useEffect(() => {
    if (!flowRef.current || viewedStage !== "ideation") return;
    window.requestAnimationFrame(() => {
      void flowRef.current?.fitView({ duration: 260, padding: 0.22 });
    });
  }, [ideationNodeSignature, viewedStage]);

  let emptyTitle = "";
  let emptyMessage = "";
  if (viewedStage === "problem-explore" && !hasProblemExplore) {
    emptyTitle = demoBalanceMode ? "문제정의" : "문제정의 1단계";
    emptyMessage = problemDefinitionPending
      ? `${demoBalanceMode ? "문제정의" : "문제정의 1단계"}를 생성 중입니다. 완료되면 자동으로 반영됩니다.`
      : `아직 ${demoBalanceMode ? "문제정의" : "문제정의 1단계"}가 생성되지 않았습니다.`;
  } else if (viewedStage === "problem-structure" && !hasProblemStructure) {
    emptyTitle = "문제정의 2단계";
    emptyMessage = problemStructurePending
      ? "문제정의 2단계를 생성 중입니다. 완료되면 자동으로 반영됩니다."
      : "아직 문제정의 2단계가 생성되지 않았습니다.";
  } else if (viewedStage === "summary" && !hasSummaryDocument) {
    emptyTitle = "요약 및 정리";
    emptyMessage = summaryDocumentPending
      ? "요약 및 정리 문서를 생성 중입니다. 완료되면 자동으로 반영됩니다."
      : "아직 요약 및 정리 문서가 생성되지 않았습니다.";
  }

  const showIdeationFlow = viewedStage === "ideation" && !emptyMessage;
  const showPendingBanner =
    (viewedStage === "problem-explore" && problemDefinitionPending && hasProblemExplore) ||
    (viewedStage === "problem-structure" && problemStructurePending && hasProblemStructure) ||
    (viewedStage === "summary" && summaryDocumentPending && hasSummaryDocument);

  return (
    <section className="flex h-full min-h-0 flex-col bg-[#f8fbff] text-[#111]">
      <header className="shrink-0 border-b border-[#d8e3f0] bg-white px-4 pb-2.5 pt-[calc(env(safe-area-inset-top)+10px)] shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <MoaRouteTransitionLink
              href="/dashboard"
              aria-label="메인화면으로 이동"
              className="-m-2 grid shrink-0 place-items-center rounded-[10px] p-2 outline-none transition hover:bg-[#f5f9ff] focus-visible:ring-2 focus-visible:ring-[#01a3ff] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
            >
              <MoaLogo size="figma" showText={false} markClassName="h-[22px] w-[36px]" />
            </MoaRouteTransitionLink>
            <div className="min-w-0">
              <p className="truncate text-[18px] font-bold leading-[1.2] tracking-[-0.45px] text-[#111]">
                {meetingTitle || "회의 워크스페이스"}
              </p>
              <div className="mt-1 flex min-w-0 items-center gap-1.5">
                <span className="rounded-full border border-[#01a3ff]/30 bg-[#eff8ff] px-2 py-0.5 text-[9px] font-bold leading-none tracking-[-0.02px] text-[#236cf3]">
                  읽기 전용
                </span>
                <span className="truncate text-[10px] font-semibold leading-none tracking-[-0.02px] text-[#90a1b9]">
                  현재 {mobileStageTitle(currentActualMobileStage, demoBalanceMode)}
                </span>
              </div>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-[#f3f8ff] px-3 py-1.5 text-[11px] font-bold leading-none text-[#526070]">
            {meetingStatus === "completed" ? "종료" : "진행"} · {elapsed}
          </span>
        </div>

        <nav className={`mt-3 grid ${demoBalanceMode ? "grid-cols-3" : "grid-cols-4"} rounded-[18px] bg-[#eef4fb] p-1`} aria-label="모바일 회의 단계">
          {stageTabs.map((tab) => {
            const active = tab.stage === viewedStage;
            const current = tab.stage === currentActualMobileStage;
            return (
              <button
                key={tab.stage}
                type="button"
                aria-pressed={active}
                onClick={() => onViewedStageChange(tab.stage)}
                className={`relative inline-flex h-[32px] min-w-0 items-center justify-center rounded-[14px] transition ${
                  active
                    ? "bg-[linear-gradient(90deg,#54c1ff_32.705%,#2f70e9_157.88%)] text-white shadow-[0_5px_16px_rgba(35,108,243,0.18)]"
                    : "text-[#526070]"
                }`}
              >
                <span className="truncate text-[11px] font-bold leading-none tracking-[-0.025px]">{tab.label}</span>
                {current ? (
                  <span className={`ml-1.5 h-[5px] w-[5px] shrink-0 rounded-full ${active ? "bg-white" : "bg-[#01a3ff]"}`} />
                ) : null}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="relative min-h-0 flex-1 overflow-hidden">
        {showPendingBanner ? (
          <div className="pointer-events-none absolute left-1/2 top-4 z-20 w-[calc(100%-32px)] max-w-[420px] -translate-x-1/2">
            <div className="moa-toast-pop rounded-full border border-[#d8e3f0] bg-white/95 px-4 py-2 text-center text-[12px] font-semibold leading-5 text-[#526070] shadow-[0_8px_28px_rgba(15,23,42,0.1)]">
              생성 중입니다. 완료되면 자동으로 반영됩니다.
            </div>
          </div>
        ) : null}

        <div key={viewedStage} className="moa-mobile-stage-surface h-full min-h-0">
          {emptyMessage ? (
            <MobileEmptyState title={emptyTitle} message={emptyMessage} />
          ) : viewedStage === "summary" ? (
            <MobileSummaryDocument document={finalSummaryDocument} />
          ) : viewedStage === "problem-explore" ? (
            <MobileProblemExploreList demoBalanceMode={demoBalanceMode} items={problemExploreItems} />
          ) : viewedStage === "problem-structure" ? (
            <MobileProblemStructureList groups={problemStructureGroups} nodes={problemStructureNodes} />
          ) : showIdeationFlow ? (
            <ReactFlow<Node, Edge>
              key="mobile-ideation"
              nodes={ideationNodes}
              edges={EMPTY_EDGES}
              onInit={(instance) => {
                flowRef.current = instance;
                window.requestAnimationFrame(() => {
                  void instance.fitView({ duration: 0, padding: 0.22 });
                });
              }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              panOnDrag
              zoomOnPinch
              zoomOnScroll
              minZoom={0.24}
              maxZoom={1.55}
              proOptions={REACT_FLOW_PRO_OPTIONS}
            >
              <Background
                id="mobile-ideation-grid"
                bgColor="#f8fbff"
                color="#e9eef5"
                gap={18}
                size={1}
                variant={BackgroundVariant.Lines}
              />
            </ReactFlow>
          ) : null}
        </div>
      </main>
    </section>
  );
});
