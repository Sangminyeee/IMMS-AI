import { useEffect, useId } from "react";

interface DashboardCreateMeetingDialogProps {
  meetingTitle: string;
  onClose: () => void;
  onCreate: () => void;
  onMeetingTitleChange: (title: string) => void;
  open: boolean;
}

export function DashboardCreateMeetingDialog({
  meetingTitle,
  onClose,
  onCreate,
  onMeetingTitleChange,
  open,
}: DashboardCreateMeetingDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const inputId = useId();

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(10,15,36,0.4)] px-5 backdrop-blur-[1.5px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="w-[min(560px,calc(100vw-40px))] overflow-hidden rounded-[16px] border border-black/10 bg-white text-left shadow-[0_28px_35px_rgba(72,64,65,0.25)]"
        onSubmit={(event) => {
          event.preventDefault();
          if (meetingTitle.trim()) onCreate();
        }}
      >
        <div className="px-[24px] pb-[8px] pt-[24px]">
          <div className="flex flex-col gap-[4px]">
            <p className="text-[12px] font-bold leading-[15px] tracking-[-0.03px] text-[#459ff6]">새 회의</p>
            <h2 id={titleId} className="text-[20px] font-bold leading-[30px] tracking-[-0.05px] text-[#111]">
              새 회의 만들기
            </h2>
            <p id={descriptionId} className="text-[14px] font-medium leading-[1.4] tracking-[-0.035px] text-[#7c7c7c]">
              회의 제목을 입력하면 바로 회의를 만들 수 있습니다.
            </p>
          </div>
        </div>

        <div className="px-[24px] pb-[28px] pt-[8px]">
          <label htmlFor={inputId} className="mb-[6px] block text-[12px] font-bold leading-[1.4] tracking-[-0.03px] text-[#434343]">
            회의 제목
          </label>
          <input
            id={inputId}
            type="text"
            value={meetingTitle}
            onChange={(event) => onMeetingTitleChange(event.target.value)}
            placeholder="예) Q3 마케팅 전략 회의"
            className="h-[44px] w-full rounded-[12px] border border-[#e5e7eb] bg-white px-[14px] text-[12px] font-normal leading-[1.4] tracking-[-0.03px] text-[#1a2035] outline-none transition placeholder:text-[rgba(26,32,53,0.5)] focus:border-[#01a3ff] focus:shadow-[0_0_0_3px_rgba(1,163,255,0.1)]"
            autoFocus
          />
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
            disabled={!meetingTitle.trim()}
            className="inline-flex h-[37px] min-w-[123px] items-center justify-center gap-[7px] rounded-full border border-[#e2faff] bg-[linear-gradient(126deg,#2cb1fe_25%,#0542ff_82%)] px-[18px] text-white shadow-[0_3px_8px_rgba(5,66,255,0.14)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:border-[#ececec] disabled:bg-none disabled:bg-[#d8d8d8] disabled:shadow-none"
          >
            <span className="block text-[14px] font-bold leading-[1.4] tracking-[-0.035px] text-white">회의 만들기</span>
            <svg aria-hidden="true" className="h-[14px] w-[14px] text-white" viewBox="0 0 14 14" fill="none">
              <path d="M3 7h7.3M7.7 4.4 10.3 7 7.7 9.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
