import { Clipboard, Pause, RotateCcw, TerminalSquare, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import type { LogEntry } from "../types";

function formatLog(entry: LogEntry) {
  return `${new Date(entry.timestamp).toLocaleTimeString("ru-RU", { hour12: false })}  ${entry.message}`;
}

export function LogPanel({
  logs,
  autoScroll,
  onAutoScrollChange,
  onCopy,
  onClear,
}: {
  logs: LogEntry[];
  autoScroll: boolean;
  onAutoScrollChange: (value: boolean) => void;
  onCopy: () => void;
  onClear: () => void;
}) {
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll) logEndRef.current?.scrollIntoView({ block: "end" });
  }, [logs, autoScroll]);

  return (
    <section className="log-panel" aria-label="Журнал SSH">
      <div className="log-panel-toolbar">
        <div className="log-panel-title">
          <TerminalSquare aria-hidden="true" />
          <strong>Журнал</strong>
          {logs.some((entry) => entry.level === "error") && <span className="error-count">Есть ошибки</span>}
        </div>
        <div className="log-actions">
          <button type="button" onClick={() => onAutoScrollChange(!autoScroll)} title={autoScroll ? "Приостановить автопрокрутку" : "Возобновить автопрокрутку"} aria-pressed={!autoScroll}>
            {autoScroll ? <Pause aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
          </button>
          <button type="button" onClick={onCopy} title="Копировать журнал"><Clipboard aria-hidden="true" /></button>
          <button type="button" onClick={onClear} title="Очистить журнал"><Trash2 aria-hidden="true" /></button>
        </div>
      </div>
      <div className="log-content" role="log" aria-live="off">
        {logs.length === 0 && <p className="log-empty">Журнал пуст.</p>}
        {logs.map((entry) => (
          <div className={`log-entry ${entry.level}`} key={entry.sequence}>
            <time>{new Date(entry.timestamp).toLocaleTimeString("ru-RU", { hour12: false })}</time>
            <span>{entry.message}</span>
          </div>
        ))}
        <div ref={logEndRef} />
      </div>
    </section>
  );
}

export { formatLog };
