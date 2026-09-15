export type TunnelPhase = "idle" | "starting" | "connected" | "stopping" | "failed";

export interface PortForward {
  id: string;
  local_port: string;
  remote_host: string;
  remote_port: string;
}

export type AuthMethod = "key" | "agent" | "password";

export interface Profile {
  id: string;
  name: string;
  host: string;
  user: string;
  port: string;
  socks_port: string;
  key_path: string;
  auth_method: AuthMethod;
  prompt_password: boolean;
  accept_new_hostkey: boolean;
  forwards: PortForward[];
}

export interface UISettings {
  log_height?: number;
}

export type PanelMode = "view" | "edit" | "log";

export interface Workspace {
  version: number;
  profiles: Profile[];
  selected_profile_id: string;
  ui: UISettings;
}

export interface TunnelState {
  phase: TunnelPhase;
  profile_id?: string;
  address?: string;
  started_at?: string;
  error?: string;
}

export interface LogEntry {
  sequence: number;
  timestamp: string;
  level: "info" | "success" | "error";
  message: string;
}

export interface Bootstrap {
  workspace: Workspace;
  tunnel: TunnelState;
  logs: LogEntry[];
}
