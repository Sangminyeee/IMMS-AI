import { useEffect, useId } from "react";
import { useMoaPresence } from "@/components/moa-ui/useMoaPresence";

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
  const presence = useMoaPresence(open, 320);

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

  if (!presence.shouldRender) return null;

  return (
    <div
      className="moa-popover-backdrop fixed inset-0 z-50 flex items-end justify-center bg-[rgba(10,15,36,0.4)] px-0 backdrop-blur-[1.5px] lg:items-center lg:px-5"
      data-exiting={presence.isExiting}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <h2 id={titleId} className="sr-only">
        새 회의 만들기
      </h2>
      <p id={descriptionId} className="sr-only">
        새 회의 생성 대화상자
      </p>
      <div className="moa-popover-sheet w-full overflow-hidden rounded-t-[30px] border border-[#d8e7ff] bg-white px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-7 text-center shadow-[0_-18px_60px_rgba(15,23,42,0.18)] lg:hidden" data-exiting={presence.isExiting}>
        <div className="mx-auto grid h-[58px] w-[58px] place-items-center rounded-[20px] bg-[#f3f9ff] text-[#0542ff] shadow-[0_12px_30px_rgba(5,66,255,0.1)]">
          <LockIcon className="h-[26px] w-[26px]" />
        </div>
        <h2 className="mt-5 text-[22px] font-bold leading-[1.35] tracking-[-0.55px] text-[#111]">
          모바일에서는 회의 생성이 불가합니다
        </h2>
        <p className="mx-auto mt-2 max-w-[280px] text-[14px] font-medium leading-[1.5] tracking-[-0.035px] text-[#7c7c7c]">
          새 회의 생성은 데스크톱 화면에서 진행해 주세요. 모바일에서는 생성된 회의 확인과 입장만 지원합니다.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-7 inline-flex h-[46px] w-full items-center justify-center rounded-full bg-[linear-gradient(126deg,#2cb1fe_25%,#0542ff_82%)] px-5 shadow-[0_12px_28px_rgba(5,66,255,0.18)]"
        >
          <span className="block text-[14px] font-bold leading-none tracking-[-0.035px] text-white">확인</span>
        </button>
      </div>

      <form
        className="moa-popover-panel hidden overflow-hidden bg-white text-left lg:block lg:w-[min(560px,calc(100vw-40px))] lg:rounded-[16px] lg:border lg:border-black/10 lg:shadow-[0_28px_35px_rgba(72,64,65,0.25)]"
        data-exiting={presence.isExiting}
        onSubmit={(event) => {
          event.preventDefault();
          if (meetingTitle.trim()) onCreate();
        }}
      >
        <div className="px-5 pb-[8px] pt-6 lg:px-[24px] lg:pt-[24px]">
          <div className="flex flex-col gap-[4px]">
            <p className="text-[12px] font-bold leading-[15px] tracking-[-0.03px] text-[#459ff6]">새 회의</p>
            <h2 className="text-[22px] font-bold leading-[1.35] tracking-[-0.55px] text-[#111] lg:text-[20px] lg:leading-[30px] lg:tracking-[-0.05px]">
              새 회의 만들기
            </h2>
            <p className="text-[14px] font-medium leading-[1.4] tracking-[-0.035px] text-[#7c7c7c]">
              회의 제목을 입력하면 바로 회의를 만들 수 있습니다.
            </p>
          </div>
        </div>

        <div className="px-5 pb-[28px] pt-[10px] lg:px-[24px] lg:pt-[8px]">
          <label htmlFor={inputId} className="mb-[6px] block text-[12px] font-bold leading-[1.4] tracking-[-0.03px] text-[#434343]">
            회의 제목
          </label>
          <input
            id={inputId}
            type="text"
            value={meetingTitle}
            onChange={(event) => onMeetingTitleChange(event.target.value)}
            placeholder="예) Q3 마케팅 전략 회의"
            className="h-[50px] w-full rounded-[16px] border border-[#e5e7eb] bg-white px-[16px] text-[14px] font-semibold leading-[1.4] tracking-[-0.03px] text-[#1a2035] outline-none transition placeholder:text-[rgba(26,32,53,0.45)] focus:border-[#01a3ff] focus:shadow-[0_0_0_3px_rgba(1,163,255,0.1)] lg:h-[44px] lg:rounded-[12px] lg:px-[14px] lg:text-[12px] lg:font-normal"
            autoFocus
          />
        </div>

        <div className="flex h-[80px] items-center justify-end gap-[8px] border-t border-[#f0f0f0] px-5 pb-[env(safe-area-inset-bottom)] lg:h-[72px] lg:px-[24px] lg:pb-0">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-[44px] min-w-[70px] items-center justify-center rounded-full px-[16px] transition hover:bg-[#f6f6f6] lg:h-[40px] lg:min-w-[56px] lg:px-[14px]"
          >
            <span className="block text-[14px] font-bold leading-[1.4] tracking-[-0.035px] text-[#4c4c4c]">취소</span>
          </button>
          <button
            type="submit"
            disabled={!meetingTitle.trim()}
            className="inline-flex h-[44px] min-w-[132px] items-center justify-center gap-[7px] rounded-full border border-[#e2faff] bg-[linear-gradient(126deg,#2cb1fe_25%,#0542ff_82%)] px-[20px] text-white shadow-[0_3px_8px_rgba(5,66,255,0.14)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:border-[#ececec] disabled:bg-none disabled:bg-[#d8d8d8] disabled:shadow-none lg:h-[37px] lg:min-w-[123px] lg:px-[18px]"
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

function LockIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M7.5 10V8.2C7.5 5.7 9.45 3.75 12 3.75s4.5 1.95 4.5 4.45V10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M6.8 10h10.4c1.05 0 1.8.75 1.8 1.8v6.15c0 1.05-.75 1.8-1.8 1.8H6.8c-1.05 0-1.8-.75-1.8-1.8V11.8c0-1.05.75-1.8 1.8-1.8Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path d="M12 14v2.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}
