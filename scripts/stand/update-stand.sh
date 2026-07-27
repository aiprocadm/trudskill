#!/usr/bin/env bash
# Автообновление тестового стенда до свежей ветки main (docs/RUNBOOK_TEST_STAND.md).
#
# Стенд работает из ОТДЕЛЬНОЙ копии репозитория, а не из рабочей папки разработки:
# иначе соседняя сессия своей обычной работой (сборка, смена ветки, установка
# зависимостей) оставляет стенд без рабочих артефактов. На этом сервере такое
# уже приводило к простою в несколько суток, причём внешне выглядело сетевой
# проблемой.
#
# У стенда ВСЁ своё и с разработкой не пересекается: своя база, свой номер базы
# Redis, своя точка обмена очереди, свой бакет хранилища, свои секреты подписи
# токенов и свои порты. Всё задано в apps/backend/.env и apps/realtime/.env
# копии — эти файлы в git не хранятся и скриптом не трогаются.
#
# Главный принцип: стенд НИКОГДА не остаётся без рабочей витрины. Перед
# пересборкой снимается копия .next, и при любой осечке всё откатывается
# на предыдущее рабочее состояние, а службы не трогаются.
#
# Зависимости: git, pnpm (через corepack), flock, systemd.
# sudo НЕ нужен: службы объявлены с User=aiproc, поэтому перезапуск делается
# сигналом своим же процессам, а Restart=always поднимет их обратно.
#
# Env:
#   STAND_DIR       — папка отдельной копии (default /home/aiproc/stands/trudskill)
#   STAND_BRANCH    — какую ветку показывать (default main)
#   STAND_UNITS     — службы (default "lms-backend lms-realtime lms-frontend")
#   STAND_LOG       — журнал обновлений (default <STAND_DIR>/../logs/lms-update.log)
#   STAND_NODE_BIN  — папка с node/pnpm (default /home/aiproc/.nvm/versions/node/v24.18.0/bin)
#
# Установка в cron (пользователь, от которого работают службы; НЕ root):
#   */10 * * * * /home/aiproc/stands/trudskill/scripts/stand/update-stand.sh
#
# Нового коммита нет — скрипт молча выходит. Ручной запуск безопасен.

# ВАЖНО: здесь намеренно НЕ `set -e`. Скрипт обязан сам перехватывать ошибки
# каждого шага и делать откат, а не умирать на первой из них.
set -uo pipefail

STAND_DIR="${STAND_DIR:-/home/aiproc/stands/trudskill}"
STAND_BRANCH="${STAND_BRANCH:-main}"
STAND_UNITS="${STAND_UNITS:-lms-backend lms-realtime lms-frontend}"
STAND_LOG="${STAND_LOG:-$(dirname "$STAND_DIR")/logs/lms-update.log}"
STAND_NODE_BIN="${STAND_NODE_BIN:-/home/aiproc/.nvm/versions/node/v24.18.0/bin}"

# Скрипт лежит ВНУТРИ той самой копии, которую сам же перезаписывает через
# `git reset --hard`. Bash дочитывает файл по ходу выполнения, поэтому подмена
# файла на середине приводит к непредсказуемому поведению. Поэтому первым делом
# переезжаем на временную копию себя и работаем уже с неё.
if [[ "${STAND_SELF_EXEC:-}" != "1" ]]; then
    self_copy="$(mktemp)" || exit 1
    cp "$0" "$self_copy" || { rm -f "$self_copy"; exit 1; }
    chmod +x "$self_copy"
    STAND_SELF_EXEC=1 exec "$self_copy" "$@"
fi
# Удаляем временную копию сразу: файл уже открыт, и Linux даст дочитать его
# до конца по существующему дескриптору, а мусор после себя мы не оставим.
rm -f "$0"

export PATH="$STAND_NODE_BIN:$PATH"
mkdir -p "$(dirname "$STAND_LOG")"

log() { echo "$(date '+%F %T') $*" >>"$STAND_LOG"; }

# Сборка монорепо длится дольше, чем промежуток между запусками по расписанию.
exec 9>"${STAND_DIR}.update.lock"
if ! flock -n 9; then
    log "предыдущее обновление ещё идёт — пропускаю этот запуск"
    exit 0
fi

cd "$STAND_DIR" || { log "ОШИБКА: нет папки $STAND_DIR"; exit 1; }

if ! git fetch --depth=1 origin "$STAND_BRANCH" --quiet 2>>"$STAND_LOG"; then
    log "ОШИБКА: не удалось получить обновления с GitHub"
    exit 1
fi

prev="$(git rev-parse HEAD)"
target="$(git rev-parse "origin/$STAND_BRANCH")"

if [[ "$prev" == "$target" ]]; then
    exit 0   # нового кода нет — обычный случай, молчим
fi

log "новый код ${prev:0:8} -> ${target:0:8}, начинаю обновление"

# Снимок рабочей витрины — страховка на случай неудачи.
rm -rf apps/frontend/.next.bak
[[ -d apps/frontend/.next ]] && cp -a apps/frontend/.next apps/frontend/.next.bak

rollback() {
    log "ОТКАТ: возвращаю предыдущую рабочую версию ${prev:0:8}"
    git reset --hard "$prev" --quiet 2>>"$STAND_LOG"
    if [[ -d apps/frontend/.next.bak ]]; then
        rm -rf apps/frontend/.next
        mv apps/frontend/.next.bak apps/frontend/.next
    fi
    log "откат завершён, стенд продолжает работать на старой версии"
}

lock_before="$(md5sum pnpm-lock.yaml 2>/dev/null | cut -d' ' -f1)"

if ! git reset --hard "$target" --quiet 2>>"$STAND_LOG"; then
    log "ОШИБКА: не удалось переключить код"
    rollback
    exit 1
fi

lock_after="$(md5sum pnpm-lock.yaml 2>/dev/null | cut -d' ' -f1)"

# Зависимости переустанавливаем только если список реально изменился.
if [[ "$lock_before" != "$lock_after" ]]; then
    log "изменился pnpm-lock.yaml — переустанавливаю зависимости"
    if ! pnpm install --frozen-lockfile >>"$STAND_LOG" 2>&1; then
        log "ОШИБКА: не встали зависимости"
        rollback
        exit 1
    fi
fi

if ! pnpm build >>"$STAND_LOG" 2>&1; then
    log "ОШИБКА: не собралось"
    rollback
    exit 1
fi

# Сборка Next.js в режиме standalone НЕ копирует статику и public внутрь
# автономного сервера — без этого шага страницы приедут без стилей и картинок.
if [[ -d apps/frontend/.next/standalone/apps/frontend ]]; then
    rm -rf apps/frontend/.next/standalone/apps/frontend/.next/static
    cp -a apps/frontend/.next/static apps/frontend/.next/standalone/apps/frontend/.next/static
    if [[ -d apps/frontend/public ]]; then
        rm -rf apps/frontend/.next/standalone/apps/frontend/public
        cp -a apps/frontend/public apps/frontend/.next/standalone/apps/frontend/public
    fi
else
    log "ОШИБКА: сборка не дала автономного сервера витрины"
    rollback
    exit 1
fi

rm -rf apps/frontend/.next.bak

# Миграции базы применяются самим сервером при старте (DB_MIGRATIONS_ENABLED),
# отдельного шага не нужно. База у стенда своя, разработку это не заденет.
for unit in $STAND_UNITS; do
    main_pid="$(systemctl show -p MainPID --value "$unit" 2>/dev/null)"
    if [[ -n "$main_pid" && "$main_pid" != "0" ]]; then
        kill "$main_pid" 2>>"$STAND_LOG"
    else
        # Безобидно: служба сейчас в паузе перезапуска и стартует уже с новым кодом.
        log "ПРЕДУПРЕЖДЕНИЕ: не нашёл процесс службы $unit, перезапуск пропущен"
    fi
done

log "готово: стенд обновлён до ${target:0:8} — $(git log -1 --format='%s' | head -c 80)"
