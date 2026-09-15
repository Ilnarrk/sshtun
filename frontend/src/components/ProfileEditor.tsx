import { FileKey, Plus } from "lucide-react";
import { useState } from "react";
import type { AuthMethod, PortForward, Profile } from "../types";
import type { ProfileErrors } from "../validation";
import { Field } from "./Field";
import { ForwardRow } from "./ForwardRow";

const authOptions: { value: AuthMethod; label: string }[] = [
  { value: "key", label: "SSH-ключ" },
  { value: "agent", label: "ssh-agent" },
  { value: "password", label: "Пароль" },
];

type EditorTab = "connection" | "advanced";

export function ProfileEditor({
  profile,
  errors,
  hasPassword,
  passwordDraft,
  onPasswordDraftChange,
  onChange,
  onChooseKey,
  onDone,
  onCancel,
  onAddForward,
  onUpdateForward,
  onRemoveForward,
}: {
  profile: Profile;
  errors: ProfileErrors;
  hasPassword: boolean;
  passwordDraft: string;
  onPasswordDraftChange: (value: string) => void;
  onChange: (patch: Partial<Profile>) => void;
  onChooseKey: () => void;
  onDone: () => void;
  onCancel: () => void;
  onAddForward: () => void;
  onUpdateForward: (id: string, patch: Partial<PortForward>) => void;
  onRemoveForward: (id: string) => void;
}) {
  const [tab, setTab] = useState<EditorTab>("connection");
  const authMethod = profile.auth_method || (profile.key_path ? "key" : "agent");

  return (
    <form className="profile-editor" onSubmit={(event) => { event.preventDefault(); onDone(); }} noValidate>
      <div className="profile-editor-header">
        <h2>Настройки профиля</h2>
        <div className="profile-editor-actions">
          <button type="button" className="button secondary" onClick={onCancel}>Отмена</button>
          <button type="submit" className="button connect">Готово</button>
        </div>
      </div>

      <div className="editor-tabs" role="tablist" aria-label="Разделы настроек">
        <button type="button" role="tab" aria-selected={tab === "connection"} className={tab === "connection" ? "active" : ""} onClick={() => setTab("connection")}>
          Подключение
        </button>
        <button type="button" role="tab" aria-selected={tab === "advanced"} className={tab === "advanced" ? "active" : ""} onClick={() => setTab("advanced")}>
          Дополнительно
        </button>
      </div>

      {tab === "connection" && (
        <fieldset>
          <legend className="sr-only">Подключение</legend>
          <div className="auth-segment" role="radiogroup" aria-label="Метод аутентификации">
            {authOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={authMethod === option.value ? "active" : ""}
                role="radio"
                aria-checked={authMethod === option.value}
                onClick={() => onChange({ auth_method: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="form-grid">
            <Field label="Название профиля" htmlFor="profile-name" className="wide">
              <input
                id="profile-name"
                value={profile.name}
                onChange={(event) => onChange({ name: event.target.value })}
                onBlur={() => { if (!profile.name.trim()) onChange({ name: "(без названия)" }); }}
              />
            </Field>
            <Field label="Хост или IP" htmlFor="host" error={errors.host} className="host-field" required>
              <input id="host" autoComplete="off" value={profile.host} onChange={(event) => onChange({ host: event.target.value })} aria-invalid={!!errors.host} aria-describedby={errors.host ? "host-error" : undefined} />
            </Field>
            <Field label="SSH-порт" htmlFor="ssh-port" error={errors.port} className="port-field" required>
              <input id="ssh-port" inputMode="numeric" value={profile.port} onChange={(event) => onChange({ port: event.target.value })} aria-invalid={!!errors.port} aria-describedby={errors.port ? "ssh-port-error" : undefined} />
            </Field>
            <Field label="Пользователь" htmlFor="user" error={errors.user} required>
              <input id="user" autoComplete="username" value={profile.user} onChange={(event) => onChange({ user: event.target.value })} aria-invalid={!!errors.user} aria-describedby={errors.user ? "user-error" : undefined} />
            </Field>
            {authMethod === "password" && (
              <div className="password-block">
                <Field label="Пароль" htmlFor="profile-password" error={errors.password} className="wide">
                  <input
                    id="profile-password"
                    type="password"
                    autoComplete="new-password"
                    value={passwordDraft}
                    onChange={(event) => onPasswordDraftChange(event.target.value)}
                    placeholder={hasPassword ? "Оставьте пустым, чтобы не менять" : "Введите пароль"}
                  />
                </Field>
                <label className="check-row password-prompt-check">
                  <input type="checkbox" checked={profile.prompt_password} onChange={(event) => onChange({ prompt_password: event.target.checked })} />
                  <span><strong>Запрашивать при каждом подключении</strong><small>Если включено, сохранённый пароль не используется автоматически.</small></span>
                </label>
                {hasPassword && !passwordDraft && <p className="auth-hint">Пароль сохранён в Windows Credential Manager.</p>}
              </div>
            )}
            <Field label="Локальный SOCKS5-порт" htmlFor="socks-port" error={errors.socks_port} required>
              <input id="socks-port" inputMode="numeric" value={profile.socks_port} onChange={(event) => onChange({ socks_port: event.target.value })} aria-invalid={!!errors.socks_port} aria-describedby={errors.socks_port ? "socks-port-error" : undefined} />
            </Field>
            {authMethod === "key" && (
              <Field label="Приватный ключ" htmlFor="key-path" error={errors.key_path} className="wide">
                <div className="input-action">
                  <input id="key-path" value={profile.key_path} onChange={(event) => onChange({ key_path: event.target.value })} placeholder="Путь к файлу ключа" />
                  <button type="button" className="button secondary" onClick={onChooseKey}><FileKey aria-hidden="true" />Выбрать</button>
                </div>
              </Field>
            )}
            {authMethod === "agent" && (
              <p className="auth-hint wide-hint">Используются ключи из ssh-agent или стандартные ключи в ~/.ssh.</p>
            )}
          </div>
        </fieldset>
      )}

      {tab === "advanced" && (
        <fieldset className="advanced-tab">
          <legend className="sr-only">Дополнительно</legend>
          <label className="check-row">
            <input type="checkbox" checked={profile.accept_new_hostkey} onChange={(event) => onChange({ accept_new_hostkey: event.target.checked })} />
            <span><strong>Принимать новые ключи хостов</strong><small>Изменённый ключ по-прежнему блокирует подключение.</small></span>
          </label>

          <div className="forwards-heading">
            <div><strong>Локальные пробросы</strong><small>Дополнительные правила SSH −L</small></div>
            <button type="button" className="button quiet" onClick={onAddForward}><Plus aria-hidden="true" />Добавить</button>
          </div>
          <div className="forwards-list">
            {profile.forwards.length === 0 && <p className="empty-forward">Нет дополнительных пробросов.</p>}
            {profile.forwards.map((forward) => (
              <ForwardRow key={forward.id} forward={forward} disabled={false} error={errors.forwards} onChange={onUpdateForward} onRemove={onRemoveForward} />
            ))}
          </div>
          {errors.forwards && <small className="field-error" role="alert">{errors.forwards}</small>}
        </fieldset>
      )}
    </form>
  );
}
