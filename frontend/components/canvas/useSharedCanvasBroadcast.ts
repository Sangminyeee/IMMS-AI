"use client";

import { useCallback, useEffect, type MutableRefObject } from "react";
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
import { normalizeCanvasArtifactGeneration } from "@/components/canvas/canvasArtifactGeneration";
import type {
  CanvasArtifactGenerationMap,
  CanvasCustomGroup,
  CanvasFinalSolutionSummary,
  CanvasIdeationBubbleGraph,
  CanvasNodePositionsByStage,
  CanvasProblemDefinitionGroup,
  CanvasProblemStructureState,
  CanvasRealtimeSyncPayload,
  CanvasWorkspaceItem,
  MeetingState,
} from "@/lib/types";

type CanvasStage = "ideation" | "problem-definition" | "solution";
type CanvasSyncScope = NonNullable<CanvasRealtimeSyncPayload["sync_scope"]>;
const SHARED_CANVAS_SYNC_STAGE: CanvasStage = "ideation";

type UseSharedCanvasBroadcastOptions = {
  agendaOverrides: Record<string, AgendaOverride>;
  canvasItems: CanvasWorkspaceItem[];
  customGroups: CanvasCustomGroup[];
  finalSummaryDocument: CanvasFinalSolutionSummary;
  artifactGeneration: CanvasArtifactGenerationMap;
  ideationBubbleGraph: CanvasIdeationBubbleGraph;
  importedState: MeetingState | null;
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
  stage: CanvasStage;
  userId: string;
  workspaceHydratingRef: MutableRefObject<boolean>;
  workspaceLoadedRef: MutableRefObject<boolean>;
};

const SCOPED_SYNC_OVERRIDE_KEYS = new Set([
  "problemGroups",
  "problemStructure",
  "finalSolutionSummary",
  "artifactGeneration",
  "ideationBubbleGraph",
  "nodePositions",
]);

function resolveForcedSyncScope(overrides?: FullWorkspacePatchPayloadOverrides): CanvasSyncScope {
  if (!overrides) return "full";

  const overrideKeys = Object.keys(overrides);
  const hasOnlyScopedKeys = overrideKeys.every((key) => SCOPED_SYNC_OVERRIDE_KEYS.has(key));
  if (!hasOnlyScopedKeys) return "full";
  const changesProblemDomain = "problemGroups" in overrides || "problemStructure" in overrides;
  const changesSummaryDomain = "finalSolutionSummary" in overrides;
  const changesBubbleDomain = "ideationBubbleGraph" in overrides;
  const changedDomainCount = [changesProblemDomain, changesSummaryDomain, changesBubbleDomain].filter(Boolean).length;
  if (changedDomainCount > 1) return "full";

  if ("finalSolutionSummary" in overrides) return "summary_document";
  if ("problemStructure" in overrides) return "problem_structure";
  if ("problemGroups" in overrides) return "problem_groups";
  if ("ideationBubbleGraph" in overrides) return "ideation_bubble_graph";
  if ("artifactGeneration" in overrides) return "artifact_generation";
  if ("nodePositions" in overrides) return "node_positions";
  return "full";
}

export function useSharedCanvasBroadcast({
  agendaOverrides,
  canvasItems,
  customGroups,
  finalSummaryDocument,
  artifactGeneration,
  ideationBubbleGraph,
  importedState,
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
        artifactGeneration: overrides.artifactGeneration ?? artifactGeneration,
        ideationBubbleGraph: overrides.ideationBubbleGraph ?? ideationBubbleGraph,
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
      artifactGeneration,
      ideationBubbleGraph,
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

  const forceBroadcastSharedCanvas = useCallback(
    (overrides?: FullWorkspacePatchPayloadOverrides) => {
      if (!meetingId || !userId) {
        return;
      }

      const snapshot = {
        meeting_goal: (overrides?.meetingGoal ?? meetingGoalDraft).trim(),
        meeting_goal_context: (overrides?.meetingGoalContext ?? meetingGoalContextDraft).trim(),
        stage: SHARED_CANVAS_SYNC_STAGE,
        agenda_overrides: serializeAgendaOverrides(overrides?.agendaOverrides ?? agendaOverrides),
        canvas_items: serializeSharedCanvasItems(overrides?.canvasItems ?? canvasItems),
        custom_groups: serializeCustomGroups(overrides?.customGroups ?? customGroups),
        problem_groups: buildWorkspaceProblemGroupsPayload(overrides?.problemGroups ?? problemGroups),
        problem_structure: overrides?.problemStructure ?? problemStructureStatePayload,
        solution_topics: [],
        final_solution_summary: buildFinalSolutionSummaryPayload(overrides?.finalSolutionSummary ?? finalSummaryDocument),
        artifact_generation: normalizeCanvasArtifactGeneration(overrides?.artifactGeneration ?? artifactGeneration),
        ideation_bubble_graph: overrides?.ideationBubbleGraph ?? ideationBubbleGraph,
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
      const syncScope = resolveForcedSyncScope(overrides);
      onSharedCanvasSync({
        sync_id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        meeting_id: meetingId,
        sync_scope: syncScope,
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
        artifact_generation: snapshot.artifact_generation,
        ideation_bubble_graph: snapshot.ideation_bubble_graph,
        imported_state: snapshot.imported_state,
      });
    },
    [
      agendaOverrides,
      canvasItems,
      customGroups,
      finalSummaryDocument,
      artifactGeneration,
      ideationBubbleGraph,
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

  return {
    buildCurrentWorkspacePatchPayload,
    forceBroadcastSharedCanvas,
  };
}
