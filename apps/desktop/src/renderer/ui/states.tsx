import { Clock } from "lucide-react";
import type { ReactNode } from "react";
import type { PendingAction } from "../app/runtime/pending.ts";

// The four states every engine-backed view handles (style guide: "Empty, loading, error and engine states").

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex h-full flex-col gap-2 p-3">
      <div className="h-4 w-1/3 animate-pulse rounded-bar bg-control" />
      <div className="h-4 w-2/3 animate-pulse rounded-bar bg-control" />
      <div className="h-4 w-1/2 animate-pulse rounded-bar bg-control" />
    </div>
  );
}

type MessageProps = { title: string; body?: ReactNode; action?: ReactNode };

export function EmptyState({ title, body, action }: MessageProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <p className="text-headline font-semibold">{title}</p>
      {body ? <p className="max-w-90 text-body text-fg-tertiary">{body}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ title, body, detail, action }: MessageProps & { detail?: string }) {
  return (
    <div role="alert" className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <p className="text-headline font-semibold">{title}</p>
      {body ? <p className="max-w-90 text-body text-fg-secondary">{body}</p> : null}
      {action}
      {detail ? <p className="max-w-90 font-mono text-mono text-fg-tertiary">{detail}</p> : null}
    </div>
  );
}

export function NotAvailableYetState({ action }: { action: PendingAction }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <Clock size={18} strokeWidth={1.75} className="text-fg-tertiary" aria-hidden />
      <p className="text-headline font-semibold">Not available yet</p>
      <p className="max-w-90 text-body text-fg-tertiary">{action.summary} arrives in a later version of Icarus.</p>
    </div>
  );
}

// A workspace opened in the app before any project is: it never falls back to sample data.
export function NoProjectState() {
  return (
    <EmptyState title="No project open yet" body="Open a project or start one from an idea to use this workspace." />
  );
}
