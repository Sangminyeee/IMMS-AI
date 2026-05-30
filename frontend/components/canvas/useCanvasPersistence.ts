"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import {
  buildCanvasPersonalNotesPayload,
  buildWorkspaceFieldSignatures,
  buildWorkspaceProblemGroupsPayload,
  normalizeCanvasNodePositionsForComputedIdeation,
  serializeAgendaOverrides,
  serializeCustomGroups,
  serializeSharedCanvasItems,
  summarizeNodePositionsForDebug,
  type AgendaOverride,
  type WorkspaceFieldSignatures,
} from "@/components/canvas/canvasWorkspaceSerialization";
import { buildFinalSolutionSummaryPayload } from "@/components/canvas/summaryDocumentHelpers";
import { normalizeCanvasArtifactGeneration } from "@/components/canvas/canvasArtifactGeneration";
import {
  flushCanvasPersonalNotes,
  flushCanvasWorkspacePatch,
  saveCanvasPersonalNotes,
  saveCanvasWorkspacePatch,
} from "@/lib/api";
import type {
  CanvasArtifactGenerationMap,
  CanvasCustomGroup,
  CanvasFinalSolutionSummary,
  CanvasIdeationBubbleGraph,
  CanvasLocalState,
  CanvasNodePositionsByStage,
  CanvasProblemDefinitionGroup,
  CanvasProblemStructureState,
  CanvasWorkspaceItem,
  CanvasWorkspacePatchRequest,
  MeetingState,
} from "@/lib/types";

type CanvasStage = "ideation" | "problem-definition" | "solution";

type ProblemGroupStatus = "draft" | "review" | "final";

type ProblemGroupModel = CanvasProblemDefinitionGroup & {
  status: ProblemGroupStatus;
};

type PersonalNoteModel = {
  id: string;
  projectId: string;
  agendaId: string;
  linkedCanvasItemId?: string;
  linkedCanvasItemTitle?: string;
  kind: string;
  title: string;
  body: string;
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
  artifactGeneration: CanvasArtifactGenerationMap;
  ideationBubbleGraph: CanvasIdeationBubbleGraph;
  nodePositions: CanvasNodePositionsByStage;
  importedState: MeetingState | null;
};

type UseCanvasPersistenceOptions = {
  agendaOverrides: Record<string, AgendaOverride>;
  applyingRemoteSharedSyncRef: MutableRefObject<boolean>;
  buildCurrentWorkspacePatchPayload: (overrides?: Partial<Omit<{
    meetingId: string;
    meetingGoal: string;
    meetingGoalContext: string;
    stage: CanvasStage;
    agendaOverrides: Record<string, AgendaOverride>;
    canvasItems: CanvasWorkspaceItem[];
    customGroups: CanvasCustomGroup[];
    problemGroups: ProblemGroupModel[];
    problemStructure?: CanvasProblemStructureState;
    finalSolutionSummary?: CanvasFinalSolutionSummary;
    artifactGeneration?: CanvasArtifactGenerationMap;
    ideationBubbleGraph?: CanvasIdeationBubbleGraph;
    nodePositions: CanvasNodePositionsByStage;
    importedState: MeetingState | null;
  }, "meetingId">>) => CanvasWorkspacePatchRequest;
  captureStageOverride: CanvasStage | "";
  canvasItems: CanvasWorkspaceItem[];
  conclusionBatchBusy: boolean;
  customGroups: CanvasCustomGroup[];
  finalSummaryDocument: CanvasFinalSolutionSummary;
  artifactGeneration: CanvasArtifactGenerationMap;
  ideationBubbleGraph: CanvasIdeationBubbleGraph;
  importOverrideActive: boolean;
  lastWorkspaceFieldSignaturesRef: MutableRefObject<WorkspaceFieldSignatures>;
  latestSharedSyncEnabledRef: MutableRefObject<boolean>;
  latestSharedWorkspaceRef: MutableRefObject<SharedWorkspaceSnapshot>;
  meetingGoalContextDraft: string;
  meetingGoalDraft: string;
  meetingId: string;
  nodePositions: CanvasNodePositionsByStage;
  onMeetingGoalSync?: (goal: string, context?: string) => void;
  persistedSharedImportedState: MeetingState | null;
  personalNotes: PersonalNoteModel[];
  problemDefinitionStagePending: boolean;
  problemGroups: ProblemGroupModel[];
  problemStructurePending: boolean;
  problemStructureStatePayload: CanvasProblemStructureState;
  sharedSyncEnabled: boolean;
  stage: CanvasStage;
  summaryDocumentPending: boolean;
  userId: string;
  workspaceHydratingRef: MutableRefObject<boolean>;
  workspaceLoadedRef: MutableRefObject<boolean>;
};

export function useCanvasPersistence({
  agendaOverrides,
  applyingRemoteSharedSyncRef,
  buildCurrentWorkspacePatchPayload,
  captureStageOverride,
  canvasItems,
  conclusionBatchBusy,
  customGroups,
  finalSummaryDocument,
  artifactGeneration,
  ideationBubbleGraph,
  importOverrideActive,
  lastWorkspaceFieldSignaturesRef,
  latestSharedSyncEnabledRef,
  latestSharedWorkspaceRef,
  meetingGoalContextDraft,
  meetingGoalDraft,
  meetingId,
  nodePositions,
  onMeetingGoalSync,
  persistedSharedImportedState,
  personalNotes,
  problemDefinitionStagePending,
  problemGroups,
  problemStructurePending,
  problemStructureStatePayload,
  sharedSyncEnabled,
  stage,
  summaryDocumentPending,
  userId,
  workspaceHydratingRef,
  workspaceLoadedRef,
}: UseCanvasPersistenceOptions) {
  const workspaceSaveTimerRef = useRef<number | null>(null);
  const personalNotesSaveTimerRef = useRef<number | null>(null);
  const latestPersonalNotesPayloadRef = useRef<ReturnType<typeof buildCanvasPersonalNotesPayload> | null>(null);

  useEffect(() => {
    if (
      !meetingId ||
      captureStageOverride ||
      !workspaceLoadedRef.current ||
      workspaceHydratingRef.current ||
      problemDefinitionStagePending ||
      summaryDocumentPending ||
      conclusionBatchBusy ||
      applyingRemoteSharedSyncRef.current
    ) {
      return;
    }

    const nextProblemGroupsPayload = buildWorkspaceProblemGroupsPayload(problemGroups);
    const nextMeetingGoal = meetingGoalDraft.trim();
    const nextMeetingGoalContext = meetingGoalContextDraft.trim();
    const nextSignatures = buildWorkspaceFieldSignatures({
      meetingGoal: nextMeetingGoal,
      meetingGoalContext: nextMeetingGoalContext,
      stage,
      agendaOverrides,
      canvasItems,
      customGroups,
      problemGroups,
      problemStructure: problemStructureStatePayload,
      finalSolutionSummary: finalSummaryDocument,
      artifactGeneration,
      ideationBubbleGraph,
      nodePositions,
      importedState: persistedSharedImportedState,
    });
    const previousSignatures = lastWorkspaceFieldSignaturesRef.current;
    const patch: CanvasWorkspacePatchRequest = {
      meeting_id: meetingId,
    };

    let hasChanges = false;
    let meetingGoalChanged = false;
    if (
      nextSignatures.meeting_goal !== previousSignatures.meeting_goal ||
      nextSignatures.meeting_goal_context !== previousSignatures.meeting_goal_context
    ) {
      patch.meeting_goal = nextMeetingGoal;
      patch.meeting_goal_context = nextMeetingGoalContext;
      hasChanges = true;
      meetingGoalChanged = true;
    }
    if (sharedSyncEnabled && nextSignatures.agenda_overrides !== previousSignatures.agenda_overrides) {
      patch.agenda_overrides = serializeAgendaOverrides(agendaOverrides);
      hasChanges = true;
    }
    if (sharedSyncEnabled && nextSignatures.canvas_items !== previousSignatures.canvas_items) {
      patch.canvas_items = serializeSharedCanvasItems(canvasItems);
      hasChanges = true;
    }
    if (sharedSyncEnabled && nextSignatures.custom_groups !== previousSignatures.custom_groups) {
      patch.custom_groups = serializeCustomGroups(customGroups);
      hasChanges = true;
    }
    if (sharedSyncEnabled && nextSignatures.problem_groups !== previousSignatures.problem_groups) {
      patch.problem_groups = nextProblemGroupsPayload;
      hasChanges = true;
    }
    if (
      sharedSyncEnabled &&
      !problemStructurePending &&
      nextSignatures.problem_structure !== previousSignatures.problem_structure
    ) {
      patch.problem_structure = problemStructureStatePayload;
      hasChanges = true;
    }
    if (sharedSyncEnabled && nextSignatures.solution_topics !== previousSignatures.solution_topics) {
      patch.solution_topics = [];
      patch.final_solution_summary = buildFinalSolutionSummaryPayload(finalSummaryDocument);
      hasChanges = true;
    }
    if (sharedSyncEnabled && nextSignatures.final_solution_summary !== previousSignatures.final_solution_summary) {
      patch.final_solution_summary = buildFinalSolutionSummaryPayload(finalSummaryDocument);
      hasChanges = true;
    }
    if (
      sharedSyncEnabled &&
      !problemStructurePending &&
      nextSignatures.artifact_generation !== previousSignatures.artifact_generation
    ) {
      patch.artifact_generation = normalizeCanvasArtifactGeneration(artifactGeneration);
      hasChanges = true;
    }
    if (sharedSyncEnabled && nextSignatures.ideation_bubble_graph !== previousSignatures.ideation_bubble_graph) {
      patch.ideation_bubble_graph = ideationBubbleGraph;
      hasChanges = true;
    }
    if (sharedSyncEnabled && nextSignatures.imported_state !== previousSignatures.imported_state) {
      patch.imported_state = persistedSharedImportedState;
      hasChanges = true;
    }

    if (!hasChanges) {
      return;
    }

    if (workspaceSaveTimerRef.current) {
      window.clearTimeout(workspaceSaveTimerRef.current);
    }

    workspaceSaveTimerRef.current = window.setTimeout(() => {
      void saveCanvasWorkspacePatch(patch)
        .then(() => {
          if (meetingGoalChanged) {
            onMeetingGoalSync?.(nextMeetingGoal, nextMeetingGoalContext);
          }
          lastWorkspaceFieldSignaturesRef.current = sharedSyncEnabled
            ? nextSignatures
            : {
                ...lastWorkspaceFieldSignaturesRef.current,
                meeting_goal: nextSignatures.meeting_goal,
                meeting_goal_context: nextSignatures.meeting_goal_context,
              };
        })
        .catch((error) => {
          console.error("Failed to save canvas workspace patch:", error);
        });
    }, 450);

    return () => {
      if (workspaceSaveTimerRef.current) {
        window.clearTimeout(workspaceSaveTimerRef.current);
        workspaceSaveTimerRef.current = null;
      }
    };
  }, [
    agendaOverrides,
    applyingRemoteSharedSyncRef,
    captureStageOverride,
    canvasItems,
    conclusionBatchBusy,
    customGroups,
    finalSummaryDocument,
    artifactGeneration,
    ideationBubbleGraph,
    lastWorkspaceFieldSignaturesRef,
    meetingGoalContextDraft,
    meetingGoalDraft,
    meetingId,
    nodePositions,
    onMeetingGoalSync,
    persistedSharedImportedState,
    problemDefinitionStagePending,
    problemGroups,
    problemStructurePending,
    problemStructureStatePayload,
    sharedSyncEnabled,
    stage,
    summaryDocumentPending,
    workspaceHydratingRef,
    workspaceLoadedRef,
  ]);

  const localCanvasState = useMemo<CanvasLocalState>(
    () =>
      sharedSyncEnabled
        ? {
            shared_sync_enabled: true,
            meeting_goal: meetingGoalDraft.trim(),
            meeting_goal_context: meetingGoalContextDraft.trim(),
            agenda_overrides: serializeAgendaOverrides(agendaOverrides),
            canvas_items: serializeSharedCanvasItems(canvasItems),
            custom_groups: serializeCustomGroups(customGroups),
            stage,
          }
        : {
            shared_sync_enabled: false,
            meeting_goal: meetingGoalDraft.trim(),
            meeting_goal_context: meetingGoalContextDraft.trim(),
            agenda_overrides: serializeAgendaOverrides(agendaOverrides),
            canvas_items: serializeSharedCanvasItems(canvasItems),
            custom_groups: serializeCustomGroups(customGroups),
            stage,
            problem_groups: buildWorkspaceProblemGroupsPayload(problemGroups),
            problem_structure: problemStructureStatePayload,
            solution_topics: [],
            final_solution_summary: buildFinalSolutionSummaryPayload(finalSummaryDocument),
            artifact_generation: normalizeCanvasArtifactGeneration(artifactGeneration),
            node_positions: normalizeCanvasNodePositionsForComputedIdeation(nodePositions),
            ideation_bubble_graph: ideationBubbleGraph,
            imported_state: persistedSharedImportedState,
            import_override_active: importOverrideActive,
          },
    [
      agendaOverrides,
      canvasItems,
      customGroups,
      finalSummaryDocument,
      artifactGeneration,
      ideationBubbleGraph,
      importOverrideActive,
      meetingGoalContextDraft,
      meetingGoalDraft,
      nodePositions,
      persistedSharedImportedState,
      problemGroups,
      problemStructureStatePayload,
      sharedSyncEnabled,
      stage,
    ],
  );

  useEffect(() => {
    if (!meetingId || !userId || !workspaceLoadedRef.current || workspaceHydratingRef.current) {
      return;
    }

    if (personalNotesSaveTimerRef.current) {
      window.clearTimeout(personalNotesSaveTimerRef.current);
    }

    personalNotesSaveTimerRef.current = window.setTimeout(() => {
      void saveCanvasPersonalNotes(buildCanvasPersonalNotesPayload(meetingId, userId, personalNotes, localCanvasState))
        .catch((error) => {
          console.error("Failed to save canvas personal notes:", error);
        });
    }, 300);

    return () => {
      if (personalNotesSaveTimerRef.current) {
        window.clearTimeout(personalNotesSaveTimerRef.current);
        personalNotesSaveTimerRef.current = null;
      }
    };
  }, [localCanvasState, meetingId, personalNotes, userId, workspaceHydratingRef, workspaceLoadedRef]);

  useEffect(() => {
    if (!meetingId || !userId || !workspaceLoadedRef.current || workspaceHydratingRef.current) {
      latestPersonalNotesPayloadRef.current = null;
      return;
    }
    latestPersonalNotesPayloadRef.current = buildCanvasPersonalNotesPayload(
      meetingId,
      userId,
      personalNotes,
      localCanvasState,
    );
  }, [localCanvasState, meetingId, personalNotes, userId, workspaceHydratingRef, workspaceLoadedRef]);

  useEffect(() => {
    const flushPendingCanvasState = () => {
      if (captureStageOverride) {
        return;
      }
      if (
        meetingId &&
        latestSharedSyncEnabledRef.current &&
        workspaceLoadedRef.current &&
        !workspaceHydratingRef.current
      ) {
        console.info("[canvas pagehide flush] sending workspace snapshot", {
          meetingId,
          stage: latestSharedWorkspaceRef.current.stage,
          canvasItems: latestSharedWorkspaceRef.current.canvasItems.length,
          nodePositions: summarizeNodePositionsForDebug(latestSharedWorkspaceRef.current.nodePositions),
        });
        flushCanvasWorkspacePatch(
          buildCurrentWorkspacePatchPayload(latestSharedWorkspaceRef.current),
        );
      }
      if (latestPersonalNotesPayloadRef.current) {
        flushCanvasPersonalNotes(latestPersonalNotesPayloadRef.current);
      }
    };

    window.addEventListener("pagehide", flushPendingCanvasState);
    return () => {
      window.removeEventListener("pagehide", flushPendingCanvasState);
    };
  }, [
    buildCurrentWorkspacePatchPayload,
    captureStageOverride,
    latestSharedSyncEnabledRef,
    latestSharedWorkspaceRef,
    meetingId,
    workspaceHydratingRef,
    workspaceLoadedRef,
  ]);
}
