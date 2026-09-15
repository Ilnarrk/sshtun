import {
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CircleStop,
  Clipboard,
  Copy,
  FileKey,
  KeyRound,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RotateCcw,
  TerminalSquare,
  Trash2,
  X,
} from "lucide-react";
import { type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { backend, runtime } from "./api";
import type { LogEntry, PortForward, Profile, TunnelState, Workspace } from "./types";
import { hasErrors, validateProfile } from "./validation";
import type { ProfileErrors } from "./validation";

const newID = () => crypto.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const newProfile = (): Profile => ({
  id: newID(),
  name: "Новый профиль",
  host: "",
  user: "root",
  port: "22",
  socks_port: "1080",
  key_path: "",
  accept_new_hostkey: true,
  forwards: [],
});

const emptyTunnel: TunnelState = { phase: "idle" };

const phaseLabel: Record<TunnelState["phase"], string> = {
  idle: "Отключено",
  starting: "Подключение…",
  connected: "Туннель активен",
  stopping: "Остановка…",
  failed: "Ошибка подключения",
};

function App() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tunnel, setTunnel] = useState<TunnelState>(emptyTunnel);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [saveError, setSaveError] = useState("");
  const [actionError, setActionError] = useState("");
  const [toast, setToast] = useState("");
  const [ready, setReady] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const offState = runtime().EventsOn("tunnel:state", (state) => {
      setTunnel(state);
      if (state.phase === "failed") setLogOpen(true);
    });
    const offLog = runtime().EventsOn("tunnel:log", (entry) => {
      setLogs((current) => [...current, entry].slice(-2000));
    });
    const offSaveError = runtime().EventsOn("workspace:save-error", setSaveError);
    backend().GetBootstrap()
      .then((bootstrap) => {
        setWorkspace(bootstrap.workspace);
        setTunnel(bootstrap.tunnel);
        setLogs(bootstrap.logs ?? []);
        setReady(true);
      })
      .catch((error) => setActionError(messageOf(error)));
    return () => {
      offState();
      offLog();
      offSaveError();
    };
  }, []);

  useEffect(() => {
    if (!ready || !workspace) return;
    backend().SaveWorkspace(workspace)
      .then(() => setSaveError(""))
      .catch((error) => setSaveError(messageOf(error)));
  }, [ready, workspace]);

  useEffect(() => {
    if (logOpen && autoScroll) logEndRef.current?.scrollIntoView({ block: "end" });
  }, [logs, logOpen, autoScroll]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selected = useMemo(
    () => workspace?.profiles.find((profile) => profile.id === workspace.selected_profile_id),
    [workspace],
  );
  const locked = tunnel.phase === "starting" || tunnel.phase === "connected" || tunnel.phase === "stopping";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === "Enter") {
        event.preventDefault();
        document.querySelector<HTMLButtonElement>("[data-connect]")?.click();
      }
      if (event.ctrlKey && event.key.toLowerCase() === "l") {
        event.preventDefault();
        setLogOpen((value) => !value);
      }
      if (event.ctrlKey && event.key.toLowerCase() === "n" && !locked) {
        event.preventDefault();
        const profile = newProfile();
        setWorkspace((current) => current && ({
          ...current,
          profiles: [...current.profiles, profile],
          selected_profile_id: profile.id,
        }));
      }
      if (event.key === "Escape") setLogOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [locked]);

  if (!workspace || !selected) {
    return (
      <main className="loading-shell">
        <div className="route-mark" aria-hidden="true"><span /><span /><span /></div>
        <p>{actionError || "Загрузка профилей…"}</p>
      </main>
    );
  }

  const updateWorkspace = (updater: (current: Workspace) => Workspace) => {
    setWorkspace((current) => current && updater(current));
  };

  const updateProfile = (patch: Partial<Profile>) => {
    updateWorkspace((current) => ({
      ...current,
      profiles: current.profiles.map((profile) => profile.id === selected.id ? { ...profile, ...patch } : profile),
    }));
  };

  const addProfile = () => {
    const profile = newProfile();
    updateWorkspace((current) => ({
      ...current,
      profiles: [...current.profiles, profile],
      selected_profile_id: profile.id,
    }));
    setErrors({});
  };

  const duplicateProfile = () => {
    const profile: Profile = {
      ...selected,
      id: newID(),
      name: `${selected.name} (копия)`,
      forwards: selected.forwards.map((forward) => ({ ...forward, id: newID() })),
    };
    updateWorkspace((current) => ({
      ...current,
      profiles: [...current.profiles, profile],
      selected_profile_id: profile.id,
    }));
  };

  const deleteProfile = () => {
    if (workspace.profiles.length === 1) {
      setActionError("Должен остаться хотя бы один профиль.");
      return;
    }
    if (!window.confirm(`Удалить профиль «${selected.name}»?`)) return;
    updateWorkspace((current) => {
      const profiles = current.profiles.filter((profile) => profile.id !== selected.id);
      return { ...current, profiles, selected_profile_id: profiles[0].id };
    });
    setErrors({});
  };

  const startOrStop = async (event: FormEvent) => {
    event.preventDefault();
    setActionError("");
    if (locked) {
      try {
        await backend().StopTunnel();
      } catch (error) {
        setActionError(messageOf(error));
      }
      return;
    }
    const nextErrors = validateProfile(selected);
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) {
      window.setTimeout(() => errorSummaryRef.current?.focus());
      return;
    }
    try {
      await backend().StartTunnel(selected);
    } catch (error) {
      setActionError(messageOf(error));
    }
  };

  const chooseKey = async () => {
    try {
      const path = await backend().ChoosePrivateKey();
      if (path) updateProfile({ key_path: path });
    } catch (error) {
      setActionError(messageOf(error));
    }
  };

  const openTerminal = async () => {
    try {
      await backend().OpenInteractiveTerminal(selected);
      setToast("Интерактивный терминал открыт");
    } catch (error) {
      setActionError(messageOf(error));
    }
  };

  const addForward = () => {
    updateProfile({
      forwards: [...selected.forwards, { id: newID(), local_port: "", remote_host: "127.0.0.1", remote_port: "" }],
    });
  };

  const updateForward = (id: string, patch: Partial<PortForward>) => {
    updateProfile({
      forwards: selected.forwards.map((forward) => forward.id === id ? { ...forward, ...patch } : forward),
    });
  };

  const removeForward = (id: string) => {
    updateProfile({ forwards: selected.forwards.filter((forward) => forward.id !== id) });
  };

  const clearLogs = async () => {
    try {
      await backend().ClearLog();
      setLogs([]);
    } catch (error) {
      setActionError(messageOf(error));
    }
  };

  const copyText = async (text: string, confirmation: string) => {
    try {
      const copied = await runtime().ClipboardSetText(text);
      setToast(copied ? confirmation : "Не удалось скопировать текст");
    } catch (error) {
      setActionError(messageOf(error));
    }
  };

  const resizeLog = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const onMove = (move: globalThis.PointerEvent) => {
      const height = Math.max(120, Math.min(Math.round(window.innerHeight * 0.4), window.innerHeight - move.clientY));
      updateWorkspace((current) => ({ ...current, ui: { ...current.ui, log_height: height } }));
    };
    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop);
  };

  const resizeLogByKeyboard = (delta: number) => {
    const maximum = Math.round(window.innerHeight * 0.4);
    updateWorkspace((current) => ({
      ...current,
      ui: { ...current.ui, log_height: Math.max(120, Math.min(maximum, current.ui.log_height + delta)) },
    }));
  };

  return (
    <main className={`app-shell phase-${tunnel.phase}`}>
      <header className="toolbar">
        <div className="brand" aria-label="SSH Tunnel Manager">
          <span className="brand-route" aria-hidden="true"><i /><i /><i /></span>
          <span className="brand-name">SSH Tunnel</span>
        </div>

        <div className="profile-picker">
          <label className="sr-only" htmlFor="profile-select">Профиль</label>
          <select
            id="profile-select"
            value={workspace.selected_profile_id}
            disabled={locked}
            onChange={(event) => {
              updateWorkspace((current) => ({ ...current, selected_profile_id: event.target.value }));
              setErrors({});
            }}
          >
            {workspace.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
          </select>
          <button className="icon-button" type="button" onClick={addProfile} disabled={locked} aria-label="Добавить профиль" title="Добавить профиль (Ctrl+N)">
            <Plus aria-hidden="true" />
          </button>
          <details className="profile-menu">
            <summary className="icon-button" aria-label="Действия с профилем" title="Действия с профилем"><MoreHorizontal aria-hidden="true" /></summary>
            <div className="menu-popover">
              <button type="button" onClick={duplicateProfile} disabled={locked}><Copy aria-hidden="true" />Дублировать</button>
              <button type="button" className="danger-text" onClick={deleteProfile} disabled={locked}><Trash2 aria-hidden="true" />Удалить</button>
            </div>
          </details>
        </div>

        <div className="connection-state" role="status" aria-live="polite">
          <span className="state-dot" aria-hidden="true" />
          <span>{phaseLabel[tunnel.phase]}</span>
          {tunnel.phase === "connected" && <Elapsed startedAt={tunnel.started_at} />}
          {tunnel.phase === "connected" && tunnel.address && (
            <button className="copy-address" type="button" onClick={() => copyText(tunnel.address!, "Адрес SOCKS5 скопирован")} title={`Скопировать ${tunnel.address}`} aria-label={`Скопировать адрес SOCKS5 ${tunnel.address}`}>
              <Copy aria-hidden="true" />
            </button>
          )}
        </div>

        <button className="button secondary log-toggle" type="button" onClick={() => setLogOpen((value) => !value)} aria-expanded={logOpen}>
          <TerminalSquare aria-hidden="true" />
          <span>Журнал</span>
        </button>
        <button className={`button connect ${locked ? "stop" : ""}`} data-connect type="submit" form="connection-form" disabled={tunnel.phase === "stopping"}>
          {locked ? <CircleStop aria-hidden="true" /> : <Play aria-hidden="true" />}
          <span>{locked ? "Остановить" : "Запустить"}</span>
        </button>
      </header>

      <div className="signal-line" aria-hidden="true"><span /></div>

      <section className="workspace">
        {(actionError || saveError || tunnel.error) && (
          <div className="error-banner" role="alert">
            <CircleAlert aria-hidden="true" />
            <span>{actionError || saveError || tunnel.error}</span>
            {tunnel.phase === "failed" && (
              <button type="button" onClick={openTerminal}><TerminalSquare aria-hidden="true" />Открыть терминал</button>
            )}
            <button className="dismiss" type="button" onClick={() => { setActionError(""); setSaveError(""); }} aria-label="Скрыть сообщение"><X aria-hidden="true" /></button>
          </div>
        )}

        {hasErrors(errors) && (
          <div className="validation-summary" ref={errorSummaryRef} tabIndex={-1} role="alert">
            Проверьте выделенные поля перед запуском.
          </div>
        )}

        <form id="connection-form" className="connection-form" onSubmit={startOrStop} noValidate>
          <fieldset disabled={locked}>
            <legend>Подключение</legend>
            <div className="form-grid">
              <Field label="Название профиля" htmlFor="profile-name" className="wide">
                <input id="profile-name" value={selected.name} onChange={(event) => updateProfile({ name: event.target.value })} onBlur={() => { if (!selected.name.trim()) updateProfile({ name: "(без названия)" }); }} />
              </Field>
              <Field label="Хост или IP" htmlFor="host" error={errors.host} className="host-field" required>
                <input id="host" autoComplete="off" value={selected.host} onChange={(event) => updateProfile({ host: event.target.value })} aria-invalid={!!errors.host} aria-describedby={errors.host ? "host-error" : undefined} />
              </Field>
              <Field label="SSH-порт" htmlFor="ssh-port" error={errors.port} className="port-field" required>
                <input id="ssh-port" inputMode="numeric" value={selected.port} onChange={(event) => updateProfile({ port: event.target.value })} aria-invalid={!!errors.port} aria-describedby={errors.port ? "ssh-port-error" : undefined} />
              </Field>
              <Field label="Пользователь" htmlFor="user" error={errors.user} required>
                <input id="user" autoComplete="username" value={selected.user} onChange={(event) => updateProfile({ user: event.target.value })} aria-invalid={!!errors.user} aria-describedby={errors.user ? "user-error" : undefined} />
              </Field>
              <Field label="Локальный SOCKS5-порт" htmlFor="socks-port" error={errors.socks_port} required>
                <input id="socks-port" inputMode="numeric" value={selected.socks_port} onChange={(event) => updateProfile({ socks_port: event.target.value })} aria-invalid={!!errors.socks_port} aria-describedby={errors.socks_port ? "socks-port-error" : undefined} />
              </Field>
              <Field label="Приватный ключ" htmlFor="key-path" error={errors.key_path} className="wide">
                <div className="input-action">
                  <input id="key-path" value={selected.key_path} onChange={(event) => updateProfile({ key_path: event.target.value })} placeholder="ssh-agent или стандартный ключ" />
                  <button type="button" className="button secondary" onClick={chooseKey}><FileKey aria-hidden="true" />Выбрать</button>
                </div>
              </Field>
            </div>
          </fieldset>

          <details className="advanced">
            <summary><span>Дополнительно</span><ChevronDown className="closed-icon" aria-hidden="true" /><ChevronUp className="open-icon" aria-hidden="true" /></summary>
            <div className="advanced-body">
              <label className="check-row">
                <input type="checkbox" checked={selected.accept_new_hostkey} disabled={locked} onChange={(event) => updateProfile({ accept_new_hostkey: event.target.checked })} />
                <span><strong>Принимать новые ключи хостов</strong><small>Изменённый ключ по-прежнему блокирует подключение.</small></span>
              </label>

              <div className="forwards-heading">
                <div><strong>Локальные пробросы</strong><small>Дополнительные правила SSH −L</small></div>
                <button type="button" className="button quiet" disabled={locked} onClick={addForward}><Plus aria-hidden="true" />Добавить</button>
              </div>
              <div className="forwards-list">
                {selected.forwards.length === 0 && <p className="empty-forward">Нет дополнительных пробросов.</p>}
                {selected.forwards.map((forward) => (
                  <ForwardRow key={forward.id} forward={forward} disabled={locked} error={errors.forwards} onChange={updateForward} onRemove={removeForward} />
                ))}
              </div>
              {errors.forwards && <small className="field-error" role="alert">{errors.forwards}</small>}

              <button type="button" className="terminal-link" disabled={locked} onClick={openTerminal}>
                <KeyRound aria-hidden="true" />Нужен пароль? Открыть подключение в отдельном терминале
              </button>
            </div>
          </details>
        </form>
      </section>

      <section className={`log-drawer ${logOpen ? "open" : ""}`} style={logOpen ? { height: workspace.ui.log_height } : undefined} aria-label="Журнал SSH">
        {logOpen && (
          <div
            className="resize-handle"
            role="separator"
            aria-label="Изменить высоту журнала"
            aria-orientation="horizontal"
            aria-valuemin={120}
            aria-valuemax={Math.round(window.innerHeight * 0.4)}
            aria-valuenow={workspace.ui.log_height}
            tabIndex={0}
            onPointerDown={resizeLog}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp") { event.preventDefault(); resizeLogByKeyboard(16); }
              if (event.key === "ArrowDown") { event.preventDefault(); resizeLogByKeyboard(-16); }
            }}
          />
        )}
        <div className="log-bar">
          <button type="button" className="log-caption" onClick={() => setLogOpen((value) => !value)} aria-expanded={logOpen}>
            <TerminalSquare aria-hidden="true" />
            <strong>Журнал</strong>
            {!logOpen && <span className="latest-line">{logs.at(-1)?.message || "События SSH появятся здесь"}</span>}
            {logs.some((entry) => entry.level === "error") && <span className="error-count">Есть ошибки</span>}
            {logOpen ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
          </button>
          {logOpen && (
            <div className="log-actions">
              <button type="button" onClick={() => setAutoScroll((value) => !value)} title={autoScroll ? "Приостановить автопрокрутку" : "Возобновить автопрокрутку"} aria-pressed={!autoScroll}>
                {autoScroll ? <Pause aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
              </button>
              <button type="button" onClick={() => copyText(logs.map(formatLog).join("\n"), "Журнал скопирован")} title="Копировать журнал"><Clipboard aria-hidden="true" /></button>
              <button type="button" onClick={clearLogs} title="Очистить журнал"><Trash2 aria-hidden="true" /></button>
            </div>
          )}
        </div>
        {logOpen && (
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
        )}
      </section>

      <div className="toast" aria-live="polite">{toast}</div>
    </main>
  );
}

function Field({ label, htmlFor, error, className = "", required = false, children }: {
  label: string;
  htmlFor: string;
  error?: string;
  className?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`field ${className}`}>
      <label htmlFor={htmlFor}>{label}{required && <span aria-hidden="true"> *</span>}</label>
      {children}
      {error && <small className="field-error" id={`${htmlFor}-error`}>{error}</small>}
    </div>
  );
}

function ForwardRow({ forward, disabled, error, onChange, onRemove }: {
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

function Elapsed({ startedAt }: { startedAt?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (!startedAt) return null;
  const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return <time className="elapsed">{[hours, minutes, remainder].map((value) => String(value).padStart(2, "0")).join(":")}</time>;
}

function formatLog(entry: LogEntry) {
  return `${new Date(entry.timestamp).toLocaleTimeString("ru-RU", { hour12: false })}  ${entry.message}`;
}

function messageOf(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export default App;
