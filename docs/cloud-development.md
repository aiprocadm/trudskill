# Облачная разработка (без установки Docker / Node на свой ПК)

Чтобы работать только в браузере или в удалённом окружении редактора (например **GitHub Codespaces**, **VS Code / Cursor** с **Dev Containers**), в репозитории настроен каталог [`.devcontainer/`](../.devcontainer/).

## Что происходит автоматически

- Поднимается контейнер **Node 22** с **pnpm** (официальный образ Dev Containers).
- Отдельными контейнерами поднимаются **PostgreSQL**, **Redis**, **RabbitMQ**, **MinIO** (+ инициализация бакета).
- После создания контейнера выполняется [`scripts/devcontainer-init.sh`](../scripts/devcontainer-init.sh): `pnpm install`, подготовка корневого `.env` под имена Docker-сервисов (`postgres`, `redis`, …).

## GitHub Codespaces

1. Откройте репозиторий на GitHub → **Code** → **Codespaces** → **Create codespace on main** (или нужную ветку).
2. После открытия терминала в codespace:  
   `pnpm dev:web`
3. Порты **3000**, **3001**, **3002** пробрасываются через панель «Ports»; скрипт при наличии переменных Codespaces создаёт `apps/frontend/.env.local` с публичными URL API и realtime.

## Cursor / VS Code локально, но с Docker только «внутри» Dev Container

Если на **Windows/macOS** установлен только **Docker Desktop** (или совместимый Docker), без отдельной установки Node на хост:

1. Установите расширение **Dev Containers** (в Cursor чаще всего совместимо с тем же workflow).
2. **Clone** репозиторий → **Open Folder**.
3. Команда палитры: **Dev Containers: Reopen in Container**.
4. Дождитесь сборки, затем в терминале контейнера:  
   `pnpm dev:web`

Приложения будут слушать порты внутри Dev Container; редактор пробросит их как при локальном запуске.

## Запуск приложения

Минимально для UI + API:

```bash
pnpm dev:web
```

Откройте в браузере порт **3000** (frontend); API — **3001** (`/api/v1`).

## Если что-то не поднимается

- Проверьте логи сборки Dev Container и наличие Docker на машине (для сценария Cursor/VS Code не в Codespaces).
- Убедитесь, что выполнился `pnpm install` и скрипт `scripts/devcontainer-init.sh` без ошибки (см. вывод **postCreate**).
