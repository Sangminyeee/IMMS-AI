"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { askCanvasQuickQuestion } from "@/lib/api";

export type CanvasQuickAskMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  status: "pending" | "done" | "error";
  warning?: string;
};

type UseCanvasQuickAskOptions = {
  meetingId: string;
  meetingTopic: string;
  stage: "ideation" | "problem-definition" | "solution";
  buildContext: () => Record<string, unknown>;
};

export function useCanvasQuickAsk({ meetingId, meetingTopic, stage, buildContext }: UseCanvasQuickAskOptions) {
  const [quickAskOpen, setQuickAskOpen] = useState(false);
  const [quickAskDraft, setQuickAskDraft] = useState("");
  const [quickAskMessages, setQuickAskMessages] = useState<CanvasQuickAskMessage[]>([]);
  const [quickAskUnreadCount, setQuickAskUnreadCount] = useState(0);
  const quickAskOpenRef = useRef(quickAskOpen);
  const quickAskScrollRef = useRef<HTMLDivElement | null>(null);

  const markQuickAskRead = useCallback(() => {
    setQuickAskUnreadCount(0);
  }, []);

  const quickAskPendingCount = useMemo(
    () => quickAskMessages.filter((message) => message.status === "pending").length,
    [quickAskMessages],
  );

  useEffect(() => {
    quickAskOpenRef.current = quickAskOpen;
  }, [quickAskOpen]);

  useEffect(() => {
    if (!quickAskOpen) return undefined;

    const frame = window.requestAnimationFrame(() => {
      if (quickAskScrollRef.current) {
        quickAskScrollRef.current.scrollTop = quickAskScrollRef.current.scrollHeight;
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [quickAskMessages.length, quickAskOpen]);

  const handleToggleQuickAsk = useCallback(() => {
    setQuickAskOpen((prev) => {
      const next = !prev;
      if (next) {
        markQuickAskRead();
      }
      return next;
    });
  }, [markQuickAskRead]);

  const handleSubmitQuickAsk = useCallback(
    (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      const question = quickAskDraft.trim();
      if (!question || !meetingId) return;

      const now = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
      const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      const userMessageId = `quick-user-${requestId}`;
      const assistantMessageId = `quick-assistant-${requestId}`;

      setQuickAskMessages((prev) => [
        ...prev,
        {
          id: userMessageId,
          role: "user",
          text: question,
          createdAt: now,
          status: "done",
        },
        {
          id: assistantMessageId,
          role: "assistant",
          text: "응답 생성 중...",
          createdAt: now,
          status: "pending",
        },
      ]);
      setQuickAskDraft("");

      void askCanvasQuickQuestion({
        meeting_id: meetingId,
        meeting_topic: meetingTopic,
        stage,
        question,
        context: buildContext(),
      })
        .then((result) => {
          setQuickAskMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMessageId
                ? {
                    ...message,
                    text: result.answer || "응답이 비어 있습니다.",
                    status: "done",
                    warning: result.warning || "",
                  }
                : message,
            ),
          );
          if (!quickAskOpenRef.current) {
            setQuickAskUnreadCount((prev) => prev + 1);
          }
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          setQuickAskMessages((prev) =>
            prev.map((item) =>
              item.id === assistantMessageId
                ? {
                    ...item,
                    text: `응답을 가져오지 못했습니다. ${message}`,
                    status: "error",
                  }
                : item,
            ),
          );
          if (!quickAskOpenRef.current) {
            setQuickAskUnreadCount((prev) => prev + 1);
          }
        });
    },
    [buildContext, meetingId, meetingTopic, quickAskDraft, stage],
  );

  return {
    quickAskOpen,
    setQuickAskOpen,
    quickAskDraft,
    setQuickAskDraft,
    quickAskMessages,
    quickAskUnreadCount,
    quickAskPendingCount,
    quickAskScrollRef,
    handleToggleQuickAsk,
    handleSubmitQuickAsk,
  };
}
