import { CircleStop, Play } from "lucide-react";
import type { TunnelState } from "../types";

export function AppHeader({ tunnel, locked, onSubmit }: {
  tunnel: TunnelState;
  locked: boolean;
  onSubmit: () => void;
}) {
  return (
    <header className="toolbar">
      <div className="brand" aria-label="SSH Tunnel Manager">
        <span className="brand-route" aria-hidden="true"><i /><i /><i /></span>
        <span className="brand-name">SSH Tunnel</span>
      </div>
      <div className="toolbar-spacer" />
      <button
        className={`button connect ${locked ? "stop" : ""}`}
        data-connect
        type="button"
        disabled={tunnel.phase === "stopping"}
        onClick={onSubmit}
      >
        {locked ? <CircleStop aria-hidden="true" /> : <Play aria-hidden="true" />}
        <span>{locked ? "Остановить" : "Запустить"}</span>
      </button>
    </header>
  );
}
