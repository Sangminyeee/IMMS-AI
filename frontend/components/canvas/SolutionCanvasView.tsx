"use client";

import { memo, useMemo, type ReactNode, type RefObject } from "react";
import type { CanvasEditPresencePayload, CanvasFinalSolutionSummary, CanvasSummaryDocumentBlock } from "@/lib/types";
import {
  buildSolutionPresentationModel,
  SolutionFinalDocumentPanel,
  SolutionSummarySourceList,
  type SummaryParticipant,
  type SummaryProblemStructureGroup,
  type SummaryProblemStructureNode,
} from "@/components/canvas/SolutionPanels";

type SummaryDocumentSection = NonNullable<CanvasFinalSolutionSummary["sections"]>[number];

type SolutionCanvasViewProps = {
  meetingTitle: string;
  meetingGoal: string;
  participants: SummaryParticipant[];
  groups: SummaryProblemStructureGroup[];
  sectionByGroupId: Map<string, SummaryDocumentSection>;
  nodeById: Map<string, SummaryProblemStructureNode>;
  evidenceOpenGroupIds: Set<string>;
  remoteEditPresenceByKey: Record<string, CanvasEditPresencePayload>;
  paneRef: RefObject<HTMLElement | null>;
  document: CanvasFinalSolutionSummary;
  draftBlocks: CanvasSummaryDocumentBlock[];
  draftMarkdown: string;
  draftDirty: boolean;
  editMode: boolean;
  pending: boolean;
  saving: boolean;
  onToggleEvidence: (groupId: string) => void;
  onSetEditMode: (editMode: boolean) => void;
  onRegenerate: () => void | Promise<void>;
  onRefreshCache: () => void | Promise<void>;
  onCopy: () => void | Promise<void>;
  onSave: () => void | Promise<void>;
  onBlocksChange: (blocks: CanvasSummaryDocumentBlock[]) => void;
  onMarkdownChange: (markdown: string) => void;
  renderPreview: (markdown: string, onEdit: () => void) => ReactNode;
};

export const SolutionCanvasView = memo(function SolutionCanvasView({
  meetingTitle,
  meetingGoal,
  participants,
  groups,
  sectionByGroupId,
  nodeById,
  evidenceOpenGroupIds,
  remoteEditPresenceByKey,
  paneRef,
  document,
  draftBlocks,
  draftMarkdown,
  draftDirty,
  editMode,
  pending,
  saving,
  onToggleEvidence,
  onSetEditMode,
  onRegenerate,
  onRefreshCache,
  onCopy,
  onSave,
  onBlocksChange,
  onMarkdownChange,
  renderPreview,
}: SolutionCanvasViewProps) {
  const presentation = useMemo(
    () => buildSolutionPresentationModel({ meetingTitle, meetingGoal, participants, document, groups, sectionByGroupId, nodeById }),
    [document, groups, meetingGoal, meetingTitle, nodeById, participants, sectionByGroupId],
  );

  return (
    <div className="grid h-full min-h-0 grid-cols-1 bg-[#f8f8f8] xl:grid-cols-[minmax(360px,37%)_minmax(0,63%)]">
      <SolutionSummarySourceList
        meetingTitle={meetingTitle}
        meetingGoal={meetingGoal}
        participants={participants}
        document={document}
        groups={groups}
        sectionByGroupId={sectionByGroupId}
        nodeById={nodeById}
        evidenceOpenGroupIds={evidenceOpenGroupIds}
        remoteEditPresenceByKey={remoteEditPresenceByKey}
        onToggleEvidence={onToggleEvidence}
      />
      <SolutionFinalDocumentPanel
        paneRef={paneRef}
        document={document}
        draftBlocks={draftBlocks}
        draftMarkdown={draftMarkdown}
        draftDirty={draftDirty}
        editMode={editMode}
        pending={pending}
        saving={saving}
        eligibleGroupCount={groups.length}
        presentation={presentation}
        remoteEditPresenceByKey={remoteEditPresenceByKey}
        onSetEditMode={onSetEditMode}
        onRegenerate={onRegenerate}
        onRefreshCache={onRefreshCache}
        onCopy={onCopy}
        onSave={onSave}
        onBlocksChange={onBlocksChange}
        onMarkdownChange={onMarkdownChange}
        renderPreview={renderPreview}
      />
    </div>
  );
});
