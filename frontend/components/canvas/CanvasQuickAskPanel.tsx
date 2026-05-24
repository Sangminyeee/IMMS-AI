"use client";

import type { FormEvent, RefObject } from "react";
import type { CanvasQuickAskMessage } from "@/components/canvas/useCanvasQuickAsk";

type CanvasQuickAskPanelProps = {
  open: boolean;
  rightDrawerCollapsed: boolean;
  messages: CanvasQuickAskMessage[];
  draft: string;
  unreadCount: number;
  pendingCount: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onToggle: () => void;
  onDraftChange: (value: string) => void;
  onSubmit: (event?: FormEvent<HTMLFormElement>) => void;
};

export function CanvasQuickAskPanel({
  open,
  rightDrawerCollapsed,
  messages,
  draft,
  unreadCount,
  pendingCount,
  scrollRef,
  onClose,
  onToggle,
  onDraftChange,
  onSubmit,
}: CanvasQuickAskPanelProps) {
  const launcherClassName = rightDrawerCollapsed
    ? "absolute bottom-5 left-1/2 z-50 flex h-[62px] w-12 -translate-x-1/2 flex-col items-center justify-center rounded-[16px] border border-black/10 bg-white text-[11px] font-semibold leading-tight text-[#a13ab8] shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition hover:-translate-y-0.5 hover:bg-[#f7ecfb] focus:outline-none focus:ring-4 focus:ring-[#a13ab8]/10"
    : "absolute bottom-4 left-4 right-4 z-50 flex min-h-[48px] items-center justify-between gap-3 rounded-[14px] border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-[#4d4d4d] shadow-[0_8px_24px_rgba(0,0,0,0.10)] transition hover:-translate-y-0.5 hover:border-[#a13ab8]/20 hover:bg-[#f7ecfb] focus:outline-none focus:ring-4 focus:ring-[#a13ab8]/10";
  const panelClassName = rightDrawerCollapsed
    ? "absolute bottom-20 right-2 z-50 flex w-[min(26rem,calc(100vw-1.5rem))] max-h-[min(620px,72vh)] flex-col overflow-hidden rounded-[18px] border border-black/10 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.24)]"
    : "absolute bottom-20 right-4 z-50 flex w-[min(28rem,calc(100vw-2rem))] max-h-[min(620px,72vh)] flex-col overflow-hidden rounded-[18px] border border-black/10 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.24)]";

  return (
    <>
      {open ? (
        <div className={panelClassName}>
          <div className="flex items-start justify-between gap-4 border-b border-black/10 px-4 py-3.5">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#a13ab8]">LLM Search</p>
              <h4 className="mt-1 text-base font-semibold leading-tight text-black">LLM 및 검색</h4>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eff0f6] text-lg leading-none text-[#4d4d4d] transition hover:bg-[#e3e5ee]"
              aria-label="LLM 및 검색 닫기"
            >
              ×
            </button>
          </div>
          <div ref={scrollRef} className="imms-overlay-scroll flex-1 space-y-3 overflow-y-auto bg-[#f7f8fb] px-4 py-4">
            {messages.length === 0 ? (
              <div className="rounded-[14px] border border-dashed border-black/10 bg-white px-4 py-5 text-sm leading-6 text-[#6f6f6f]">
                아직 질문이 없습니다.
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[86%] rounded-[14px] px-3.5 py-3 text-sm leading-6 shadow-sm ${
                      message.role === "user"
                        ? "bg-[#a13ab8] text-white"
                        : message.status === "error"
                        ? "border border-red-100 bg-red-50 text-red-700"
                        : "border border-black/10 bg-white text-[#2f3440]"
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{message.text}</div>
                    <div
                      className={`mt-2 flex items-center gap-2 text-[11px] ${
                        message.role === "user" ? "text-white/70" : "text-[#8b8f9a]"
                      }`}
                    >
                      <span>{message.createdAt}</span>
                      {message.status === "pending" ? <span>처리 중</span> : null}
                      {message.warning && message.status === "done" ? <span>주의 있음</span> : null}
                    </div>
                    {message.warning && message.status === "done" ? (
                      <p className="mt-2 rounded-[10px] bg-[#fff8e8] px-2.5 py-2 text-xs leading-5 text-[#8a6516]">
                        {message.warning}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
          <form onSubmit={onSubmit} className="border-t border-black/10 bg-white p-3">
            <textarea
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  onSubmit();
                }
              }}
              placeholder="질문 입력"
              className="min-h-[78px] w-full resize-none rounded-[12px] border border-black/10 bg-[#f9f9f9] px-3.5 py-3 text-sm leading-6 text-black outline-none transition placeholder:text-black/30 focus:border-[#a13ab8]/30 focus:bg-white focus:ring-2 focus:ring-[#a13ab8]/10"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-[11px] font-medium text-[#8b8f9a]">
                {pendingCount > 0 ? `${pendingCount}개 응답 대기 중` : "LLM 응답"}
              </span>
              <button
                type="submit"
                disabled={!draft.trim()}
                className="rounded-[10px] border border-[#ead0f2] bg-[#f4e8fb] px-4 py-2 text-sm font-semibold text-[#6f2b7d] transition hover:border-[#d9b7e5] hover:bg-[#ecd9f7] disabled:cursor-not-allowed disabled:opacity-45"
              >
                보내기
              </button>
            </div>
          </form>
        </div>
      ) : null}
      <button type="button" onClick={onToggle} className={launcherClassName} title="LLM 및 검색">
        {rightDrawerCollapsed ? (
          <span className="relative">
            <span className="block">LLM</span>
            <span className="block text-[10px] font-medium leading-tight text-[#777]">검색</span>
            {unreadCount > 0 || pendingCount > 0 ? (
              <span className="absolute -right-2.5 -top-2.5 h-3 w-3 rounded-full border-2 border-white bg-[#a13ab8]" />
            ) : null}
          </span>
        ) : (
          <>
            <span className="flex flex-col leading-tight">
              <span className="text-[#a13ab8]">LLM 및 검색</span>
              <span className="mt-0.5 text-[11px] font-medium text-[#777]">바로 질문하고 응답 확인</span>
            </span>
            <span className="rounded-full bg-[#f4e8fb] px-2.5 py-1 text-[11px] font-semibold text-[#a13ab8]">
              {pendingCount > 0 ? `${pendingCount}개 처리 중` : unreadCount > 0 ? `새 응답 ${unreadCount}` : "바로 질문"}
            </span>
          </>
        )}
      </button>
    </>
  );
}
