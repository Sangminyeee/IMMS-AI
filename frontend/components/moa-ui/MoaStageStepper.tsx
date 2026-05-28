import { classNames } from "@/lib/classNames";

export interface MoaStageStep {
  id: string;
  label: string;
}

interface MoaStageStepperProps {
  activeId: string;
  className?: string;
  steps: MoaStageStep[];
}

export function MoaStageStepper({ activeId, className, steps }: MoaStageStepperProps) {
  const activeIndex = Math.max(0, steps.findIndex((step) => step.id === activeId));

  return (
    <nav aria-label="회의 단계" className={classNames("inline-flex items-center justify-center gap-2", className)}>
      {steps.map((step, index) => {
        const isActive = step.id === activeId;
        const isDone = index < activeIndex;

        return (
          <div key={step.id} className="flex items-center gap-2">
            {index > 0 ? <span className="h-px w-10 bg-[var(--moa-border)]" /> : null}
            <span
              className={classNames(
                "inline-flex h-9 items-center gap-2 rounded-full border px-4 text-xs font-semibold transition",
                isActive
                  ? "border-[var(--moa-brand)] bg-[var(--moa-brand)] text-white shadow-[0_10px_24px_rgba(207,60,177,0.2)]"
                  : isDone
                    ? "border-[var(--moa-brand-soft-border)] bg-[var(--moa-brand-soft)] text-[var(--moa-brand-strong)]"
                    : "border-[var(--moa-border)] bg-white text-[var(--moa-muted)]",
              )}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/25 text-[11px]">{index + 1}</span>
              {step.label}
            </span>
          </div>
        );
      })}
    </nav>
  );
}
