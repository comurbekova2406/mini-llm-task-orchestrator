export const STATUS_ORDER = ["PENDING", "RUNNING", "COMPLETED", "FAILED"];

export const STATUS_COLORS = {
  PENDING: "#94a3b8",
  RUNNING: "#d97706",
  COMPLETED: "#059669",
  FAILED: "#dc2626",
};

export const VIEW_TITLES = {
  dashboard: "Dashboard",
  registry: "Task Registry",
  create: "Create Task",
};

export function formatDateTime(iso) {
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

export function computeKpis(list) {
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

  return { successRate, queueDepth: queue.length, avgLatency };
}

export function statusCounts(list) {
  return STATUS_ORDER.reduce((acc, status) => {
    acc[status] = list.filter((t) => t.status === status).length;
    return acc;
  }, {});
}

export function latencyTrendSeries(tasks) {
  const labels = [];
  const values = [];
  const now = new Date();
  now.setMinutes(0, 0, 0);

  for (let i = 23; i >= 0; i -= 1) {
    const point = new Date(now.getTime() - i * 60 * 60 * 1000);
    labels.push(point.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }));
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
