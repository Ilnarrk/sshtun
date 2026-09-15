# SSH Tunnel Manager

Компактное Windows-приложение для управления SSH SOCKS5-туннелями и локальными пробросами портов. Интерфейс написан на React, управление системным `ssh.exe` и хранение профилей — на Go, desktop-оболочка — Wails.

## Возможности

- несколько профилей подключения;
- SOCKS5-прокси через `ssh -D`;
- дополнительные локальные пробросы `ssh -L`;
- ключ, ssh-agent или стандартные ключи для фонового подключения;
- отдельный терминал для парольной авторизации;
- проверка фактического открытия локального порта;
- сворачиваемый журнал SSH;
- автоматическая миграция старого `%APPDATA%\SSHTunnelManager\profiles.json`.

## Разработка

Требуются Go 1.23+, Node.js 22+, Wails v2.14.0 и компонент Windows OpenSSH Client.

```powershell
go install github.com/wailsapp/wails/v2/cmd/wails@v2.14.0
wails doctor
wails dev
```

Проверки:

```powershell
go test ./...
cd frontend
npm install
npm test
npm run build
```

## Сборка Windows x64

Запустите `build_windows.bat`. Готовый exe появится в `build\bin`; bootstrapper WebView2 включается в сборку и предложит установить runtime, если его нет.

## Хранение данных

Профили сохраняются в `%APPDATA%\SSHTunnelManager\profiles.json`. При первом чтении конфигурации Python-версии создаётся `profiles.v1.backup.json`, затем профилям назначаются стабильные идентификаторы.
