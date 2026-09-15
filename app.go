package main

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"sshtun/internal/config"
	"sshtun/internal/credentials"
	"sshtun/internal/model"
	"sshtun/internal/tray"
	"sshtun/internal/tunnel"
)

type App struct {
	ctx       context.Context
	store     *config.Store
	tunnel    *tunnel.Manager
	tray      *tray.Icon
	exiting   bool
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
	a.tray = tray.New(func() {
		runtime.WindowShow(ctx)
		runtime.WindowUnminimise(ctx)
	}, func() {
		a.exiting = true
		_ = a.tunnel.Stop()
		if a.tray != nil {
			a.tray.Hide()
		}
		runtime.Quit(ctx)
	})
}

func (a *App) shutdown(context.Context) {
	if a.tray != nil {
		a.tray.Hide()
	}
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
	if a.exiting || !a.tunnel.IsActive() {
		return false
	}
	runtime.WindowHide(ctx)
	if a.tray != nil {
		_ = a.tray.Show("SSH Tunnel Manager")
	}
	return true
}

func (a *App) showWindow() {
	if a.ctx == nil {
		return
	}
	runtime.WindowShow(a.ctx)
	runtime.WindowUnminimise(a.ctx)
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
	return a.startTunnel(profile, "")
}

func (a *App) StartTunnelWithPassword(profile model.Profile, password string) error {
	return a.startTunnel(profile, password)
}

func (a *App) startTunnel(profile model.Profile, sessionPassword string) error {
	profile = model.NormalizeWorkspace(model.Workspace{Profiles: []model.Profile{profile}}).Profiles[0]
	authMethod := model.NormalizeAuthMethod(profile.AuthMethod)
	if authMethod == "password" {
		if strings.TrimSpace(sessionPassword) == "" && !profile.PromptPassword {
			stored, err := credentials.GetPassword(profile.ID)
			if err != nil {
				return errors.New("укажите пароль или включите запрос при подключении")
			}
			sessionPassword = stored
		}
		if strings.TrimSpace(sessionPassword) == "" {
			return errors.New("требуется пароль")
		}
	}
	return a.tunnel.Start(profile, sessionPassword)
}

func (a *App) SetProfilePassword(profileID, password string) error {
	if strings.TrimSpace(profileID) == "" {
		return errors.New("не указан профиль")
	}
	if strings.TrimSpace(password) == "" {
		return credentials.DeletePassword(profileID)
	}
	return credentials.SetPassword(profileID, password)
}

func (a *App) ClearProfilePassword(profileID string) error {
	return credentials.DeletePassword(profileID)
}

func (a *App) HasProfilePassword(profileID string) bool {
	return credentials.HasPassword(profileID)
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
