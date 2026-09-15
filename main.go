package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app, err := NewApp("")
	if err != nil {
		log.Fatal(err)
	}

	err = wails.Run(&options.App{
		Title:             "SSH Tunnel Manager",
		Width:             820,
		Height:            540,
		MinWidth:          680,
		MinHeight:         460,
		BackgroundColour:  &options.RGBA{R: 18, G: 21, B: 27, A: 255},
		AssetServer:       &assetserver.Options{Assets: assets},
		OnStartup:         app.startup,
		OnShutdown:        app.shutdown,
		OnBeforeClose:     app.beforeClose,
		Bind:              []interface{}{app},
		SingleInstanceLock: &options.SingleInstanceLock{UniqueId: "4d5700b5-79c4-4c42-a55b-84418d4aa676"},
		Windows: &windows.Options{
			Theme:              windows.SystemDefault,
			DisablePinchZoom:   true,
			IsZoomControlEnabled: false,
		},
	})
	if err != nil {
		log.Fatal(err)
	}
}
