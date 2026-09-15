package model

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"
	"time"
)

const CurrentVersion = 2

type PortForward struct {
	ID         string `json:"id"`
	LocalPort  string `json:"local_port"`
	RemoteHost string `json:"remote_host"`
	RemotePort string `json:"remote_port"`
}

type Profile struct {
	ID               string        `json:"id"`
	Name             string        `json:"name"`
	Host             string        `json:"host"`
	User             string        `json:"user"`
	Port             string        `json:"port"`
	SocksPort        string        `json:"socks_port"`
	KeyPath          string        `json:"key_path"`
	AcceptNewHostKey bool          `json:"accept_new_hostkey"`
	Forwards         []PortForward `json:"forwards"`
}

type UISettings struct {
	LogHeight int `json:"log_height"`
}

type Workspace struct {
	Version           int         `json:"version"`
	Profiles          []Profile   `json:"profiles"`
	SelectedProfileID string      `json:"selected_profile_id"`
	UI                UISettings  `json:"ui"`
}

type TunnelState struct {
	Phase     string `json:"phase"`
	ProfileID string `json:"profile_id,omitempty"`
	Address   string `json:"address,omitempty"`
	StartedAt string `json:"started_at,omitempty"`
	Error     string `json:"error,omitempty"`
}

type LogEntry struct {
	Sequence  int64  `json:"sequence"`
	Timestamp string `json:"timestamp"`
	Level     string `json:"level"`
	Message   string `json:"message"`
}

type Bootstrap struct {
	Workspace Workspace   `json:"workspace"`
	Tunnel    TunnelState `json:"tunnel"`
	Logs      []LogEntry  `json:"logs"`
}

func NewID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("id-%d", time.Now().UnixNano())
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	encoded := hex.EncodeToString(b)
	return encoded[:8] + "-" + encoded[8:12] + "-" + encoded[12:16] + "-" + encoded[16:20] + "-" + encoded[20:]
}

func DefaultProfile() Profile {
	return Profile{
		ID:               NewID(),
		Name:             "Новый профиль",
		User:             "root",
		Port:             "22",
		SocksPort:        "1080",
		AcceptNewHostKey: true,
		Forwards:         []PortForward{},
	}
}

func DefaultWorkspace() Workspace {
	p := DefaultProfile()
	return Workspace{
		Version:           CurrentVersion,
		Profiles:          []Profile{p},
		SelectedProfileID: p.ID,
		UI:                UISettings{LogHeight: 180},
	}
}

func NormalizeWorkspace(workspace Workspace) Workspace {
	workspace.Version = CurrentVersion
	if workspace.UI.LogHeight < 120 || workspace.UI.LogHeight > 420 {
		workspace.UI.LogHeight = 180
	}
	if len(workspace.Profiles) == 0 {
		return DefaultWorkspace()
	}
	selectedExists := false
	profileIDs := make(map[string]bool, len(workspace.Profiles))
	for i := range workspace.Profiles {
		p := &workspace.Profiles[i]
		if p.ID == "" || profileIDs[p.ID] {
			p.ID = NewID()
		}
		profileIDs[p.ID] = true
		if strings.TrimSpace(p.Name) == "" {
			p.Name = "(без названия)"
		}
		if p.Forwards == nil {
			p.Forwards = []PortForward{}
		}
		forwardIDs := make(map[string]bool, len(p.Forwards))
		for j := range p.Forwards {
			if p.Forwards[j].ID == "" || forwardIDs[p.Forwards[j].ID] {
				p.Forwards[j].ID = NewID()
			}
			forwardIDs[p.Forwards[j].ID] = true
		}
		if p.ID == workspace.SelectedProfileID {
			selectedExists = true
		}
	}
	if !selectedExists {
		workspace.SelectedProfileID = workspace.Profiles[0].ID
	}
	return workspace
}

func (p Profile) Validate() error {
	if strings.TrimSpace(p.Host) == "" {
		return errors.New("укажите хост или IP-адрес сервера")
	}
	if strings.TrimSpace(p.User) == "" {
		return errors.New("укажите имя пользователя")
	}
	sshPort, err := validPort(p.Port)
	if err != nil {
		return errors.New("SSH-порт должен быть числом от 1 до 65535")
	}
	socksPort, err := validPort(p.SocksPort)
	if err != nil {
		return errors.New("SOCKS5-порт должен быть числом от 1 до 65535")
	}
	_ = sshPort
	if p.KeyPath != "" {
		if info, statErr := os.Stat(p.KeyPath); statErr != nil || info.IsDir() {
			return errors.New("указанный файл SSH-ключа не найден")
		}
	}
	used := map[int]bool{socksPort: true}
	for _, forward := range p.Forwards {
		if forward.IsEmpty() {
			continue
		}
		local, localErr := validPort(forward.LocalPort)
		remote, remoteErr := validPort(forward.RemotePort)
		if localErr != nil {
			return errors.New("локальный порт проброса должен быть числом от 1 до 65535")
		}
		if strings.TrimSpace(forward.RemoteHost) == "" {
			return errors.New("укажите адрес назначения для проброса")
		}
		if remoteErr != nil {
			return errors.New("порт назначения должен быть числом от 1 до 65535")
		}
		_ = remote
		if used[local] {
			return fmt.Errorf("локальный порт %d уже используется", local)
		}
		used[local] = true
	}
	return nil
}

func (p Profile) SSHArgs(batch bool) ([]string, error) {
	if err := p.Validate(); err != nil {
		return nil, err
	}
	args := []string{
		"-D", net.JoinHostPort("127.0.0.1", normalizedPort(p.SocksPort)),
		"-N", "-p", normalizedPort(p.Port),
		"-o", "ExitOnForwardFailure=yes",
		"-o", "ConnectTimeout=10",
		"-o", "ServerAliveInterval=30",
		"-o", "ServerAliveCountMax=3",
	}
	if batch {
		args = append(args, "-o", "BatchMode=yes")
	}
	for _, forward := range p.Forwards {
		if forward.IsEmpty() {
			continue
		}
		destination := net.JoinHostPort(strings.TrimSpace(forward.RemoteHost), normalizedPort(forward.RemotePort))
		args = append(args, "-L", "127.0.0.1:"+normalizedPort(forward.LocalPort)+":"+destination)
	}
	if p.KeyPath != "" {
		args = append(args, "-i", p.KeyPath)
	}
	if p.AcceptNewHostKey {
		args = append(args, "-o", "StrictHostKeyChecking=accept-new")
	}
	args = append(args, strings.TrimSpace(p.User)+"@"+strings.TrimSpace(p.Host))
	return args, nil
}

func (p Profile) LocalPorts() ([]int, error) {
	if err := p.Validate(); err != nil {
		return nil, err
	}
	ports := make([]int, 0, len(p.Forwards)+1)
	socks, _ := validPort(p.SocksPort)
	ports = append(ports, socks)
	for _, forward := range p.Forwards {
		if !forward.IsEmpty() {
			port, _ := validPort(forward.LocalPort)
			ports = append(ports, port)
		}
	}
	return ports, nil
}

func (f PortForward) IsEmpty() bool {
	return strings.TrimSpace(f.LocalPort) == "" && strings.TrimSpace(f.RemotePort) == ""
}

func validPort(value string) (int, error) {
	port, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil || port < 1 || port > 65535 {
		return 0, errors.New("invalid port")
	}
	return port, nil
}

func normalizedPort(value string) string {
	port, _ := validPort(value)
	return strconv.Itoa(port)
}
