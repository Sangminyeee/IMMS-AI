"use client";

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  buildMeetingStateSignature,
  buildSharedCanvasSignature,
  buildWorkspaceFieldSignatures,
  normalizeCanvasNodePositionsForComputedIdeation,
  normalizeIdeationBubbleGraphForWorkspace,
  serializeCustomGroups,
  type AgendaOverride,
  type WorkspaceFieldSignatures,
} from "@/components/canvas/canvasWorkspaceSerialization";
import {
  normalizeCanvasArtifactGeneration,
  PROBLEM_DEFINITION_STEP1_ARTIFACT,
  PROBLEM_DEFINITION_STEP2_ARTIFACT,
  SUMMARY_DOCUMENT_ARTIFACT,
} from "@/components/canvas/canvasArtifactGeneration";
import {
  buildProblemStructureStatePayload,
  createDefaultProblemStructureState,
  hydrateProblemStructureState,
  type ProblemStructureArtifactMeta,
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
  CanvasArtifactGenerationMap,
  CanvasCustomGroup,
  CanvasDemoBalanceClassification,
  CanvasDemoConfig,
  CanvasFinalSolutionSummary,
  CanvasIdeationBubbleGraph,
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
  demoConfig: CanvasDemoConfig;
  demoBalanceClassification: CanvasDemoBalanceClassification;
  stage: CanvasStage;
  agendaOverrides: Record<string, AgendaOverride>;
  canvasItems: CanvasWorkspaceItem[];
  customGroups: CanvasCustomGroup[];
  problemGroups: ProblemGroupModel[];
  problemStructure: CanvasProblemStructureState;
  finalSolutionSummary: CanvasFinalSolutionSummary;
  artifactGeneration: CanvasArtifactGenerationMap;
  ideationBubbleGraph: CanvasIdeationBubbleGraph;
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
  setAgendaOverrides: Dispatch<SetStateAction<Record<string, AgendaOverride>>>;
  setCanvasItems: Dispatch<SetStateAction<CanvasWorkspaceItem[]>>;
  setCustomGroups: Dispatch<SetStateAction<CanvasCustomGroup[]>>;
  setFinalSummaryDocument: Dispatch<SetStateAction<CanvasFinalSolutionSummary>>;
  setArtifactGeneration: Dispatch<SetStateAction<CanvasArtifactGenerationMap>>;
  setIdeationBubbleGraph: Dispatch<SetStateAction<CanvasIdeationBubbleGraph>>;
  setImportedState: Dispatch<SetStateAction<MeetingState | null>>;
  setImportOverrideActive: Dispatch<SetStateAction<boolean>>;
  setMeetingGoalDrafts: (goal: string, context: string) => void;
  setDemoConfig: Dispatch<SetStateAction<CanvasDemoConfig>>;
  setDemoBalanceClassification: Dispatch<SetStateAction<CanvasDemoBalanceClassification>>;
  setNodePositions: Dispatch<SetStateAction<CanvasNodePositionsByStage>>;
  setProblemGroups: Dispatch<SetStateAction<ProblemGroupModel[]>>;
  setProblemStructureGroups: Dispatch<SetStateAction<ProblemStructureGroupViewModel[]>>;
  setProblemStructureArtifactMeta: Dispatch<SetStateAction<ProblemStructureArtifactMeta>>;
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

function shouldApplyIncomingIdeationBubbleGraph(
  incoming: CanvasIdeationBubbleGraph,
  current: CanvasIdeationBubbleGraph,
) {
  if ((incoming.update_cycle || 0) > (current.update_cycle || 0)) return true;
  if ((incoming.update_cycle || 0) < (current.update_cycle || 0)) return false;
  return getSyncUpdatedAtMs(incoming.updated_at) > getSyncUpdatedAtMs(current.updated_at);
}

function problemStructureRevisionOf(raw: CanvasProblemStructureState | null | undefined) {
  const value = Number(raw?.revision || 0);
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function problemStructureUpdatedAtMs(raw: CanvasProblemStructureState | null | undefined) {
  const parsed = raw?.updated_at ? Date.parse(raw.updated_at) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function problemStructureHasGroups(raw: CanvasProblemStructureState | null | undefined) {
  return (raw?.groups || []).some((group) => group && (group.node_ids || []).length > 0);
}

function shouldApplyIncomingProblemStructure(
  incoming: CanvasProblemStructureState | null | undefined,
  current: CanvasProblemStructureState | null | undefined,
) {
  const incomingRevision = problemStructureRevisionOf(incoming);
  const currentRevision = problemStructureRevisionOf(current);
  if (incomingRevision > currentRevision) return true;
  if (incomingRevision < currentRevision) return false;
  if (problemStructureHasGroups(current) && !problemStructureHasGroups(incoming)) {
    return false;
  }
  return problemStructureUpdatedAtMs(incoming) >= problemStructureUpdatedAtMs(current);
}

function mergeIncomingArtifactGeneration(
  current: CanvasArtifactGenerationMap,
  incoming: CanvasArtifactGenerationMap,
) {
  const merged: CanvasArtifactGenerationMap = { ...current };
  Object.entries(incoming).forEach(([key, incomingEntry]) => {
    const currentEntry = current[key];
    const currentVersion = Number(currentEntry?.version || 0);
    const incomingVersion = Number(incomingEntry?.version || 0);
    if (currentVersion > incomingVersion) return;
    const currentGenerationId = (currentEntry?.generation_id || "").trim();
    const incomingGenerationId = (incomingEntry.generation_id || "").trim();
    if (
      currentVersion === incomingVersion &&
      currentGenerationId &&
      incomingGenerationId &&
      currentGenerationId !== incomingGenerationId &&
      incomingEntry.status !== "generating"
    ) {
      return;
    }
    if (
      currentVersion === incomingVersion &&
      currentEntry?.status === "ready" &&
      incomingEntry.status !== "ready" &&
      (!currentGenerationId || !incomingGenerationId || currentGenerationId === incomingGenerationId)
    ) {
      return;
    }
    merged[key] = incomingEntry;
  });
  return normalizeCanvasArtifactGeneration(merged);
}

function shouldApplyArtifactScopedWorkspace(
  current: CanvasArtifactGenerationMap,
  incoming: CanvasArtifactGenerationMap,
  artifactKey: string,
) {
  const incomingEntry = incoming[artifactKey];
  if (!incomingEntry) return true;

  const currentEntry = current[artifactKey];
  const currentVersion = Number(currentEntry?.version || 0);
  const incomingVersion = Number(incomingEntry.version || 0);
  if (currentVersion > incomingVersion) return false;

  const currentGenerationId = (currentEntry?.generation_id || "").trim();
  const incomingGenerationId = (incomingEntry.generation_id || "").trim();
  if (
    currentVersion === incomingVersion &&
    currentGenerationId &&
    incomingGenerationId &&
    currentGenerationId !== incomingGenerationId &&
    incomingEntry.status !== "generating"
  ) {
    return false;
  }

  if (
    currentVersion === incomingVersion &&
    currentEntry?.status === "ready" &&
    incomingEntry.status !== "ready" &&
    (!currentGenerationId || !incomingGenerationId || currentGenerationId === incomingGenerationId)
  ) {
    return false;
  }

  return true;
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
  setAgendaOverrides,
  setCanvasItems,
  setCustomGroups,
  setFinalSummaryDocument,
  setArtifactGeneration,
  setIdeationBubbleGraph,
  setImportedState,
  setImportOverrideActive,
  setMeetingGoalDrafts,
  setDemoConfig,
  setDemoBalanceClassification,
  setNodePositions,
  setProblemGroups,
  setProblemStructureGroups,
  setProblemStructureArtifactMeta,
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

    const applyRemoteWorkspace = (
      nextWorkspace: SharedWorkspaceSnapshot,
      applyState: () => void,
    ) => {
      applyingRemoteSharedSyncRef.current = true;
      latestSharedWorkspaceRef.current = nextWorkspace;
      lastSharedSyncSignatureRef.current = buildSharedCanvasSignature({
        meeting_goal: nextWorkspace.meetingGoal,
        meeting_goal_context: nextWorkspace.meetingGoalContext,
        demo_config: nextWorkspace.demoConfig,
        demo_balance_classification: nextWorkspace.demoBalanceClassification,
        stage: nextWorkspace.stage,
        agenda_overrides: nextWorkspace.agendaOverrides,
        canvas_items: nextWorkspace.canvasItems,
        custom_groups: serializeCustomGroups(nextWorkspace.customGroups),
        problem_groups: nextWorkspace.problemGroups,
        problem_structure: nextWorkspace.problemStructure,
        solution_topics: [],
        final_solution_summary: buildFinalSolutionSummaryPayload(nextWorkspace.finalSolutionSummary),
        artifact_generation: nextWorkspace.artifactGeneration,
        ideation_bubble_graph: nextWorkspace.ideationBubbleGraph,
        node_positions: nextWorkspace.nodePositions,
        imported_state: nextWorkspace.importedState,
      });
      lastWorkspaceFieldSignaturesRef.current = buildWorkspaceFieldSignatures({
        meetingGoal: nextWorkspace.meetingGoal,
        meetingGoalContext: nextWorkspace.meetingGoalContext,
        demoConfig: nextWorkspace.demoConfig,
        demoBalanceClassification: nextWorkspace.demoBalanceClassification,
        stage: nextWorkspace.stage,
        agendaOverrides: nextWorkspace.agendaOverrides,
        canvasItems: nextWorkspace.canvasItems,
        customGroups: nextWorkspace.customGroups,
        problemGroups: nextWorkspace.problemGroups,
        problemStructure: nextWorkspace.problemStructure,
        finalSolutionSummary: nextWorkspace.finalSolutionSummary,
        artifactGeneration: nextWorkspace.artifactGeneration,
        ideationBubbleGraph: nextWorkspace.ideationBubbleGraph,
        nodePositions: nextWorkspace.nodePositions,
        importedState: nextWorkspace.importedState,
      });
      applyState();
      window.setTimeout(() => {
        applyingRemoteSharedSyncRef.current = false;
      }, 0);
    };

    const currentWorkspace = latestSharedWorkspaceRef.current;
    const syncScope = incomingSharedCanvasSync.sync_scope || "full";
    if (syncScope === "artifact_generation") {
      const nextArtifactGeneration = mergeIncomingArtifactGeneration(
        currentWorkspace.artifactGeneration,
        normalizeCanvasArtifactGeneration(incomingSharedCanvasSync.artifact_generation || {}),
      );
      applyRemoteWorkspace(
        {
          ...currentWorkspace,
          stage,
          artifactGeneration: nextArtifactGeneration,
        },
        () => {
          setArtifactGeneration(nextArtifactGeneration);
        },
      );
      return;
    }

    if (syncScope === "ideation_bubble_graph") {
      const incomingIdeationBubbleGraph = normalizeIdeationBubbleGraphForWorkspace(
        incomingSharedCanvasSync.ideation_bubble_graph,
      );
      const currentIdeationBubbleGraph = normalizeIdeationBubbleGraphForWorkspace(
        currentWorkspace.ideationBubbleGraph,
      );
      const shouldApplyIdeationBubbleGraph = shouldApplyIncomingIdeationBubbleGraph(
        incomingIdeationBubbleGraph,
        currentIdeationBubbleGraph,
      );
      if (!shouldApplyIdeationBubbleGraph) {
        console.info("[Bubble][Sync] ignored lower ideation graph version", {
          incomingCycle: incomingIdeationBubbleGraph.update_cycle,
          incomingUpdatedAt: incomingIdeationBubbleGraph.updated_at,
          currentCycle: currentIdeationBubbleGraph.update_cycle,
          currentUpdatedAt: currentIdeationBubbleGraph.updated_at,
        });
      } else {
        console.info("[Bubble][Sync] applied ideation graph", {
          cycle: incomingIdeationBubbleGraph.update_cycle,
          updatedAt: incomingIdeationBubbleGraph.updated_at,
          bubbles: incomingIdeationBubbleGraph.bubbles.length,
        });
      }
      const nextIdeationBubbleGraph = shouldApplyIdeationBubbleGraph
        ? incomingIdeationBubbleGraph
        : currentIdeationBubbleGraph;
      applyRemoteWorkspace(
        {
          ...currentWorkspace,
          stage,
          ideationBubbleGraph: nextIdeationBubbleGraph,
        },
        () => {
          setIdeationBubbleGraph(nextIdeationBubbleGraph);
        },
      );
      return;
    }

    if (syncScope === "summary_document") {
      const incomingArtifactGeneration = normalizeCanvasArtifactGeneration(incomingSharedCanvasSync.artifact_generation || {});
      const shouldApplySummaryDocument = shouldApplyArtifactScopedWorkspace(
        currentWorkspace.artifactGeneration,
        incomingArtifactGeneration,
        SUMMARY_DOCUMENT_ARTIFACT,
      );
      const nextFinalSummary = normalizeFinalSolutionSummaryPayload(
        shouldApplySummaryDocument
          ? incomingSharedCanvasSync.final_solution_summary || currentWorkspace.finalSolutionSummary
          : currentWorkspace.finalSolutionSummary,
      );
      const nextArtifactGeneration = mergeIncomingArtifactGeneration(currentWorkspace.artifactGeneration, incomingArtifactGeneration);
      applyRemoteWorkspace(
        {
          ...currentWorkspace,
          stage,
          finalSolutionSummary: nextFinalSummary,
          artifactGeneration: nextArtifactGeneration,
        },
        () => {
          if (shouldApplySummaryDocument) {
            setFinalSummaryDocument(nextFinalSummary);
            setSummaryDocumentDraftMarkdown(nextFinalSummary.markdown);
            setSummaryDocumentDraftDirty(false);
            setSummaryDocumentEditMode(false);
          }
          setArtifactGeneration(nextArtifactGeneration);
        },
      );
      return;
    }

    if (syncScope === "problem_groups") {
      const incomingArtifactGeneration = normalizeCanvasArtifactGeneration(incomingSharedCanvasSync.artifact_generation || {});
      const shouldApplyProblemGroups = shouldApplyArtifactScopedWorkspace(
        currentWorkspace.artifactGeneration,
        incomingArtifactGeneration,
        PROBLEM_DEFINITION_STEP1_ARTIFACT,
      );
      const nextProblemGroups = shouldApplyProblemGroups
        ? hydrateProblemGroups(
            incomingSharedCanvasSync.problem_groups || [],
            currentWorkspace.problemGroups,
          )
        : currentWorkspace.problemGroups;
      const nextNodePositions =
        shouldApplyProblemGroups && incomingSharedCanvasSync.node_positions
          ? normalizeCanvasNodePositionsForComputedIdeation(incomingSharedCanvasSync.node_positions)
          : currentWorkspace.nodePositions;
      const nextArtifactGeneration = mergeIncomingArtifactGeneration(currentWorkspace.artifactGeneration, incomingArtifactGeneration);
      applyRemoteWorkspace(
        {
          ...currentWorkspace,
          stage,
          problemGroups: nextProblemGroups,
          nodePositions: nextNodePositions,
          artifactGeneration: nextArtifactGeneration,
        },
        () => {
          if (shouldApplyProblemGroups) {
            setProblemGroups(nextProblemGroups);
            if (incomingSharedCanvasSync.node_positions) {
              liveNodePositionsRef.current = nextNodePositions;
              setNodePositions(nextNodePositions);
            }
          }
          setArtifactGeneration(nextArtifactGeneration);
        },
      );
      return;
    }

    if (syncScope === "problem_structure") {
      const incomingArtifactGeneration = normalizeCanvasArtifactGeneration(incomingSharedCanvasSync.artifact_generation || {});
      const shouldApplyProblemStructureArtifact = shouldApplyArtifactScopedWorkspace(
        currentWorkspace.artifactGeneration,
        incomingArtifactGeneration,
        PROBLEM_DEFINITION_STEP2_ARTIFACT,
      );
      const incomingProblemGroups = hydrateProblemGroups(
        incomingSharedCanvasSync.problem_groups || [],
        currentWorkspace.problemGroups,
      );
      const incomingProblemStructure = incomingSharedCanvasSync.problem_structure || createDefaultProblemStructureState();
      const shouldApplyProblemStructure = shouldApplyProblemStructureArtifact && shouldApplyIncomingProblemStructure(
        incomingProblemStructure,
        currentWorkspace.problemStructure,
      );
      const nextProblemGroups = shouldApplyProblemStructure ? incomingProblemGroups : currentWorkspace.problemGroups;
      const nextProblemStructure = shouldApplyProblemStructure
        ? hydrateProblemStructureState(incomingProblemStructure, nextProblemGroups)
        : hydrateProblemStructureState(currentWorkspace.problemStructure, currentWorkspace.problemGroups);
      const nextProblemStructurePayload = buildProblemStructureStatePayload({
        ...nextProblemStructure,
        phase: problemDefinitionPhase,
        method: problemStructureMethod,
        mode: problemDefinitionMode,
      });
      const nextNodePositions = shouldApplyProblemStructure && incomingSharedCanvasSync.node_positions
        ? normalizeCanvasNodePositionsForComputedIdeation(incomingSharedCanvasSync.node_positions)
        : currentWorkspace.nodePositions;
      const nextArtifactGeneration = mergeIncomingArtifactGeneration(currentWorkspace.artifactGeneration, incomingArtifactGeneration);
      applyRemoteWorkspace(
        {
          ...currentWorkspace,
          stage,
          problemGroups: nextProblemGroups,
          problemStructure: nextProblemStructurePayload,
          nodePositions: nextNodePositions,
          artifactGeneration: nextArtifactGeneration,
        },
        () => {
          if (shouldApplyProblemStructure) {
            setProblemGroups(nextProblemGroups);
            setProblemStructureNodes(nextProblemStructure.nodes);
            setProblemStructureGroups(nextProblemStructure.groups);
            setProblemStructureArtifactMeta({
              revision: nextProblemStructure.revision,
              sourceGenerationId: nextProblemStructure.sourceGenerationId,
              basedOnTranscriptRevision: nextProblemStructure.basedOnTranscriptRevision,
              updatedAt: nextProblemStructure.updatedAt,
            });
          }
          if (shouldApplyProblemStructure && incomingSharedCanvasSync.node_positions) {
            liveNodePositionsRef.current = nextNodePositions;
            setNodePositions(nextNodePositions);
          }
          setArtifactGeneration(nextArtifactGeneration);
          if (nextArtifactGeneration["problem-definition:structure"]?.status !== "generating") {
            setProblemStructurePending(false);
          }
        },
      );
      return;
    }

    const incomingCanvasItems = hydrateCanvasItems(incomingSharedCanvasSync.canvas_items || []);
    const incomingCustomGroups = hydrateCustomGroups(incomingSharedCanvasSync.custom_groups || []);
    const incomingMeetingGoal = incomingSharedCanvasSync.meeting_goal || "";
    const incomingMeetingGoalContext = incomingSharedCanvasSync.meeting_goal_context || "";
    const incomingDemoConfig = incomingSharedCanvasSync.demo_config || currentWorkspace.demoConfig;
    const incomingDemoBalanceClassification =
      incomingSharedCanvasSync.demo_balance_classification || currentWorkspace.demoBalanceClassification || {};
    const nextIncomingCanvasItems = incomingCanvasItems;
    const currentNodePositionsSnapshot = liveNodePositionsRef.current;

    const incomingProblemGroups = hydrateProblemGroups(incomingSharedCanvasSync.problem_groups || [], problemGroups);
    const incomingProblemStructure = incomingSharedCanvasSync.problem_structure || createDefaultProblemStructureState();
    const shouldApplyProblemStructure = shouldApplyIncomingProblemStructure(
      incomingProblemStructure,
      currentWorkspace.problemStructure,
    );
    const nextProblemGroups = shouldApplyProblemStructure ? incomingProblemGroups : currentWorkspace.problemGroups;
    const nextProblemStructure = shouldApplyProblemStructure
      ? hydrateProblemStructureState(incomingProblemStructure, nextProblemGroups)
      : hydrateProblemStructureState(currentWorkspace.problemStructure, currentWorkspace.problemGroups);
    const localViewProblemStructurePayload = buildProblemStructureStatePayload({
      ...nextProblemStructure,
      phase: problemDefinitionPhase,
      method: problemStructureMethod,
      mode: problemDefinitionMode,
    });
    const nextFinalSummary = normalizeFinalSolutionSummaryPayload(incomingSharedCanvasSync.final_solution_summary || null);
    const nextArtifactGeneration = mergeIncomingArtifactGeneration(
      currentWorkspace.artifactGeneration,
      normalizeCanvasArtifactGeneration(incomingSharedCanvasSync.artifact_generation || {}),
    );
    const incomingIdeationBubbleGraph = normalizeIdeationBubbleGraphForWorkspace(
      incomingSharedCanvasSync.ideation_bubble_graph,
    );
    const currentIdeationBubbleGraph = normalizeIdeationBubbleGraphForWorkspace(
      latestSharedWorkspaceRef.current.ideationBubbleGraph,
    );
    const nextIdeationBubbleGraph = shouldApplyIncomingIdeationBubbleGraph(
      incomingIdeationBubbleGraph,
      currentIdeationBubbleGraph,
    )
      ? incomingIdeationBubbleGraph
      : currentIdeationBubbleGraph;

    lastSharedSyncSignatureRef.current = buildSharedCanvasSignature({
      meeting_goal: incomingMeetingGoal,
      meeting_goal_context: incomingMeetingGoalContext,
      demo_config: incomingDemoConfig,
      demo_balance_classification: incomingDemoBalanceClassification,
      stage,
      agenda_overrides: incomingSharedCanvasSync.agenda_overrides || {},
      canvas_items: nextIncomingCanvasItems,
      custom_groups: serializeCustomGroups(incomingCustomGroups),
      problem_groups: nextProblemGroups,
      problem_structure: localViewProblemStructurePayload,
      solution_topics: [],
      final_solution_summary: buildFinalSolutionSummaryPayload(nextFinalSummary),
      artifact_generation: nextArtifactGeneration,
      ideation_bubble_graph: nextIdeationBubbleGraph,
      node_positions: currentNodePositionsSnapshot,
      imported_state: incomingSharedCanvasSync.imported_state || null,
    });
    applyingRemoteSharedSyncRef.current = true;
    latestSharedWorkspaceRef.current = {
      meetingGoal: incomingMeetingGoal,
      meetingGoalContext: incomingMeetingGoalContext,
      demoConfig: incomingDemoConfig,
      demoBalanceClassification: incomingDemoBalanceClassification,
      stage,
      agendaOverrides: incomingSharedCanvasSync.agenda_overrides || {},
      canvasItems: nextIncomingCanvasItems,
      customGroups: incomingCustomGroups,
      problemGroups: nextProblemGroups,
      problemStructure: localViewProblemStructurePayload,
      finalSolutionSummary: nextFinalSummary,
      artifactGeneration: nextArtifactGeneration,
      ideationBubbleGraph: nextIdeationBubbleGraph,
      nodePositions: currentNodePositionsSnapshot,
      importedState: incomingSharedCanvasSync.imported_state || null,
    };

    setProblemGroups(nextProblemGroups);
    setProblemStructureNodes(nextProblemStructure.nodes);
    setProblemStructureGroups(nextProblemStructure.groups);
    setProblemStructureArtifactMeta({
      revision: nextProblemStructure.revision,
      sourceGenerationId: nextProblemStructure.sourceGenerationId,
      basedOnTranscriptRevision: nextProblemStructure.basedOnTranscriptRevision,
      updatedAt: nextProblemStructure.updatedAt,
    });
    if (nextArtifactGeneration["problem-definition:structure"]?.status !== "generating") {
      setProblemStructurePending(false);
    }
    setFinalSummaryDocument(nextFinalSummary);
    setArtifactGeneration(nextArtifactGeneration);
    setIdeationBubbleGraph(nextIdeationBubbleGraph);
    setSummaryDocumentDraftMarkdown(nextFinalSummary.markdown);
    setSummaryDocumentDraftDirty(false);
    setSummaryDocumentEditMode(false);
    setMeetingGoalDrafts(incomingMeetingGoal, incomingMeetingGoalContext);
    setDemoConfig(incomingDemoConfig);
    setDemoBalanceClassification(incomingDemoBalanceClassification);
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
      demoConfig: incomingDemoConfig,
      demoBalanceClassification: incomingDemoBalanceClassification,
      stage,
      agendaOverrides: incomingSharedCanvasSync.agenda_overrides || {},
      canvasItems: nextIncomingCanvasItems,
      customGroups: incomingCustomGroups,
      problemGroups: nextProblemGroups,
      problemStructure: localViewProblemStructurePayload,
      finalSolutionSummary: nextFinalSummary,
      artifactGeneration: nextArtifactGeneration,
      ideationBubbleGraph: nextIdeationBubbleGraph,
      nodePositions: currentNodePositionsSnapshot,
      importedState: incomingSharedCanvasSync.imported_state || null,
    });
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
    setAgendaOverrides,
    setArtifactGeneration,
    setCanvasItems,
    setCustomGroups,
    setFinalSummaryDocument,
    setIdeationBubbleGraph,
    setImportedState,
    setImportOverrideActive,
    setMeetingGoalDrafts,
    setDemoBalanceClassification,
    setDemoConfig,
    setNodePositions,
    setProblemGroups,
    setProblemStructureArtifactMeta,
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
