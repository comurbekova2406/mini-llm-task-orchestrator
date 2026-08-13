export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export async function fetchTaskList() {
  const response = await fetch(`${API_BASE}/tasks`);
  if (!response.ok) {
    throw new Error(`GET /tasks failed (${response.status})`);
  }
  const payload = await response.json();
  return Array.isArray(payload.tasks) ? payload.tasks : [];
}

export async function createTask(body) {
  const response = await fetch(`${API_BASE}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    const message =
      typeof detail.detail === "string" ? detail.detail : `Create failed (${response.status})`;
    throw new Error(message);
  }
  return response.json();
}
