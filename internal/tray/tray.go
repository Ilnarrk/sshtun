package tray

type Icon struct {
	onShow func()
	onQuit func()
	stop   func()
}

func New(onShow, onQuit func()) *Icon {
	return &Icon{onShow: onShow, onQuit: onQuit}
}

func (i *Icon) Show(tooltip string) error {
	return i.show(tooltip)
}

func (i *Icon) Hide() {
	if i.stop != nil {
		i.stop()
		i.stop = nil
	}
}
