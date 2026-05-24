"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

const DEFAULT_LEFT_PANEL_RATIO = 0.19;
const DEFAULT_RIGHT_PANEL_RATIO = 0.2;
const MIN_LEFT_PANEL_RATIO = 0.13;
const MAX_LEFT_PANEL_RATIO = 0.28;
const MIN_RIGHT_PANEL_RATIO = 0.14;
const MAX_RIGHT_PANEL_RATIO = 0.3;

type PlacementFeedbackState = {
  id: string;
  x: number;
  y: number;
  label: string;
} | null;

type CanvasPlacementPreviewState = {
  x: number;
  y: number;
  label: string;
  hint: string;
  tone: string;
} | null;

type UseCanvasUiStateOptions = {
  solutionPaneMeasureKey: string;
};

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function useCanvasUiState({ solutionPaneMeasureKey }: UseCanvasUiStateOptions) {
  const [rightDrawerCollapsed, setRightDrawerCollapsed] = useState(true);
  const [rightDrawerContentVisible, setRightDrawerContentVisible] = useState(false);
  const [rightDrawerDetailCollapsed, setRightDrawerDetailCollapsed] = useState(false);
  const [rightDrawerNotesCollapsed, setRightDrawerNotesCollapsed] = useState(false);
  const [meetingGoalEditorOpen, setMeetingGoalEditorOpen] = useState(false);
  const [leftPanelRatio, setLeftPanelRatio] = useState(DEFAULT_LEFT_PANEL_RATIO);
  const [rightPanelRatio, setRightPanelRatio] = useState(DEFAULT_RIGHT_PANEL_RATIO);
  const [isDesktopLayout, setIsDesktopLayout] = useState(false);
  const [solutionRightPaneWidth, setSolutionRightPaneWidth] = useState(0);
  const [placementFeedback, setPlacementFeedback] = useState<PlacementFeedbackState>(null);
  const [canvasPlacementPreview, setCanvasPlacementPreview] = useState<CanvasPlacementPreviewState>(null);

  const resizeStateRef = useRef<{ side: "left" | "right"; startX: number; startRatio: number } | null>(null);
  const solutionRightPaneRef = useRef<HTMLElement | null>(null);
  const placementFeedbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (rightDrawerCollapsed) return undefined;

    const timer = window.setTimeout(() => {
      setRightDrawerContentVisible(true);
    }, 120);

    return () => window.clearTimeout(timer);
  }, [rightDrawerCollapsed]);

  const openRightDrawer = useCallback(() => {
    setRightDrawerCollapsed(false);
  }, []);

  const closeRightDrawer = useCallback(() => {
    setRightDrawerContentVisible(false);
    setRightDrawerCollapsed(true);
  }, []);

  const toggleRightDrawer = useCallback(() => {
    setRightDrawerCollapsed((prev) => {
      if (!prev) {
        setRightDrawerContentVisible(false);
      }
      return !prev;
    });
  }, []);

  useEffect(() => {
    const syncViewportMode = () => {
      setIsDesktopLayout(window.innerWidth >= 1280);
    };

    syncViewportMode();
    window.addEventListener("resize", syncViewportMode);
    return () => window.removeEventListener("resize", syncViewportMode);
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: MouseEvent) => {
      if (!resizeStateRef.current) return;

      const viewportWidth = Math.max(window.innerWidth, 1);
      const deltaRatio = (event.clientX - resizeStateRef.current.startX) / viewportWidth;
      if (resizeStateRef.current.side === "left") {
        setLeftPanelRatio(
          clampNumber(
            resizeStateRef.current.startRatio + deltaRatio,
            MIN_LEFT_PANEL_RATIO,
            MAX_LEFT_PANEL_RATIO,
          ),
        );
        return;
      }

      setRightPanelRatio(
        clampNumber(
          resizeStateRef.current.startRatio - deltaRatio,
          MIN_RIGHT_PANEL_RATIO,
          MAX_RIGHT_PANEL_RATIO,
        ),
      );
    };

    const handlePointerUp = () => {
      resizeStateRef.current = null;
    };

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);
    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
    };
  }, []);

  useEffect(() => {
    const element = solutionRightPaneRef.current;
    if (!element) return undefined;

    const syncWidth = () => {
      const nextWidth = Math.round(element.getBoundingClientRect().width);
      setSolutionRightPaneWidth((current) => (Math.abs(current - nextWidth) > 4 ? nextWidth : current));
    };

    syncWidth();
    const observer = new ResizeObserver(syncWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, [solutionPaneMeasureKey]);

  const startPanelResize = useCallback(
    (side: "left" | "right") => (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (!isDesktopLayout) return;
      resizeStateRef.current = {
        side,
        startX: event.clientX,
        startRatio: side === "left" ? leftPanelRatio : rightPanelRatio,
      };
    },
    [isDesktopLayout, leftPanelRatio, rightPanelRatio],
  );

  return {
    rightDrawerCollapsed,
    rightDrawerContentVisible,
    rightDrawerDetailCollapsed,
    setRightDrawerDetailCollapsed,
    rightDrawerNotesCollapsed,
    setRightDrawerNotesCollapsed,
    openRightDrawer,
    closeRightDrawer,
    toggleRightDrawer,
    meetingGoalEditorOpen,
    setMeetingGoalEditorOpen,
    leftPanelRatio,
    rightPanelRatio,
    isDesktopLayout,
    startPanelResize,
    solutionRightPaneRef,
    solutionRightPaneWidth,
    placementFeedback,
    setPlacementFeedback,
    placementFeedbackTimerRef,
    canvasPlacementPreview,
    setCanvasPlacementPreview,
  };
}
