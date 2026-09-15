import { type FormEvent, useState } from "react";

export function PasswordPrompt({ profileName, onSubmit, onCancel }: {
  profileName: string;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(password);
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <form className="password-prompt" role="dialog" aria-labelledby="password-prompt-title" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
        <h3 id="password-prompt-title">Пароль для «{profileName}»</h3>
        <p>Введите пароль SSH для подключения туннеля.</p>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoFocus
        />
        <div className="password-prompt-actions">
          <button type="button" className="button secondary" onClick={onCancel}>Отмена</button>
          <button type="submit" className="button connect" disabled={!password}>Подключить</button>
        </div>
      </form>
    </div>
  );
}
