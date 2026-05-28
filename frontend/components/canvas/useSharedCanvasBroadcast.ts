"use client";

import { useCallback, useEffect, useMemo, type MutableRefObject } from "react";
import {
  buildFullWorkspacePatchPayload,
  buildSharedCanvasSignature,
  buildWorkspaceProblemGroupsPayload,
  serializeAgendaOverrides,
  serializeCustomGroups,
  serializeSharedCanvasItems,
  writeSharedWorkspaceSessionCache,
  type AgendaOverride,
  type FullWorkspacePatchPayloadOverrides,
} from "@/components/canvas/canvasWorkspaceSerialization";
import { buildFinalSolutionSummaryPayload } from "@/components/canvas/summaryDocumentHelpers";
import type {
  CanvasCustomGroup,
  CanvasFinalSolutionSummary,
  CanvasNodePositionsByStage,
  CanvasProblemDefinitionGroup,
  CanvasProblemStructureState,
  CanvasRealtimeSyncPayload,
  CanvasWorkspaceItem,
  MeetingState,
} from "@/lib/types";

type CanvasStage = "ideation" | "problem-definition" | "solution";

type UseSharedCanvasBroadcastOptions = {
  agendaOverrides: Record<string, AgendaOverride>;
  applyingRemoteSharedSyncRef: MutableRefObject<boolean>;
  canvasItems: CanvasWorkspaceItem[];
  customGroups: CanvasCustomGroup[];
  finalSummaryDocument: CanvasFinalSolutionSummary;
  importedState: MeetingState | null;
  incomingCanvasStateRequestId: string;
  lastNodePreviewFlushAtRef: MutableRefObject<number>;
  lastSharedSyncSignatureRef: MutableRefObject<string>;
  meetingGoalContextDraft: string;
  meetingGoalDraft: string;
  meetingId: string;
  nodePositions: CanvasNodePositionsByStage;
  nodePreviewFlushTimerRef: MutableRefObject<number | null>;
  onSharedCanvasSync: (payload: CanvasRealtimeSyncPayload) => void;
  pendingNodePreviewsRef: MutableRefObject<Record<string, unknown>>;
  problemGroups: Array<CanvasProblemDefinitionGroup & { status?: string }>;
  problemStructureStatePayload: CanvasProblemStructureState;
  sharedSyncEnabled: boolean;
  sharedSyncTimerRef: MutableRefObject<number | null>;
  stage: CanvasStage;
  userId: string;
  workspaceHydratingRef: MutableRefObject<boolean>;
  workspaceLoadedRef: MutableRefObject<boolean>;
};

export function useSharedCanvasBroadcast({
  agendaOverrides,
  applyingRemoteSharedSyncRef,
  canvasItems,
  customGroups,
  finalSummaryDocument,
  importedState,
  incomingCanvasStateRequestId,
  lastNodePreviewFlushAtRef,
  lastSharedSyncSignatureRef,
  meetingGoalContextDraft,
  meetingGoalDraft,
  meetingId,
  nodePositions,
  nodePreviewFlushTimerRef,
  onSharedCanvasSync,
  pendingNodePreviewsRef,
  problemGroups,
  problemStructureStatePayload,
  sharedSyncEnabled,
  sharedSyncTimerRef,
  stage,
  userId,
  workspaceHydratingRef,
  workspaceLoadedRef,
}: UseSharedCanvasBroadcastOptions) {
  const buildCurrentWorkspacePatchPayload = useCallback(
    (overrides: FullWorkspacePatchPayloadOverrides = {}) =>
      buildFullWorkspacePatchPayload({
        meetingId,
        meetingGoal: overrides.meetingGoal ?? meetingGoalDraft,
        meetingGoalContext: overrides.meetingGoalContext ?? meetingGoalContextDraft,
        stage: overrides.stage ?? stage,
        agendaOverrides: overrides.agendaOverrides ?? agendaOverrides,
        canvasItems: overrides.canvasItems ?? canvasItems,
        customGroups: overrides.customGroups ?? customGroups,
        problemGroups: overrides.problemGroups ?? problemGroups,
        problemStructure: overrides.problemStructure ?? problemStructureStatePayload,
        finalSolutionSummary: overrides.finalSolutionSummary ?? finalSummaryDocument,
        nodePositions: overrides.nodePositions ?? nodePositions,
        importedState:
          "importedState" in overrides
            ? (overrides.importedState ?? null)
            : importedState,
      }),
    [
      agendaOverrides,
      canvasItems,
      customGroups,
      finalSummaryDocument,
      importedState,
      meetingGoalContextDraft,
      meetingGoalDraft,
      meetingId,
      nodePositions,
      problemGroups,
      problemStructureStatePayload,
      stage,
    ],
  );

  const sharedCanvasSnapshot = useMemo(
    () => ({
      meeting_goal: meetingGoalDraft.trim(),
      meeting_goal_context: meetingGoalContextDraft.trim(),
      stage,
      agenda_overrides: serializeAgendaOverrides(agendaOverrides),
      canvas_items: serializeSharedCanvasItems(canvasItems),
      custom_groups: serializeCustomGroups(customGroups),
      problem_groups: buildWorkspaceProblemGroupsPayload(problemGroups),
      problem_structure: problemStructureStatePayload,
      solution_topics: [],
      final_solution_summary: buildFinalSolutionSummaryPayload(finalSummaryDocument),
      imported_state: importedState,
    }),
    [
      agendaOverrides,
      canvasItems,
      customGroups,
      finalSummaryDocument,
      importedState,
      meetingGoalContextDraft,
      meetingGoalDraft,
      problemGroups,
      problemStructureStatePayload,
      stage,
    ],
  );

  const sharedCanvasSignature = useMemo(
    () => buildSharedCanvasSignature(sharedCanvasSnapshot),
    [sharedCanvasSnapshot],
  );

  const forceBroadcastSharedCanvas = useCallback(
    (overrides?: FullWorkspacePatchPayloadOverrides) => {
      if (!meetingId || !userId) {
        return;
      }

      const snapshot = {
        meeting_goal: (overrides?.meetingGoal ?? meetingGoalDraft).trim(),
        meeting_goal_context: (overrides?.meetingGoalContext ?? meetingGoalContextDraft).trim(),
        stage: overrides?.stage ?? stage,
        agenda_overrides: serializeAgendaOverrides(overrides?.agendaOverrides ?? agendaOverrides),
        canvas_items: serializeSharedCanvasItems(overrides?.canvasItems ?? canvasItems),
        custom_groups: serializeCustomGroups(overrides?.customGroups ?? customGroups),
        problem_groups: buildWorkspaceProblemGroupsPayload(overrides?.problemGroups ?? problemGroups),
        problem_structure: overrides?.problemStructure ?? problemStructureStatePayload,
        solution_topics: [],
        final_solution_summary: buildFinalSolutionSummaryPayload(overrides?.finalSolutionSummary ?? finalSummaryDocument),
        imported_state:
          overrides && "importedState" in overrides
            ? (overrides.importedState ?? null)
            : importedState,
      };

      if (nodePreviewFlushTimerRef.current) {
        window.clearTimeout(nodePreviewFlushTimerRef.current);
        nodePreviewFlushTimerRef.current = null;
      }
      pendingNodePreviewsRef.current = {};
      lastNodePreviewFlushAtRef.current = Date.now();
      lastSharedSyncSignatureRef.current = buildSharedCanvasSignature(snapshot);
      onSharedCanvasSync({
        sync_id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        meeting_id: meetingId,
        sync_scope: "full",
        updated_by: userId,
        updated_at: new Date().toISOString(),
        meeting_goal: snapshot.meeting_goal,
        meeting_goal_context: snapshot.meeting_goal_context,
        stage: snapshot.stage,
        agenda_overrides: snapshot.agenda_overrides,
        canvas_items: snapshot.canvas_items,
        custom_groups: snapshot.custom_groups,
        problem_groups: snapshot.problem_groups,
        problem_structure: snapshot.problem_structure,
        solution_topics: snapshot.solution_topics,
        final_solution_summary: snapshot.final_solution_summary,
        imported_state: snapshot.imported_state,
      });
    },
    [
      agendaOverrides,
      canvasItems,
      customGroups,
      finalSummaryDocument,
      importedState,
      lastNodePreviewFlushAtRef,
      lastSharedSyncSignatureRef,
      meetingGoalContextDraft,
      meetingGoalDraft,
      meetingId,
      nodePreviewFlushTimerRef,
      onSharedCanvasSync,
      pendingNodePreviewsRef,
      problemGroups,
      problemStructureStatePayload,
      stage,
      userId,
    ],
  );

  useEffect(() => {
    if (!meetingId || !sharedSyncEnabled || !workspaceLoadedRef.current || workspaceHydratingRef.current) {
      return;
    }

    writeSharedWorkspaceSessionCache(
      meetingId,
      buildCurrentWorkspacePatchPayload(),
    );
  }, [
    buildCurrentWorkspacePatchPayload,
    meetingId,
    sharedSyncEnabled,
    workspaceHydratingRef,
    workspaceLoadedRef,
  ]);

  useEffect(() => {
    if (
      !meetingId ||
      !userId ||
      !sharedSyncEnabled ||
      !workspaceLoadedRef.current ||
      workspaceHydratingRef.current ||
      applyingRemoteSharedSyncRef.current ||
      lastSharedSyncSignatureRef.current === sharedCanvasSignature
    ) {
      return;
    }

    if (sharedSyncTimerRef.current) {
      window.clearTimeout(sharedSyncTimerRef.current);
    }

    sharedSyncTimerRef.current = window.setTimeout(() => {
      if (workspaceHydratingRef.current || applyingRemoteSharedSyncRef.current) {
        return;
      }

      lastSharedSyncSignatureRef.current = sharedCanvasSignature;
      onSharedCanvasSync({
        sync_id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        meeting_id: meetingId,
        sync_scope: "full",
        meeting_goal: sharedCanvasSnapshot.meeting_goal,
        meeting_goal_context: sharedCanvasSnapshot.meeting_goal_context,
        updated_by: userId,
        updated_at: new Date().toISOString(),
        stage: sharedCanvasSnapshot.stage,
        agenda_overrides: sharedCanvasSnapshot.agenda_overrides,
        canvas_items: sharedCanvasSnapshot.canvas_items,
        custom_groups: sharedCanvasSnapshot.custom_groups,
        problem_groups: sharedCanvasSnapshot.problem_groups,
        problem_structure: sharedCanvasSnapshot.problem_structure,
        solution_topics: sharedCanvasSnapshot.solution_topics,
        final_solution_summary: sharedCanvasSnapshot.final_solution_summary,
        imported_state: sharedCanvasSnapshot.imported_state,
      });
    }, 140);

    return () => {
      if (sharedSyncTimerRef.current) {
        window.clearTimeout(sharedSyncTimerRef.current);
        sharedSyncTimerRef.current = null;
      }
    };
  }, [
    applyingRemoteSharedSyncRef,
    lastSharedSyncSignatureRef,
    meetingId,
    onSharedCanvasSync,
    sharedCanvasSignature,
    sharedCanvasSnapshot,
    sharedSyncEnabled,
    sharedSyncTimerRef,
    userId,
    workspaceHydratingRef,
    workspaceLoadedRef,
  ]);

  useEffect(() => {
    if (
      !incomingCanvasStateRequestId ||
      !sharedSyncEnabled ||
      !workspaceLoadedRef.current ||
      workspaceHydratingRef.current ||
      applyingRemoteSharedSyncRef.current
    ) {
      return;
    }

    forceBroadcastSharedCanvas();
  }, [
    applyingRemoteSharedSyncRef,
    forceBroadcastSharedCanvas,
    incomingCanvasStateRequestId,
    sharedSyncEnabled,
    workspaceHydratingRef,
    workspaceLoadedRef,
  ]);

  return {
    buildCurrentWorkspacePatchPayload,
    forceBroadcastSharedCanvas,
  };
}
