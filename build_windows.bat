@echo off
setlocal

where go >nul 2>nul || (echo Go 1.23+ is required. & exit /b 1)
where node >nul 2>nul || (echo Node.js is required. & exit /b 1)
where wails >nul 2>nul || (echo Install Wails: go install github.com/wailsapp/wails/v2/cmd/wails@v2.14.0 & exit /b 1)

call wails doctor || exit /b 1
call wails build -clean -platform windows/amd64 -webview2 embed || exit /b 1

echo Built: build\bin\SSH Tunnel Manager.exe
