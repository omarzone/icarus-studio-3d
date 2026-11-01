import { X } from "lucide-react";
import { Act } from "../app/navigation/go-to.tsx";
import { useNotices } from "../app/runtime/notices.ts";
import { buttonClass } from "./button-styles.ts";

export function Notices() {
  const notices = useNotices((state) => state.notices);
  const dismiss = useNotices((state) => state.dismiss);
  if (notices.length === 0) {
    return null;
  }
  return (
    <div aria-live="polite" className="absolute bottom-5 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2">
      {notices.map((notice) => (
        <div
          key={notice.id}
          className="flex w-90 items-start gap-3 rounded-card-sm border border-line-strong bg-floating px-3.5 py-3 shadow-floating"
        >
          <div className="min-w-0 flex-1">
            <p className="text-ui font-semibold">{notice.title}</p>
            {notice.detail ? <p className="text-ui text-fg-tertiary">{notice.detail}</p> : null}
          </div>
          <Act
            cta="Dismiss"
            aria-label="Dismiss"
            onClick={() => dismiss(notice.id)}
            className={buttonClass("icon", "size-6")}
          >
            <X size={14} strokeWidth={1.75} aria-hidden />
          </Act>
        </div>
      ))}
    </div>
  );
}
