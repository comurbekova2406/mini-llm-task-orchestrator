export default function StatusPill({ status }) {
  return (
    <span className={`status-pill status-${status}`}>
      {status === "RUNNING" ? <span className="pulse-dot" aria-hidden="true" /> : null}
      {status}
    </span>
  );
}
