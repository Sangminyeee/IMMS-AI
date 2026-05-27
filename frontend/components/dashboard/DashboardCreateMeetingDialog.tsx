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
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-[560px] rounded-[24px] bg-white px-10 py-9 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
        <h2 className="text-[28px] font-bold tracking-normal text-[var(--moa-text)]">
          <span className="block text-[28px] font-bold leading-normal tracking-normal text-[var(--moa-text)]">새 회의 만들기</span>
        </h2>
        <p className="mt-3 text-[15px] font-medium leading-6 text-[var(--moa-disabled-text)]">
          <span className="block text-[15px] font-medium leading-6 tracking-normal text-[var(--moa-disabled-text)]">
            회의 이름을 입력하면 바로 회의 화면으로 이동합니다.
          </span>
        </p>
        <input
          type="text"
          value={meetingTitle}
          onChange={(event) => onMeetingTitleChange(event.target.value)}
          placeholder="회의 이름"
          className="mt-7 h-[54px] w-full rounded-[14px] border border-[var(--moa-border-soft)] bg-white px-4 text-[16px] font-semibold text-[var(--moa-text)] outline-none transition placeholder:text-[#b3b3b3] focus:border-[var(--moa-primary)]"
          onKeyDown={(event) => {
            if (event.key === "Enter") onCreate();
          }}
          autoFocus
        />
        <div className="mt-8 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-[44px] min-w-[112px] items-center justify-center rounded-full border border-[var(--moa-dashboard-action-border)] bg-white px-5 text-[15px] font-medium text-[var(--moa-dashboard-action-text)] transition hover:border-[var(--moa-dashboard-outline)] hover:bg-[var(--moa-dashboard-outline-hover)] hover:text-[var(--moa-dashboard-outline)]"
          >
            <span className="block text-[15px] font-medium leading-normal tracking-normal">취소</span>
          </button>
          <button
            type="button"
            onClick={onCreate}
            disabled={!meetingTitle.trim()}
            className="moa-dashboard-primary-button inline-flex h-[44px] min-w-[112px] items-center justify-center rounded-full px-5 text-[15px] font-bold text-white transition disabled:cursor-not-allowed disabled:bg-none disabled:bg-[#d8d8d8]"
          >
            <span className="block text-[15px] font-bold leading-normal tracking-normal text-white">시작</span>
          </button>
        </div>
      </div>
    </div>
  );
}
