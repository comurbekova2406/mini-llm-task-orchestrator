import StatusPill from "./StatusPill";
import { formatDateTime } from "../lib/stats";

export default function Registry({ tasks, onExplore, onChain }) {
  const sorted = [...tasks].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return (
    <section className="view-enter relative" aria-label="Task Registry">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <p className="text-sm text-slate-500 max-w-2xl">
          Registry of all orchestrated jobs. Open a row to inspect LLM output, token accounting,
          and model metadata.
        </p>
        <p className="text-xs font-mono text-slate-400">{tasks.length} tasks</p>
      </div>

      <div className="mt-5 rounded-lg border border-slate-200/90 bg-white/70 shadow-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50/90 border-b border-slate-200/80 text-[11px] uppercase tracking-[0.12em] text-slate-400">
              <tr>
                <th className="px-4 py-3 font-semibold">Task Name</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold whitespace-nowrap">Scheduled Time</th>
                <th className="px-4 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                    No tasks yet. Create one to enqueue work on Redis.
                  </td>
                </tr>
              ) : (
                sorted.map((task) => (
                  <tr key={task.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3.5 align-middle">
                      <div className="font-medium text-ink">{task.name}</div>
                      <div className="mt-0.5 text-[11px] font-mono text-slate-400 truncate max-w-[14rem] sm:max-w-xs">
                        {task.id}
                      </div>
                      {task.parent_task_id ? (
                        <div className="mt-0.5 text-[11px] text-slate-400">⛓ chained</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3.5 align-middle">
                      <StatusPill status={task.status} />
                    </td>
                    <td className="px-4 py-3.5 align-middle whitespace-nowrap font-mono text-xs text-slate-600">
                      {formatDateTime(task.scheduled_at)}
                    </td>
                    <td className="px-4 py-3.5 align-middle text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-2">
                        {task.status === "COMPLETED" ? (
                          <button
                            type="button"
                            onClick={() => onChain(task.id)}
                            className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition"
                          >
                            Chain Task
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onExplore(task.id)}
                          className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:border-amber-action hover:text-amber-700 transition"
                        >
                          Explore
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
