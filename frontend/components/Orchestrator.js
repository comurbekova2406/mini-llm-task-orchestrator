"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createTask, fetchTaskList } from "../lib/api";
import { VIEW_TITLES } from "../lib/stats";
import CreateTask from "./CreateTask";
import Dashboard from "./Dashboard";
import Registry from "./Registry";
import SlideOver from "./SlideOver";

const POLL_INTERVAL_MS = 5000;

function NavButton({ view, current, onSelect, children }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(view)}
      className={`nav-link w-full flex items-center gap-3 rounded-md border border-transparent px-3 py-2.5 text-left text-sm font-medium text-ink hover:bg-slate-100/80 transition ${current === view ? "is-active" : ""}`}
    >
      {children}
    </button>
  );
}

export default function Orchestrator() {
  const [view, setView] = useState("dashboard");
  const [tasks, setTasks] = useState([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [inspectId, setInspectId] = useState(null);
  const [chainParent, setChainParent] = useState(null);
  const [toast, setToast] = useState({ message: "", visible: false });
  const toastTimer = useRef(null);
  const nameInputRef = useRef(null);
  const inFlight = useRef(false);

  const showToast = useCallback((message) => {
    setToast({ message, visible: true });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 3200);
  }, []);

  const loadTasks = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const list = await fetchTaskList();
      setTasks(list);
    } catch (error) {
      console.error(error);
      showToast("Unable to reach API — is the backend running on :8000?");
    } finally {
      inFlight.current = false;
    }
  }, [showToast]);

  useEffect(() => {
    loadTasks();
    const id = setInterval(loadTasks, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [loadTasks]);

  useEffect(() => {
    function onResize() {
      if (window.innerWidth >= 1024) setMobileOpen(false);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function switchView(next) {
    setView(next);
    setMobileOpen(false);
  }

  function beginChainFromTask(taskId) {
    const parent = tasks.find((t) => t.id === taskId);
    if (!parent) {
      showToast("Parent task not found");
      return;
    }
    if (parent.status !== "COMPLETED") {
      showToast("Only completed tasks can be chained");
      return;
    }
    setChainParent({ id: parent.id, name: parent.name });
    setInspectId(null);
    switchView("create");
    setTimeout(() => nameInputRef.current?.focus(), 0);
  }

  async function handleCreateSubmit(body) {
    const created = await createTask(body);
    setChainParent(null);
    showToast(`Enqueued “${created.name}”`);
    await loadTasks();
    switchView("registry");
    return created;
  }

  const inspectTask = tasks.find((t) => t.id === inspectId) || null;

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:shrink-0 border-r border-slate-200/80 bg-[#fbfaf8]/80 backdrop-blur">
        <div className="px-6 pt-7 pb-5 border-b border-slate-200/70">
          <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-slate-400">
            Task Orchestrator
          </p>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-ink">LLM Orchestrator</h1>
          <p className="mt-1 text-sm text-slate-500 leading-snug">Simulation pipeline control</p>
        </div>
        <nav className="flex-1 px-3 py-5 space-y-1" aria-label="Primary">
          <NavButton view="dashboard" current={view} onSelect={switchView}>
            <span aria-hidden="true">📊</span>
            <span>Dashboard</span>
          </NavButton>
          <NavButton view="registry" current={view} onSelect={switchView}>
            <span aria-hidden="true">⚙️</span>
            <span>Task Registry</span>
          </NavButton>
          <NavButton view="create" current={view} onSelect={switchView}>
            <span aria-hidden="true">📈</span>
            <span>Create Task</span>
          </NavButton>
        </nav>
        <div className="px-5 py-5 border-t border-slate-200/70 text-xs text-slate-500">
          <div className="flex items-center justify-between">
            <span>Pipeline</span>
            <span className="font-mono text-[11px] text-emerald-700">ONLINE</span>
          </div>
          <div className="mt-2 h-1 w-full rounded-full bg-slate-200 overflow-hidden">
            <div className="h-full w-4/5 rounded-full bg-amber-action" />
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-[#fdfcfb]/90 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-ink"
                aria-label="Open navigation"
                onClick={() => setMobileOpen((open) => !open)}
              >
                ☰
              </button>
              <div className="min-w-0">
                <p className="lg:hidden text-[11px] font-semibold tracking-[0.16em] uppercase text-slate-400">
                  Orchestrator
                </p>
                <h2 className="text-base sm:text-lg font-semibold text-ink truncate">
                  {VIEW_TITLES[view]}
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="hidden sm:inline font-mono">ops · local</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700 font-medium">
                <span className="pulse-dot" />
                Live
              </span>
            </div>
          </div>
          {mobileOpen ? (
            <div className="lg:hidden border-t border-slate-200/80 px-3 py-2 space-y-1 bg-[#fbfaf8]">
              <NavButton view="dashboard" current={view} onSelect={switchView}>
                <span>📊</span>
                <span>Dashboard</span>
              </NavButton>
              <NavButton view="registry" current={view} onSelect={switchView}>
                <span>⚙️</span>
                <span>Task Registry</span>
              </NavButton>
              <NavButton view="create" current={view} onSelect={switchView}>
                <span>📈</span>
                <span>Create Task</span>
              </NavButton>
            </div>
          ) : null}
        </header>

        <main className="relative flex-1 px-4 sm:px-6 py-6 sm:py-8">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-40 grid-texture opacity-40" />
          {view === "dashboard" ? <Dashboard tasks={tasks} /> : null}
          {view === "registry" ? (
            <Registry tasks={tasks} onExplore={setInspectId} onChain={beginChainFromTask} />
          ) : null}
          <div className={view === "create" ? "block" : "hidden"}>
            <CreateTask
              chainParent={chainParent}
              onClearChain={() => setChainParent(null)}
              onSubmit={handleCreateSubmit}
              nameInputRef={nameInputRef}
            />
          </div>
        </main>
      </div>

      <SlideOver
        task={inspectTask}
        tasks={tasks}
        open={Boolean(inspectId)}
        onClose={() => setInspectId(null)}
        onChain={beginChainFromTask}
      />

      <div
        className={`toast fixed bottom-5 right-5 z-[60] max-w-sm rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-panel ${toast.visible ? "is-visible" : ""}`}
        role="status"
        aria-live="polite"
      >
        {toast.message}
      </div>
    </div>
  );
}
