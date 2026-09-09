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
 * Что делает: заходит под каждой указанной ролью, открывает КАЖДУЮ страницу приложения,
 * собирает исключения браузера, неудачные запросы и видимый текст. Ошибка на любой странице —
 * повод разбираться.
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
import { existsSync, readdirSync, statSync } from 'node:fs';
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
 * Порт двери обязан совпадать с тем, под который СОБРАНА витрина: адрес сервера зашивается
 * в неё на сборке. Разошлись — страницы откроются, а сессия не поднимется.
 */
const DOOR_PORT = Number(arg('door', '3211'));
const WAIT_MS = Number(arg('wait', '3000'));
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
      const up = request(
        {
          hostname: target.hostname,
          port: target.port,
          path: req.url,
          method: req.method,
          headers: req.headers
        },
        (r) => {
          res.writeHead(r.statusCode ?? 502, r.headers);
          r.pipe(res);
        }
      );
      up.on('error', () => {
        res.writeHead(502);
        res.end('door error');
      });
      req.pipe(up);
    });
    server.listen(DOOR_PORT, '127.0.0.1', () => resolve(server));
  });

const cdp = (ws) => {
  let seq = 0;
  const pending = new Map();
  let events = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result);
      pending.delete(msg.id);
    } else if (msg.method) events.push(msg);
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
    }
  };
};

const door = await startDoor();
const BASE = `http://127.0.0.1:${DOOR_PORT}`;

const routes = routesFromDisk(APP_DIR).sort();
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
const { send, take } = cdp(ws);
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
      domain: '127.0.0.1',
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
    if (/Роль:/.test(shown)) sessionSeen = true;
    if (errors.length) {
      bad += 1;
      console.log(`  ✗ ${route}\n      экран: ${shown.slice(0, 140)}\n      ошибка: ${errors[0]}`);
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
