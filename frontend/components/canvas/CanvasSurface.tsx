"use client";

import {
  Background,
  BackgroundVariant,
  ReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import { memo, type ReactNode, type RefObject } from "react";
import type { CanvasEditPresencePayload, CanvasFinalSolutionSummary, CanvasSummaryDocumentBlock } from "@/lib/types";
import {
  CanvasStageEmptyOverlay,
  CanvasStatusToast,
  ProblemDefinitionPreparingOverlay,
  SummaryDocumentPendingOverlay,
} from "@/components/canvas/CanvasStatusOverlays";
import {
  ProblemCanvasToolbar,
  ProblemStructureSetupModal,
  type ProblemCanvasToolbarActionId,
} from "@/components/canvas/ProblemStructureControls";
import { SolutionCanvasView } from "@/components/canvas/SolutionCanvasView";
import type {
  SummaryParticipant,
  SummaryProblemStructureGroup,
  SummaryProblemStructureNode,
} from "@/components/canvas/SolutionPanels";

type CanvasStage = "ideation" | "problem-definition" | "solution";
type ProblemGroupStatus = "draft" | "review" | "final";
type ProblemDefinitionMode = "" | "manual" | "ai";
type ConcreteProblemDefinitionMode = Exclude<ProblemDefinitionMode, "">;
type ProblemDefinitionPhase = "explore" | "structure";
type ProblemStructureMethod = "affinity" | "card-sorting";
type SummaryDocumentSection = NonNullable<CanvasFinalSolutionSummary["sections"]>[number];

type ProblemGroupingRationale = {
  groupId: string;
  rationale: string;
  basisItems: string[];
  usedLlm: boolean;
  warning?: string;
};

export type CanvasSurfaceViewState = {
  stage: CanvasStage;
  nodes: Node[];
  problemSplitLeftEdges: Edge[];
  busy: boolean;
  canvasStatusMessage: string;
};

export type CanvasSurfaceSolutionState = {
  meetingTitle: string;
  meetingGoal: string;
  participants: SummaryParticipant[];
  finalSummaryDocument: CanvasFinalSolutionSummary;
  summaryDocumentDraftBlocks: CanvasSummaryDocumentBlock[];
  summaryDocumentDraftMarkdown: string;
  summaryDocumentDraftDirty: boolean;
  summaryEligibleStructureGroups: SummaryProblemStructureGroup[];
  summaryDocumentSectionByGroupId: Map<string, SummaryDocumentSection>;
  problemStructureNodeById: Map<string, SummaryProblemStructureNode>;
  summaryEvidenceOpenGroupIds: Set<string>;
  remoteEditPresenceByKey: Record<string, CanvasEditPresencePayload>;
  summaryDocumentEditMode: boolean;
  summaryDocumentPending: boolean;
  summaryDocumentSaving: boolean;
  solutionRightPaneRef: RefObject<HTMLElement | null>;
};

export type CanvasSurfaceProblemState = {
  problemGroupsCount: number;
  problemStructureNodesCount: number;
  problemDefinitionStagePending: boolean;
  problemStructureSetupOpen: boolean;
  problemStructureDraftMethod: ProblemStructureMethod;
  problemStructureDraftMode: ProblemDefinitionMode;
  problemStructurePending: boolean;
  problemDefinitionPhase: ProblemDefinitionPhase;
  problemStructureMethod: ProblemStructureMethod;
  problemDefinitionMode: ProblemDefinitionMode;
  activeProblemGroupingRationale: ProblemGroupingRationale | null;
  activeProblemGroupingRationaleTitle: string;
  problemCanvasToolbarActions: ProblemCanvasToolbarActionId[];
  selectedProblemStatus: ProblemGroupStatus | "";
};

export type CanvasSurfaceFlowHandlers = {
  onFlowInit: (instance: ReactFlowInstance<Node, Edge>) => void;
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  onPaneClick: (event: React.MouseEvent) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onNodeDragStart: (event: React.MouseEvent, node: Node) => void;
  onNodeDrag: (event: React.MouseEvent, node: Node) => void;
  onNodeDragStop: (event: React.MouseEvent, node: Node) => void;
};

export type CanvasSurfaceSolutionHandlers = {
  onToggleSummaryEvidence: (groupId: string) => void;
  onSetSummaryDocumentEditMode: (editMode: boolean) => void;
  onRegenerateSummaryDocument: () => void | Promise<void>;
  onRefreshSummaryCache: () => void | Promise<void>;
  onCopyFinalSolutionMarkdown: () => void | Promise<void>;
  onSaveSummaryDocument: () => void | Promise<void>;
  onSummaryDocumentBlocksChange: (blocks: CanvasSummaryDocumentBlock[]) => void;
  onSummaryDocumentMarkdownChange: (markdown: string) => void;
};

export type CanvasSurfaceProblemHandlers = {
  onCloseProblemStructureSetup: () => void;
  onProblemStructureDraftMethodChange: (method: ProblemStructureMethod) => void;
  onProblemStructureDraftModeChange: (mode: ConcreteProblemDefinitionMode) => void;
  onStartProblemStructure: () => void | Promise<void>;
  onRegenerateProblemStructure: () => void | Promise<void>;
  onRegenerateProblemDefinition: () => void | Promise<void>;
  onProblemStructureMethodChange: (method: ProblemStructureMethod) => void;
  onProblemDefinitionModeChange: (mode: ConcreteProblemDefinitionMode) => void;
  onProblemDefinitionPhaseSelect: (phase: ProblemDefinitionPhase) => void;
  onCloseProblemGroupingRationale: () => void;
  getProblemToolbarActionLabel: (action: ProblemCanvasToolbarActionId) => string;
  isProblemToolbarActionActive: (action: ProblemCanvasToolbarActionId) => boolean;
  onProblemToolbarAction: (action: ProblemCanvasToolbarActionId) => void;
  onSetProblemGroupStatus: (status: ProblemGroupStatus) => void;
};

export type CanvasSurfaceProps = {
  canvasSurfaceRef: RefObject<HTMLDivElement | null>;
  view: CanvasSurfaceViewState;
  solution: CanvasSurfaceSolutionState;
  problem: CanvasSurfaceProblemState;
  flowHandlers: CanvasSurfaceFlowHandlers;
  solutionHandlers: CanvasSurfaceSolutionHandlers;
  problemHandlers: CanvasSurfaceProblemHandlers;
  renderSummaryMarkdownPreview: (markdown: string, onEdit: () => void) => ReactNode;
};

const EMPTY_EDGES: Edge[] = [];
const REACT_FLOW_PRO_OPTIONS = { hideAttribution: true } as const;

function ProblemGroupingRationaleOverlay({
  title,
  rationale,
  onClose,
}: {
  title: string;
  rationale: ProblemGroupingRationale;
  onClose: () => void;
}) {
  return (
    <div className="absolute right-4 top-4 z-[8] w-[min(26rem,calc(100%-2rem))] rounded-[16px] border border-black/10 bg-white/95 p-4 text-left shadow-[0_18px_46px_rgba(15,23,42,0.14)] backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#236cf3]">Grouping Rationale</p>
          <h4 className="mt-1 line-clamp-2 text-[17px] font-semibold leading-6 text-black">
            {title || "문제정의 그룹"}
          </h4>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-[8px] border border-black/10 bg-[#f9f9f9] px-2.5 py-1.5 text-xs font-semibold text-[#4d4d4d] transition hover:bg-[#eef8ff] hover:text-[#236cf3]"
        >
          닫기
        </button>
      </div>
      <p className="mt-3 text-sm leading-6 text-[#333]">
        {rationale.rationale}
      </p>
      {rationale.basisItems.length > 0 ? (
        <div className="mt-4 space-y-2">
          {rationale.basisItems.map((item, index) => (
            <p key={`${rationale.groupId}-basis-${index}`} className="rounded-[10px] bg-[#f5f6f8] px-3 py-2 text-xs leading-5 text-[#4d4d4d]">
              {item}
            </p>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-medium text-[#777]">
        <span className="rounded-full bg-[#eef8ff] px-2.5 py-1 text-[#236cf3]">
          {rationale.usedLlm ? "AI 추정" : "로컬 추정"}
        </span>
        {rationale.warning ? (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
            {rationale.warning}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export const CanvasSurface = memo(function CanvasSurface({
  canvasSurfaceRef,
  view,
  solution,
  problem,
  flowHandlers,
  solutionHandlers,
  problemHandlers,
  renderSummaryMarkdownPreview,
}: CanvasSurfaceProps) {
  const {
    stage,
    nodes,
    problemSplitLeftEdges,
    busy,
    canvasStatusMessage,
  } = view;
  const {
    finalSummaryDocument,
    meetingGoal,
    meetingTitle,
    participants,
    summaryDocumentDraftBlocks,
    summaryDocumentDraftMarkdown,
    summaryDocumentDraftDirty,
    summaryEligibleStructureGroups,
    summaryDocumentSectionByGroupId,
    problemStructureNodeById,
    summaryEvidenceOpenGroupIds,
    remoteEditPresenceByKey,
    summaryDocumentEditMode,
    summaryDocumentPending,
    summaryDocumentSaving,
    solutionRightPaneRef,
  } = solution;
  const {
    problemGroupsCount,
    problemStructureNodesCount,
    problemDefinitionStagePending,
    problemStructureSetupOpen,
    problemStructureDraftMethod,
    problemStructureDraftMode,
    problemStructurePending,
    problemDefinitionPhase,
    activeProblemGroupingRationale,
    activeProblemGroupingRationaleTitle,
    problemCanvasToolbarActions,
  } = problem;
  const {
    onFlowInit,
    onNodeClick,
    onPaneClick,
    onNodesChange,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
  } = flowHandlers;
  const {
    onToggleSummaryEvidence,
    onSetSummaryDocumentEditMode,
    onRegenerateSummaryDocument,
    onRefreshSummaryCache,
    onCopyFinalSolutionMarkdown,
    onSaveSummaryDocument,
    onSummaryDocumentBlocksChange,
    onSummaryDocumentMarkdownChange,
  } = solutionHandlers;
  const {
    onCloseProblemStructureSetup,
    onProblemStructureDraftMethodChange,
    onProblemStructureDraftModeChange,
    onStartProblemStructure,
    onCloseProblemGroupingRationale,
    getProblemToolbarActionLabel,
    isProblemToolbarActionActive,
    onProblemToolbarAction,
  } = problemHandlers;
  const hasFinalProblemStructureGroups = summaryEligibleStructureGroups.length > 0;
  const showMissingFinalProblemStructureOverlay = stage === "solution" && !hasFinalProblemStructureGroups;
  const showProblemGenerationOverlay = problemDefinitionStagePending && problemGroupsCount === 0;
  const showSummaryGenerationOverlay = summaryDocumentPending && hasFinalProblemStructureGroups;

  return (
    <section ref={canvasSurfaceRef} className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#fbfbfb]">
      <div className="relative min-h-0 w-full flex-1">
        {stage === "ideation" || stage === "problem-definition" ? (
          <ReactFlow<Node, Edge>
            nodes={nodes}
            edges={stage === "problem-definition" ? problemSplitLeftEdges : EMPTY_EDGES}
            onInit={onFlowInit}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onNodesChange={onNodesChange}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            nodesConnectable={false}
            panOnDrag
            autoPanOnNodeDrag={false}
            noPanClassName="nopan"
            nodesDraggable={stage === "problem-definition"}
            minZoom={0.45}
            maxZoom={1.6}
            proOptions={REACT_FLOW_PRO_OPTIONS}
          >
            {stage === "ideation" ? (
              <Background
                id="ideation-grid"
                bgColor="#fbfbfb"
                color="#e9eef5"
                gap={18}
                size={1}
                variant={BackgroundVariant.Lines}
              />
            ) : null}
            {stage === "problem-definition" ? (
              <Background
                id="problem-definition-grid"
                bgColor={problemDefinitionPhase === "structure" ? "#f8f8f8" : "#f5f6f8"}
                color={problemDefinitionPhase === "structure" ? "#edf1f6" : "#d7dce5"}
                gap={28}
                size={1}
                variant={problemDefinitionPhase === "structure" ? BackgroundVariant.Lines : BackgroundVariant.Dots}
              />
            ) : null}
          </ReactFlow>
        ) : hasFinalProblemStructureGroups ? (
          <SolutionCanvasView
            meetingTitle={meetingTitle}
            meetingGoal={meetingGoal}
            participants={participants}
            groups={summaryEligibleStructureGroups}
            sectionByGroupId={summaryDocumentSectionByGroupId}
            nodeById={problemStructureNodeById}
            evidenceOpenGroupIds={summaryEvidenceOpenGroupIds}
            remoteEditPresenceByKey={remoteEditPresenceByKey}
            paneRef={solutionRightPaneRef}
            document={finalSummaryDocument}
            draftBlocks={summaryDocumentDraftBlocks}
            draftMarkdown={summaryDocumentDraftMarkdown}
            draftDirty={summaryDocumentDraftDirty}
            editMode={summaryDocumentEditMode}
            pending={summaryDocumentPending}
            saving={summaryDocumentSaving}
            onToggleEvidence={onToggleSummaryEvidence}
            onSetEditMode={onSetSummaryDocumentEditMode}
            onRegenerate={onRegenerateSummaryDocument}
            onRefreshCache={onRefreshSummaryCache}
            onCopy={onCopyFinalSolutionMarkdown}
            onSave={onSaveSummaryDocument}
            onBlocksChange={onSummaryDocumentBlocksChange}
            onMarkdownChange={onSummaryDocumentMarkdownChange}
            renderPreview={renderSummaryMarkdownPreview}
          />
        ) : (
          <div className="h-full min-h-0 bg-[#f8f8f8]" />
        )}
      </div>

      {stage === "problem-definition" && problemGroupsCount === 0 ? (
        <CanvasStageEmptyOverlay
          eyebrow="Problem Definition"
          message={busy ? "문제 정의 그룹을 생성하는 중입니다." : "문제 정의 그룹이 아직 없습니다."}
          tone="problem"
        />
      ) : null}

      {stage === "solution" &&
      (showMissingFinalProblemStructureOverlay ||
        (!finalSummaryDocument.markdown.trim() && !(finalSummaryDocument.document_blocks || []).length && !summaryDocumentPending)) ? (
        <CanvasStageEmptyOverlay
          eyebrow="Summary Stage"
          message={
            !showMissingFinalProblemStructureOverlay
              ? "요약 문서를 준비하는 중입니다."
              : "문제정의 2단계에서 확정된 분류가 있어야 요약 및 정리 문서를 만들 수 있습니다."
          }
          tone="summary"
        />
      ) : null}

      {showProblemGenerationOverlay ? <ProblemDefinitionPreparingOverlay /> : null}

      {stage === "problem-definition" && !problemDefinitionStagePending && problemStructureSetupOpen ? (
        <ProblemStructureSetupModal
          draftMethod={problemStructureDraftMethod}
          draftMode={problemStructureDraftMode}
          problemGroupsCount={problemGroupsCount}
          pending={problemStructurePending}
          onClose={onCloseProblemStructureSetup}
          onDraftMethodChange={onProblemStructureDraftMethodChange}
          onDraftModeChange={onProblemStructureDraftModeChange}
          onStart={onStartProblemStructure}
        />
      ) : null}

      {stage === "problem-definition" && problemDefinitionPhase !== "structure" && activeProblemGroupingRationale ? (
        <ProblemGroupingRationaleOverlay
          title={activeProblemGroupingRationaleTitle}
          rationale={activeProblemGroupingRationale}
          onClose={onCloseProblemGroupingRationale}
        />
      ) : null}

      {showSummaryGenerationOverlay ? <SummaryDocumentPendingOverlay /> : null}

      {canvasStatusMessage ? <CanvasStatusToast key={canvasStatusMessage} message={canvasStatusMessage} /> : null}

      {stage === "problem-definition" && problemDefinitionPhase !== "structure" && problemCanvasToolbarActions.length > 0 ? (
        <ProblemCanvasToolbar
          actions={problemCanvasToolbarActions}
          getActionLabel={getProblemToolbarActionLabel}
          isActionActive={isProblemToolbarActionActive}
          isActionDisabled={(item) =>
            problemDefinitionStagePending ||
            (item === "structure-start" && problemGroupsCount === 0) ||
            (item === "structure-ai-group" &&
              (problemStructurePending || (problemStructureNodesCount === 0 && problemGroupsCount === 0))) ||
            item === "structure-add-group"
          }
          onAction={onProblemToolbarAction}
        />
      ) : null}
    </section>
  );
});
