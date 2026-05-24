"use client";

import { memo, type ReactNode, type RefObject } from "react";
import type { CanvasEditPresencePayload, CanvasFinalSolutionSummary } from "@/lib/types";
import {
  SolutionFinalDocumentPanel,
  SolutionSummarySourceList,
  type SummaryProblemStructureGroup,
  type SummaryProblemStructureNode,
} from "@/components/canvas/SolutionPanels";

type SummaryDocumentSection = NonNullable<CanvasFinalSolutionSummary["sections"]>[number];

type SolutionCanvasViewProps = {
  groups: SummaryProblemStructureGroup[];
  sectionByGroupId: Map<string, SummaryDocumentSection>;
  nodeById: Map<string, SummaryProblemStructureNode>;
  evidenceOpenGroupIds: Set<string>;
  remoteEditPresenceByKey: Record<string, CanvasEditPresencePayload>;
  paneRef: RefObject<HTMLElement | null>;
  document: CanvasFinalSolutionSummary;
  editMode: boolean;
  pending: boolean;
  onToggleEvidence: (groupId: string) => void;
  onSetEditMode: (editMode: boolean) => void;
  onRegenerate: () => void | Promise<void>;
  onCopy: () => void | Promise<void>;
  onMarkdownChange: (markdown: string) => void;
  renderPreview: (markdown: string, onEdit: () => void) => ReactNode;
};

export const SolutionCanvasView = memo(function SolutionCanvasView({
  groups,
  sectionByGroupId,
  nodeById,
  evidenceOpenGroupIds,
  remoteEditPresenceByKey,
  paneRef,
  document,
  editMode,
  pending,
  onToggleEvidence,
  onSetEditMode,
  onRegenerate,
  onCopy,
  onMarkdownChange,
  renderPreview,
}: SolutionCanvasViewProps) {
  return (
    <div className="grid h-full min-h-0 grid-cols-1 bg-[#f5f6f8] xl:grid-cols-[minmax(18rem,32%)_minmax(0,1fr)]">
      <SolutionSummarySourceList
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
        editMode={editMode}
        pending={pending}
        eligibleGroupCount={groups.length}
        onSetEditMode={onSetEditMode}
        onRegenerate={onRegenerate}
        onCopy={onCopy}
        onMarkdownChange={onMarkdownChange}
        renderPreview={renderPreview}
      />
    </div>
  );
});
