"use client";

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  buildMeetingStateSignature,
  buildSharedCanvasSignature,
  buildWorkspaceFieldSignatures,
  normalizeCanvasNodePositionsForComputedIdeation,
  serializeCustomGroups,
  type AgendaOverride,
  type WorkspaceFieldSignatures,
} from "@/components/canvas/canvasWorkspaceSerialization";
import {
  buildProblemStructureStatePayload,
  createDefaultProblemStructureState,
  hydrateProblemStructureState,
  type ProblemDefinitionMode,
  type ProblemDefinitionPhase,
  type ProblemStructureGroupViewModel,
  type ProblemStructureMethod,
  type ProblemStructureNodeViewModel,
} from "@/components/canvas/problemStructureModel";
import {
  buildFinalSolutionSummaryPayload,
  normalizeFinalSolutionSummaryPayload,
} from "@/components/canvas/summaryDocumentHelpers";
import type {
  CanvasCustomGroup,
  CanvasFinalSolutionSummary,
  CanvasNodePositionsByStage,
  CanvasProblemDefinitionGroup,
  CanvasProblemStructureState,
  CanvasRealtimeSyncPayload,
  CanvasWorkspaceItem,
  CanvasWorkspaceProblemGroup,
  MeetingState,
} from "@/lib/types";

type CanvasStage = "ideation" | "problem-definition" | "solution";

type ProblemGroupStatus = "draft" | "review" | "final";

type ProblemGroupModel = CanvasProblemDefinitionGroup & {
  status: ProblemGroupStatus;
};

type SharedWorkspaceSnapshot = {
  meetingGoal: string;
  meetingGoalContext: string;
  stage: CanvasStage;
  agendaOverrides: Record<string, AgendaOverride>;
  canvasItems: CanvasWorkspaceItem[];
  customGroups: CanvasCustomGroup[];
  problemGroups: ProblemGroupModel[];
  problemStructure: CanvasProblemStructureState;
  finalSolutionSummary: CanvasFinalSolutionSummary;
  nodePositions: CanvasNodePositionsByStage;
  importedState: MeetingState | null;
};

type LocalNodeOverrideMap = Record<CanvasStage, Set<string>>;

type UseSharedCanvasIncomingSyncOptions = {
  analysisSignatureAtImportRef: MutableRefObject<string>;
  applyingRemoteSharedSyncRef: MutableRefObject<boolean>;
  ensureRemoteNodePreviewAnimation: () => void;
  hydrateCanvasItems: (items?: CanvasWorkspaceItem[]) => CanvasWorkspaceItem[];
  hydrateCustomGroups: (groups?: CanvasCustomGroup[]) => CanvasCustomGroup[];
  hydrateProblemGroups: (
    groups: Array<CanvasWorkspaceProblemGroup & { status?: string }>,
    previousGroups?: ProblemGroupModel[],
  ) => ProblemGroupModel[];
  incomingSharedCanvasSync: CanvasRealtimeSyncPayload | null;
  lastIncomingSharedSyncIdRef: MutableRefObject<string>;
  lastNodePositionUpdateMsByKeyRef: MutableRefObject<Record<string, number>>;
  lastSharedSyncSignatureRef: MutableRefObject<string>;
  lastWorkspaceFieldSignaturesRef: MutableRefObject<WorkspaceFieldSignatures>;
  latestSharedWorkspaceRef: MutableRefObject<SharedWorkspaceSnapshot>;
  liveNodePositionsRef: MutableRefObject<CanvasNodePositionsByStage>;
  localDraggingNodeIdsRef: MutableRefObject<Set<string>>;
  localNodeOverridesRef: MutableRefObject<LocalNodeOverrideMap>;
  meetingId: string;
  nodePositions: CanvasNodePositionsByStage;
  onMeetingGoalChange: (goal: string) => void;
  onMeetingGoalContextChange: (context: string) => void;
  problemDefinitionMode: ProblemDefinitionMode;
  problemDefinitionPhase: ProblemDefinitionPhase;
  problemGroups: ProblemGroupModel[];
  problemStructureMethod: ProblemStructureMethod;
  remoteNodePreviewTargetsRef: MutableRefObject<Map<string, { x: number; y: number }>>;
  setActivityMessage: (message: string) => void;
  setAgendaOverrides: Dispatch<SetStateAction<Record<string, AgendaOverride>>>;
  setCanvasItems: Dispatch<SetStateAction<CanvasWorkspaceItem[]>>;
  setCustomGroups: Dispatch<SetStateAction<CanvasCustomGroup[]>>;
  setFinalSummaryDocument: Dispatch<SetStateAction<CanvasFinalSolutionSummary>>;
  setImportedState: Dispatch<SetStateAction<MeetingState | null>>;
  setImportOverrideActive: Dispatch<SetStateAction<boolean>>;
  setMeetingGoalDrafts: (goal: string, context: string) => void;
  setNodePositions: Dispatch<SetStateAction<CanvasNodePositionsByStage>>;
  setProblemGroups: Dispatch<SetStateAction<ProblemGroupModel[]>>;
  setProblemStructureGroups: Dispatch<SetStateAction<ProblemStructureGroupViewModel[]>>;
  setProblemStructureNodes: Dispatch<SetStateAction<ProblemStructureNodeViewModel[]>>;
  setProblemStructurePending: Dispatch<SetStateAction<boolean>>;
  setSummaryDocumentDraftDirty: Dispatch<SetStateAction<boolean>>;
  setSummaryDocumentDraftMarkdown: Dispatch<SetStateAction<string>>;
  setSummaryDocumentEditMode: Dispatch<SetStateAction<boolean>>;
  sharedSyncEnabled: boolean;
  stage: CanvasStage;
  userId: string;
  workspaceHydratingRef: MutableRefObject<boolean>;
  workspaceLoadedRef: MutableRefObject<boolean>;
};

const CANVAS_STAGES: CanvasStage[] = ["ideation", "problem-definition", "solution"];

function getNodePositionUpdateKey(stage: CanvasStage, nodeId: string) {
  return `${stage}:${nodeId}`;
}

function getSyncUpdatedAtMs(updatedAt: string | undefined) {
  const parsed = updatedAt ? Date.parse(updatedAt) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function positionsEqual(
  left?: { x: number; y: number },
  right?: { x: number; y: number },
) {
  return (left?.x ?? 0) === (right?.x ?? 0) && (left?.y ?? 0) === (right?.y ?? 0);
}

export function useSharedCanvasIncomingSync({
  analysisSignatureAtImportRef,
  applyingRemoteSharedSyncRef,
  ensureRemoteNodePreviewAnimation,
  hydrateCanvasItems,
  hydrateCustomGroups,
  hydrateProblemGroups,
  incomingSharedCanvasSync,
  lastIncomingSharedSyncIdRef,
  lastNodePositionUpdateMsByKeyRef,
  lastSharedSyncSignatureRef,
  lastWorkspaceFieldSignaturesRef,
  latestSharedWorkspaceRef,
  liveNodePositionsRef,
  localDraggingNodeIdsRef,
  localNodeOverridesRef,
  meetingId,
  nodePositions,
  onMeetingGoalChange,
  onMeetingGoalContextChange,
  problemDefinitionMode,
  problemDefinitionPhase,
  problemGroups,
  problemStructureMethod,
  remoteNodePreviewTargetsRef,
  setActivityMessage,
  setAgendaOverrides,
  setCanvasItems,
  setCustomGroups,
  setFinalSummaryDocument,
  setImportedState,
  setImportOverrideActive,
  setMeetingGoalDrafts,
  setNodePositions,
  setProblemGroups,
  setProblemStructureGroups,
  setProblemStructureNodes,
  setProblemStructurePending,
  setSummaryDocumentDraftDirty,
  setSummaryDocumentDraftMarkdown,
  setSummaryDocumentEditMode,
  sharedSyncEnabled,
  stage,
  userId,
  workspaceHydratingRef,
  workspaceLoadedRef,
}: UseSharedCanvasIncomingSyncOptions) {
  useEffect(() => {
    if (!incomingSharedCanvasSync || incomingSharedCanvasSync.meeting_id !== meetingId) {
      return;
    }

    if (workspaceHydratingRef.current) {
      return;
    }

    if (incomingSharedCanvasSync.updated_by === userId) {
      return;
    }

    if (lastIncomingSharedSyncIdRef.current === incomingSharedCanvasSync.sync_id) {
      return;
    }

    const hasLocalNodePositions = CANVAS_STAGES.some(
      (stageKey) => Object.keys(nodePositions[stageKey] || {}).length > 0,
    );
    if (
      incomingSharedCanvasSync.updated_by === "__server__" &&
      workspaceLoadedRef.current &&
      hasLocalNodePositions
    ) {
      return;
    }

    lastIncomingSharedSyncIdRef.current = incomingSharedCanvasSync.sync_id;
    if (incomingSharedCanvasSync.sync_scope === "node_positions") {
      const incomingNodePositionPatch = normalizeCanvasNodePositionsForComputedIdeation(
        incomingSharedCanvasSync.node_positions || {},
      );
      const incomingUpdatedAtMs = getSyncUpdatedAtMs(incomingSharedCanvasSync.updated_at);
      const acceptedPreviewTargets: Array<[string, { x: number; y: number }]> = [];
      let changed = false;
      const mergedNodePositions: CanvasNodePositionsByStage = {
        ...liveNodePositionsRef.current,
      };

      CANVAS_STAGES.forEach((stageKey) => {
        const incomingStagePositions = incomingNodePositionPatch[stageKey] || {};
        const incomingEntries = Object.entries(incomingStagePositions);
        if (incomingEntries.length === 0) {
          return;
        }

        const nextStagePositions = {
          ...(mergedNodePositions[stageKey] || {}),
        };
        incomingEntries.forEach(([nodeId, position]) => {
          if (!nodeId || localDraggingNodeIdsRef.current.has(nodeId)) {
            return;
          }
          if (!sharedSyncEnabled && localNodeOverridesRef.current[stageKey].has(nodeId)) {
            return;
          }

          const updateKey = getNodePositionUpdateKey(stageKey, nodeId);
          const lastUpdateMs = lastNodePositionUpdateMsByKeyRef.current[updateKey] || 0;
          if (incomingUpdatedAtMs < lastUpdateMs) {
            return;
          }

          const nextPosition = {
            x: Number(position.x || 0),
            y: Number(position.y || 0),
          };
          lastNodePositionUpdateMsByKeyRef.current[updateKey] = incomingUpdatedAtMs;
          if (!positionsEqual(nextStagePositions[nodeId], nextPosition)) {
            nextStagePositions[nodeId] = nextPosition;
            changed = true;
            if (stageKey === stage) {
              acceptedPreviewTargets.push([nodeId, nextPosition]);
            }
          }
        });
        mergedNodePositions[stageKey] = nextStagePositions;
      });

      const nextMergedNodePositions = changed
        ? normalizeCanvasNodePositionsForComputedIdeation(mergedNodePositions)
        : liveNodePositionsRef.current;

      if (acceptedPreviewTargets.length > 0) {
        acceptedPreviewTargets.forEach(([nodeId, position]) => {
          remoteNodePreviewTargetsRef.current.set(nodeId, position);
        });
        ensureRemoteNodePreviewAnimation();
      }

      applyingRemoteSharedSyncRef.current = true;
      liveNodePositionsRef.current = nextMergedNodePositions;
      latestSharedWorkspaceRef.current = {
        ...latestSharedWorkspaceRef.current,
        nodePositions: nextMergedNodePositions,
      };
      lastWorkspaceFieldSignaturesRef.current = {
        ...lastWorkspaceFieldSignaturesRef.current,
        node_positions: JSON.stringify(nextMergedNodePositions),
      };
      if (changed) {
        setNodePositions(nextMergedNodePositions);
      }
      window.setTimeout(() => {
        applyingRemoteSharedSyncRef.current = false;
      }, 0);
      return;
    }

    const incomingCanvasItems = hydrateCanvasItems(incomingSharedCanvasSync.canvas_items || []);
    const incomingCustomGroups = hydrateCustomGroups(incomingSharedCanvasSync.custom_groups || []);
    const incomingMeetingGoal = incomingSharedCanvasSync.meeting_goal || "";
    const incomingMeetingGoalContext = incomingSharedCanvasSync.meeting_goal_context || "";
    const nextIncomingCanvasItems = incomingCanvasItems;
    const currentNodePositionsSnapshot = liveNodePositionsRef.current;

    const nextProblemGroups = hydrateProblemGroups(incomingSharedCanvasSync.problem_groups || [], problemGroups);
    const nextProblemStructure = hydrateProblemStructureState(
      incomingSharedCanvasSync.problem_structure || createDefaultProblemStructureState(),
      nextProblemGroups,
    );
    const localViewProblemStructurePayload = buildProblemStructureStatePayload({
      ...nextProblemStructure,
      phase: problemDefinitionPhase,
      method: problemStructureMethod,
      mode: problemDefinitionMode,
    });
    const nextFinalSummary = normalizeFinalSolutionSummaryPayload(incomingSharedCanvasSync.final_solution_summary || null);

    lastSharedSyncSignatureRef.current = buildSharedCanvasSignature({
      meeting_goal: incomingMeetingGoal,
      meeting_goal_context: incomingMeetingGoalContext,
      stage,
      agenda_overrides: incomingSharedCanvasSync.agenda_overrides || {},
      canvas_items: nextIncomingCanvasItems,
      custom_groups: serializeCustomGroups(incomingCustomGroups),
      problem_groups: incomingSharedCanvasSync.problem_groups || [],
      problem_structure: localViewProblemStructurePayload,
      solution_topics: [],
      final_solution_summary: buildFinalSolutionSummaryPayload(nextFinalSummary),
      node_positions: currentNodePositionsSnapshot,
      imported_state: incomingSharedCanvasSync.imported_state || null,
    });
    applyingRemoteSharedSyncRef.current = true;

    setProblemGroups(nextProblemGroups);
    setProblemStructureNodes(nextProblemStructure.nodes);
    setProblemStructureGroups(nextProblemStructure.groups);
    setProblemStructurePending(false);
    setFinalSummaryDocument(nextFinalSummary);
    setSummaryDocumentDraftMarkdown(nextFinalSummary.markdown);
    setSummaryDocumentDraftDirty(false);
    setSummaryDocumentEditMode(false);
    setMeetingGoalDrafts(incomingMeetingGoal, incomingMeetingGoalContext);
    onMeetingGoalChange(incomingMeetingGoal);
    onMeetingGoalContextChange(incomingMeetingGoalContext);
    setAgendaOverrides(incomingSharedCanvasSync.agenda_overrides || {});
    setCanvasItems(nextIncomingCanvasItems);
    setCustomGroups(incomingCustomGroups);
    setImportedState(incomingSharedCanvasSync.imported_state || null);
    if (incomingSharedCanvasSync.imported_state) {
      analysisSignatureAtImportRef.current = buildMeetingStateSignature(incomingSharedCanvasSync.imported_state);
      setImportOverrideActive(true);
    } else {
      analysisSignatureAtImportRef.current = "";
      setImportOverrideActive(false);
    }
    lastWorkspaceFieldSignaturesRef.current = buildWorkspaceFieldSignatures({
      meetingGoal: incomingMeetingGoal,
      meetingGoalContext: incomingMeetingGoalContext,
      stage,
      agendaOverrides: incomingSharedCanvasSync.agenda_overrides || {},
      canvasItems: nextIncomingCanvasItems,
      customGroups: incomingCustomGroups,
      problemGroups: nextProblemGroups,
      problemStructure: localViewProblemStructurePayload,
      finalSolutionSummary: nextFinalSummary,
      nodePositions: currentNodePositionsSnapshot,
      importedState: incomingSharedCanvasSync.imported_state || null,
    });
    setActivityMessage("다른 참가자의 canvas 변경사항이 반영되었습니다.");

    window.setTimeout(() => {
      applyingRemoteSharedSyncRef.current = false;
    }, 0);
  }, [
    analysisSignatureAtImportRef,
    applyingRemoteSharedSyncRef,
    ensureRemoteNodePreviewAnimation,
    hydrateCanvasItems,
    hydrateCustomGroups,
    hydrateProblemGroups,
    incomingSharedCanvasSync,
    lastIncomingSharedSyncIdRef,
    lastNodePositionUpdateMsByKeyRef,
    lastSharedSyncSignatureRef,
    lastWorkspaceFieldSignaturesRef,
    latestSharedWorkspaceRef,
    liveNodePositionsRef,
    localDraggingNodeIdsRef,
    localNodeOverridesRef,
    meetingId,
    nodePositions,
    onMeetingGoalChange,
    onMeetingGoalContextChange,
    problemDefinitionMode,
    problemDefinitionPhase,
    problemGroups,
    problemStructureMethod,
    remoteNodePreviewTargetsRef,
    setActivityMessage,
    setAgendaOverrides,
    setCanvasItems,
    setCustomGroups,
    setFinalSummaryDocument,
    setImportedState,
    setImportOverrideActive,
    setMeetingGoalDrafts,
    setNodePositions,
    setProblemGroups,
    setProblemStructureGroups,
    setProblemStructureNodes,
    setProblemStructurePending,
    setSummaryDocumentDraftDirty,
    setSummaryDocumentDraftMarkdown,
    setSummaryDocumentEditMode,
    sharedSyncEnabled,
    stage,
    userId,
    workspaceHydratingRef,
    workspaceLoadedRef,
  ]);
}
