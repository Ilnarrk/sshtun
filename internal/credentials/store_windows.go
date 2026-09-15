//go:build windows

package credentials

import (
	"errors"
	"fmt"
	"syscall"
	"unsafe"
)

const targetPrefix = "SSHTunnelManager/"

var (
	advapi32   = syscall.NewLazyDLL("advapi32.dll")
	credWrite  = advapi32.NewProc("CredWriteW")
	credRead   = advapi32.NewProc("CredReadW")
	credDelete = advapi32.NewProc("CredDeleteW")
	credFree   = advapi32.NewProc("CredFree")
)

type nativeCredential struct {
	Flags              uint32
	Type               uint32
	TargetName         *uint16
	Comment            *uint16
	LastWritten        syscall.Filetime
	CredentialBlobSize uint32
	CredentialBlob     *byte
	Persist            uint32
	AttributeCount     uint32
	Attributes         uintptr
	TargetAlias        *uint16
	UserName           *uint16
}

func targetName(profileID string) string {
	return targetPrefix + profileID
}

func SetPassword(profileID, password string) error {
	if profileID == "" {
		return errors.New("не указан профиль")
	}
	target := syscall.StringToUTF16Ptr(targetName(profileID))
	blob := []byte(password)
	cred := nativeCredential{
		Type:               1,
		TargetName:         target,
		CredentialBlobSize: uint32(len(blob)),
		CredentialBlob:     &blob[0],
		Persist:            2,
	}
	r, _, err := credWrite.Call(uintptr(unsafe.Pointer(&cred)), 0)
	if r == 0 {
		return fmt.Errorf("не удалось сохранить пароль: %w", err)
	}
	return nil
}

func GetPassword(profileID string) (string, error) {
	if profileID == "" {
		return "", errors.New("не указан профиль")
	}
	target := syscall.StringToUTF16Ptr(targetName(profileID))
	var cred *nativeCredential
	r, _, err := credRead.Call(
		uintptr(unsafe.Pointer(target)),
		1,
		0,
		uintptr(unsafe.Pointer(&cred)),
	)
	if r == 0 {
		return "", fmt.Errorf("пароль не найден: %w", err)
	}
	defer credFree.Call(uintptr(unsafe.Pointer(cred)))
	if cred.CredentialBlobSize == 0 || cred.CredentialBlob == nil {
		return "", errors.New("пароль пуст")
	}
	data := unsafe.Slice(cred.CredentialBlob, cred.CredentialBlobSize)
	return string(data), nil
}

func DeletePassword(profileID string) error {
	if profileID == "" {
		return nil
	}
	target := syscall.StringToUTF16Ptr(targetName(profileID))
	r, _, err := credDelete.Call(uintptr(unsafe.Pointer(target)), 1, 0)
	if r == 0 {
		if errno, ok := err.(syscall.Errno); ok && errno == 1168 {
			return nil
		}
		return fmt.Errorf("не удалось удалить пароль: %w", err)
	}
	return nil
}

func HasPassword(profileID string) bool {
	_, err := GetPassword(profileID)
	return err == nil
}
