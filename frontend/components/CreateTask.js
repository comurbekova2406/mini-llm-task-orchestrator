"use client";

import { useEffect, useState } from "react";

export default function CreateTask({ chainParent, onClearChain, onSubmit, nameInputRef }) {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState("immediate");
  const [scheduledAt, setScheduledAt] = useState("");
  const [feedback, setFeedback] = useState({ text: "", className: "text-sm text-slate-500" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (chainParent) {
      setFeedback({ text: "", className: "text-sm text-slate-500" });
    }
  }, [chainParent]);

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedPrompt = prompt.trim();

    if (!trimmedName || !trimmedPrompt) {
      setFeedback({ text: "Name and prompt are required.", className: "text-sm text-red-600" });
      return;
    }
    if (mode === "scheduled" && !scheduledAt) {
      setFeedback({
        text: "Choose a schedule time for Scheduled mode.",
        className: "text-sm text-red-600",
      });
      return;
    }

    setSubmitting(true);
    setFeedback({ text: "Enqueueing…", className: "text-sm text-slate-500" });

    try {
      const created = await onSubmit({
        name: trimmedName,
        prompt: trimmedPrompt,
        scheduled_at: mode === "scheduled" ? new Date(scheduledAt).toISOString() : null,
        parent_task_id: chainParent?.id || null,
      });
      setName("");
      setPrompt("");
      setMode("immediate");
      setScheduledAt("");
      setFeedback({
        text: chainParent
          ? "Chained task enqueued on Redis."
          : "Task enqueued on Redis.",
        className: "text-sm text-emerald-700",
      });
      return created;
    } catch (error) {
      setFeedback({
        text: error.message || "Failed to create task.",
        className: "text-sm text-red-600",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="view-enter relative" aria-label="Create Task">
      <p className="text-sm text-slate-500 max-w-2xl">
        Define a new LLM job. Immediate runs enter the queue now; scheduled runs wait until the
        selected window.
      </p>

      <form
        className="mt-6 max-w-2xl rounded-lg border border-slate-200/90 bg-white/70 shadow-panel p-5 sm:p-6 space-y-5"
        noValidate
        onSubmit={handleSubmit}
      >
        {chainParent ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            <div className="flex items-start justify-between gap-3">
              <p>
                <span className="font-semibold">Chaining from:</span> {chainParent.name}
              </p>
              <button
                type="button"
                onClick={onClearChain}
                className="shrink-0 text-xs font-semibold text-amber-800 hover:text-amber-950 underline-offset-2 hover:underline"
              >
                Clear
              </button>
            </div>
            <p className="mt-1 text-xs font-mono text-amber-800/80 break-all">
              Parent ID: {chainParent.id}
            </p>
          </div>
        ) : null}

        <div>
          <label htmlFor="task-name" className="block text-sm font-medium text-ink">
            Name
          </label>
          <input
            id="task-name"
            ref={nameInputRef}
            name="name"
            type="text"
            maxLength={255}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. lattice-force-summary"
            className="mt-1.5 w-full rounded-md border border-slate-200 bg-canvas px-3 py-2.5 text-sm text-ink placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-action/40 focus:border-amber-action"
          />
        </div>

        <div>
          <label htmlFor="parent-task-id-visible" className="block text-sm font-medium text-ink">
            Parent Task ID <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            id="parent-task-id-visible"
            type="text"
            readOnly
            value={chainParent?.id || ""}
            placeholder="Set via Chain Task on a completed job"
            className="mt-1.5 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-ink font-mono placeholder:text-slate-400 focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="task-prompt" className="block text-sm font-medium text-ink">
            Prompt
          </label>
          <textarea
            id="task-prompt"
            name="prompt"
            rows={6}
            required
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the simulation analysis the model should perform…"
            className="mt-1.5 w-full rounded-md border border-slate-200 bg-canvas px-3 py-2.5 text-sm text-ink placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-action/40 focus:border-amber-action resize-y font-mono leading-relaxed"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="execution-mode" className="block text-sm font-medium text-ink">
              Execution Mode
            </label>
            <select
              id="execution-mode"
              name="execution_mode"
              value={mode}
              onChange={(e) => {
                setMode(e.target.value);
                if (e.target.value !== "scheduled") setScheduledAt("");
              }}
              className="mt-1.5 w-full rounded-md border border-slate-200 bg-canvas px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-amber-action/40 focus:border-amber-action"
            >
              <option value="immediate">Immediate</option>
              <option value="scheduled">Scheduled</option>
            </select>
          </div>
          {mode === "scheduled" ? (
            <div>
              <label htmlFor="scheduled-at" className="block text-sm font-medium text-ink">
                Scheduled At
              </label>
              <input
                id="scheduled-at"
                name="scheduled_at"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-slate-200 bg-canvas px-3 py-2.5 text-sm text-ink font-mono focus:outline-none focus:ring-2 focus:ring-amber-action/40 focus:border-amber-action"
              />
            </div>
          ) : null}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center rounded-md bg-amber-action px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-action/50 transition disabled:opacity-60"
          >
            Enqueue Task
          </button>
          <p className={feedback.className} role="status" aria-live="polite">
            {feedback.text}
          </p>
        </div>
      </form>
    </section>
  );
}
