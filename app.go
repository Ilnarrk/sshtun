package main

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"sshtun/internal/config"
	"sshtun/internal/model"
	"sshtun/internal/tunnel"
)

type App struct {
	ctx       context.Context
	store     *config.Store
	tunnel    *tunnel.Manager
	saveMu    sync.Mutex
	pending   *model.Workspace
	saveTimer *time.Timer
}

func NewApp(configPath string) (*App, error) {
	store, err := config.NewStore(configPath)
	if err != nil {
		return nil, err
	}
	return &App{store: store, tunnel: tunnel.NewManager()}, nil
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.tunnel.SetEmitter(func(name string, payload any) {
		runtime.EventsEmit(ctx, name, payload)
	})
}

func (a *App) shutdown(context.Context) {
	_ = a.flushWorkspace()
	_ = a.tunnel.Stop()
}

func (a *App) beforeClose(ctx context.Context) bool {
	if err := a.flushWorkspace(); err != nil {
		_, _ = runtime.MessageDialog(ctx, runtime.MessageDialogOptions{
			Type:    runtime.ErrorDialog,
			Title:   "Не удалось сохранить настройки",
			Message: err.Error() + "\n\nЗакрытие отменено, чтобы не потерять изменения.",
		})
		return true
	}
	if !a.tunnel.IsActive() {
		return false
	}
	choice, err := runtime.MessageDialog(ctx, runtime.MessageDialogOptions{
		Type:          runtime.QuestionDialog,
		Title:         "SSH Tunnel Manager",
		Message:       "Туннель активен. Остановить его и закрыть приложение?",
		Buttons:       []string{"Остановить и выйти", "Отмена"},
		DefaultButton: "Остановить и выйти",
		CancelButton:  "Отмена",
	})
	if err != nil || choice != "Остановить и выйти" {
		return true
	}
	_ = a.tunnel.Stop()
	return false
}

func (a *App) GetBootstrap() (model.Bootstrap, error) {
	workspace, err := a.store.Load()
	if err != nil {
		return model.Bootstrap{}, err
	}
	return model.Bootstrap{
		Workspace: workspace,
		Tunnel:    a.tunnel.State(),
		Logs:      a.tunnel.Logs(),
	}, nil
}

func (a *App) SaveWorkspace(workspace model.Workspace) error {
	workspace = model.NormalizeWorkspace(workspace)
	a.saveMu.Lock()
	a.pending = &workspace
	if a.saveTimer != nil {
		a.saveTimer.Stop()
	}
	a.saveTimer = time.AfterFunc(400*time.Millisecond, func() {
		if err := a.flushWorkspace(); err != nil && a.ctx != nil {
			runtime.EventsEmit(a.ctx, "workspace:save-error", err.Error())
		}
	})
	a.saveMu.Unlock()
	return nil
}

func (a *App) flushWorkspace() error {
	a.saveMu.Lock()
	defer a.saveMu.Unlock()
	if a.saveTimer != nil {
		a.saveTimer.Stop()
		a.saveTimer = nil
	}
	workspace := a.pending
	if workspace == nil {
		return nil
	}
	if err := a.store.Save(*workspace); err != nil {
		return err
	}
	a.pending = nil
	return nil
}

func (a *App) StartTunnel(profile model.Profile) error {
	return a.tunnel.Start(profile)
}

func (a *App) StopTunnel() error {
	return a.tunnel.Stop()
}

func (a *App) ClearLog() {
	a.tunnel.ClearLogs()
}

func (a *App) ChoosePrivateKey() (string, error) {
	if a.ctx == nil {
		return "", errors.New("приложение ещё не готово")
	}
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Выберите приватный SSH-ключ",
		Filters: []runtime.FileFilter{
			{DisplayName: "SSH-ключи", Pattern: "*.pem;*.key;id_rsa;id_ed25519"},
			{DisplayName: "Все файлы", Pattern: "*"},
		},
	})
}

func (a *App) OpenInteractiveTerminal(profile model.Profile) error {
	if strings.TrimSpace(profile.Host) == "" {
		return errors.New("укажите хост перед открытием терминала")
	}
	return a.tunnel.OpenInteractive(profile)
}
