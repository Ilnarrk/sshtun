package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadMigratesLegacyWorkspace(t *testing.T) {
	path := filepath.Join(t.TempDir(), "profiles.json")
	legacy := `{
  "profiles": [
    {"name":"Первый","host":"one","user":"root","port":"22","socks_port":"1080","key_path":"","accept_new_hostkey":true,"forwards":[]},
    {"name":"Второй","host":"two","user":"dev","port":"22","socks_port":"1081","key_path":"","accept_new_hostkey":true,"forwards":[]}
  ],
  "last_selected": 1
}`
	if err := os.WriteFile(path, []byte(legacy), 0o600); err != nil {
		t.Fatal(err)
	}
	store, err := NewStore(path)
	if err != nil {
		t.Fatal(err)
	}
	workspace, err := store.Load()
	if err != nil {
		t.Fatal(err)
	}
	if workspace.Version != 2 || workspace.SelectedProfileID != workspace.Profiles[1].ID {
		t.Fatalf("legacy selection was not migrated: %#v", workspace)
	}
	if workspace.Profiles[0].ID == "" || workspace.Profiles[1].ID == "" {
		t.Fatal("profile IDs were not generated")
	}
	if _, err := os.Stat(filepath.Join(filepath.Dir(path), "profiles.v1.backup.json")); err != nil {
		t.Fatal("legacy backup was not created")
	}
}

func TestSaveAndLoadRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "profiles.json")
	store, _ := NewStore(path)
	want, err := store.Load()
	if err != nil {
		t.Fatal(err)
	}
	want.Profiles[0].Host = "example.org"
	if err := store.Save(want); err != nil {
		t.Fatal(err)
	}
	got, err := store.Load()
	if err != nil {
		t.Fatal(err)
	}
	if got.Profiles[0].Host != "example.org" || got.SelectedProfileID != want.SelectedProfileID {
		t.Fatalf("round-trip mismatch: %#v", got)
	}
}

func TestLoadRejectsCorruptConfigWithoutChangingIt(t *testing.T) {
	path := filepath.Join(t.TempDir(), "profiles.json")
	want := []byte(`{"profiles":`)
	if err := os.WriteFile(path, want, 0o600); err != nil {
		t.Fatal(err)
	}
	store, _ := NewStore(path)
	if _, err := store.Load(); err == nil {
		t.Fatal("expected corrupt configuration error")
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(want) {
		t.Fatal("corrupt configuration was modified")
	}
}
