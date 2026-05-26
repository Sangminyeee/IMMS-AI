interface MoaLoadingStateProps {
  label?: string;
}

export function MoaLoadingState({ label = "로딩 중..." }: MoaLoadingStateProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--moa-app-bg)]">
      <div className="rounded-[18px] border border-[var(--moa-border)] bg-white px-8 py-7 text-center shadow-[var(--moa-shadow-card)]">
        <div className="mx-auto h-11 w-11 animate-spin rounded-full border-[3px] border-[var(--moa-brand-soft)] border-t-[var(--moa-brand)]" />
        <p className="mt-4 text-sm font-medium text-[var(--moa-muted)]">{label}</p>
      </div>
    </div>
  );
}
