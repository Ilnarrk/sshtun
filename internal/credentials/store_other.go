//go:build !windows

package credentials

import "errors"

var unsupported = errors.New("хранение паролей поддерживается только в Windows")

func SetPassword(profileID, password string) error {
	return unsupported
}

func GetPassword(profileID string) (string, error) {
	return "", unsupported
}

func DeletePassword(profileID string) error {
	return unsupported
}

func HasPassword(profileID string) bool {
	return false
}
