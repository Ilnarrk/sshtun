import type { AuthMethod, Profile } from "../types";

const authLabels: Record<AuthMethod, string> = {
  key: "SSH-ключ",
  agent: "ssh-agent",
  password: "Пароль",
};

export function ProfileView({ profile, hasPassword }: {
  profile: Profile;
  hasPassword: boolean;
}) {
  const authMethod = profile.auth_method || (profile.key_path ? "key" : "agent");
  const target = profile.host.trim()
    ? `${profile.user}@${profile.host}:${profile.port}`
    : "—";

  return (
    <section className="profile-view">
      <div className="profile-view-header">
        <h2>{profile.name}</h2>
      </div>
      <dl className="profile-summary">
        <div>
          <dt>Сервер</dt>
          <dd><code>{target}</code></dd>
        </div>
        <div>
          <dt>Локальный SOCKS5</dt>
          <dd><code>127.0.0.1:{profile.socks_port}</code></dd>
        </div>
        <div>
          <dt>Аутентификация</dt>
          <dd>
            {authLabels[authMethod]}
            {authMethod === "password" && (
              <span className="profile-summary-note">
                {profile.prompt_password ? " · запрос при подключении" : hasPassword ? " · пароль сохранён" : " · пароль не задан"}
              </span>
            )}
            {authMethod === "key" && profile.key_path && (
              <span className="profile-summary-note"> · {profile.key_path}</span>
            )}
          </dd>
        </div>
        {profile.forwards.length > 0 && (
          <div>
            <dt>Пробросы</dt>
            <dd>{profile.forwards.length} правил</dd>
          </div>
        )}
      </dl>
      <p className="profile-view-hint">Нажмите «Запустить» для подключения туннеля. Редактирование — в меню профиля.</p>
    </section>
  );
}
