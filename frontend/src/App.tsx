import { CircleAlert, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { backend, runtime } from "./api";
import { AppHeader } from "./components/AppHeader";
import { formatLog } from "./components/LogPanel";
import { LogPanel } from "./components/LogPanel";
import { PasswordPrompt } from "./components/PasswordPrompt";
import { ProfileEditor } from "./components/ProfileEditor";
import { ProfileSidebar } from "./components/ProfileSidebar";
import { ProfileView } from "./components/ProfileView";
import { StatusFooter } from "./components/StatusFooter";
import type { LogEntry, PanelMode, PortForward, Profile, TunnelState, Workspace } from "./types";
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
  auth_method: "agent",
  prompt_password: false,
  accept_new_hostkey: true,
  forwards: [],
});

const emptyTunnel: TunnelState = { phase: "idle" };

function resolvePanelMode(tunnel: TunnelState, editingProfileId: string | null, selectedId: string): PanelMode {
  if (tunnel.phase === "starting" || tunnel.phase === "connected" || tunnel.phase === "stopping" || tunnel.phase === "failed") {
    return "log";
  }
  if (editingProfileId === selectedId) return "edit";
  return "view";
}

function App() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tunnel, setTunnel] = useState<TunnelState>(emptyTunnel);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [saveError, setSaveError] = useState("");
  const [actionError, setActionError] = useState("");
  const [toast, setToast] = useState("");
  const [ready, setReady] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [savedSnapshots, setSavedSnapshots] = useState<Record<string, Profile>>({});
  const [newProfileIds, setNewProfileIds] = useState<Set<string>>(() => new Set());
  const [hasPasswordMap, setHasPasswordMap] = useState<Record<string, boolean>>({});
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});
  const [passwordPromptOpen, setPasswordPromptOpen] = useState(false);
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const offState = runtime().EventsOn("tunnel:state", (state) => setTunnel(state));
    const offLog = runtime().EventsOn("tunnel:log", (entry) => {
      setLogs((current) => [...current, entry].slice(-2000));
    });
    const offSaveError = runtime().EventsOn("workspace:save-error", setSaveError);
    backend().GetBootstrap()
      .then(async (bootstrap) => {
        setWorkspace(bootstrap.workspace);
        setTunnel(bootstrap.tunnel);
        setLogs(bootstrap.logs ?? []);
        const passwordStates: Record<string, boolean> = {};
        await Promise.all(bootstrap.workspace.profiles.map(async (profile) => {
          passwordStates[profile.id] = await backend().HasProfilePassword(profile.id);
        }));
        setHasPasswordMap(passwordStates);
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
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selected = useMemo(
    () => workspace?.profiles.find((profile) => profile.id === workspace.selected_profile_id),
    [workspace],
  );
  const locked = tunnel.phase === "starting" || tunnel.phase === "connected" || tunnel.phase === "stopping";
  const panelMode = selected ? resolvePanelMode(tunnel, editingProfileId, selected.id) : "view";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === "Enter") {
        event.preventDefault();
        document.querySelector<HTMLButtonElement>("[data-connect]")?.click();
      }
      if (event.ctrlKey && event.key.toLowerCase() === "n" && !locked) {
        event.preventDefault();
        addProfile();
      }
      if (event.key === "Escape") {
        if (passwordPromptOpen) {
          setPasswordPromptOpen(false);
          return;
        }
        if (editingProfileId) cancelEdit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [locked, editingProfileId, passwordPromptOpen, workspace, selected]);

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

  const refreshPasswordState = async (profileID: string) => {
    const hasPassword = await backend().HasProfilePassword(profileID);
    setHasPasswordMap((current) => ({ ...current, [profileID]: hasPassword }));
  };

  const addProfile = () => {
    const profile = newProfile();
    setNewProfileIds((current) => new Set(current).add(profile.id));
    updateWorkspace((current) => ({
      ...current,
      profiles: [...current.profiles, profile],
      selected_profile_id: profile.id,
    }));
    setEditingProfileId(profile.id);
    setErrors({});
  };

  const startEdit = (profileID = selected.id) => {
    const target = workspace.profiles.find((profile) => profile.id === profileID) ?? selected;
    setSavedSnapshots((current) => ({ ...current, [target.id]: { ...target } }));
    updateWorkspace((current) => ({ ...current, selected_profile_id: target.id }));
    setEditingProfileId(target.id);
    setErrors({});
  };

  const duplicateProfile = (profileID = selected.id) => {
    const source = workspace.profiles.find((profile) => profile.id === profileID) ?? selected;
    const profile: Profile = {
      ...source,
      id: newID(),
      name: `${source.name} (копия)`,
      forwards: source.forwards.map((forward) => ({ ...forward, id: newID() })),
    };
    updateWorkspace((current) => ({
      ...current,
      profiles: [...current.profiles, profile],
      selected_profile_id: profile.id,
    }));
    setEditingProfileId(profile.id);
  };

  const deleteProfile = async (profileID = selected.id) => {
    const target = workspace.profiles.find((profile) => profile.id === profileID) ?? selected;
    if (workspace.profiles.length === 1) {
      setActionError("Должен остаться хотя бы один профиль.");
      return;
    }
    if (!window.confirm(`Удалить профиль «${target.name}»?`)) return;
    await backend().ClearProfilePassword(target.id);
    updateWorkspace((current) => {
      const profiles = current.profiles.filter((profile) => profile.id !== target.id);
      return { ...current, profiles, selected_profile_id: profiles[0].id };
    });
    setEditingProfileId(null);
    setErrors({});
  };

  const cancelEdit = () => {
    const snapshot = savedSnapshots[selected.id];
    const isNew = newProfileIds.has(selected.id);
    if (isNew) {
      if (workspace.profiles.length > 1) {
        updateWorkspace((current) => {
          const profiles = current.profiles.filter((profile) => profile.id !== selected.id);
          return { ...current, profiles, selected_profile_id: profiles[0].id };
        });
      }
      setNewProfileIds((current) => {
        const next = new Set(current);
        next.delete(selected.id);
        return next;
      });
    } else if (snapshot) {
      updateWorkspace((current) => ({
        ...current,
        profiles: current.profiles.map((profile) => profile.id === selected.id ? snapshot : profile),
      }));
    }
    setPasswordDrafts((current) => ({ ...current, [selected.id]: "" }));
    setEditingProfileId(null);
    setErrors({});
  };

  const finishEdit = async () => {
    const passwordDraft = passwordDrafts[selected.id] ?? "";
    const hasPassword = (hasPasswordMap[selected.id] ?? false) || !!passwordDraft.trim();
    const nextErrors = validateProfile(selected, hasPassword);
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) {
      window.setTimeout(() => errorSummaryRef.current?.focus());
      return;
    }
    if (selected.auth_method === "password" && passwordDraft) {
      try {
        await backend().SetProfilePassword(selected.id, passwordDraft);
        await refreshPasswordState(selected.id);
        setPasswordDrafts((current) => ({ ...current, [selected.id]: "" }));
      } catch (error) {
        setActionError(messageOf(error));
        return;
      }
    }
    if (!selected.name.trim()) updateProfile({ name: "(без названия)" });
    setNewProfileIds((current) => {
      const next = new Set(current);
      next.delete(selected.id);
      return next;
    });
    setEditingProfileId(null);
    setErrors({});
  };

  const startOrStop = async () => {
    setActionError("");
    if (locked) {
      try {
        await backend().StopTunnel();
      } catch (error) {
        setActionError(messageOf(error));
      }
      return;
    }
    const nextErrors = validateProfile(selected, hasPasswordMap[selected.id] ?? false);
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) {
      if (panelMode !== "edit") startEdit();
      window.setTimeout(() => errorSummaryRef.current?.focus());
      return;
    }
    if (selected.auth_method === "password" && selected.prompt_password) {
      setPasswordPromptOpen(true);
      return;
    }
    try {
      await backend().StartTunnel(selected);
    } catch (error) {
      setActionError(messageOf(error));
    }
  };

  const startWithPassword = async (password: string) => {
    setPasswordPromptOpen(false);
    try {
      await backend().StartTunnelWithPassword(selected, password);
    } catch (error) {
      setActionError(messageOf(error));
    }
  };

  const chooseKey = async () => {
    try {
      const path = await backend().ChoosePrivateKey();
      if (path) updateProfile({ key_path: path, auth_method: "key" });
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

  const selectProfile = (profileID: string) => {
    updateWorkspace((current) => ({ ...current, selected_profile_id: profileID }));
    setErrors({});
    if (editingProfileId && editingProfileId !== profileID) {
      setEditingProfileId(null);
    }
  };

  return (
    <main className={`app-shell phase-${tunnel.phase}`}>
      <AppHeader tunnel={tunnel} locked={locked} onSubmit={startOrStop} />

      <div className="main-layout">
        <ProfileSidebar
          profiles={workspace.profiles}
          selectedId={workspace.selected_profile_id}
          tunnel={tunnel}
          locked={locked}
          onSelect={selectProfile}
          onAdd={addProfile}
          onEdit={startEdit}
          onDuplicate={duplicateProfile}
          onDelete={deleteProfile}
        />

        <section className="content-panel">
          {(actionError || saveError || tunnel.error) && (
            <div className="error-banner" role="alert">
              <CircleAlert aria-hidden="true" />
              <span>{actionError || saveError || tunnel.error}</span>
              <button className="dismiss" type="button" onClick={() => { setActionError(""); setSaveError(""); }} aria-label="Скрыть сообщение"><X aria-hidden="true" /></button>
            </div>
          )}

          {hasErrors(errors) && panelMode === "edit" && (
            <div className="validation-summary" ref={errorSummaryRef} tabIndex={-1} role="alert">
              Проверьте выделенные поля перед сохранением.
            </div>
          )}

          {panelMode === "view" && (
            <ProfileView
              profile={selected}
              hasPassword={hasPasswordMap[selected.id] ?? false}
            />
          )}

          {panelMode === "edit" && (
            <ProfileEditor
              profile={selected}
              errors={errors}
              hasPassword={hasPasswordMap[selected.id] ?? false}
              passwordDraft={passwordDrafts[selected.id] ?? ""}
              onPasswordDraftChange={(value) => setPasswordDrafts((current) => ({ ...current, [selected.id]: value }))}
              onChange={updateProfile}
              onChooseKey={chooseKey}
              onDone={finishEdit}
              onCancel={cancelEdit}
              onAddForward={addForward}
              onUpdateForward={updateForward}
              onRemoveForward={removeForward}
            />
          )}

          {panelMode === "log" && (
            <LogPanel
              logs={logs}
              autoScroll={autoScroll}
              onAutoScrollChange={setAutoScroll}
              onCopy={() => copyText(logs.map(formatLog).join("\n"), "Журнал скопирован")}
              onClear={clearLogs}
            />
          )}
        </section>
      </div>

      <StatusFooter tunnel={tunnel} onCopyAddress={(address) => copyText(address, "Адрес SOCKS5 скопирован")} />

      {passwordPromptOpen && (
        <PasswordPrompt
          profileName={selected.name}
          onSubmit={startWithPassword}
          onCancel={() => setPasswordPromptOpen(false)}
        />
      )}

      <div className="toast" aria-live="polite">{toast}</div>
    </main>
  );
}

function messageOf(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export default App;
