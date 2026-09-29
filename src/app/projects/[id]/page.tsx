"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { ExternalLink, FileCode2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import type { AgentLog, Project } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";

const TERMINAL = ["completed", "failed"];

function mergeLogs(prev: AgentLog[], incoming: AgentLog[]): AgentLog[] {
  const map = new Map(prev.map((l) => [l.id, l]));
  incoming.forEach((l) => map.set(l.id, l));
  return [...map.values()].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
}
export async function POST(request: Request) {
  try {
    // 処理
  } catch (error) {
    console.error("API Error Detail:", error);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}
export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [activeFile, setActiveFile] = useState(0);
  const consoleRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const [p, l] = await Promise.all([
      supabase.from("projects").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("agent_logs")
        .select("*")
        .eq("project_id", id)
        .order("created_at"),
    ]);
    if (!p.data) {
      setNotFound(true);
      return;
    }
    setProject(p.data as Project);
    setLogs((prev) => mergeLogs(prev, (l.data ?? []) as AgentLog[]));
  }, [id]);

  // Realtime購読 + 取りこぼし対策の初回取得
  useEffect(() => {
    const channel = supabase
      .channel(`project-${id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "projects",
          filter: `id=eq.${id}`,
        },
        (payload) => setProject(payload.new as Project),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_logs",
          filter: `project_id=eq.${id}`,
        },
        (payload) =>
          setLogs((prev) => mergeLogs(prev, [payload.new as AgentLog])),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") load();
      });

    load();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, load]);

  // Realtimeが不調でも進捗が止まらないよう、終了するまで5秒ごとに再取得
  useEffect(() => {
    if (!project || TERMINAL.includes(project.status)) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [project, load]);

  useEffect(() => {
    consoleRef.current?.scrollTo({ top: consoleRef.current.scrollHeight });
  }, [logs.length]);

  const files = useMemo(() => project?.generated_files ?? [], [project]);

  if (notFound) {
    return (
      <p className="text-muted">このプロジェクトは見つかりませんでした。</p>
    );
  }
  if (!project) {
    return <p className="text-muted">読み込み中...</p>;
  }

  const current = files[Math.min(activeFile, files.length - 1)];

  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={project.status} />
        </div>
        <p className="mt-4 max-w-2xl whitespace-pre-wrap text-lg leading-relaxed">
          {project.prompt}
        </p>
      </div>

      {project.status === "failed" && project.error_message && (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900"
        >
          <p className="font-semibold">生成に失敗しました</p>
          <p className="mt-1 break-words">{project.error_message}</p>
        </div>
      )}

      {project.status === "completed" && project.github_repo_url && (
        <a
          href={project.github_repo_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-12 items-center gap-2 rounded-md bg-accent px-6 text-base font-semibold text-white hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          GitHubで開く
          <ExternalLink className="h-5 w-5" aria-hidden />
        </a>
      )}

      <section aria-labelledby="log-heading">
        <h2 id="log-heading" className="mb-2 text-sm font-semibold text-muted">
          実行ログ
        </h2>
        <div
          ref={consoleRef}
          role="log"
          aria-live="polite"
          className="h-64 overflow-y-auto rounded-md bg-console p-4 font-mono text-sm leading-relaxed text-slate-200"
        >
          {logs.length === 0 ? (
            <p className="text-slate-400">ジョブの開始を待っています...</p>
          ) : (
            logs.map((l) => (
              <p
                key={l.id}
                className={cn(l.step_name === "error" && "text-red-300")}
              >
                <span className="text-slate-500">
                  {new Date(l.created_at).toLocaleTimeString("ja-JP")}
                </span>{" "}
                <span className="text-sky-300">{l.step_name}</span>{" "}
                {l.log_message}
              </p>
            ))
          )}
        </div>
      </section>

      {files.length > 0 && current && (
        <section aria-labelledby="files-heading">
          <h2
            id="files-heading"
            className="mb-2 text-sm font-semibold text-muted"
          >
            生成されたスクリプト
          </h2>
          <div
            role="tablist"
            className="flex flex-wrap gap-1 border-b border-line"
          >
            {files.map((f, i) => (
              <button
                key={f.path}
                role="tab"
                aria-selected={i === activeFile}
                onClick={() => setActiveFile(i)}
                className={cn(
                  "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                  i === activeFile
                    ? "border-accent text-accent"
                    : "border-transparent text-muted hover:text-ink",
                )}
              >
                <FileCode2 className="h-4 w-4" aria-hidden />
                {f.path.split("/").pop()}
              </button>
            ))}
          </div>
          <p className="mt-3 font-mono text-xs text-muted">{current.path}</p>
          <pre
            role="tabpanel"
            className="mt-2 max-h-[32rem] overflow-auto rounded-md bg-console p-4 font-mono text-sm leading-relaxed text-slate-200"
          >
            <code>{current.content}</code>
          </pre>
        </section>
      )}
    </div>
  );
}
