import type { Profile } from "./types";

export type ProfileErrors = Partial<Record<"host" | "user" | "port" | "socks_port" | "key_path" | "forwards", string>>;

const port = (value: string) => {
  const number = Number(value.trim());
  return Number.isInteger(number) && number >= 1 && number <= 65535 ? number : null;
};

export function validateProfile(profile: Profile): ProfileErrors {
  const errors: ProfileErrors = {};
  if (!profile.host.trim()) errors.host = "Укажите хост или IP-адрес";
  if (!profile.user.trim()) errors.user = "Укажите пользователя";
  if (port(profile.port) === null) errors.port = "Введите порт от 1 до 65535";
  const socks = port(profile.socks_port);
  if (socks === null) errors.socks_port = "Введите порт от 1 до 65535";

  const used = new Set<number>();
  if (socks !== null) used.add(socks);
  for (const forward of profile.forwards) {
    if (!forward.local_port.trim() && !forward.remote_port.trim()) continue;
    const local = port(forward.local_port);
    const remote = port(forward.remote_port);
    if (local === null || remote === null || !forward.remote_host.trim()) {
      errors.forwards = "Заполните адрес и оба порта каждого проброса";
      break;
    }
    if (used.has(local)) {
      errors.forwards = `Локальный порт ${local} уже используется`;
      break;
    }
    used.add(local);
  }
  return errors;
}

export const hasErrors = (errors: ProfileErrors) => Object.keys(errors).length > 0;
