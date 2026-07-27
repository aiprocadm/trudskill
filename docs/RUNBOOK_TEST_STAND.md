# Runbook — тестовый стенд lms.ptsfera.online

**Owner**: ops / тех.лид
**Scope**: как устроен демо-стенд, как он сам обновляется до `main`, как поднять его с нуля и что проверять, когда «сайт не открывается».
**Контекст**: стенд нужен, чтобы смотреть результат разработки в браузере глазами пользователя и показывать его заказчику. Поэтому он не заморожен на релизе, а догоняет `main` автоматически. Это **не production**: данные тестовые.

---

## 1. Устройство

| Часть            | Где                                                   | Комментарий                                                                                         |
| ---------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Код стенда       | `/home/aiproc/stands/trudskill`                       | **Отдельная копия** репозитория, свои `node_modules`, свои env-файлы (chmod 600, в git НЕ хранятся) |
| Код разработки   | `/home/aiproc/projects/trudskill`                     | Отдан сессиям разработки целиком, стенда не касается                                                |
| Сервер           | служба `lms-backend` → `127.0.0.1:3011`               | NestJS, `User=aiproc`, `Restart=always`                                                             |
| Живые обновления | служба `lms-realtime` → `127.0.0.1:3012`              | Без неё витрина работает, но интерфейс не обновляется на лету                                       |
| Витрина          | служба `lms-frontend` → `127.0.0.1:3015`              | Next.js, автономный сервер (`output: standalone`)                                                   |
| Адрес            | `lms.ptsfera.online`                                  | basic-auth, логин `demo`, файл `/etc/nginx/.htpasswd-stand`                                         |
| Обновление       | cron `*/10 * * * *` → `scripts/stand/update-stand.sh` | Полный цикл ≈ 50 секунд                                                                             |

Образцы файлов: [`scripts/stand/`](../scripts/stand/) — скрипт обновления, юниты systemd, конфиг nginx.

**Один поддомен на проект:** витрина в корне, сервер под `/api`, живые обновления под `/realtime` — всё на одном домене, поэтому CORS не нужен.

### У стенда всё своё

Стенд не делит с разработкой **ничего**:

| Ресурс                  | Разработка             | Стенд                  |
| ----------------------- | ---------------------- | ---------------------- |
| Папка кода              | `~/projects/trudskill` | `~/stands/trudskill`   |
| База                    | `trudskill`            | **`trudskill_stand`**  |
| Redis                   | база `0`               | **база `3`**           |
| Точка обмена очереди    | `jobs.topic`           | **`jobs.stand.topic`** |
| Бакет хранилища         | `cdoprof-dev`          | **`cdoprof-stand`**    |
| Секреты подписи токенов | свои                   | **свои, другие**       |
| Порты                   | 3001 / 3002 / 3000     | **3011 / 3012 / 3015** |

Разные секреты — не формальность: токен, выданный стендом, не должен приниматься в разработке и наоборот.

### Почему копия отдельная

Стенд и разработка спорят за одни и те же артефакты сборки. Отладочный запуск, смена ветки или переустановка зависимостей соседней сессией оставляют стенд без рабочей витрины, и служба уходит в бесконечный цикл падений. **Это не теория: на этом сервере такое уже приводило к простою в несколько суток**, причём внешне выглядело сетевой проблемой и увело диагностику совсем не туда.

---

## 2. Как обновляется

`scripts/stand/update-stand.sh` (cron, каждые 10 минут, от пользователя `aiproc`, **без sudo**):

1. `git fetch` → нет нового коммита в `origin/main` → **молча выходит**.
2. Есть новый → снимок `apps/frontend/.next` как страховка.
3. `git reset --hard` → зависимости **только если** сменился `pnpm-lock.yaml` → `pnpm build`.
4. Докладывает статику и `public` внутрь автономного сервера витрины (сборка этого не делает — см. §4).
5. Успех → `kill` главных процессов трёх служб; systemd поднимет их с новым кодом.
6. **Любая осечка → откат**: код возвращается на прежний коммит, витрина восстанавливается из снимка, службы не трогаются, причина пишется в журнал.

Миграции базы применяет сам сервер при старте (`DB_MIGRATIONS_ENABLED`) — отдельного шага нет. База у стенда своя, разработку это не заденет.

**Скрипт переезжает на временную копию себя** перед `git reset --hard`: он лежит внутри той же копии, которую перезаписывает, а bash дочитывает файл по ходу выполнения.

### Команды на каждый день

```bash
tail -20 /home/aiproc/stands/logs/lms-update.log             # что и когда обновлялось
/home/aiproc/stands/trudskill/scripts/stand/update-stand.sh  # обновить сейчас, не ждать
```

Ручной запуск безопасен: если нового кода нет, скрипт ничего не делает.

`ПРЕДУПРЕЖДЕНИЕ: не нашёл процесс службы` в журнале — безобидно. Служба в этот момент была в паузе перезапуска и стартовала уже с новым кодом.

---

## 3. Развернуть с нуля

```bash
# 1. Своя база и свой бакет — стенд ничего не делит с разработкой
docker exec test-postgres psql -U testuser -d postgres -c "CREATE DATABASE trudskill_stand OWNER testuser"
docker exec infra-minio-1 sh -c 'mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" && mc mb --ignore-existing local/cdoprof-stand'

# 2. Отдельная копия кода
mkdir -p /home/aiproc/stands
git clone --depth=1 --branch main https://github.com/aiprocadm/trudskill.git /home/aiproc/stands/trudskill
cd /home/aiproc/stands/trudskill
export PATH=/home/aiproc/.nvm/versions/node/v24.18.0/bin:$PATH
pnpm install --frozen-lockfile

# 3. Настройки (в git не хранятся; секреты генерировать СВОИ: openssl rand -hex 32)
#    apps/backend/.env   — BACKEND_PORT=3011, DATABASE_URL на trudskill_stand,
#                          REDIS_URL с /3, JOB_EXCHANGE=jobs.stand.topic,
#                          S3_BUCKET=cdoprof-stand, свои AUTH_JWT_SECRET/SESSION_SECRET,
#                          CORS_ORIGIN и PUBLIC_BASE_URL на https://lms.ptsfera.online,
#                          MVP_PERSISTENCE_DRIVER=postgres, DOCUMENTS_PERSISTENCE_DRIVER=postgres,
#                          ALLOW_IN_MEMORY_STATE=false
#    apps/realtime/.env  — REALTIME_PORT=3012, BACKEND_PUBLIC_URL=http://127.0.0.1:3011,
#                          тот же REDIS_URL, тот же AUTH_JWT_SECRET и REALTIME_PUBLISH_KEY
#    apps/frontend/.env.local — NEXT_PUBLIC_API_BASE_URL=https://lms.ptsfera.online/api/v1
#                          NEXT_PUBLIC_REALTIME_URL=https://lms.ptsfera.online/realtime
chmod 600 apps/backend/.env apps/realtime/.env apps/frontend/.env.local

# 4. Сборка + доложить статику в автономный сервер витрины
pnpm build
cp -a apps/frontend/.next/static apps/frontend/.next/standalone/apps/frontend/.next/static
cp -a apps/frontend/public       apps/frontend/.next/standalone/apps/frontend/public

# 5. Службы
sudo cp scripts/stand/systemd/lms-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now lms-backend lms-realtime lms-frontend

# 6. Публикация
sudo cp scripts/stand/nginx/lms.ptsfera.online.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/lms.ptsfera.online.conf /etc/nginx/sites-enabled/
sudo htpasswd /etc/nginx/.htpasswd-stand demo     # пароль — из менеджера секретов
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d lms.ptsfera.online

# 7. Автообновление
crontab -l 2>/dev/null | { cat; \
  echo '*/10 * * * * /home/aiproc/stands/trudskill/scripts/stand/update-stand.sh'; } | crontab -
```

**После certbot** конфиг nginx нельзя перезаписывать целиком — только точечно (`sudo sed -i ...`), иначе дописанные им блоки 443 пропадут и HTTPS отвалится.

---

## 4. Грабли, на которые уже наступали

| Симптом                                                                   | Причина                                                                                                                                                                                                                                           | Лечение                                                                                                                                                   |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **После входа в приложение снова требует пароль nginx, войти невозможно** | Приложение кладёт токен в заголовок `Authorization`, а браузер держит там же пропуск basic-auth — карман один, токен вытесняет пропуск                                                                                                            | `auth_basic off;` в `location /api/` и `/realtime/` (уже в конфиге)                                                                                       |
| **`node apps/backend/dist/main.js` падает с `ERR_MODULE_NOT_FOUND`**      | ESM-пакеты монорепо (`api-contracts`, `shared-types`, `ui`, `test-utils`) компилируются с относительными импортами **без расширения** (`moduleResolution: Bundler`), а Node ESM такие не резолвит. **Тот же дефект ломает `CMD` в `Dockerfile`.** | Стенд запускает сервер через `tsx` (так же, как `pnpm dev`). Настоящее лечение — добавить `.js` к относительным импортам в этих пакетах; отдельная задача |
| **Сборка витрины падает: `ZodError: NEXT_PUBLIC_REALTIME_URL Required`**  | Схема требует ДВЕ переменные, не одну: `NEXT_PUBLIC_API_BASE_URL` и `NEXT_PUBLIC_REALTIME_URL`                                                                                                                                                    | Задать обе в `apps/frontend/.env.local`                                                                                                                   |
| **Страницы приезжают без стилей и картинок**                              | `next build` в режиме standalone не копирует `.next/static` и `public` внутрь автономного сервера                                                                                                                                                 | Копировать после каждой сборки (скрипт обновления это делает)                                                                                             |
| **`next start` ругается и работает не так**                               | В конфиге `output: standalone` — `next start` с ним несовместим                                                                                                                                                                                   | Запускать `node .next/standalone/apps/frontend/server.js`                                                                                                 |
| **Данные пропадают при каждом обновлении**                                | `MVP_PERSISTENCE_DRIVER=memory` — состояние живёт в памяти процесса                                                                                                                                                                               | На стенде `postgres` + `ALLOW_IN_MEMORY_STATE=false`                                                                                                      |
| **Не открывается в Chrome/Яндексе, хотя `curl` даёт честный 401**         | Кириллица в `auth_basic` — по RFC там только ASCII, браузер молча не показывает окно пароля                                                                                                                                                       | Realm только латиницей. Проверка: `curl -D - -H "Host: <домен>" -k https://127.0.0.1/ \| grep -i www-authenticate`                                        |

**Вход в приложение:** заголовок `x-tenant-id: tenant_demo`, поле **`login`** (не email), пользователи `platform_admin` / `tenant_admin` / `manager` / `methodist` / `learner`, пароль `Password123!`.

**Токен живёт 15 минут.** Отказ на защищённом роуте через некоторое время после входа — это протухший токен, а не поломка. На этом уже один раз ошибочно завели дефект: диагноз «токен отвергается из-за подмены секрета» **не подтвердился** при живой проверке.

---

## 5. «Сайт не открывается» — порядок диагностики

Проверять **снизу вверх**: сначала свои процессы, потом сеть. Обратный порядок однажды стоил суток разбирательства, а причина была на сервере.

```bash
ss -lnt | grep -E ':(3011|3012|3015)'         # 1. слушают ли порты
systemctl status lms-backend lms-frontend      # 2. строку Active: читать ЦЕЛИКОМ
journalctl -u lms-backend -n 50                # 3. что пишет при падении
curl -s http://127.0.0.1:3011/api/v1/health/ready   # 4. база, redis, очередь, хранилище
```

- **`systemctl is-active` ВРЁТ**: в цикле перезапусков отвечает `active`, хотя служба на самом деле `activating (auto-restart)`. Смотреть только полный `systemctl status`.
- **Быстрый разделитель «сервер или сеть»:** на сервере опубликовано несколько стендов, каждый своим процессом на своём порту. Если часть поддоменов открывается, а часть нет — виноват процесс: сетевая поломка положила бы все сразу.
- **Hairpin NAT не работает:** запрос с сервера на свой же внешний адрес даёт `код=000`. Это НЕ признак закрытого порта.
- **На сервере поднят локальный прокси** — всегда `curl --noproxy '*'`, иначе коды будут мусорные.

**Внешняя проверка** (WebFetch к этим доменам стабильно врёт «Socket is closed»):

```bash
curl --noproxy '*' -H "Accept: application/json" \
  "https://check-host.net/check-http?host=https%3A%2F%2Flms.ptsfera.online&max_nodes=4"
curl --noproxy '*' -H "Accept: application/json" \
  "https://check-host.net/check-result/<request_id>"
```

`401` от чужих машин = стенд работает и защищён паролем.

---

## 6. Что стенд НЕ показывает

- **Только влитую `main`.** Незалитая ветка на стенде не появится — под это нужен отдельный адрес и отдельная копия.
- **Задержка до ~11 минут** между мержем в `main` и появлением на стенде (10 минут расписания + ~50 секунд сборки). Кому надо сразу — ручной запуск скрипта.
- **Сломанный код в `main` стенд не уронит**, но и не покажет: он останется на прошлой рабочей версии, а причина будет в журнале обновлений.
