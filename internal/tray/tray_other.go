//go:build !windows

package tray

func (i *Icon) show(string) error {
	return nil
}
