package tunnel

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func prepareAskpass(password string) (string, func(), error) {
	dir, err := os.MkdirTemp("", "sshtun-askpass-*")
	if err != nil {
		return "", nil, err
	}
	cleanup := func() { _ = os.RemoveAll(dir) }
	scriptPath := filepath.Join(dir, "askpass.cmd")
	script := fmt.Sprintf("@echo off\r\necho %s\r\n", escapeBatchEcho(password))
	if err := os.WriteFile(scriptPath, []byte(script), 0o600); err != nil {
		cleanup()
		return "", nil, err
	}
	return scriptPath, cleanup, nil
}

func escapeBatchEcho(value string) string {
	replacements := []struct {
		from string
		to   string
	}{
		{"^", "^^"},
		{"%", "%%"},
		{"!", "^!"},
		{"<", "^<"},
		{">", "^>"},
		{"|", "^|"},
		{"&", "^&"},
		{"\"", "\\\""},
	}
	out := value
	for _, replacement := range replacements {
		out = strings.ReplaceAll(out, replacement.from, replacement.to)
	}
	return out
}
