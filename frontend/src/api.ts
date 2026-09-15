import type { Bootstrap, LogEntry, Profile, TunnelState, Workspace } from "./types";

type WailsApp = {
  GetBootstrap(): Promise<Bootstrap>;
  SaveWorkspace(workspace: Workspace): Promise<void>;
  StartTunnel(profile: Profile): Promise<void>;
  StartTunnelWithPassword(profile: Profile, password: string): Promise<void>;
  StopTunnel(): Promise<void>;
  ClearLog(): Promise<void>;
  ChoosePrivateKey(): Promise<string>;
  SetProfilePassword(profileID: string, password: string): Promise<void>;
  ClearProfilePassword(profileID: string): Promise<void>;
  HasProfilePassword(profileID: string): Promise<boolean>;
};

type WailsRuntime = {
  EventsOn(name: "tunnel:state", callback: (state: TunnelState) => void): () => void;
  EventsOn(name: "tunnel:log", callback: (entry: LogEntry) => void): () => void;
  EventsOn(name: "workspace:save-error", callback: (message: string) => void): () => void;
  ClipboardSetText(text: string): Promise<boolean>;
};

declare global {
  interface Window {
    go: { main: { App: WailsApp } };
    runtime: WailsRuntime;
  }
}

export const backend = (): WailsApp => window.go.main.App;
export const runtime = (): WailsRuntime => window.runtime;
