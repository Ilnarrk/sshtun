import { Copy } from "lucide-react";
import type { TunnelState } from "../types";
import { Elapsed } from "./Elapsed";

const phaseLabel: Record<TunnelState["phase"], string> = {
  idle: "Отключено",
  starting: "Подключение…",
  connected: "Туннель активен",
  stopping: "Остановка…",
  failed: "Ошибка подключения",
};

export function StatusFooter({ tunnel, onCopyAddress }: {
  tunnel: TunnelState;
  onCopyAddress: (address: string) => void;
}) {
  return (
    <footer className="status-footer" role="status" aria-live="polite">
      <span className="state-dot" aria-hidden="true" />
      <span className="status-phase">{phaseLabel[tunnel.phase]}</span>
      {tunnel.phase === "connected" && <Elapsed startedAt={tunnel.started_at} />}
      {tunnel.phase === "connected" && tunnel.address && (
        <span className="status-address">
          <span className="status-address-label">SOCKS5</span>
          <code>{tunnel.address}</code>
          <button
            className="copy-address"
            type="button"
            onClick={() => onCopyAddress(tunnel.address!)}
            title={`Скопировать ${tunnel.address}`}
            aria-label={`Скопировать адрес SOCKS5 ${tunnel.address}`}
          >
            <Copy aria-hidden="true" />
          </button>
        </span>
      )}
      {tunnel.phase === "failed" && tunnel.error && (
        <span className="status-error">{tunnel.error}</span>
      )}
    </footer>
  );
}
