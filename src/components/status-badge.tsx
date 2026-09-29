import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectStatus } from "@/lib/types";

const CONFIG: Record<
  ProjectStatus,
  { label: string; className: string; icon: "clock" | "spin" | "ok" | "ng" }
> = {
  pending: { label: "待機中", className: "bg-white text-muted border-line", icon: "clock" },
  planning: { label: "処理中:設計", className: "bg-accent/10 text-accent border-accent/30", icon: "spin" },
  generating: { label: "処理中:コード生成", className: "bg-accent/10 text-accent border-accent/30", icon: "spin" },
  pushing: { label: "処理中:GitHubへpush", className: "bg-accent/10 text-accent border-accent/30", icon: "spin" },
  completed: { label: "完了", className: "bg-emerald-50 text-emerald-800 border-emerald-300", icon: "ok" },
  failed: { label: "失敗", className: "bg-red-50 text-red-800 border-red-300", icon: "ng" },
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const c = CONFIG[status] ?? CONFIG.pending;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold",
        c.className
      )}
    >
      {c.icon === "spin" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {c.icon === "ok" && <CheckCircle2 className="h-4 w-4" aria-hidden />}
      {c.icon === "ng" && <XCircle className="h-4 w-4" aria-hidden />}
      {c.icon === "clock" && <Clock className="h-4 w-4" aria-hidden />}
      {c.label}
    </span>
  );
}
