"use client";

import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import {
  STATUS_COLORS,
  STATUS_ORDER,
  computeKpis,
  latencyTrendSeries,
  statusCounts,
} from "../lib/stats";

export default function Dashboard({ tasks }) {
  const kpis = computeKpis(tasks);
  const statusRef = useRef(null);
  const latencyRef = useRef(null);
  const statusChart = useRef(null);
  const latencyChart = useRef(null);

  useEffect(() => {
    if (statusRef.current && !statusChart.current) {
      statusChart.current = new Chart(statusRef.current, {
        type: "doughnut",
        data: {
          labels: STATUS_ORDER,
          datasets: [
            {
              data: STATUS_ORDER.map(() => 0),
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
    }

    if (latencyRef.current && !latencyChart.current) {
      latencyChart.current = new Chart(latencyRef.current, {
        type: "line",
        data: {
          labels: [],
          datasets: [
            {
              label: "Latency (ms)",
              data: [],
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
    }

    return () => {
      statusChart.current?.destroy();
      latencyChart.current?.destroy();
      statusChart.current = null;
      latencyChart.current = null;
    };
  }, []);

  useEffect(() => {
    const counts = statusCounts(tasks);
    const trend = latencyTrendSeries(tasks);
    if (statusChart.current) {
      statusChart.current.data.datasets[0].data = STATUS_ORDER.map((s) => counts[s]);
      statusChart.current.update("none");
    }
    if (latencyChart.current) {
      latencyChart.current.data.labels = trend.labels;
      latencyChart.current.data.datasets[0].data = trend.values;
      latencyChart.current.update("none");
    }
  }, [tasks]);

  return (
    <section className="view-enter relative" aria-label="Dashboard">
      <p className="text-sm text-slate-500 max-w-2xl">
        High-level telemetry for the LLM pipeline. Status distribution and latency trends update as
        tasks move through the queue.
      </p>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <article className="rounded-lg border border-slate-200/90 bg-white/70 shadow-panel p-4 sm:p-5">
          <p className="text-[11px] font-semibold tracking-[0.14em] uppercase text-slate-400">
            Success Rate
          </p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-ink">{kpis.successRate}%</p>
          <p className="mt-1 text-xs text-slate-500">Completed ÷ terminal tasks</p>
        </article>
        <article className="rounded-lg border border-slate-200/90 bg-white/70 shadow-panel p-4 sm:p-5">
          <p className="text-[11px] font-semibold tracking-[0.14em] uppercase text-slate-400">
            Queue Depth
          </p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-ink">{kpis.queueDepth}</p>
          <p className="mt-1 text-xs text-slate-500">PENDING + RUNNING</p>
        </article>
        <article className="rounded-lg border border-slate-200/90 bg-white/70 shadow-panel p-4 sm:p-5">
          <p className="text-[11px] font-semibold tracking-[0.14em] uppercase text-slate-400">
            Avg Latency
          </p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-ink">
            {kpis.avgLatency === null ? "—" : `${kpis.avgLatency.toLocaleString()} ms`}
          </p>
          <p className="mt-1 text-xs text-slate-500">Mean completed duration (ms)</p>
        </article>
      </div>

      <div className="mt-4 sm:mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <article className="rounded-lg border border-slate-200/90 bg-white/70 shadow-panel p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h3 className="text-sm font-semibold text-ink">Task Status Distribution</h3>
            <span className="text-[11px] font-mono text-slate-400">live snapshot</span>
          </div>
          <div className="chart-shell mx-auto max-w-sm">
            <canvas ref={statusRef} aria-label="Task status doughnut chart" />
          </div>
        </article>
        <article className="rounded-lg border border-slate-200/90 bg-white/70 shadow-panel p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h3 className="text-sm font-semibold text-ink">Latency Trends (24h)</h3>
            <span className="text-[11px] font-mono text-slate-400">ms · hourly</span>
          </div>
          <div className="chart-shell">
            <canvas ref={latencyRef} aria-label="Latency line chart" />
          </div>
        </article>
      </div>
    </section>
  );
}
