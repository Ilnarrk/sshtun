package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"sshtun/internal/model"
)

const fileName = "profiles.json"

type Store struct {
	path string
}

type diskWorkspace struct {
	Version           int                 `json:"version"`
	Profiles          []model.Profile     `json:"profiles"`
	SelectedProfileID string              `json:"selected_profile_id"`
	LastSelected      int                 `json:"last_selected"`
	UI                model.UISettings    `json:"ui"`
}

func NewStore(path string) (*Store, error) {
	if path == "" {
		configDir, err := os.UserConfigDir()
		if err != nil {
			return nil, fmt.Errorf("не удалось определить каталог настроек: %w", err)
		}
		path = filepath.Join(configDir, "SSHTunnelManager", fileName)
	}
	return &Store{path: path}, nil
}

func (s *Store) Load() (model.Workspace, error) {
	raw, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return model.DefaultWorkspace(), nil
	}
	if err != nil {
		return model.Workspace{}, fmt.Errorf("не удалось прочитать настройки: %w", err)
	}

	var disk diskWorkspace
	if err := json.Unmarshal(raw, &disk); err != nil {
		return model.Workspace{}, fmt.Errorf("файл настроек повреждён: %w", err)
	}
	workspace := model.Workspace{
		Version:           disk.Version,
		Profiles:          disk.Profiles,
		SelectedProfileID: disk.SelectedProfileID,
		UI:                disk.UI,
	}
	legacy := disk.Version < model.CurrentVersion || workspace.SelectedProfileID == ""
	selected := disk.LastSelected
	if selected < 0 || selected >= len(workspace.Profiles) {
		selected = 0
	}
	workspace = model.NormalizeWorkspace(workspace)
	if legacy {
		workspace.SelectedProfileID = workspace.Profiles[selected].ID
		if err := s.backupLegacy(raw); err != nil {
			return model.Workspace{}, fmt.Errorf("не удалось создать резервную копию старых настроек: %w", err)
		}
	}
	return workspace, nil
}

func (s *Store) Save(workspace model.Workspace) error {
	workspace = model.NormalizeWorkspace(workspace)
	raw, err := json.MarshalIndent(workspace, "", "  ")
	if err != nil {
		return fmt.Errorf("не удалось подготовить настройки: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0o700); err != nil {
		return fmt.Errorf("не удалось создать каталог настроек: %w", err)
	}

	temporary, err := os.CreateTemp(filepath.Dir(s.path), ".profiles-*.tmp")
	if err != nil {
		return fmt.Errorf("не удалось создать временный файл настроек: %w", err)
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)

	if err := temporary.Chmod(0o600); err != nil {
		_ = temporary.Close()
		return err
	}
	if _, err := temporary.Write(raw); err != nil {
		_ = temporary.Close()
		return fmt.Errorf("не удалось записать настройки: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		_ = temporary.Close()
		return fmt.Errorf("не удалось синхронизировать настройки: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("не удалось закрыть файл настроек: %w", err)
	}
	if err := replaceFile(temporaryPath, s.path); err != nil {
		return fmt.Errorf("не удалось заменить файл настроек: %w", err)
	}
	return nil
}

func (s *Store) backupLegacy(raw []byte) error {
	backup := filepath.Join(filepath.Dir(s.path), "profiles.v1.backup.json")
	if _, err := os.Stat(backup); err == nil {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0o700); err != nil {
		return err
	}
	return os.WriteFile(backup, raw, 0o600)
}
