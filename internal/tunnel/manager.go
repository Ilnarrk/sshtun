package tunnel

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"sshtun/internal/model"
)

const maxLogEntries = 2000

type Emitter func(name string, payload any)

type Manager struct {
	mu            sync.Mutex
	state         model.TunnelState
	logs          []model.LogEntry
	sequence      int64
	runID         uint64
	cancel        context.CancelFunc
	cmd           *exec.Cmd
	stopRequested bool
	emit          Emitter
	lookPath      func(string) (string, error)
	command       func(context.Context, string, ...string) *exec.Cmd
	checkPort     func(int) error
}

func NewManager() *Manager {
	return &Manager{
		state:     model.TunnelState{Phase: "idle"},
		logs:      make([]model.LogEntry, 0, 128),
		lookPath:  exec.LookPath,
		command:   exec.CommandContext,
		checkPort: portAvailable,
	}
}

func (m *Manager) SetEmitter(emitter Emitter) {
	m.mu.Lock()
	m.emit = emitter
	m.mu.Unlock()
}

func (m *Manager) State() model.TunnelState {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.state
}

func (m *Manager) Logs() []model.LogEntry {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append(make([]model.LogEntry, 0, len(m.logs)), m.logs...)
}

func (m *Manager) IsActive() bool {
	phase := m.State().Phase
	return phase == "starting" || phase == "connected" || phase == "stopping"
}

func (m *Manager) Start(profile model.Profile, sessionPassword string) error {
	authMethod := model.NormalizeAuthMethod(profile.AuthMethod)
	if authMethod == "" {
		if strings.TrimSpace(profile.KeyPath) != "" {
			authMethod = "key"
		} else {
			authMethod = "agent"
		}
	}
	batch := authMethod != "password"
	args, err := profile.SSHArgs(batch)
	if err != nil {
		return err
	}
	var askpassPath string
	var askpassCleanup func()
	if authMethod == "password" {
		if strings.TrimSpace(sessionPassword) == "" {
			return errors.New("требуется пароль")
		}
		askpassPath, askpassCleanup, err = prepareAskpass(sessionPassword)
		if err != nil {
			return fmt.Errorf("не удалось подготовить SSH_ASKPASS: %w", err)
		}
	}
	sshPath, err := m.lookPath("ssh")
	if err != nil {
		return errors.New("ssh.exe не найден; установите компонент OpenSSH Client")
	}
	ports, err := profile.LocalPorts()
	if err != nil {
		return err
	}
	for _, port := range ports {
		if err := m.checkPort(port); err != nil {
			return fmt.Errorf("локальный порт %d уже занят", port)
		}
	}

	m.mu.Lock()
	if m.state.Phase != "idle" && m.state.Phase != "failed" {
		m.mu.Unlock()
		return errors.New("туннель уже запускается или работает")
	}
	ctx, cancel := context.WithCancel(context.Background())
	m.cancel = cancel
	m.runID++
	runID := m.runID
	m.stopRequested = false
	m.state = model.TunnelState{
		Phase:     "starting",
		ProfileID: profile.ID,
		Address:   net.JoinHostPort("127.0.0.1", normalizedPort(profile.SocksPort)),
	}
	state := m.state
	m.mu.Unlock()
	m.emitEvent("tunnel:state", state)
	m.appendLog("info", "Запуск туннеля к "+profile.User+"@"+profile.Host)

	go m.run(ctx, runID, sshPath, args, profile, askpassPath, askpassCleanup)
	return nil
}

func (m *Manager) Stop() error {
	m.mu.Lock()
	if m.state.Phase == "idle" || m.state.Phase == "failed" {
		if m.state.Phase == "failed" {
			m.state = model.TunnelState{Phase: "idle"}
			state := m.state
			m.mu.Unlock()
			m.emitEvent("tunnel:state", state)
			return nil
		}
		m.mu.Unlock()
		return nil
	}
	if m.state.Phase == "stopping" {
		m.mu.Unlock()
		return nil
	}
	m.stopRequested = true
	m.state.Phase = "stopping"
	state, cancel, cmd := m.state, m.cancel, m.cmd
	m.mu.Unlock()
	m.emitEvent("tunnel:state", state)
	m.appendLog("info", "Остановка туннеля")
	if cancel != nil {
		cancel()
	}
	if cmd != nil && cmd.Process != nil {
		_ = cmd.Process.Kill()
	}
	return nil
}

func (m *Manager) ClearLogs() {
	m.mu.Lock()
	m.logs = m.logs[:0]
	m.mu.Unlock()
}

func (m *Manager) OpenInteractive(profile model.Profile) error {
	args, err := profile.SSHArgs(false)
	if err != nil {
		return err
	}
	sshPath, err := m.lookPath("ssh")
	if err != nil {
		return errors.New("ssh.exe не найден; установите компонент OpenSSH Client")
	}
	if err := startInteractive(sshPath, args); err != nil {
		return fmt.Errorf("не удалось открыть терминал: %w", err)
	}
	m.appendLog("info", "Открыт отдельный терминал для парольного подключения")
	return nil
}

func (m *Manager) run(ctx context.Context, runID uint64, sshPath string, args []string, profile model.Profile, askpassPath string, askpassCleanup func()) {
	cmd := m.command(ctx, sshPath, args...)
	if askpassPath != "" {
		cmd.Env = append(os.Environ(),
			"SSH_ASKPASS="+askpassPath,
			"SSH_ASKPASS_REQUIRE=force",
			"DISPLAY=sshtun",
		)
	}
	configureCommand(cmd)
	if askpassCleanup != nil {
		defer askpassCleanup()
	}
	output, err := cmd.StdoutPipe()
	if err != nil {
		m.finish(runID, err)
		return
	}
	cmd.Stderr = cmd.Stdout
	if err := cmd.Start(); err != nil {
		m.finish(runID, err)
		return
	}

	m.mu.Lock()
	if runID != m.runID {
		m.mu.Unlock()
		_ = cmd.Process.Kill()
		return
	}
	m.cmd = cmd
	m.mu.Unlock()

	scanDone := make(chan struct{})
	go func() {
		defer close(scanDone)
		scanner := bufio.NewScanner(output)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line != "" {
				m.appendLog(levelForLine(line), line)
			}
		}
	}()

	waitDone := make(chan error, 1)
	go func() { waitDone <- cmd.Wait() }()

	address := net.JoinHostPort("127.0.0.1", normalizedPort(profile.SocksPort))
	deadline := time.NewTimer(10 * time.Second)
	ticker := time.NewTicker(100 * time.Millisecond)
	defer deadline.Stop()
	defer ticker.Stop()

	for {
		select {
		case waitErr := <-waitDone:
			<-scanDone
			m.finish(runID, waitErr)
			return
		case <-ticker.C:
			connection, dialErr := net.DialTimeout("tcp", address, 150*time.Millisecond)
			if dialErr == nil {
				_ = connection.Close()
				m.connected(runID)
				waitErr := <-waitDone
				<-scanDone
				m.finish(runID, waitErr)
				return
			}
		case <-deadline.C:
			_ = cmd.Process.Kill()
			<-waitDone
			<-scanDone
			m.finish(runID, errors.New("SSH не открыл локальный порт за 10 секунд"))
			return
		}
	}
}

func (m *Manager) connected(runID uint64) {
	m.mu.Lock()
	if runID != m.runID || m.stopRequested {
		m.mu.Unlock()
		return
	}
	m.state.Phase = "connected"
	m.state.StartedAt = time.Now().UTC().Format(time.RFC3339)
	m.state.Error = ""
	state := m.state
	m.mu.Unlock()
	m.appendLog("success", "Туннель подключён: "+state.Address)
	m.emitEvent("tunnel:state", state)
}

func (m *Manager) finish(runID uint64, runErr error) {
	m.mu.Lock()
	if runID != m.runID {
		m.mu.Unlock()
		return
	}
	stopped := m.stopRequested || errors.Is(runErr, context.Canceled)
	m.cmd = nil
	m.cancel = nil
	m.stopRequested = false
	if stopped || runErr == nil {
		m.state = model.TunnelState{Phase: "idle"}
	} else {
		m.state.Phase = "failed"
		m.state.Error = humanProcessError(runErr)
		m.state.StartedAt = ""
	}
	state := m.state
	m.mu.Unlock()
	if state.Phase == "failed" {
		m.appendLog("error", state.Error)
	} else {
		m.appendLog("info", "Туннель остановлен")
	}
	m.emitEvent("tunnel:state", state)
}

func (m *Manager) appendLog(level, message string) {
	m.mu.Lock()
	m.sequence++
	entry := model.LogEntry{
		Sequence:  m.sequence,
		Timestamp: time.Now().UTC().Format(time.RFC3339Nano),
		Level:     level,
		Message:   message,
	}
	m.logs = append(m.logs, entry)
	if len(m.logs) > maxLogEntries {
		m.logs = append([]model.LogEntry(nil), m.logs[len(m.logs)-maxLogEntries:]...)
	}
	emitter := m.emit
	m.mu.Unlock()
	if emitter != nil {
		emitter("tunnel:log", entry)
	}
}

func (m *Manager) emitEvent(name string, payload any) {
	m.mu.Lock()
	emitter := m.emit
	m.mu.Unlock()
	if emitter != nil {
		emitter(name, payload)
	}
}

func portAvailable(port int) error {
	listener, err := net.Listen("tcp", net.JoinHostPort("127.0.0.1", strconv.Itoa(port)))
	if err != nil {
		return err
	}
	return listener.Close()
}

func normalizedPort(value string) string {
	port, _ := strconv.Atoi(strings.TrimSpace(value))
	return strconv.Itoa(port)
}

func levelForLine(line string) string {
	lower := strings.ToLower(line)
	if strings.Contains(lower, "error") || strings.Contains(lower, "failed") || strings.Contains(lower, "denied") {
		return "error"
	}
	return "info"
}

func humanProcessError(err error) string {
	if err == nil {
		return ""
	}
	if errors.Is(err, context.Canceled) {
		return "подключение отменено"
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return fmt.Sprintf("SSH завершился с кодом %d. Проверьте ключ, ssh-agent и журнал.", exitErr.ExitCode())
	}
	return err.Error()
}
