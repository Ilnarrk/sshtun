import { Copy, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Profile, TunnelState } from "../types";

export function ProfileSidebar({
  profiles,
  selectedId,
  tunnel,
  locked,
  onSelect,
  onAdd,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  profiles: Profile[];
  selectedId: string;
  tunnel: TunnelState;
  locked: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuId) return;
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenuId(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuId]);

  return (
    <aside className="profile-sidebar" aria-label="Профили">
      <div className="sidebar-header">
        <h2>Профили</h2>
        <button className="icon-button" type="button" onClick={onAdd} disabled={locked} aria-label="Добавить профиль" title="Добавить профиль (Ctrl+N)">
          <Plus aria-hidden="true" />
        </button>
      </div>
      <ul className="profile-list" role="listbox" aria-label="Список профилей">
        {profiles.map((profile) => {
          const active = profile.id === selectedId;
          const connected = tunnel.phase === "connected" && tunnel.profile_id === profile.id;
          const subtitle = profile.host.trim()
            ? `${profile.user}@${profile.host}`
            : "Не настроен";
          return (
            <li key={profile.id} role="option" aria-selected={active} className="profile-row">
              <div className={`profile-card ${active ? "active" : ""} ${connected ? "connected" : ""}`}>
                <button
                  type="button"
                  className="profile-item"
                  disabled={locked && !active}
                  onClick={() => onSelect(profile.id)}
                >
                  <span className="profile-item-dot" aria-hidden="true" />
                  <span className="profile-item-text">
                    <span className="profile-item-title">
                      <strong>{profile.name}</strong>
                    </span>
                    <small>{subtitle}</small>
                  </span>
                </button>
                <button
                  type="button"
                  className="icon-button profile-menu-button"
                  disabled={locked && !active}
                  aria-label={`Действия с профилем «${profile.name}»`}
                  aria-haspopup="menu"
                  aria-expanded={menuId === profile.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(profile.id);
                    setMenuId((current) => current === profile.id ? null : profile.id);
                  }}
                >
                  <MoreVertical aria-hidden="true" />
                </button>
              </div>
              {menuId === profile.id && (
                <div className="menu-popover" ref={menuRef} role="menu">
                  <button type="button" role="menuitem" disabled={locked} onClick={() => { setMenuId(null); onEdit(profile.id); }}>
                    <Pencil aria-hidden="true" />Редактировать
                  </button>
                  <button type="button" role="menuitem" disabled={locked} onClick={() => { setMenuId(null); onDuplicate(profile.id); }}>
                    <Copy aria-hidden="true" />Дублировать
                  </button>
                  <button type="button" role="menuitem" className="danger-text" disabled={locked} onClick={() => { setMenuId(null); onDelete(profile.id); }}>
                    <Trash2 aria-hidden="true" />Удалить
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
