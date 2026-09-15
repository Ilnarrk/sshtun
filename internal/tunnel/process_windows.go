//go:build windows

package tunnel

import (
	"os/exec"
	"syscall"
)

func configureCommand(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: 0x08000000,
	}
}

func startInteractive(sshPath string, args []string) error {
	command := append([]string{"/K", sshPath}, args...)
	cmd := exec.Command("cmd.exe", command...)
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: 0x00000010}
	return cmd.Start()
}
