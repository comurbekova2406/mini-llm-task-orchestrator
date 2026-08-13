(() => {
  "use strict";

  const API_BASE = window.API_BASE || "http://localhost:8000";
  const POLL_INTERVAL_MS = 5000;

  const STATUS_ORDER = ["PENDING", "RUNNING", "COMPLETED", "FAILED"];
  const STATUS_COLORS = {
    PENDING: "#94a3b8",
    RUNNING: "#d97706",
    COMPLETED: "#059669",
    FAILED: "#dc2626",
  };

  const VIEW_TITLES = {
    dashboard: "Dashboard",
    registry: "Task Registry",
    create: "Create Task",
  };

  /** @type {Array<Record<string, unknown>>} */
  let tasks = [];

  let statusChart = null;
  let latencyChart = null;
  let toastTimer = null;
  let pollTimer = null;
  let fetchInFlight = false;

  const els = {
    viewTitle: document.getElementById("view-title"),
    menuToggle: document.getElementById("menu-toggle"),
    mobileNav: document.getElementById("mobile-nav"),
    kpiSuccess: document.getElementById("kpi-success"),
    kpiQueue: document.getElementById("kpi-queue"),
    kpiLatency: document.getElementById("kpi-latency"),
    tableBody: document.getElementById("task-table-body"),
    registryCount: document.getElementById("registry-count"),
    createForm: document.getElementById("create-form"),
    executionMode: document.getElementById("execution-mode"),
    scheduledField: document.getElementById("scheduled-field"),
    scheduledAt: document.getElementById("scheduled-at"),
    formFeedback: document.getElementById("form-feedback"),
    parentTaskId: document.getElementById("parent-task-id"),
    parentTaskIdVisible: document.getElementById("parent-task-id-visible"),
    chainHint: document.getElementById("chain-hint"),
    chainParentName: document.getElementById("chain-parent-name"),
    chainParentIdLabel: document.getElementById("chain-parent-id-label"),
    clearChain: document.getElementById("clear-chain"),
    overlay: document.getElementById("overlay"),
    slideOver: document.getElementById("slide-over"),
    closeInspect: document.getElementById("close-inspect"),
    inspectTitle: document.getElementById("inspect-title"),
    inspectId: document.getElementById("inspect-id"),
    inspectStatus: document.getElementById("inspect-status"),
    inspectScheduled: document.getElementById("inspect-scheduled"),
    inspectPrompt: document.getElementById("inspect-prompt"),
    inspectModel: document.getElementById("inspect-model"),
    inspectTokens: document.getElementById("inspect-tokens"),
    inspectResult: document.getElementById("inspect-result"),
    inspectChain: document.getElementById("inspect-chain"),
    toast: document.getElementById("toast"),
  };

  async function fetchTasks() {
    if (fetchInFlight) return;
    fetchInFlight = true;
    try {
      const response = await fetch(`${API_BASE}/tasks`);
      if (!response.ok) {
        throw new Error(`GET /tasks failed (${response.status})`);
      }
      const payload = await response.json();
      tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
      refresh();
    } catch (error) {
      console.error(error);
      showToast("Unable to reach API — is the backend running on :8000?");
    } finally {
      fetchInFlight = false;
    }
  }

  function formatDateTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function statusDot(status) {
    return status === "RUNNING" ? '<span class="pulse-dot" aria-hidden="true"></span>' : "";
  }

  function computeKpis(list) {
    const terminal = list.filter((t) => t.status === "COMPLETED" || t.status === "FAILED");
    const completed = list.filter((t) => t.status === "COMPLETED");
    const queue = list.filter((t) => t.status === "PENDING" || t.status === "RUNNING");
    const latencies = completed
      .map((t) => t.result?.latency_ms)
      .filter((n) => typeof n === "number");

    const successRate =
      terminal.length === 0 ? 0 : Math.round((completed.length / terminal.length) * 100);
    const avgLatency =
      latencies.length === 0
        ? null
        : Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);

    return {
      successRate,
      queueDepth: queue.length,
      avgLatency,
    };
  }

  function statusCounts(list) {
    return STATUS_ORDER.reduce((acc, status) => {
      acc[status] = list.filter((t) => t.status === status).length;
      return acc;
    }, {});
  }

  function latencyTrendSeries() {
    const labels = [];
    const values = [];
    const now = new Date();
    now.setMinutes(0, 0, 0);

    for (let i = 23; i >= 0; i -= 1) {
      const point = new Date(now.getTime() - i * 60 * 60 * 1000);
      labels.push(
        point.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
      );
      values.push(null);
    }

    const buckets = new Map();
    tasks.forEach((task) => {
      const ms = task.result?.latency_ms;
      if (typeof ms !== "number" || !task.updated_at) return;
      const updated = new Date(task.updated_at);
      const hoursAgo = Math.round((now - updated) / (60 * 60 * 1000));
      if (hoursAgo < 0 || hoursAgo > 23) return;
      const idx = 23 - hoursAgo;
      if (!buckets.has(idx)) buckets.set(idx, []);
      buckets.get(idx).push(ms);
    });

    buckets.forEach((samples, idx) => {
      values[idx] = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
    });

    // Chart.js skips nulls when spanGaps is true — fill gaps lightly for readability.
    let last = 1200;
    const filled = values.map((v) => {
      if (typeof v === "number") {
        last = v;
        return v;
      }
      return last;
    });

    return { labels, values: filled };
  }

  function renderKpis() {
    const kpis = computeKpis(tasks);
    els.kpiSuccess.textContent = `${kpis.successRate}%`;
    els.kpiQueue.textContent = String(kpis.queueDepth);
    els.kpiLatency.textContent =
      kpis.avgLatency === null ? "—" : `${kpis.avgLatency.toLocaleString()} ms`;
  }

  function ensureCharts() {
    const statusCtx = document.getElementById("status-chart");
    const latencyCtx = document.getElementById("latency-chart");
    if (!statusCtx || !latencyCtx || typeof Chart === "undefined") return;

    const counts = statusCounts(tasks);
    const trend = latencyTrendSeries();

    if (!statusChart) {
      statusChart = new Chart(statusCtx, {
        type: "doughnut",
        data: {
          labels: STATUS_ORDER,
          datasets: [
            {
              data: STATUS_ORDER.map((s) => counts[s]),
              backgroundColor: STATUS_ORDER.map((s) => STATUS_COLORS[s]),
              borderColor: "#fdfcfb",
              borderWidth: 3,
              hoverOffset: 4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "bottom",
              labels: {
                color: "#334155",
                boxWidth: 12,
                font: { family: "Inter", size: 11 },
              },
            },
          },
          cutout: "62%",
        },
      });
    } else {
      statusChart.data.datasets[0].data = STATUS_ORDER.map((s) => counts[s]);
      statusChart.update("none");
    }

    if (!latencyChart) {
      latencyChart = new Chart(latencyCtx, {
        type: "line",
        data: {
          labels: trend.labels,
          datasets: [
            {
              label: "Latency (ms)",
              data: trend.values,
              borderColor: "#d97706",
              backgroundColor: "rgba(217, 119, 6, 0.12)",
              fill: true,
              tension: 0.35,
              pointRadius: 0,
              pointHoverRadius: 4,
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.parsed.y} ms`,
              },
            },
          },
          scales: {
            x: {
              ticks: {
                color: "#64748b",
                maxRotation: 0,
                autoSkip: true,
                maxTicksLimit: 8,
                font: { family: "IBM Plex Mono", size: 10 },
              },
              grid: { color: "rgba(51, 65, 85, 0.06)" },
            },
            y: {
              ticks: {
                color: "#64748b",
                font: { family: "IBM Plex Mono", size: 10 },
                callback: (v) => `${v}`,
              },
              grid: { color: "rgba(51, 65, 85, 0.08)" },
              beginAtZero: false,
            },
          },
        },
      });
    } else {
      latencyChart.data.labels = trend.labels;
      latencyChart.data.datasets[0].data = trend.values;
      latencyChart.update("none");
    }
  }

  function renderRegistry() {
    els.registryCount.textContent = String(tasks.length);
    const sorted = [...tasks].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );

    if (sorted.length === 0) {
      els.tableBody.innerHTML = `
        <tr>
          <td colspan="4" class="px-4 py-8 text-center text-sm text-slate-500">
            No tasks yet. Create one to enqueue work on Redis.
          </td>
        </tr>`;
      return;
    }

    els.tableBody.innerHTML = sorted
      .map((task) => {
        const chainButton =
          task.status === "COMPLETED"
            ? `<button
            type="button"
            data-chain="${task.id}"
            class="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition"
          >
            Chain Task
          </button>`
            : "";

        const parentHint = task.parent_task_id
          ? `<div class="mt-0.5 text-[11px] text-slate-400">⛓ chained</div>`
          : "";

        return `
      <tr class="hover:bg-slate-50/80 transition">
        <td class="px-4 py-3.5 align-middle">
          <div class="font-medium text-ink">${escapeHtml(task.name)}</div>
          <div class="mt-0.5 text-[11px] font-mono text-slate-400 truncate max-w-[14rem] sm:max-w-xs">
            ${escapeHtml(task.id)}
          </div>
          ${parentHint}
        </td>
        <td class="px-4 py-3.5 align-middle">
          <span class="status-pill status-${task.status}">
            ${statusDot(task.status)}${task.status}
          </span>
        </td>
        <td class="px-4 py-3.5 align-middle whitespace-nowrap font-mono text-xs text-slate-600">
          ${formatDateTime(task.scheduled_at)}
        </td>
        <td class="px-4 py-3.5 align-middle text-right">
          <div class="inline-flex flex-wrap items-center justify-end gap-2">
            ${chainButton}
            <button
              type="button"
              data-explore="${task.id}"
              class="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:border-amber-action hover:text-amber-700 transition"
            >
              Explore
            </button>
          </div>
        </td>
      </tr>`;
      })
      .join("");
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function switchView(view) {
    document.querySelectorAll(".view").forEach((node) => {
      node.classList.toggle("is-active", node.id === `view-${view}`);
    });

    document.querySelectorAll("[data-nav]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.nav === view);
    });

    els.viewTitle.textContent = VIEW_TITLES[view] || view;
    els.mobileNav.classList.remove("is-open");

    if (view === "dashboard") {
      requestAnimationFrame(() => ensureCharts());
    }
  }

  function clearChainContext() {
    els.parentTaskId.value = "";
    els.parentTaskIdVisible.value = "";
    els.chainParentName.textContent = "—";
    els.chainParentIdLabel.textContent = "—";
    els.chainHint.classList.add("hidden");
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

    els.parentTaskId.value = parent.id;
    els.parentTaskIdVisible.value = parent.id;
    els.chainParentName.textContent = parent.name;
    els.chainParentIdLabel.textContent = parent.id;
    els.chainHint.classList.remove("hidden");
    els.formFeedback.textContent = "";
    els.formFeedback.className = "text-sm text-slate-500";

    closeInspect();
    switchView("create");
    document.getElementById("task-name")?.focus();
  }

  function openInspect(taskId) {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    els.inspectTitle.textContent = task.name;
    els.inspectId.textContent = task.id;
    els.inspectStatus.className = `status-pill status-${task.status}`;
    els.inspectStatus.innerHTML = `${statusDot(task.status)}${task.status}`;
    els.inspectScheduled.textContent = task.scheduled_at
      ? `Scheduled ${formatDateTime(task.scheduled_at)}`
      : "Not scheduled";
    if (task.parent_task_id) {
      const parent = tasks.find((t) => t.id === task.parent_task_id);
      const parentLabel = parent ? parent.name : task.parent_task_id;
      els.inspectScheduled.textContent += ` · parent: ${parentLabel}`;
    }
    els.inspectPrompt.textContent = task.prompt;

    const result = task.result;
    els.inspectModel.textContent = result?.model || "—";
    if (result?.token_usage) {
      const { prompt, completion, total } = result.token_usage;
      els.inspectTokens.textContent = `${total} (p ${prompt} · c ${completion})`;
    } else {
      els.inspectTokens.textContent = "—";
    }

    if (!result) {
      els.inspectResult.textContent = "No result yet — task has not produced output.";
    } else {
      els.inspectResult.textContent = JSON.stringify(result, null, 2);
    }

    els.inspectChain.classList.toggle("hidden", task.status !== "COMPLETED");
    els.inspectChain.dataset.chain = task.id;

    els.overlay.classList.add("is-open");
    els.slideOver.classList.add("is-open");
    els.overlay.setAttribute("aria-hidden", "false");
    els.slideOver.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeInspect() {
    els.overlay.classList.remove("is-open");
    els.slideOver.classList.remove("is-open");
    els.overlay.setAttribute("aria-hidden", "true");
    els.slideOver.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      els.toast.classList.remove("is-visible");
    }, 3200);
  }

  function refresh() {
    renderKpis();
    renderRegistry();
    if (document.getElementById("view-dashboard").classList.contains("is-active")) {
      ensureCharts();
    }
  }

  async function handleCreateSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = form.name.value.trim();
    const prompt = form.prompt.value.trim();
    const mode = els.executionMode.value;
    const scheduledRaw = els.scheduledAt.value;
    const parentTaskId = els.parentTaskId.value.trim() || null;
    const submitBtn = form.querySelector('button[type="submit"]');

    if (!name || !prompt) {
      els.formFeedback.textContent = "Name and prompt are required.";
      els.formFeedback.className = "text-sm text-red-600";
      return;
    }

    if (mode === "scheduled" && !scheduledRaw) {
      els.formFeedback.textContent = "Choose a schedule time for Scheduled mode.";
      els.formFeedback.className = "text-sm text-red-600";
      return;
    }

    const body = {
      name,
      prompt,
      scheduled_at:
        mode === "scheduled" ? new Date(scheduledRaw).toISOString() : null,
      parent_task_id: parentTaskId,
    };

    submitBtn.disabled = true;
    els.formFeedback.textContent = "Enqueueing…";
    els.formFeedback.className = "text-sm text-slate-500";

    try {
      const response = await fetch(`${API_BASE}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        const message =
          typeof detail.detail === "string"
            ? detail.detail
            : `Create failed (${response.status})`;
        throw new Error(message);
      }

      const created = await response.json();
      form.reset();
      els.scheduledField.classList.add("hidden");
      clearChainContext();
      els.formFeedback.textContent = parentTaskId
        ? "Chained task enqueued on Redis."
        : "Task enqueued on Redis.";
      els.formFeedback.className = "text-sm text-emerald-700";
      showToast(`Enqueued “${created.name}”`);
      await fetchTasks();
      switchView("registry");
    } catch (error) {
      els.formFeedback.textContent = error.message || "Failed to create task.";
      els.formFeedback.className = "text-sm text-red-600";
    } finally {
      submitBtn.disabled = false;
    }
  }

  function bindEvents() {
    document.querySelectorAll("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", () => switchView(btn.dataset.nav));
    });

    els.menuToggle.addEventListener("click", () => {
      els.mobileNav.classList.toggle("is-open");
    });

    els.executionMode.addEventListener("change", () => {
      const scheduled = els.executionMode.value === "scheduled";
      els.scheduledField.classList.toggle("hidden", !scheduled);
      if (!scheduled) els.scheduledAt.value = "";
    });

    els.createForm.addEventListener("submit", handleCreateSubmit);
    els.clearChain.addEventListener("click", clearChainContext);

    els.tableBody.addEventListener("click", (event) => {
      const chainBtn = event.target.closest("[data-chain]");
      if (chainBtn) {
        beginChainFromTask(chainBtn.dataset.chain);
        return;
      }
      const exploreBtn = event.target.closest("[data-explore]");
      if (exploreBtn) openInspect(exploreBtn.dataset.explore);
    });

    els.inspectChain.addEventListener("click", () => {
      const taskId = els.inspectChain.dataset.chain;
      if (taskId) beginChainFromTask(taskId);
    });

    els.closeInspect.addEventListener("click", closeInspect);
    els.overlay.addEventListener("click", closeInspect);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeInspect();
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth >= 1024) els.mobileNav.classList.remove("is-open");
    });
  }

  function startPolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      fetchTasks();
    }, POLL_INTERVAL_MS);
  }

  async function init() {
    bindEvents();
    refresh();
    await fetchTasks();
    ensureCharts();
    startPolling();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
