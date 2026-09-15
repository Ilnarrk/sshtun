import { X } from "lucide-react";
import type { PortForward } from "../types";

export function ForwardRow({ forward, disabled, error, onChange, onRemove }: {
  forward: PortForward;
  disabled: boolean;
  error?: string;
  onChange: (id: string, patch: Partial<PortForward>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="forward-row">
      <label><span className="sr-only">Локальный порт</span><input inputMode="numeric" disabled={disabled} value={forward.local_port} placeholder="3000" onChange={(event) => onChange(forward.id, { local_port: event.target.value })} aria-invalid={!!error} /></label>
      <span aria-hidden="true">→</span>
      <label className="forward-host"><span className="sr-only">Хост назначения</span><input disabled={disabled} value={forward.remote_host} placeholder="127.0.0.1" onChange={(event) => onChange(forward.id, { remote_host: event.target.value })} aria-invalid={!!error} /></label>
      <span aria-hidden="true">:</span>
      <label><span className="sr-only">Порт назначения</span><input inputMode="numeric" disabled={disabled} value={forward.remote_port} placeholder="3000" onChange={(event) => onChange(forward.id, { remote_port: event.target.value })} aria-invalid={!!error} /></label>
      <button type="button" className="icon-button" disabled={disabled} onClick={() => onRemove(forward.id)} aria-label="Удалить проброс"><X aria-hidden="true" /></button>
    </div>
  );
}
