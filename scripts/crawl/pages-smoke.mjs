#!/usr/bin/env node
/**
 * Обход всех страниц приложения браузером: что человек РЕАЛЬНО видит.
 *
 * Зачем это отдельным инструментом. Экраны рисуются в браузере, поэтому ни тесты (в наборе
 * нет ни браузера, ни монтирования компонентов — `RISK-002`), ни ответы сервера не показывают
 * падение отрисовки. Так дважды доходило до владельца: на карточке курса красный экран
 * «map is not a function» (журнал 379) и пятисотка на публичной проверке документа (журнал
 * 380). Оба раза сервер был здоров, журналы чисты, а страница — сломана.
 *
 * Что делает: заходит под каждой указанной ролью, открывает КАЖДУЮ страницу приложения и
 * собирает две вещи:
 *   * исключения браузера — страница упала при отрисовке;
 *   * ОТКАЗЫ ЗАПРОСОВ — сервер ответил ошибкой, даже если экран не упал.
 *
 * Второе добавлено 09.09.2026 и добавлено не зря: публичная проверка документа отвечала
 * пятисоткой на каждом обращении, а страница при этом честно рисовала сообщение об ошибке —
 * исключения не было, и первая редакция обхода её не замечала (журнал 380).
 *
 * С флагом `--click` дополнительно НАЖИМАЕТ кнопки на каждой странице — так находятся
 * падения, которые случаются при открытии окон и панелей, а не при загрузке.
 *
 * Почему это безопасно. На время нажатий все ИЗМЕНЯЮЩИЕ запросы (POST/PUT/PATCH/DELETE)
 * блокируются на сетевом уровне: до сервера они не доходят. Поэтому нажать можно что угодно —
 * ничего не удалится и не выпустится. Считаются только падения; сообщения об ошибке,
 * вызванные самой блокировкой, ошибкой не считаются — их там ждать и надо.
 *
 * Чего НЕ делает: не проверяет вёрстку, смысл и права. Это дымовая проверка «страница
 * открывается и не падает», а не приёмка.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * ПОДГОТОВКА (один раз) и ЗАПУСК — в `docs/RUNBOOK_PAGE_CRAWL.md`. Коротко:
 *
 *   node scripts/crawl/pages-smoke.mjs --app http://127.0.0.1:3210 \
 *     --api http://127.0.0.1:3011/api/v1 --roles tenant_admin,learner
 *
 * ⚠️ Витрина и сервер обязаны быть видны браузеру ОДНИМ адресом. В песочнице разработки
 * браузер видит не все локальные порты, поэтому скрипт сам поднимает «одну дверь» (прокси):
 * `/api` и `/realtime` уходят на сервер, остальное — на витрину. Сборка витрины должна быть
 * сделана с адресом этой двери — иначе страницы застрянут на «Проверяем сессию…».
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};

const APP = arg('app', 'http://127.0.0.1:3210');
const API = arg('api', 'http://127.0.0.1:3011/api/v1');
const ROLES = arg('roles', 'tenant_admin')
  .split(',')
  .map((r) => r.trim())
  .filter(Boolean);
const TENANT = arg('tenant', 'tenant_demo');
const PASSWORD = arg('password', 'Password123!');
/*
 * Дверь встаёт НА ТОТ ЖЕ адрес, который витрина зовёт по умолчанию (`localhost:3001` из
 * `.env.local`). Тогда пересобирать её не нужно вовсе: обычная сборка сама придёт в дверь, а
 * страница и сервер окажутся на одном источнике — и запрет чужого источника не мешает.
 *
 * Прежняя редакция требовала собирать витрину под порт двери. Это ловушка: сборку легко
 * забыть, и обход молча показывает форму входа вместо экранов.
 */
const DOOR_PORT = Number(arg('door', '3001'));
const WAIT_MS = Number(arg('wait', '3000'));
const CLICK = process.argv.includes('--click');
/** Печатать видимый текст каждой страницы: нужно, когда обход «ничего не нашёл» и это подозрительно. */
const VERBOSE = process.argv.includes('--verbose');
/* Больше шести кнопок на страницу — это уже не дымовая проверка, а полдня ожидания. */
const MAX_BUTTONS = Number(arg('buttons', '6'));
const CHROME = arg(
  'chrome',
  `${process.env.HOME}/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome`
);
const APP_DIR = arg('app-dir', 'apps/frontend/app');

if (!existsSync(CHROME)) {
  console.error(
    `Браузер не найден: ${CHROME}\nСм. docs/RUNBOOK_PAGE_CRAWL.md — установка без прав администратора.`
  );
  process.exit(1);
}

/** Все маршруты приложения — из файлов страниц, а не из списка, который забудут обновить. */
const routesFromDisk = (dir, prefix = '', acc = []) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      routesFromDisk(full, `${prefix}/${entry}`, acc);
    } else if (entry === 'page.tsx') {
      acc.push(prefix === '' ? '/' : prefix);
    }
  }
  return acc;
};

/**
 * Настоящие коды записей для адресов вида `/courses/[id]`.
 *
 * Без них проверялись бы только экраны «не найдено» — а падают обычно как раз страницы с
 * данными. Чего нет в базе, то подставляется заведомо несуществующим кодом: экран «запись не
 * найдена» тоже обязан открываться.
 */
const SAMPLE_SOURCES = [
  ['courses', 'courses'],
  ['groups', 'groups'],
  ['learners', 'learners'],
  ['users', 'users'],
  ['commissions', 'commissions'],
  ['tests', 'tests'],
  ['question-banks', 'question-banks']
];

const firstId = async (path, token) => {
  try {
    const res = await fetch(`${API}/${path}?page_size=1`, {
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': TENANT }
    });
    if (!res.ok) return null;
    const body = await res.json();
    const data = body?.data;
    const items = Array.isArray(data) ? data : data?.items;
    return items?.[0]?.id ?? null;
  } catch {
    return null;
  }
};

const login = async (role) => {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tenant-id': TENANT },
    body: JSON.stringify({ login: role, password: PASSWORD })
  });
  if (!res.ok) return null;
  const body = await res.json();
  return { cookies: res.headers.getSetCookie(), token: body?.data?.accessToken ?? '' };
};

/** «Одна дверь»: браузер ходит только сюда, а внутрь смотрят и витрина, и сервер. */
const startDoor = () =>
  new Promise((resolve) => {
    const apiPrefix = new URL(API).pathname.replace(/\/v1$/, '');
    const server = createServer((req, res) => {
      const toApi = req.url.startsWith(apiPrefix) || req.url.startsWith('/realtime');
      const target = new URL(toApi ? API : APP);
      /*
       * `connection: close` и свой агент — не украшение. С переиспользованием соединений
       * дверь изредка отдавала 502 на живом сервере, и обход показывал ложные «ошибки»:
       * страница при этом честно уходила на форму входа, потому что сессия не обновилась.
       * Инструмент, который врёт даже изредка, перестают читать.
       */
      const up = request(
        {
          hostname: '127.0.0.1',
          port: target.port,
          path: req.url,
          method: req.method,
          headers: { ...req.headers, connection: 'close' },
          agent: false
        },
        (r) => {
          res.writeHead(r.statusCode ?? 502, r.headers);
          r.pipe(res);
        }
      );
      up.on('error', (error) => {
        console.log(`  ⚠ дверь не смогла передать запрос ${req.url}: ${String(error)}`);
        res.writeHead(502);
        res.end('door error');
      });
      req.pipe(up);
    });
    server.listen(DOOR_PORT, '127.0.0.1', () => resolve(server));
    server.on('error', (error) => {
      console.error(
        `Порт ${DOOR_PORT} занят (${String(error)}). Если там поднят сервер разработки — остановите его или укажите --door.`
      );
      process.exit(1);
    });
  });

const cdp = (ws) => {
  let seq = 0;
  const pending = new Map();
  const listeners = new Map();
  let events = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result);
      pending.delete(msg.id);
    } else if (msg.method) {
      const listener = listeners.get(msg.method);
      if (listener) listener(msg.params);
      events.push(msg);
    }
  };
  return {
    send: (method, params = {}) =>
      new Promise((res) => {
        const id = (seq += 1);
        pending.set(id, res);
        ws.send(JSON.stringify({ id, method, params }));
      }),
    take: () => {
      const out = events;
      events = [];
      return out;
    },
    onEvent: (method, handler) => listeners.set(method, handler)
  };
};

const door = await startDoor();
/* Именно `localhost`, а не `127.0.0.1`: витрина зовёт сервер так, и cookie должны совпасть. */
const BASE = `http://localhost:${DOOR_PORT}`;

const ROUTES_FILE = arg('routes', '');
const routes = ROUTES_FILE
  ? readFileSync(ROUTES_FILE, 'utf8').split('\n').filter(Boolean)
  : routesFromDisk(APP_DIR).sort();
console.log(`Страниц найдено: ${routes.length}. Роли: ${ROLES.join(', ')}. Дверь: ${BASE}`);

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--remote-debugging-port=9333',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--user-data-dir=/tmp/page-crawl-profile',
    'about:blank'
  ],
  { stdio: 'ignore' }
);
for (let i = 0; i < 60; i += 1) {
  try {
    await fetch('http://127.0.0.1:9333/json/version');
    break;
  } catch {
    await sleep(500);
  }
}
const targets = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
const { send, take, onEvent } = cdp(ws);
if (CLICK) {
  onEvent('Fetch.requestPaused', (params) => {
    const method = params.request.method.toUpperCase();
    /*
     * Вход и обновление сессии — тоже POST, но без них обход просто не состоится: человек
     * окажется на форме входа. Они пропускаются; всё остальное изменяющее — нет.
     */
    const isAuth = /\/auth\//.test(params.request.url);
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS' || isAuth) {
      void send('Fetch.continueRequest', { requestId: params.requestId });
    } else {
      /* Изменяющий запрос до сервера не доходит — ни одна запись не пострадает. */
      void send('Fetch.failRequest', {
        requestId: params.requestId,
        errorReason: 'BlockedByClient'
      });
    }
  });
}
await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');

let problems = 0;
for (const role of ROLES) {
  const auth = await login(role);
  if (!auth) {
    console.log(`\n### ${role}: войти не удалось — пропускаю`);
    problems += 1;
    continue;
  }

  const ids = new Map();
  for (const [key, path] of SAMPLE_SOURCES) {
    const id = await firstId(path, auth.token);
    if (id) ids.set(key, id);
  }
  const withIds = routes.map((r) =>
    r.replace(/\[[^\]]+\]/g, () => {
      const key = [...ids.keys()].find((k) => r.includes(`/${k}/`));
      return key ? ids.get(key) : 'нет-такой-записи';
    })
  );

  await send('Network.clearBrowserCookies');
  for (const raw of auth.cookies) {
    const [pair] = raw.split(';');
    const i = pair.indexOf('=');
    await send('Network.setCookie', {
      name: pair.slice(0, i).trim(),
      value: pair.slice(i + 1),
      domain: 'localhost',
      path: '/',
      url: BASE
    });
  }
  await send('Page.navigate', { url: `${BASE}/login` });
  await sleep(WAIT_MS);

  console.log(`\n### роль ${role}`);
  let bad = 0;
  let sessionSeen = false;
  for (const route of withIds) {
    take();
    await send('Page.navigate', { url: BASE + route });
    await sleep(WAIT_MS);
    const shown = String(
      (
        await send('Runtime.evaluate', {
          expression:
            'document.body ? document.body.innerText.replace(/\\s+/g," ").slice(0,200) : "(нет тела)"',
          returnByValue: true
        })
      ).result?.value ?? ''
    );
    const events = take();
    /*
     * Пятисотка — всегда наша беда. Отказ по правам (401/403) на чужой странице — наоборот,
     * правильное поведение, поэтому он в отдельном списке и не считается ошибкой: роль без
     * права просто не должна была сюда попасть, и её встречает экран «нет доступа».
     */
    const failed = events
      .filter((e) => e.method === 'Network.responseReceived')
      .map((e) => ({ status: e.params.response.status, url: String(e.params.response.url) }))
      .filter((r) => r.status >= 500 || (r.status >= 400 && ![401, 403, 404].includes(r.status)));
    const errors = [
      ...new Set(
        events
          .filter((e) => e.method === 'Runtime.exceptionThrown')
          .map((e) =>
            String(e.params.exceptionDetails?.exception?.description ?? '')
              .split('\n')[0]
              .slice(0, 150)
          )
      )
    ];
    if (VERBOSE) {
      console.log(`  · ${route} → ${shown.slice(0, 120)}`);
      for (const e of events.filter((x) => x.method === 'Network.responseReceived'))
        if (/api\//.test(e.params.response.url))
          console.log(
            `      ${e.params.response.status} ${e.params.response.url.replace(BASE, '')}`
          );
      const urls = new Map(
        events
          .filter((x) => x.method === 'Network.requestWillBeSent')
          .map((x) => [x.params.requestId, String(x.params.request.url)])
      );
      for (const e of events.filter((x) => x.method === 'Network.loadingFailed').slice(0, 4))
        console.log(`      НЕ ДОШЁЛ: ${e.params.errorText} ${urls.get(e.params.requestId) ?? ''}`);
    }
    if (/Роль:/.test(shown)) sessionSeen = true;
    if (CLICK) {
      /*
       * Перехват включается ТОЛЬКО на время нажатий и сразу выключается. Держать его весь
       * прогон нельзя: под него попадает и вход, и обновление сессии — обход просто не
       * состоится, а страницы окажутся на форме входа.
       */
      await send('Fetch.enable', { patterns: [{ urlPattern: `${BASE}/api/*` }] });
      const found = await send('Runtime.evaluate', {
        expression: `
          Array.from(document.querySelectorAll('button:not([disabled])'))
            .map((b) => (b.innerText || '').trim())
            .filter((t) => t && !/выйти|выход/i.test(t))
            .slice(0, ${MAX_BUTTONS})`,
        returnByValue: true
      });
      for (const label of found.result?.value ?? []) {
        take();
        /* Перед каждым нажатием страница открывается заново: состояние чистое. */
        await send('Page.navigate', { url: BASE + route });
        await sleep(WAIT_MS);
        await send('Runtime.evaluate', {
          expression: `
            (() => {
              const button = Array.from(document.querySelectorAll('button:not([disabled])'))
                .find((b) => (b.innerText || '').trim() === ${JSON.stringify(label)});
              if (button) button.click();
            })()`
        });
        await sleep(1500);
        const clickErrors = [
          ...new Set(
            take()
              .filter((e) => e.method === 'Runtime.exceptionThrown')
              .map((e) =>
                String(e.params.exceptionDetails?.exception?.description ?? '')
                  .split('\n')[0]
                  .slice(0, 150)
              )
          )
        ];
        if (clickErrors.length) {
          bad += 1;
          console.log(`  ✗ ${route} — нажатие «${label}»\n      падение: ${clickErrors[0]}`);
        }
      }
      await send('Fetch.disable');
    }

    if (errors.length || failed.length) {
      bad += 1;
      console.log(`  ✗ ${route}`);
      console.log(`      экран: ${shown.slice(0, 140)}`);
      if (errors[0]) console.log(`      падение: ${errors[0]}`);
      for (const r of [...new Map(failed.map((f) => [f.url, f])).values()].slice(0, 3)) {
        console.log(`      запрос отвечает ${r.status}: ${r.url.replace(BASE, '')}`);
      }
    }
  }

  /*
   * Страховка от «зелёного отчёта ни о чём»: если сессия так и не поднялась, все страницы
   * показывают «Проверяем сессию…» — и отсутствие ошибок не значит ровно ничего. Так уже
   * было дважды, пока не выяснилось, что браузер не видит порт сервера.
   */
  if (!sessionSeen) {
    console.log(
      '  ⚠ НИ ОДНА страница не показала роль: сессия не поднялась, обход недействителен.'
    );
    console.log('     Проверьте, что витрина собрана с адресом двери (см. runbook).');
    bad += 1;
  }
  console.log(`  итого: ${withIds.length} страниц, с ошибками ${bad}`);
  problems += bad;
}

ws.close();
chrome.kill();
door.close();
console.log(`\nВсего проблем: ${problems}`);
process.exit(problems > 0 ? 1 : 0);
