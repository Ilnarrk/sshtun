//go:build windows

package tray

import (
	"errors"
	"runtime"
	"sync"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	wmApp            = 0x8000
	wmTray           = wmApp + 1
	wmClose          = 0x0010
	wmCommand        = 0x0111
	wmLButtonUp      = 0x0202
	wmLButtonDblClk  = 0x0203
	wmRButtonUp      = 0x0205
	nimAdd        = 0
	nimDelete     = 2
	nifMessage    = 0x00000001
	nifIcon       = 0x00000002
	nifTip        = 0x00000004
	idiApplication = 32512
	idcArrow      = 32512
	tpmRightAlign = 0x0008
	tpmBottomAlign = 0x0020
	tpmReturnCmd  = 0x0100
	mfString      = 0x0000
	menuShow      = 1
	menuQuit      = 2
)

var (
	user32   = windows.NewLazySystemDLL("user32.dll")
	shell32  = windows.NewLazySystemDLL("shell32.dll")
	kernel32 = windows.NewLazySystemDLL("kernel32.dll")

	procRegisterClassExW    = user32.NewProc("RegisterClassExW")
	procCreateWindowExW     = user32.NewProc("CreateWindowExW")
	procDefWindowProcW      = user32.NewProc("DefWindowProcW")
	procGetMessageW         = user32.NewProc("GetMessageW")
	procTranslateMessage    = user32.NewProc("TranslateMessage")
	procDispatchMessageW    = user32.NewProc("DispatchMessageW")
	procPostQuitMessage     = user32.NewProc("PostQuitMessage")
	procDestroyWindow       = user32.NewProc("DestroyWindow")
	procLoadIconW           = user32.NewProc("LoadIconW")
	procLoadCursorW         = user32.NewProc("LoadCursorW")
	procCreatePopupMenu     = user32.NewProc("CreatePopupMenu")
	procAppendMenuW         = user32.NewProc("AppendMenuW")
	procTrackPopupMenu      = user32.NewProc("TrackPopupMenu")
	procDestroyMenu         = user32.NewProc("DestroyMenu")
	procSetForegroundWindow = user32.NewProc("SetForegroundWindow")
	procGetCursorPos        = user32.NewProc("GetCursorPos")
	procPostMessageW        = user32.NewProc("PostMessageW")
	procShellNotifyIconW    = shell32.NewProc("Shell_NotifyIconW")
	procGetModuleHandleW    = kernel32.NewProc("GetModuleHandleW")
)

type wndClassEx struct {
	Size       uint32
	Style      uint32
	WndProc    uintptr
	ClsExtra   int32
	WndExtra   int32
	Instance   windows.Handle
	Icon       windows.Handle
	Cursor     windows.Handle
	Background windows.Handle
	MenuName   *uint16
	ClassName  *uint16
	IconSm     windows.Handle
}

type notifyIconData struct {
	Size            uint32
	Wnd             windows.HWND
	ID              uint32
	Flags           uint32
	CallbackMessage uint32
	Icon            windows.Handle
	Tip             [128]uint16
	State           uint32
	StateMask       uint32
	Info            [256]uint16
	Timeout         uint32
	InfoTitle       [64]uint16
	InfoFlags       uint32
	GUID            windows.GUID
	BalloonIcon     windows.Handle
}

type point struct {
	X int32
	Y int32
}

type msg struct {
	HWnd    windows.HWND
	Message uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	Pt      point
}

var (
	classOnce sync.Once
	classAtom uintptr
	current   *Icon
)

func (i *Icon) show(tooltip string) error {
	if i.stop != nil {
		return nil
	}
	ready := make(chan error, 1)
	go func() {
		runtime.LockOSThread()
		err := i.run(tooltip, ready)
		if err != nil {
			select {
			case ready <- err:
			default:
			}
		}
	}()
	return <-ready
}

func (i *Icon) run(tooltip string, ready chan error) error {
	classOnce.Do(func() {
		className, _ := syscall.UTF16PtrFromString("SSHTunnelManagerTray")
		hInstance, _, _ := procGetModuleHandleW.Call(0)
		hIcon, _, _ := procLoadIconW.Call(hInstance, uintptr(1))
		if hIcon == 0 {
			hIcon, _, _ = procLoadIconW.Call(0, uintptr(idiApplication))
		}
		hCursor, _, _ := procLoadCursorW.Call(0, uintptr(idcArrow))
		wndClass := wndClassEx{
			WndProc:   syscall.NewCallback(wndProc),
			Instance:  windows.Handle(hInstance),
			Icon:      windows.Handle(hIcon),
			Cursor:    windows.Handle(hCursor),
			ClassName: className,
			IconSm:    windows.Handle(hIcon),
		}
		wndClass.Size = uint32(unsafe.Sizeof(wndClass))
		atom, _, _ := procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wndClass)))
		classAtom = atom
	})
	if classAtom == 0 {
		ready <- errors.New("не удалось зарегистрировать класс окна трея")
		return errors.New("не удалось зарегистрировать класс окна трея")
	}

	hInstance, _, _ := procGetModuleHandleW.Call(0)
	hwnd, _, err := procCreateWindowExW.Call(
		0,
		classAtom,
		0,
		0,
		0, 0, 0, 0,
		^uintptr(2),
		0,
		hInstance,
		0,
	)
	if hwnd == 0 {
		ready <- err
		return err
	}
	window := windows.HWND(hwnd)

	hIcon, _, _ := procLoadIconW.Call(hInstance, uintptr(1))
	if hIcon == 0 {
		hIcon, _, _ = procLoadIconW.Call(0, uintptr(idiApplication))
	}

	nid := notifyIconData{
		Wnd:             window,
		ID:              1,
		Flags:           nifMessage | nifIcon | nifTip,
		CallbackMessage: wmTray,
		Icon:            windows.Handle(hIcon),
	}
	nid.Size = uint32(unsafe.Sizeof(nid))
	copy(nid.Tip[:], syscall.StringToUTF16(tooltip))
	r, _, notifyErr := procShellNotifyIconW.Call(nimAdd, uintptr(unsafe.Pointer(&nid)))
	if r == 0 {
		_, _, _ = procDestroyWindow.Call(hwnd)
		ready <- notifyErr
		return notifyErr
	}

	i.stop = func() {
		_, _, _ = procPostMessageW.Call(hwnd, wmClose, 0, 0)
	}
	current = i
	ready <- nil

	var message msg
	for {
		ret, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&message)), 0, 0, 0)
		if int32(ret) <= 0 {
			break
		}
		_, _, _ = procTranslateMessage.Call(uintptr(unsafe.Pointer(&message)))
		_, _, _ = procDispatchMessageW.Call(uintptr(unsafe.Pointer(&message)))
	}

	_, _, _ = procShellNotifyIconW.Call(nimDelete, uintptr(unsafe.Pointer(&nid)))
	_, _, _ = procDestroyWindow.Call(hwnd)
	if current == i {
		current = nil
	}
	return nil
}

func wndProc(hwnd windows.HWND, msg uint32, wParam, lParam uintptr) uintptr {
	i := current
	if i == nil {
		ret, _, _ := procDefWindowProcW.Call(uintptr(hwnd), uintptr(msg), wParam, lParam)
		return ret
	}
	switch msg {
	case wmTray:
		switch lParam {
		case wmLButtonUp, wmLButtonDblClk:
			if i.onShow != nil {
				i.onShow()
			}
		case wmRButtonUp:
			i.showMenu(hwnd)
		}
		return 0
	case wmClose:
		_, _, _ = procPostQuitMessage.Call(0)
		return 0
	case wmCommand:
		switch uint16(wParam) {
		case menuShow:
			if i.onShow != nil {
				i.onShow()
			}
		case menuQuit:
			if i.onQuit != nil {
				i.onQuit()
			}
		}
		return 0
	}
	ret, _, _ := procDefWindowProcW.Call(uintptr(hwnd), uintptr(msg), wParam, lParam)
	return ret
}

func (i *Icon) showMenu(hwnd windows.HWND) {
	menu, _, _ := procCreatePopupMenu.Call()
	if menu == 0 {
		return
	}
	defer procDestroyMenu.Call(menu)

	showText, _ := syscall.UTF16PtrFromString("Показать")
	quitText, _ := syscall.UTF16PtrFromString("Выход")
	_, _, _ = procAppendMenuW.Call(menu, mfString, menuShow, uintptr(unsafe.Pointer(showText)))
	_, _, _ = procAppendMenuW.Call(menu, mfString, menuQuit, uintptr(unsafe.Pointer(quitText)))

	var cursor point
	_, _, _ = procGetCursorPos.Call(uintptr(unsafe.Pointer(&cursor)))
	_, _, _ = procSetForegroundWindow.Call(uintptr(hwnd))
	cmd, _, _ := procTrackPopupMenu.Call(
		menu,
		tpmRightAlign|tpmBottomAlign|tpmReturnCmd,
		uintptr(cursor.X),
		uintptr(cursor.Y),
		0,
		uintptr(hwnd),
		0,
	)
	if cmd == menuShow && i.onShow != nil {
		i.onShow()
	}
	if cmd == menuQuit && i.onQuit != nil {
		i.onQuit()
	}
}
