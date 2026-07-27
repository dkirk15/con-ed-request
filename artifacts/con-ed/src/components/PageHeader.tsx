import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="flex items-center gap-2 text-xs font-semibold uppercase text-primary">{eyebrow}</div> : null}
        <h1 className="mt-1 font-serif text-3xl font-bold text-slate-950">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-3">{actions}</div> : null}
    </header>
  );
}
