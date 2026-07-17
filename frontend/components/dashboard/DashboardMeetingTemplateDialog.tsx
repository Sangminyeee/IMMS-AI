import { useEffect, useId } from "react";
import { useMoaPresence } from "@/components/moa-ui/useMoaPresence";

type DashboardMeetingTemplateDialogProps = {
  open: boolean;
  title: string;
  optionA: string;
  optionAKeyword: string;
  optionB: string;
  optionBKeyword: string;
  onClose: () => void;
  onSave: () => void;
  onTitleChange: (value: string) => void;
  onOptionAChange: (value: string) => void;
  onOptionAKeywordChange: (value: string) => void;
  onOptionBChange: (value: string) => void;
  onOptionBKeywordChange: (value: string) => void;
};

export function DashboardMeetingTemplateDialog({
  open,
  title,
  optionA,
  optionAKeyword,
  optionB,
  optionBKeyword,
  onClose,
  onSave,
  onTitleChange,
  onOptionAChange,
  onOptionAKeywordChange,
  onOptionBChange,
  onOptionBKeywordChange,
}: DashboardMeetingTemplateDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const inputId = useId();
  const optionAId = useId();
  const optionAKeywordId = useId();
  const optionBId = useId();
  const optionBKeywordId = useId();
  const presence = useMoaPresence(open, 320);
  const canSubmit = Boolean(
    title.trim() &&
      optionA.trim() &&
      optionAKeyword.trim() &&
      optionB.trim() &&
      optionBKeyword.trim(),
  );

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!presence.shouldRender) return null;

  return (
    <div
      className="moa-popover-backdrop fixed inset-0 z-50 flex items-center justify-center bg-[rgba(10,15,36,0.4)] px-5 backdrop-blur-[1.5px]"
      data-exiting={presence.isExiting}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="moa-popover-panel w-[min(560px,calc(100vw-40px))] overflow-hidden rounded-[16px] border border-black/10 bg-white text-left shadow-[0_28px_35px_rgba(72,64,65,0.25)]"
        data-exiting={presence.isExiting}
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) onSave();
        }}
      >
        <div className="px-[24px] pb-[8px] pt-[24px]">
          <div className="flex flex-col gap-[4px]">
            <p className="text-[12px] font-bold leading-[15px] tracking-[-0.03px] text-[#459ff6]">시연 템플릿</p>
            <h2 id={titleId} className="text-[20px] font-bold leading-[30px] tracking-[-0.05px] text-[#111]">
              회의 템플릿 저장
            </h2>
            <p id={descriptionId} className="text-[14px] font-medium leading-[1.4] tracking-[-0.035px] text-[#7c7c7c]">
              같은 밸런스 게임 주제로 여러 번 시연할 수 있도록 A/B 설정을 저장합니다.
            </p>
          </div>
        </div>

        <div className="space-y-[16px] px-[24px] pb-[28px] pt-[8px]">
          <div>
            <label htmlFor={inputId} className="mb-[6px] block text-[12px] font-bold leading-[1.4] tracking-[-0.03px] text-[#434343]">
              템플릿 제목
            </label>
            <input
              id={inputId}
              type="text"
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder="예) 친구 vs 연인 밸런스 게임"
              className="h-[44px] w-full rounded-[12px] border border-[#e5e7eb] bg-white px-[14px] text-[12px] font-normal leading-[1.4] tracking-[-0.03px] text-[#1a2035] outline-none transition placeholder:text-[rgba(26,32,53,0.45)] focus:border-[#01a3ff] focus:shadow-[0_0_0_3px_rgba(1,163,255,0.1)]"
              autoFocus
            />
          </div>

          <div className="rounded-[16px] border border-[#e4efff] bg-[#f7fbff] p-[14px]">
            <div className="grid gap-[10px] lg:grid-cols-2">
              <div>
                <label htmlFor={optionAId} className="mb-[5px] block text-[11px] font-bold leading-[1.4] tracking-[-0.028px] text-[#236cf3]">
                  A 선택지
                </label>
                <input
                  id={optionAId}
                  type="text"
                  value={optionA}
                  onChange={(event) => onOptionAChange(event.target.value)}
                  placeholder="예) 친구"
                  className="h-[40px] w-full rounded-[12px] border border-[#dbeafe] bg-white px-[13px] text-[12px] font-semibold leading-[1.4] tracking-[-0.03px] text-[#1a2035] outline-none transition placeholder:text-[rgba(26,32,53,0.42)] focus:border-[#01a3ff] focus:shadow-[0_0_0_3px_rgba(1,163,255,0.1)]"
                />
              </div>
              <div>
                <label htmlFor={optionAKeywordId} className="mb-[5px] block text-[11px] font-bold leading-[1.4] tracking-[-0.028px] text-[#236cf3]">
                  A 중심 키워드
                </label>
                <input
                  id={optionAKeywordId}
                  type="text"
                  value={optionAKeyword}
                  onChange={(event) => onOptionAKeywordChange(event.target.value)}
                  placeholder="예) 친구"
                  className="h-[40px] w-full rounded-[12px] border border-[#dbeafe] bg-white px-[13px] text-[12px] font-semibold leading-[1.4] tracking-[-0.03px] text-[#1a2035] outline-none transition placeholder:text-[rgba(26,32,53,0.42)] focus:border-[#01a3ff] focus:shadow-[0_0_0_3px_rgba(1,163,255,0.1)]"
                />
              </div>
            </div>
            <div className="mt-[10px] grid gap-[10px] lg:grid-cols-2">
              <div>
                <label htmlFor={optionBId} className="mb-[5px] block text-[11px] font-bold leading-[1.4] tracking-[-0.028px] text-[#e4573a]">
                  B 선택지
                </label>
                <input
                  id={optionBId}
                  type="text"
                  value={optionB}
                  onChange={(event) => onOptionBChange(event.target.value)}
                  placeholder="예) 연인"
                  className="h-[40px] w-full rounded-[12px] border border-[#ffe0d5] bg-white px-[13px] text-[12px] font-semibold leading-[1.4] tracking-[-0.03px] text-[#1a2035] outline-none transition placeholder:text-[rgba(26,32,53,0.42)] focus:border-[#ff6544] focus:shadow-[0_0_0_3px_rgba(255,101,68,0.1)]"
                />
              </div>
              <div>
                <label htmlFor={optionBKeywordId} className="mb-[5px] block text-[11px] font-bold leading-[1.4] tracking-[-0.028px] text-[#e4573a]">
                  B 중심 키워드
                </label>
                <input
                  id={optionBKeywordId}
                  type="text"
                  value={optionBKeyword}
                  onChange={(event) => onOptionBKeywordChange(event.target.value)}
                  placeholder="예) 연인"
                  className="h-[40px] w-full rounded-[12px] border border-[#ffe0d5] bg-white px-[13px] text-[12px] font-semibold leading-[1.4] tracking-[-0.03px] text-[#1a2035] outline-none transition placeholder:text-[rgba(26,32,53,0.42)] focus:border-[#ff6544] focus:shadow-[0_0_0_3px_rgba(255,101,68,0.1)]"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex h-[72px] items-center justify-end gap-[8px] border-t border-[#f0f0f0] px-[24px]">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-[40px] min-w-[56px] items-center justify-center rounded-full px-[14px] transition hover:bg-[#f6f6f6]"
          >
            <span className="block text-[14px] font-bold leading-[1.4] tracking-[-0.035px] text-[#4c4c4c]">취소</span>
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex h-[37px] min-w-[123px] items-center justify-center rounded-full border border-[#e2faff] bg-[linear-gradient(126deg,#2cb1fe_25%,#0542ff_82%)] px-[18px] text-white shadow-[0_3px_8px_rgba(5,66,255,0.14)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:border-[#ececec] disabled:bg-none disabled:bg-[#d8d8d8] disabled:shadow-none"
          >
            <span className="block text-[14px] font-bold leading-[1.4] tracking-[-0.035px] text-white">저장</span>
          </button>
        </div>
      </form>
    </div>
  );
}
