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
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { useMoaPresence, useMoaPresenceValue } from "@/components/moa-ui/useMoaPresence";
import { classNames } from "@/lib/classNames";
import type {
  CanvasArtifactGenerationStatus,
  CanvasEditPresencePayload,
  CanvasFinalSolutionSummary,
  CanvasSummaryDocumentBlock,
} from "@/lib/types";
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
  summaryDocumentGenerationStatus: CanvasArtifactGenerationStatus;
  summaryDocumentGenerationError: string;
  summaryDocumentSaving: boolean;
  solutionRightPaneRef: RefObject<HTMLElement | null>;
};

export type CanvasSurfaceProblemState = {
  demoBalanceMode?: boolean;
  problemGroupsCount: number;
  problemStructureNodesCount: number;
  problemDefinitionStagePending: boolean;
  problemDefinitionGenerationStatus: CanvasArtifactGenerationStatus;
  problemDefinitionGenerationError: string;
  problemStructureSetupOpen: boolean;
  problemStructureDraftMethod: ProblemStructureMethod;
  problemStructureDraftMode: ProblemDefinitionMode;
  problemStructurePending: boolean;
  problemStructureGenerationStatus: CanvasArtifactGenerationStatus;
  problemStructureGenerationError: string;
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
const CANVAS_STAGE_FADE_OUT_MS = 260;
const CANVAS_STAGE_FADE_IN_MS = 740;

type CanvasStageTransitionPhase = "idle" | "out" | "in";

type CanvasSurfaceStageSnapshot = {
  key: string;
  stage: CanvasStage;
  problemDefinitionPhase: ProblemDefinitionPhase;
  nodes: Node[];
  problemSplitLeftEdges: Edge[];
  solution: CanvasSurfaceSolutionState;
  hasFinalProblemStructureGroups: boolean;
};

function ProblemGroupingRationaleOverlay({
  exiting = false,
  title,
  rationale,
  onClose,
}: {
  exiting?: boolean;
  title: string;
  rationale: ProblemGroupingRationale;
  onClose: () => void;
}) {
  return (
    <div className="moa-popover-panel absolute right-4 top-4 z-[8] w-[min(26rem,calc(100%-2rem))] rounded-[16px] border border-black/10 bg-white/95 p-4 text-left shadow-[0_18px_46px_rgba(15,23,42,0.14)] backdrop-blur" data-exiting={exiting}>
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
    summaryDocumentGenerationStatus,
    summaryDocumentGenerationError,
    summaryDocumentSaving,
    solutionRightPaneRef,
  } = solution;
  const {
    demoBalanceMode,
    problemGroupsCount,
    problemStructureNodesCount,
    problemDefinitionStagePending,
    problemDefinitionGenerationStatus,
    problemDefinitionGenerationError,
    problemStructureSetupOpen,
    problemStructureDraftMethod,
    problemStructureDraftMode,
    problemStructurePending,
    problemStructureGenerationStatus,
    problemStructureGenerationError,
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
  const problemDefinitionFailed = problemDefinitionGenerationStatus === "failed";
  const problemStructureFailed = problemStructureGenerationStatus === "failed";
  const summaryDocumentFailed = summaryDocumentGenerationStatus === "failed";
  const showProblemGenerationOverlay = problemDefinitionStagePending && problemGroupsCount === 0;
  const showSummaryGenerationOverlay = summaryDocumentPending && hasFinalProblemStructureGroups;
  const showProblemEmptyOverlay = stage === "problem-definition" && problemGroupsCount === 0;
  const showSummaryEmptyOverlay =
    stage === "solution" &&
    (showMissingFinalProblemStructureOverlay ||
      (!finalSummaryDocument.markdown.trim() && !(finalSummaryDocument.document_blocks || []).length && !summaryDocumentPending));
  const showProblemStructureSetup = stage === "problem-definition" && !problemDefinitionStagePending && problemStructureSetupOpen;
  const problemRationalePresence = useMoaPresenceValue(
    stage === "problem-definition" && problemDefinitionPhase !== "structure" && activeProblemGroupingRationale
      ? { rationale: activeProblemGroupingRationale, title: activeProblemGroupingRationaleTitle }
      : null,
  );
  const showProblemToolbar =
    stage === "problem-definition" && problemDefinitionPhase !== "structure" && problemCanvasToolbarActions.length > 0;
  const problemEmptyPresence = useMoaPresence(showProblemEmptyOverlay);
  const summaryEmptyPresence = useMoaPresence(showSummaryEmptyOverlay);
  const problemGenerationPresence = useMoaPresence(showProblemGenerationOverlay);
  const summaryGenerationPresence = useMoaPresence(showSummaryGenerationOverlay);
  const problemStructureSetupPresence = useMoaPresence(showProblemStructureSetup);
  const problemToolbarPresence = useMoaPresence(showProblemToolbar);
  const stageSurfaceKey = stage === "problem-definition" ? `${stage}:${problemDefinitionPhase}` : stage;
  const currentStageSurfaceSnapshot = useMemo<CanvasSurfaceStageSnapshot>(
    () => ({
      key: stageSurfaceKey,
      stage,
      problemDefinitionPhase,
      nodes,
      problemSplitLeftEdges,
      solution,
      hasFinalProblemStructureGroups,
    }),
    [
      hasFinalProblemStructureGroups,
      nodes,
      problemDefinitionPhase,
      problemSplitLeftEdges,
      solution,
      stage,
      stageSurfaceKey,
    ],
  );
  const requestedStageSurfaceKeyRef = useRef(stageSurfaceKey);
  const displayedStageSurfaceSnapshotRef = useRef<CanvasSurfaceStageSnapshot>(currentStageSurfaceSnapshot);
  const stageTransitionTimersRef = useRef<{
    switchTimer: ReturnType<typeof setTimeout> | null;
    idleTimer: ReturnType<typeof setTimeout> | null;
  }>({ switchTimer: null, idleTimer: null });
  const [stageTransitionPhase, setStageTransitionPhase] = useState<CanvasStageTransitionPhase>("idle");
  const [transitionStageSurfaceSnapshot, setTransitionStageSurfaceSnapshot] =
    useState<CanvasSurfaceStageSnapshot | null>(null);
  const renderedStageSurfaceSnapshot = transitionStageSurfaceSnapshot || currentStageSurfaceSnapshot;

  useLayoutEffect(() => {
    if (requestedStageSurfaceKeyRef.current === stageSurfaceKey) return;

    requestedStageSurfaceKeyRef.current = stageSurfaceKey;

    if (stageTransitionTimersRef.current.switchTimer) {
      clearTimeout(stageTransitionTimersRef.current.switchTimer);
      stageTransitionTimersRef.current.switchTimer = null;
    }
    if (stageTransitionTimersRef.current.idleTimer) {
      clearTimeout(stageTransitionTimersRef.current.idleTimer);
      stageTransitionTimersRef.current.idleTimer = null;
    }

    setTransitionStageSurfaceSnapshot(displayedStageSurfaceSnapshotRef.current);
    setStageTransitionPhase("out");
    stageTransitionTimersRef.current.switchTimer = setTimeout(() => {
      setTransitionStageSurfaceSnapshot(null);
      setStageTransitionPhase("in");
      stageTransitionTimersRef.current.switchTimer = null;
      stageTransitionTimersRef.current.idleTimer = setTimeout(() => {
        setStageTransitionPhase("idle");
        stageTransitionTimersRef.current.idleTimer = null;
      }, CANVAS_STAGE_FADE_IN_MS);
    }, CANVAS_STAGE_FADE_OUT_MS);
  }, [currentStageSurfaceSnapshot, stageSurfaceKey]);

  useLayoutEffect(() => {
    displayedStageSurfaceSnapshotRef.current = renderedStageSurfaceSnapshot;
  });

  useEffect(() => {
    return () => {
      if (stageTransitionTimersRef.current.switchTimer) {
        clearTimeout(stageTransitionTimersRef.current.switchTimer);
        stageTransitionTimersRef.current.switchTimer = null;
      }
      if (stageTransitionTimersRef.current.idleTimer) {
        clearTimeout(stageTransitionTimersRef.current.idleTimer);
        stageTransitionTimersRef.current.idleTimer = null;
      }
    };
  }, []);

  function renderStageSurfaceContent(snapshot: CanvasSurfaceStageSnapshot) {
    const snapshotSolution = snapshot.solution;

    if (snapshot.stage === "ideation" || snapshot.stage === "problem-definition") {
      return (
        <ReactFlow<Node, Edge>
          nodes={snapshot.nodes}
          edges={snapshot.stage === "problem-definition" ? snapshot.problemSplitLeftEdges : EMPTY_EDGES}
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
          nodesDraggable={snapshot.stage === "problem-definition"}
          minZoom={0.45}
          maxZoom={1.6}
          proOptions={REACT_FLOW_PRO_OPTIONS}
        >
          {snapshot.stage === "ideation" ? (
            <Background
              id="ideation-grid"
              bgColor="#fdfdfd"
              color="#edf5fb"
              gap={16}
              size={1}
              variant={BackgroundVariant.Lines}
            />
          ) : null}
          {snapshot.stage === "problem-definition" ? (
            <Background
              id="problem-definition-grid"
              bgColor={snapshot.problemDefinitionPhase === "structure" ? "#f8f8f8" : "#f5f6f8"}
              color={snapshot.problemDefinitionPhase === "structure" ? "#edf1f6" : "#d7dce5"}
              gap={28}
              size={1}
              variant={snapshot.problemDefinitionPhase === "structure" ? BackgroundVariant.Lines : BackgroundVariant.Dots}
            />
          ) : null}
        </ReactFlow>
      );
    }

    if (snapshot.hasFinalProblemStructureGroups) {
      return (
        <SolutionCanvasView
          meetingTitle={snapshotSolution.meetingTitle}
          meetingGoal={snapshotSolution.meetingGoal}
          participants={snapshotSolution.participants}
          groups={snapshotSolution.summaryEligibleStructureGroups}
          sectionByGroupId={snapshotSolution.summaryDocumentSectionByGroupId}
          nodeById={snapshotSolution.problemStructureNodeById}
          evidenceOpenGroupIds={snapshotSolution.summaryEvidenceOpenGroupIds}
          remoteEditPresenceByKey={snapshotSolution.remoteEditPresenceByKey}
          paneRef={snapshotSolution.solutionRightPaneRef}
          document={snapshotSolution.finalSummaryDocument}
          draftBlocks={snapshotSolution.summaryDocumentDraftBlocks}
          draftMarkdown={snapshotSolution.summaryDocumentDraftMarkdown}
          draftDirty={snapshotSolution.summaryDocumentDraftDirty}
          editMode={snapshotSolution.summaryDocumentEditMode}
          pending={snapshotSolution.summaryDocumentPending}
          generationStatus={snapshotSolution.summaryDocumentGenerationStatus}
          generationError={snapshotSolution.summaryDocumentGenerationError}
          saving={snapshotSolution.summaryDocumentSaving}
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
      );
    }

    return <div className="h-full min-h-0 bg-[#f8f8f8]" />;
  }

  return (
    <section
      ref={canvasSurfaceRef}
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#fbfbfb]"
      style={
        {
          "--moa-canvas-stage-fade-out-ms": `${CANVAS_STAGE_FADE_OUT_MS}ms`,
          "--moa-canvas-stage-fade-in-ms": `${CANVAS_STAGE_FADE_IN_MS}ms`,
        } as CSSProperties
      }
    >
      <div
        className={classNames(
          "moa-canvas-stage-surface relative min-h-0 w-full flex-1",
          stageTransitionPhase === "out" && "moa-canvas-stage-surface-out",
          stageTransitionPhase === "in" && "moa-canvas-stage-surface-in",
          stageTransitionPhase !== "idle" && "moa-canvas-stage-surface-transitioning",
        )}
      >
        {renderStageSurfaceContent(renderedStageSurfaceSnapshot)}
      </div>

      {problemEmptyPresence.shouldRender ? (
        <CanvasStageEmptyOverlay
          eyebrow="Problem Definition"
          exiting={problemEmptyPresence.isExiting}
          message={
            problemDefinitionFailed
              ? `${demoBalanceMode ? "문제정의" : "문제정의 1단계"} 생성에 실패했습니다.${problemDefinitionGenerationError ? ` ${problemDefinitionGenerationError}` : ""}`
              : busy
                ? "문제 정의 그룹을 생성하는 중입니다."
                : "문제 정의 그룹이 아직 없습니다."
          }
          tone="problem"
        />
      ) : null}

      {summaryEmptyPresence.shouldRender ? (
        <CanvasStageEmptyOverlay
          eyebrow="Summary Stage"
          exiting={summaryEmptyPresence.isExiting}
          message={
            summaryDocumentFailed && hasFinalProblemStructureGroups
              ? `요약 문서 생성에 실패했습니다.${summaryDocumentGenerationError ? ` ${summaryDocumentGenerationError}` : ""}`
              : !showMissingFinalProblemStructureOverlay
              ? "요약 문서를 준비하는 중입니다."
              : demoBalanceMode
                ? "문제정의에서 A/B 의견 정리가 있어야 요약 및 정리 문서를 만들 수 있습니다."
                : "문제정의 2단계에서 확정된 분류가 있어야 요약 및 정리 문서를 만들 수 있습니다."
          }
          tone="summary"
        />
      ) : null}

      {stage === "problem-definition" &&
      problemDefinitionPhase === "structure" &&
      problemStructureFailed &&
      problemStructureNodesCount === 0 ? (
        <CanvasStageEmptyOverlay
          eyebrow="Problem Structure"
          message={`문제정의 2단계 구조화에 실패했습니다.${problemStructureGenerationError ? ` ${problemStructureGenerationError}` : ""}`}
          tone="problem"
        />
      ) : null}

      {problemGenerationPresence.shouldRender ? (
        <ProblemDefinitionPreparingOverlay exiting={problemGenerationPresence.isExiting} />
      ) : null}

      {problemStructureSetupPresence.shouldRender ? (
        <ProblemStructureSetupModal
          draftMethod={problemStructureDraftMethod}
          draftMode={problemStructureDraftMode}
          exiting={problemStructureSetupPresence.isExiting}
          problemGroupsCount={problemGroupsCount}
          pending={problemStructurePending}
          onClose={onCloseProblemStructureSetup}
          onDraftMethodChange={onProblemStructureDraftMethodChange}
          onDraftModeChange={onProblemStructureDraftModeChange}
          onStart={onStartProblemStructure}
        />
      ) : null}

      {problemRationalePresence.shouldRender && problemRationalePresence.presentValue ? (
        <ProblemGroupingRationaleOverlay
          exiting={problemRationalePresence.isExiting}
          title={problemRationalePresence.presentValue.title}
          rationale={problemRationalePresence.presentValue.rationale}
          onClose={onCloseProblemGroupingRationale}
        />
      ) : null}

      {summaryGenerationPresence.shouldRender ? (
        <SummaryDocumentPendingOverlay exiting={summaryGenerationPresence.isExiting} />
      ) : null}

      {canvasStatusMessage ? <CanvasStatusToast key={canvasStatusMessage} message={canvasStatusMessage} /> : null}

      {problemToolbarPresence.shouldRender ? (
        <ProblemCanvasToolbar
          actions={problemCanvasToolbarActions}
          exiting={problemToolbarPresence.isExiting}
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
