package main

import (
	"path/filepath"
	"testing"

	"sshtun/internal/model"
)

func TestPendingWorkspaceCanBeFlushed(t *testing.T) {
	path := filepath.Join(t.TempDir(), "profiles.json")
	app, err := NewApp(path)
	if err != nil {
		t.Fatal(err)
	}
	workspace := model.DefaultWorkspace()
	workspace.Profiles[0].Host = "example.org"
	if err := app.SaveWorkspace(workspace); err != nil {
		t.Fatal(err)
	}
	if err := app.flushWorkspace(); err != nil {
		t.Fatal(err)
	}
	got, err := app.store.Load()
	if err != nil {
		t.Fatal(err)
	}
	if got.Profiles[0].Host != "example.org" {
		t.Fatalf("workspace was not flushed: %#v", got)
	}
}
