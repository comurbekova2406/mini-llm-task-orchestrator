"use client";

import { useEffect } from "react";
import StatusPill from "./StatusPill";
import { formatDateTime } from "../lib/stats";

export default function SlideOver({ task, tasks, open, onClose, onChain }) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const result = task?.result;
  const parent = task?.parent_task_id
    ? tasks.find((t) => t.id === task.parent_task_id)
    : null;
  const scheduledLabel = task
    ? task.scheduled_at
      ? `Scheduled ${formatDateTime(task.scheduled_at)}`
      : "Not scheduled"
    : "";
  const parentLabel = task?.parent_task_id
    ? ` · parent: ${parent ? parent.name : task.parent_task_id}`
    : "";
  const tokenLabel = result?.token_usage
    ? `${result.token_usage.total} (p ${result.token_usage.prompt} · c ${result.token_usage.completion})`
    : "—";
  const resultText = !task
    ? ""
    : !result
      ? "No result yet — task has not produced output."
      : JSON.stringify(result, null, 2);

  return (
    <>
      <div
        className={`overlay fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[1px] ${open ? "is-open" : ""}`}
        aria-hidden={!open}
        onClick={onClose}
      />
      <aside
        className={`slide-over fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-[#fdfcfb] border-l border-slate-200 shadow-panel flex flex-col ${open ? "is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="inspect-title"
        aria-hidden={!open}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.14em] uppercase text-slate-400">
              Task Inspection
            </p>
            <h3 id="inspect-title" className="mt-1 text-lg font-semibold text-ink truncate">
              {task?.name || "—"}
            </h3>
            <p className="mt-1 text-xs font-mono text-slate-400 break-all">{task?.id || ""}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 h-9 w-9 rounded-md border border-slate-200 text-ink hover:bg-slate-50"
            aria-label="Close inspection panel"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            {task ? <StatusPill status={task.status} /> : <span className="status-pill">—</span>}
            <span className="text-xs font-mono text-slate-500">
              {scheduledLabel}
              {parentLabel}
            </span>
          </div>

          <div>
            <h4 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-slate-400">
              Prompt
            </h4>
            <pre className="mt-2 whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-white px-3 py-3 text-xs font-mono leading-relaxed text-ink">
              {task?.prompt || ""}
            </pre>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-slate-200 bg-white px-3 py-3">
              <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400 font-semibold">
                Model
              </p>
              <p className="mt-1 text-sm font-medium text-ink font-mono">{result?.model || "—"}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white px-3 py-3">
              <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400 font-semibold">
                Token Usage
              </p>
              <p className="mt-1 text-sm font-medium text-ink font-mono">{tokenLabel}</p>
            </div>
          </div>

          <div>
            <h4 className="text-[11px] font-semibold tracking-[0.12em] uppercase text-slate-400">
              LLM Result
            </h4>
            <pre className="mt-2 whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-[#1e293b] px-3 py-3 text-xs font-mono leading-relaxed text-slate-100 max-h-80 overflow-y-auto">
              {resultText}
            </pre>
          </div>
        </div>

        <div className="border-t border-slate-200 px-5 py-4">
          {task?.status === "COMPLETED" ? (
            <button
              type="button"
              onClick={() => onChain(task.id)}
              className="w-full inline-flex items-center justify-center rounded-md bg-amber-action px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-action/50 transition"
            >
              Chain Task
            </button>
          ) : null}
        </div>
      </aside>
    </>
  );
}
