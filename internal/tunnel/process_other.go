//go:build !windows

package tunnel

import (
	"errors"
	"os/exec"
)

func configureCommand(*exec.Cmd) {}

func startInteractive(string, []string) error {
	return errors.New("интерактивный терминал поддерживается только в Windows")
}
