"use client";

import { memo, type FormEvent, type ReactNode, type RefObject } from "react";
import { CanvasQuickAskPanel } from "@/components/canvas/CanvasQuickAskPanel";
import {
  CanvasRightDrawer,
  type CanvasRightDrawerComposerHandlers,
  type CanvasRightDrawerComposerState,
  type CanvasRightDrawerLayoutHandlers,
  type CanvasRightDrawerLayoutState,
  type CanvasRightDrawerNoteHandlers,
  type CanvasRightDrawerNotesState,
} from "@/components/canvas/CanvasRightDrawer";
import {
  CanvasSurface,
  type CanvasSurfaceFlowHandlers,
  type CanvasSurfaceProblemHandlers,
  type CanvasSurfaceProblemState,
  type CanvasSurfaceSolutionHandlers,
  type CanvasSurfaceSolutionState,
  type CanvasSurfaceViewState,
} from "@/components/canvas/CanvasSurface";
import type { CanvasQuickAskMessage } from "@/components/canvas/useCanvasQuickAsk";

export type CanvasWorkspaceQuickAskState = {
  open: boolean;
  messages: CanvasQuickAskMessage[];
  draft: string;
  unreadCount: number;
  pendingCount: number;
  scrollRef: RefObject<HTMLDivElement | null>;
};

export type CanvasWorkspaceQuickAskHandlers = {
  onClose: () => void;
  onToggle: () => void;
  onDraftChange: (value: string) => void;
  onSubmit: (event?: FormEvent<HTMLFormElement>) => void;
};

export type CanvasWorkspacePanelsProps = {
  isDesktopLayout: boolean;
  workspaceGridColumns: string;
  canvasSurfaceRef: RefObject<HTMLDivElement | null>;
  surfaceView: CanvasSurfaceViewState;
  surfaceSolution: CanvasSurfaceSolutionState;
  surfaceProblem: CanvasSurfaceProblemState;
  surfaceFlowHandlers: CanvasSurfaceFlowHandlers;
  surfaceSolutionHandlers: CanvasSurfaceSolutionHandlers;
  surfaceProblemHandlers: CanvasSurfaceProblemHandlers;
  renderSummaryMarkdownPreview: (markdown: string, onEdit: () => void) => ReactNode;
  rightDrawerLayout: CanvasRightDrawerLayoutState;
  rightDrawerComposer: CanvasRightDrawerComposerState;
  rightDrawerNotesState: CanvasRightDrawerNotesState;
  rightDrawerLayoutHandlers: CanvasRightDrawerLayoutHandlers;
  rightDrawerComposerHandlers: CanvasRightDrawerComposerHandlers;
  rightDrawerNoteHandlers: CanvasRightDrawerNoteHandlers;
  quickAskState: CanvasWorkspaceQuickAskState;
  quickAskHandlers: CanvasWorkspaceQuickAskHandlers;
};

export const CanvasWorkspacePanels = memo(function CanvasWorkspacePanels({
  isDesktopLayout,
  workspaceGridColumns,
  canvasSurfaceRef,
  surfaceView,
  surfaceSolution,
  surfaceProblem,
  surfaceFlowHandlers,
  surfaceSolutionHandlers,
  surfaceProblemHandlers,
  renderSummaryMarkdownPreview,
  rightDrawerLayout,
  rightDrawerComposer,
  rightDrawerNotesState,
  rightDrawerLayoutHandlers,
  rightDrawerComposerHandlers,
  rightDrawerNoteHandlers,
  quickAskState,
  quickAskHandlers,
}: CanvasWorkspacePanelsProps) {
  return (
    <div
      className="imms-workspace-grid grid flex-1 min-h-0 grid-cols-1 overflow-y-auto bg-black/10 xl:grid-rows-[minmax(0,1fr)_minmax(0,1fr)] xl:overflow-hidden xl:gap-[clamp(0.25rem,0.45vw,0.5rem)] xl:border-x xl:border-b xl:border-black/10"
      style={isDesktopLayout ? { gridTemplateColumns: workspaceGridColumns } : undefined}
    >
      <CanvasSurface
        canvasSurfaceRef={canvasSurfaceRef}
        view={surfaceView}
        solution={surfaceSolution}
        problem={surfaceProblem}
        flowHandlers={surfaceFlowHandlers}
        solutionHandlers={surfaceSolutionHandlers}
        problemHandlers={surfaceProblemHandlers}
        renderSummaryMarkdownPreview={renderSummaryMarkdownPreview}
      />

      <CanvasRightDrawer
        layout={rightDrawerLayout}
        composer={rightDrawerComposer}
        notesState={rightDrawerNotesState}
        quickAskSlot={
          <CanvasQuickAskPanel
            open={quickAskState.open}
            rightDrawerCollapsed={rightDrawerLayout.collapsed}
            messages={quickAskState.messages}
            draft={quickAskState.draft}
            unreadCount={quickAskState.unreadCount}
            pendingCount={quickAskState.pendingCount}
            scrollRef={quickAskState.scrollRef}
            onClose={quickAskHandlers.onClose}
            onToggle={quickAskHandlers.onToggle}
            onDraftChange={quickAskHandlers.onDraftChange}
            onSubmit={quickAskHandlers.onSubmit}
          />
        }
        layoutHandlers={rightDrawerLayoutHandlers}
        composerHandlers={rightDrawerComposerHandlers}
        noteHandlers={rightDrawerNoteHandlers}
      />
    </div>
  );
});
