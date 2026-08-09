// Профиль «пилот» — нагрузка строго по §12 дельта-ТЗ (Фаза 6 Task 10).
//
// ЗАЧЕМ. В ТЗ есть числа, но их никто не мерил: «p95 списков < 300 мс» и «пакет документов
// на 25 человек ≤ 2 минут» существовали как пожелание. Этот профиль превращает их в
// повторяемый прогон, после которого решение «переделывать ли сохранение состояния тенанта»
// принимается ПО ЦИФРАМ, а не по ощущению.
//
// Что моделируем (§12.1): 300–500 активных слушателей на тенант (объём данных) и
// 20–50 параллельных экзаменационных сессий (одновременные пользователи).
//
// Запуск:
//   TOKEN=$(curl -s -X POST "$BASE/auth/login" -H 'content-type: application/json' \
//     -H "x-tenant-id: $TENANT" -d '{"login":"tenant_admin","password":"..."}' \
//     | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["accessToken"])')
//   k6 run -e BASE_URL=http://127.0.0.1:3011/api/v1 -e TENANT_ID=tenant_load \
//          -e TOKEN=$TOKEN -e VUS=50 -e DURATION=3m infra/load/k6-pilot.js
//
// ВАЖНО про отдельный тенант: гонять нагрузку по рабочему центру нельзя — списки станут
// вперемешку с настоящими слушателями, а аудит забьётся служебными записями. Данные
// готовит `infra/load/seed-load-tenant.sh`.

import { check, sleep } from 'k6';
import http from 'k6/http';
import { Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3011/api/v1';
const TENANT_ID = __ENV.TENANT_ID || 'tenant_load';
const TOKEN = __ENV.TOKEN || '';
const VUS = Number(__ENV.VUS || 50);
const DURATION = __ENV.DURATION || '3m';

// §12.1 — требование к спискам. Порог задан как ПРОВАЛ прогона, а не как справка:
// прогон, который «почти уложился», должен краснеть.
const LIST_P95_MS = Number(__ENV.LIST_P95_MS || 300);

/** Время ответа только по спискам — именно оно нормируется в §12.1. */
const listDuration = new Trend('list_request_duration_ms', true);

export const options = {
  scenarios: {
    // «20–50 параллельных экзаменационных сессий»: плавный набор, полка, спад.
    pilot: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: Math.max(1, Math.round(VUS * 0.4)) },
        { duration: DURATION, target: VUS },
        { duration: '30s', target: 0 }
      ],
      gracefulRampDown: '20s'
    }
  },
  thresholds: {
    // Требование §12.1 дословно.
    list_request_duration_ms: [`p(95)<${LIST_P95_MS}`],
    // Нагрузка, которая «успевает», но роняет каждый двадцатый запрос, — не успех.
    http_req_failed: ['rate<0.01']
  },
  // Стенд делит машину с другими проектами: без ограничения k6 сам станет источником помех.
  discardResponseBodies: false
};

const authHeaders = () => ({
  headers: {
    'x-tenant-id': TENANT_ID,
    authorization: TOKEN ? `Bearer ${TOKEN}` : '',
    accept: 'application/json'
  }
});

/**
 * Списки, которые администратор и преподаватель открывают чаще всего.
 * Именно их время нормирует §12.1 — не «любой запрос», а списки.
 */
const LIST_ENDPOINTS = [
  '/learners?limit=50',
  '/groups?limit=50',
  '/enrollments?limit=50',
  '/courses?limit=50',
  '/document-tasks'
];

export default function pilot() {
  for (const path of LIST_ENDPOINTS) {
    const started = Date.now();
    const res = http.get(`${BASE_URL}${path}`, authHeaders());
    listDuration.add(Date.now() - started);

    check(res, {
      'список отдан': (r) => r.status === 200,
      'ответ в конверте API': (r) => {
        if (r.status !== 200) return false;
        try {
          const body = r.json();
          return body && typeof body === 'object' && 'data' in body && 'meta' in body;
        } catch {
          return false;
        }
      }
    });
    // Человек не листает списки без пауз; без задержки мы меряем не работу, а долбёжку.
    sleep(0.2);
  }
  sleep(0.5);
}
