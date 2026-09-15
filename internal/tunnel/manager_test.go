package tunnel

import (
	"context"
	"errors"
	"net"
	"os"
	"os/exec"
	"strconv"
	"testing"
	"time"

	"sshtun/internal/model"
)

func TestLevelForLine(t *testing.T) {
	for input, want := range map[string]string{
		"Permission denied": "error",
		"connection failed": "error",
		"debug message":     "info",
	} {
		if got := levelForLine(input); got != want {
			t.Fatalf("levelForLine(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestManagerConnectsAndStops(t *testing.T) {
	probe, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := probe.Addr().(*net.TCPAddr).Port
	_ = probe.Close()

	manager := NewManager()
	manager.lookPath = func(string) (string, error) { return os.Args[0], nil }
	manager.command = func(ctx context.Context, _ string, args ...string) *exec.Cmd {
		address := ""
		for index, arg := range args {
			if arg == "-D" && index+1 < len(args) {
				address = args[index+1]
			}
		}
		cmd := exec.CommandContext(ctx, os.Args[0], "-test.run=TestSSHHelperProcess")
		cmd.Env = append(os.Environ(), "GO_WANT_SSH_HELPER=1", "SSH_HELPER_ADDRESS="+address)
		return cmd
	}

	profile := model.DefaultProfile()
	profile.Host = "example.org"
	profile.SocksPort = strconv.Itoa(port)
	if err := manager.Start(profile); err != nil {
		t.Fatal(err)
	}
	waitForPhase(t, manager, "connected")
	if err := manager.Start(profile); err == nil {
		t.Fatal("expected second start to be rejected")
	}
	if err := manager.Stop(); err != nil {
		t.Fatal(err)
	}
	waitForPhase(t, manager, "idle")
}

func TestManagerKeepsIdleWhenPortIsOccupied(t *testing.T) {
	manager := NewManager()
	manager.lookPath = func(string) (string, error) { return "ssh", nil }
	manager.checkPort = func(int) error { return errors.New("busy") }
	profile := model.DefaultProfile()
	profile.Host = "example.org"
	if err := manager.Start(profile); err == nil {
		t.Fatal("expected occupied port error")
	}
	if manager.State().Phase != "idle" {
		t.Fatalf("manager left idle state: %#v", manager.State())
	}
}

func TestLogBufferIsBounded(t *testing.T) {
	manager := NewManager()
	for index := 0; index < maxLogEntries+10; index++ {
		manager.appendLog("info", "line")
	}
	if got := len(manager.Logs()); got != maxLogEntries {
		t.Fatalf("log length = %d, want %d", got, maxLogEntries)
	}
}

func TestLogsIsEmptySliceWhenNoLogsExist(t *testing.T) {
	if logs := NewManager().Logs(); logs == nil {
		t.Fatal("Logs() returned nil; expected an empty slice for JSON serialization")
	}
}

func TestSSHHelperProcess(t *testing.T) {
	if os.Getenv("GO_WANT_SSH_HELPER") != "1" {
		return
	}
	listener, err := net.Listen("tcp", os.Getenv("SSH_HELPER_ADDRESS"))
	if err != nil {
		os.Exit(2)
	}
	defer listener.Close()
	for {
		connection, acceptErr := listener.Accept()
		if acceptErr != nil {
			os.Exit(0)
		}
		_ = connection.Close()
	}
}

func waitForPhase(t *testing.T, manager *Manager, phase string) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if manager.State().Phase == phase {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("state did not become %q; got %#v", phase, manager.State())
}
