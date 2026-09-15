import { describe, expect, it } from "vitest";
import { validateProfile } from "./validation";
import type { Profile } from "./types";

const profile = (): Profile => ({
  id: "profile-1",
  name: "Demo",
  host: "example.org",
  user: "root",
  port: "22",
  socks_port: "01080",
  key_path: "",
  accept_new_hostkey: true,
  forwards: [],
});

describe("validateProfile", () => {
  it("accepts a complete profile", () => {
    expect(validateProfile(profile())).toEqual({});
  });

  it("finds duplicate ports after normalisation", () => {
    const value = profile();
    value.forwards = [{ id: "f1", local_port: "1080", remote_host: "localhost", remote_port: "80" }];
    expect(validateProfile(value).forwards).toContain("1080");
  });
});
