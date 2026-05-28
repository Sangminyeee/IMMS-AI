"use client";

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { getCanvasPersonalNotes, getCanvasWorkspaceState } from "@/lib/api";
import type {
  CanvasArtifactGenerationMap,
  CanvasCustomGroup,
  CanvasFinalSolutionSummary,
  CanvasIdeationBubbleGraph,
  CanvasNodePositionsByStage,
  CanvasPersonalNote,
  CanvasProblemDefinitionGroup,
  CanvasWorkspaceItem,
  CanvasWorkspaceProblemGroup,
  MeetingState,
} from "@/lib/types";
import {
  buildMeetingStateSignature,
  buildSharedCanvasSignature,
  buildWorkspaceFieldSignatures,
  createEmptyIdeationBubbleGraph,
  normalizeCanvasNodePositionsForComputedIdeation,
  normalizeIdeationBubbleGraphForWorkspace,
  readSharedWorkspaceSessionCache,
  serializeCustomGroups,
  summarizeNodePositionsForDebug,
  type AgendaOverride,
  type WorkspaceFieldSignatures,
} from "@/components/canvas/canvasWorkspaceSerialization";
import { normalizeCanvasArtifactGeneration } from "@/components/canvas/canvasArtifactGeneration";
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
  createEmptyFinalSolutionSummary,
  normalizeFinalSolutionSummaryPayload,
} from "@/components/canvas/summaryDocumentHelpers";

type CanvasStage = "ideation" | "problem-definition" | "solution";
type ComposerTool = "note" | "comment" | "topic";
type ProblemGroupStatus = "draft" | "review" | "final";

type PersonalNoteModel = {
  id: string;
  projectId: string;
  agendaId: string;
  linkedCanvasItemId?: string;
  linkedCanvasItemTitle?: string;
  kind: ComposerTool;
  title: string;
  body: string;
};

type ProblemGroupModel = CanvasProblemDefinitionGroup & {
  status: ProblemGroupStatus;
};

function toPersonalNote(note: CanvasPersonalNote, meetingId: string): PersonalNoteModel {
  const kind: ComposerTool =
    note.kind === "comment" || note.kind === "topic" || note.kind === "note"
      ? note.kind
      : "note";

  return {
    id: note.id,
    projectId: note.project_id || meetingId,
    agendaId: note.agenda_id,
    linkedCanvasItemId: note.linked_canvas_item_id || "",
    linkedCanvasItemTitle: note.linked_canvas_item_title || "",
    kind,
    title: note.title,
    body: note.body,
  };
}

function normalizeWorkspaceStage(stage: unknown): CanvasStage {
  return stage === "problem-definition" || stage === "solution" || stage === "ideation"
    ? stage
    : "ideation";
}

type UseCanvasWorkspaceLoaderOptions<
  TGroup extends ProblemGroupModel,
  TPersonalNote extends PersonalNoteModel,
  TRationale,
> = {
  analysisSignatureAtImportRef: MutableRefObject<string>;
  captureProblemPhaseOverride: ProblemDefinitionPhase | "";
  captureStageOverride: CanvasStage | "";
  hydrateCanvasItems: (items?: CanvasWorkspaceItem[]) => CanvasWorkspaceItem[];
  hydrateCustomGroups: (groups?: CanvasCustomGroup[]) => CanvasCustomGroup[];
  hydrateProblemGroups: (
    groups: Array<CanvasWorkspaceProblemGroup & { status?: string }>,
    previousGroups?: TGroup[],
  ) => TGroup[];
  lastSharedSyncSignatureRef: MutableRefObject<string>;
  lastWorkspaceFieldSignaturesRef: MutableRefObject<WorkspaceFieldSignatures>;
  meetingId: string;
  onMeetingGoalChange: (goal: string) => void;
  onMeetingGoalContextChange: (context: string) => void;
  resetProblemStructureEditorState: () => void;
  setAgendaOverrides: Dispatch<SetStateAction<Record<string, AgendaOverride>>>;
  setCanvasItems: Dispatch<SetStateAction<CanvasWorkspaceItem[]>>;
  setCollapsedProblemGroupIds: Dispatch<SetStateAction<Set<string>>>;
  setCustomGroups: Dispatch<SetStateAction<CanvasCustomGroup[]>>;
  setEditingProblemGroupId: Dispatch<SetStateAction<string>>;
  setFinalSummaryDocument: Dispatch<SetStateAction<CanvasFinalSolutionSummary>>;
  setArtifactGeneration: Dispatch<SetStateAction<CanvasArtifactGenerationMap>>;
  setIdeationBubbleGraph: Dispatch<SetStateAction<CanvasIdeationBubbleGraph>>;
  setImportedState: Dispatch<SetStateAction<MeetingState | null>>;
  setImportOverrideActive: Dispatch<SetStateAction<boolean>>;
  setLoadingProblemGroupIds: Dispatch<SetStateAction<string[]>>;
  setMeetingGoalDrafts: (goal: string, context: string) => void;
  setNodePositions: Dispatch<SetStateAction<CanvasNodePositionsByStage>>;
  setPersonalNotes: Dispatch<SetStateAction<TPersonalNote[]>>;
  setProblemDefinitionMode: Dispatch<SetStateAction<ProblemDefinitionMode>>;
  setProblemDefinitionPhase: Dispatch<SetStateAction<ProblemDefinitionPhase>>;
  setProblemDefinitionStagePending: Dispatch<SetStateAction<boolean>>;
  setProblemGroupingRationaleById: Dispatch<SetStateAction<Record<string, TRationale>>>;
  setProblemGroupingRationaleOpenGroupId: Dispatch<SetStateAction<string>>;
  setProblemGroupingRationalePendingId: Dispatch<SetStateAction<string>>;
  setProblemGroups: Dispatch<SetStateAction<TGroup[]>>;
  setProblemStructureDraftMethod: Dispatch<SetStateAction<ProblemStructureMethod>>;
  setProblemStructureDraftMode: Dispatch<SetStateAction<ProblemDefinitionMode>>;
  setProblemStructureGroups: Dispatch<SetStateAction<ProblemStructureGroupViewModel[]>>;
  setProblemStructureMethod: Dispatch<SetStateAction<ProblemStructureMethod>>;
  setProblemStructureNodes: Dispatch<SetStateAction<ProblemStructureNodeViewModel[]>>;
  setProblemStructurePending: Dispatch<SetStateAction<boolean>>;
  setProblemStructureSetupOpen: Dispatch<SetStateAction<boolean>>;
  setSelectedCanvasItemId: Dispatch<SetStateAction<string>>;
  setSelectedNodeId: Dispatch<SetStateAction<string>>;
  setSelectedProblemGroupId: Dispatch<SetStateAction<string>>;
  setSharedSyncEnabled: Dispatch<SetStateAction<boolean>>;
  setStage: Dispatch<SetStateAction<CanvasStage>>;
  setSummaryDocumentEditMode: Dispatch<SetStateAction<boolean>>;
  setSummaryDocumentPending: Dispatch<SetStateAction<boolean>>;
  setSummaryEvidenceOpenGroupIds: Dispatch<SetStateAction<Set<string>>>;
  userId: string;
  workspaceHydratingRef: MutableRefObject<boolean>;
  workspaceLoadedRef: MutableRefObject<boolean>;
};

export function useCanvasWorkspaceLoader<
  TGroup extends ProblemGroupModel,
  TPersonalNote extends PersonalNoteModel,
  TRationale,
>({
  analysisSignatureAtImportRef,
  captureProblemPhaseOverride,
  captureStageOverride,
  hydrateCanvasItems,
  hydrateCustomGroups,
  hydrateProblemGroups,
  lastSharedSyncSignatureRef,
  lastWorkspaceFieldSignaturesRef,
  meetingId,
  onMeetingGoalChange,
  onMeetingGoalContextChange,
  resetProblemStructureEditorState,
  setAgendaOverrides,
  setCanvasItems,
  setCollapsedProblemGroupIds,
  setCustomGroups,
  setEditingProblemGroupId,
  setFinalSummaryDocument,
  setArtifactGeneration,
  setIdeationBubbleGraph,
  setImportedState,
  setImportOverrideActive,
  setLoadingProblemGroupIds,
  setMeetingGoalDrafts,
  setNodePositions,
  setPersonalNotes,
  setProblemDefinitionMode,
  setProblemDefinitionPhase,
  setProblemDefinitionStagePending,
  setProblemGroupingRationaleById,
  setProblemGroupingRationaleOpenGroupId,
  setProblemGroupingRationalePendingId,
  setProblemGroups,
  setProblemStructureDraftMethod,
  setProblemStructureDraftMode,
  setProblemStructureGroups,
  setProblemStructureMethod,
  setProblemStructureNodes,
  setProblemStructurePending,
  setProblemStructureSetupOpen,
  setSelectedCanvasItemId,
  setSelectedNodeId,
  setSelectedProblemGroupId,
  setSharedSyncEnabled,
  setStage,
  setSummaryDocumentEditMode,
  setSummaryDocumentPending,
  setSummaryEvidenceOpenGroupIds,
  userId,
  workspaceHydratingRef,
  workspaceLoadedRef,
}: UseCanvasWorkspaceLoaderOptions<TGroup, TPersonalNote, TRationale>) {
  useEffect(() => {
    let cancelled = false;

    workspaceLoadedRef.current = false;
    workspaceHydratingRef.current = true;
    setProblemGroups([]);
    setProblemDefinitionMode("");
    setProblemDefinitionPhase("explore");
    setProblemStructureMethod("affinity");
    setProblemStructureDraftMethod("affinity");
    setProblemStructureDraftMode("ai");
    setProblemStructureSetupOpen(false);
    setProblemStructureNodes([]);
    setProblemStructureGroups([]);
    setProblemStructurePending(false);
    resetProblemStructureEditorState();
    setFinalSummaryDocument(createEmptyFinalSolutionSummary());
    setArtifactGeneration({});
    setIdeationBubbleGraph(createEmptyIdeationBubbleGraph());
    setSummaryDocumentEditMode(false);
    setSummaryEvidenceOpenGroupIds(new Set());
    setPersonalNotes([]);
    setAgendaOverrides({});
    setCanvasItems([]);
    setCustomGroups([]);
    setNodePositions({});
    setImportedState(null);
    setStage("ideation");
    setProblemDefinitionMode("");
    setProblemDefinitionPhase("explore");
    setProblemStructureMethod("affinity");
    setProblemStructureDraftMethod("affinity");
    setProblemStructureDraftMode("ai");
    setProblemStructureSetupOpen(false);
    setProblemStructureNodes([]);
    setProblemStructureGroups([]);
    setProblemStructurePending(false);
    resetProblemStructureEditorState();
    setProblemDefinitionStagePending(false);
    setSummaryDocumentPending(false);
    setSelectedProblemGroupId("");
    setSelectedNodeId("");
    setEditingProblemGroupId("");
    setLoadingProblemGroupIds([]);
    setCollapsedProblemGroupIds(new Set());
    setProblemGroupingRationaleById({});
    setProblemGroupingRationalePendingId("");
    setProblemGroupingRationaleOpenGroupId("");

    if (!meetingId) {
      workspaceHydratingRef.current = false;
      workspaceLoadedRef.current = true;
      return () => {
        cancelled = true;
      };
    }

    void Promise.all([getCanvasWorkspaceState(meetingId), getCanvasPersonalNotes(meetingId, userId)])
      .then(([saved, savedPersonalNotes]) => {
        if (cancelled) return;

        const cachedSharedWorkspace = readSharedWorkspaceSessionCache(meetingId);
        const cachedNodePositions =
          cachedSharedWorkspace && typeof cachedSharedWorkspace === "object"
            ? (cachedSharedWorkspace.node_positions as CanvasNodePositionsByStage | undefined)
            : undefined;

        const sharedGroups = hydrateProblemGroups(saved.problem_groups || []);
        const sharedStage = normalizeWorkspaceStage(saved.stage);
        const nextPersonalNotes = (savedPersonalNotes.personal_notes || []).map((note) =>
          toPersonalNote(note, meetingId),
        ) as TPersonalNote[];
        const savedLocalCanvasState = savedPersonalNotes.local_canvas_state || null;
        const nextSharedSyncEnabled = savedLocalCanvasState?.shared_sync_enabled ?? true;
        const shouldUseLocalCanvas = nextSharedSyncEnabled === false;
        const savedLocalStage = savedLocalCanvasState?.stage ? normalizeWorkspaceStage(savedLocalCanvasState.stage) : "";
        const nextAgendaOverrides = shouldUseLocalCanvas
          ? savedLocalCanvasState?.agenda_overrides || {}
          : saved.agenda_overrides || {};
        const nextCanvasItems = shouldUseLocalCanvas
          ? hydrateCanvasItems(savedLocalCanvasState?.canvas_items || [])
          : hydrateCanvasItems(saved.canvas_items || []);
        const nextCustomGroups = shouldUseLocalCanvas
          ? hydrateCustomGroups(savedLocalCanvasState?.custom_groups || [])
          : hydrateCustomGroups(saved.custom_groups || []);
        const nextGroups = shouldUseLocalCanvas
          ? hydrateProblemGroups(savedLocalCanvasState?.problem_groups || [], sharedGroups)
          : sharedGroups;
        const nextProblemStructure = hydrateProblemStructureState(
          shouldUseLocalCanvas ? savedLocalCanvasState?.problem_structure : saved.problem_structure,
          nextGroups,
        );
        const nextStage = savedLocalStage || sharedStage;
        const displayStage = captureStageOverride || nextStage;
        const displayProblemStructure =
          displayStage === "problem-definition" && captureProblemPhaseOverride
            ? {
                ...nextProblemStructure,
                phase: captureProblemPhaseOverride,
              }
            : nextProblemStructure;
        const nextFinalSummary = normalizeFinalSolutionSummaryPayload(
          shouldUseLocalCanvas
            ? savedLocalCanvasState?.final_solution_summary || saved.final_solution_summary || null
            : saved.final_solution_summary || null,
        );
        const nextArtifactGeneration = normalizeCanvasArtifactGeneration(saved.artifact_generation || {});
        const nextNodePositions = normalizeCanvasNodePositionsForComputedIdeation(
          shouldUseLocalCanvas
            ? savedLocalCanvasState?.node_positions || {}
            : Object.keys(saved.node_positions || {}).length > 0
              ? saved.node_positions || {}
              : cachedNodePositions || {},
        );
        const nextIdeationBubbleGraph = normalizeIdeationBubbleGraphForWorkspace(
          saved.ideation_bubble_graph,
        );
        const nextImportedState = shouldUseLocalCanvas
          ? savedLocalCanvasState?.imported_state || null
          : saved.imported_state || null;
        const nextMeetingGoal = saved.meeting_goal || "";
        const nextMeetingGoalContext = saved.meeting_goal_context || "";
        const nextImportOverrideActive = shouldUseLocalCanvas
          ? Boolean(savedLocalCanvasState?.import_override_active && nextImportedState)
          : Boolean(saved.imported_state);

        setProblemGroups(nextGroups);
        setFinalSummaryDocument(nextFinalSummary);
        setArtifactGeneration(nextArtifactGeneration);
        setIdeationBubbleGraph(nextIdeationBubbleGraph);
        setSummaryDocumentEditMode(false);
        setSummaryEvidenceOpenGroupIds(new Set());
        setPersonalNotes(nextPersonalNotes);
        setAgendaOverrides(nextAgendaOverrides);
        setCanvasItems(nextCanvasItems);
        setCustomGroups(nextCustomGroups);
        setMeetingGoalDrafts(nextMeetingGoal, nextMeetingGoalContext);
        onMeetingGoalChange(nextMeetingGoal);
        onMeetingGoalContextChange(nextMeetingGoalContext);
        setSharedSyncEnabled(nextSharedSyncEnabled);
        setNodePositions(nextNodePositions);
        setImportedState(nextImportedState);
        setProblemDefinitionMode(displayProblemStructure.mode);
        setProblemDefinitionPhase(displayProblemStructure.phase);
        setProblemStructureMethod(displayProblemStructure.method);
        setProblemStructureDraftMethod(displayProblemStructure.method);
        setProblemStructureDraftMode(displayProblemStructure.mode || "ai");
        setProblemStructureSetupOpen(false);
        setProblemStructureNodes(displayProblemStructure.nodes);
        setProblemStructureGroups(displayProblemStructure.groups);
        setProblemStructurePending(false);
        resetProblemStructureEditorState();
        analysisSignatureAtImportRef.current = nextImportedState
          ? buildMeetingStateSignature(nextImportedState)
          : "";
        setImportOverrideActive(nextImportOverrideActive);
        setStage(displayStage);
        lastSharedSyncSignatureRef.current = buildSharedCanvasSignature({
          meeting_goal: nextMeetingGoal,
          meeting_goal_context: nextMeetingGoalContext,
          stage: displayStage,
          agenda_overrides: nextAgendaOverrides,
          canvas_items: nextCanvasItems,
          custom_groups: serializeCustomGroups(nextCustomGroups),
          problem_groups: nextGroups,
          problem_structure: buildProblemStructureStatePayload(displayProblemStructure),
          solution_topics: [],
          final_solution_summary: buildFinalSolutionSummaryPayload(nextFinalSummary),
          artifact_generation: nextArtifactGeneration,
          node_positions: nextNodePositions,
          ideation_bubble_graph: nextIdeationBubbleGraph,
          imported_state: nextImportedState,
        });
        lastWorkspaceFieldSignaturesRef.current = buildWorkspaceFieldSignatures({
          meetingGoal: nextMeetingGoal,
          meetingGoalContext: nextMeetingGoalContext,
          stage: displayStage,
          agendaOverrides: nextAgendaOverrides,
          canvasItems: nextCanvasItems,
          customGroups: nextCustomGroups,
          problemGroups: nextGroups,
          problemStructure: buildProblemStructureStatePayload(displayProblemStructure),
          finalSolutionSummary: nextFinalSummary,
          artifactGeneration: nextArtifactGeneration,
          ideationBubbleGraph: nextIdeationBubbleGraph,
          nodePositions: nextNodePositions,
          importedState: nextImportedState,
        });
        setSelectedProblemGroupId(displayProblemStructure.phase === "structure" ? "" : nextGroups[0]?.group_id || "");
        setSelectedCanvasItemId("");
        setSelectedNodeId(
          displayStage === "problem-definition"
            ? (displayProblemStructure.phase === "structure" ? "" : nextGroups[0] ? `problem-${nextGroups[0].group_id}` : "")
            : "",
        );
        setEditingProblemGroupId("");

        console.info("[canvas hydrate] loaded workspace", {
          meetingId,
          sharedSyncEnabled: nextSharedSyncEnabled,
          usingLocalCanvas: shouldUseLocalCanvas,
          stage: displayStage,
          canvasItems: nextCanvasItems.length,
          customGroups: nextCustomGroups.length,
          usedCachedNodePositions:
            !shouldUseLocalCanvas &&
            Object.keys(saved.node_positions || {}).length === 0 &&
            Boolean(cachedNodePositions && Object.keys(cachedNodePositions).length > 0),
          nodePositions: summarizeNodePositionsForDebug(nextNodePositions),
        });
      })
      .catch(() => {
        if (cancelled) return;
        const emptyFinalSummary = createEmptyFinalSolutionSummary();
        const defaultProblemStructure = createDefaultProblemStructureState();

        setProblemGroups([]);
        setFinalSummaryDocument(emptyFinalSummary);
        setArtifactGeneration({});
        setIdeationBubbleGraph(createEmptyIdeationBubbleGraph());
        setSummaryDocumentEditMode(false);
        setSummaryEvidenceOpenGroupIds(new Set());
        setPersonalNotes([]);
        setAgendaOverrides({});
        setCanvasItems([]);
        setCustomGroups([]);
        setSharedSyncEnabled(true);
        setNodePositions({});
        setImportedState(null);
        setStage("ideation");
        setProblemDefinitionMode("");
        setProblemDefinitionPhase("explore");
        setProblemStructureMethod("affinity");
        setProblemStructureDraftMethod("affinity");
        setProblemStructureDraftMode("ai");
        setProblemStructureSetupOpen(false);
        setProblemStructureNodes([]);
        setProblemStructureGroups([]);
        setProblemStructurePending(false);
        resetProblemStructureEditorState();
        lastSharedSyncSignatureRef.current = buildSharedCanvasSignature({
          meeting_goal: "",
          meeting_goal_context: "",
          stage: "ideation",
          agenda_overrides: {},
          canvas_items: [],
          custom_groups: [],
          problem_groups: [],
          problem_structure: defaultProblemStructure,
          solution_topics: [],
          final_solution_summary: buildFinalSolutionSummaryPayload(emptyFinalSummary),
          artifact_generation: {},
          node_positions: {},
          ideation_bubble_graph: createEmptyIdeationBubbleGraph(),
          imported_state: null,
        });
        lastWorkspaceFieldSignaturesRef.current = buildWorkspaceFieldSignatures({
          meetingGoal: "",
          meetingGoalContext: "",
          stage: "ideation",
          agendaOverrides: {},
          canvasItems: [],
          customGroups: [],
          problemGroups: [],
          problemStructure: defaultProblemStructure,
          finalSolutionSummary: emptyFinalSummary,
          artifactGeneration: {},
          ideationBubbleGraph: createEmptyIdeationBubbleGraph(),
          nodePositions: {},
          importedState: null,
        });
        setSelectedProblemGroupId("");
        setSelectedCanvasItemId("");
        setSelectedNodeId("");
        setEditingProblemGroupId("");
        setCollapsedProblemGroupIds(new Set());
        setProblemGroupingRationaleById({});
        setProblemGroupingRationalePendingId("");
        setProblemGroupingRationaleOpenGroupId("");
      })
      .finally(() => {
        if (cancelled) return;
        workspaceHydratingRef.current = false;
        workspaceLoadedRef.current = true;
      });

    return () => {
      cancelled = true;
    };
  }, [
    analysisSignatureAtImportRef,
    captureProblemPhaseOverride,
    captureStageOverride,
    hydrateCanvasItems,
    hydrateCustomGroups,
    hydrateProblemGroups,
    lastSharedSyncSignatureRef,
    lastWorkspaceFieldSignaturesRef,
    meetingId,
    onMeetingGoalChange,
    onMeetingGoalContextChange,
    resetProblemStructureEditorState,
    setAgendaOverrides,
    setCanvasItems,
    setCollapsedProblemGroupIds,
    setCustomGroups,
    setEditingProblemGroupId,
    setFinalSummaryDocument,
    setArtifactGeneration,
    setIdeationBubbleGraph,
    setImportedState,
    setImportOverrideActive,
    setLoadingProblemGroupIds,
    setMeetingGoalDrafts,
    setNodePositions,
    setPersonalNotes,
    setProblemDefinitionMode,
    setProblemDefinitionPhase,
    setProblemDefinitionStagePending,
    setProblemGroupingRationaleById,
    setProblemGroupingRationaleOpenGroupId,
    setProblemGroupingRationalePendingId,
    setProblemGroups,
    setProblemStructureDraftMethod,
    setProblemStructureDraftMode,
    setProblemStructureGroups,
    setProblemStructureMethod,
    setProblemStructureNodes,
    setProblemStructurePending,
    setProblemStructureSetupOpen,
    setSelectedCanvasItemId,
    setSelectedNodeId,
    setSelectedProblemGroupId,
    setSharedSyncEnabled,
    setStage,
    setSummaryDocumentEditMode,
    setSummaryDocumentPending,
    setSummaryEvidenceOpenGroupIds,
    userId,
    workspaceHydratingRef,
    workspaceLoadedRef,
  ]);
}
