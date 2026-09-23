// Профиль «объём CDOPROF» — спайк производительности текущей модели хранения
// (ТЗ перехода с CDOPROF, §15.1 МГ-A3.1; позиция 3 очереди).
//
// ЗАЧЕМ. ТЗ называет слой хранения главным техническим блокером: домен живёт JSON-снимком на
// тенант, и на каждый запрос читаются ВСЕ строки тенанта. На 25 000 групп это утверждение
// должно стать ЧИСЛОМ — p95 по спискам и поиску — чтобы Фаза 1 (нормализованное хранение)
// начиналась с базы «до», с которой потом сравнят «после».
//
// Что меряем (§15.1): `GET /groups`, `GET /learners` (первая, вторая и дальняя страницы, с
// фильтром `q`) и `GET /search`. Порог — бюджет `apiP95Ms` из performance-budgets: p95 < 500 мс.
//
// Данные готовит `pnpm perf:synth` (отдельная база, тенант `tenant_demo`). Запуск:
//   TOKEN=$(curl -s -X POST "$BASE/auth/login" -H 'content-type: application/json' \
//     -H "x-tenant-id: tenant_demo" -d '{"login":"tenant_admin","password":"..."}' \
//     | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["accessToken"])')
//   k6 run -e BASE_URL=http://127.0.0.1:3091/api/v1 -e TENANT_ID=tenant_demo -e TOKEN=$TOKEN \
//          -e VUS=1 -e DURATION=60s infra/load/k6-cdoprof-volume.js   # одиночная задержка
//   k6 run … -e VUS=10 …                                              # очередь на тенант
//
// ВАЖНО: запросы одного тенанта бэкенд выполняет по очереди (`runExclusive`). Поэтому прогон
// с VUS=1 показывает цену одного запроса, а с VUS>1 — цену очереди; в отчёт идут оба.

import { check, sleep } from 'k6';
import http from 'k6/http';
import { Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3091/api/v1';
const TENANT_ID = __ENV.TENANT_ID || 'tenant_demo';
const TOKEN = __ENV.TOKEN || '';
const VUS = Number(__ENV.VUS || 1);
const DURATION = __ENV.DURATION || '60s';
// Бюджет `apiP95Ms` (packages/shared-types/src/performance-budgets.ts) — как ПРОВАЛ прогона.
const LIST_P95_MS = Number(__ENV.LIST_P95_MS || 500);

const groupsDuration = new Trend('groups_list_ms', true);
const learnersDuration = new Trend('learners_list_ms', true);
const searchDuration = new Trend('search_ms', true);

export const options = {
  scenarios: {
    volume: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION
    }
  },
  thresholds: {
    groups_list_ms: [`p(95)<${LIST_P95_MS}`],
    learners_list_ms: [`p(95)<${LIST_P95_MS}`],
    search_ms: [`p(95)<${LIST_P95_MS}`],
    http_req_failed: ['rate<0.01']
  }
};

const headers = {
  'x-tenant-id': TENANT_ID,
  authorization: TOKEN ? `Bearer ${TOKEN}` : '',
  accept: 'application/json'
};

/** Списки: первая страница — то, что открывают чаще всего; дальняя — цена пагинации в памяти. */
const GROUP_QUERIES = ['', '?page=2', '?page=400', '?q=2024-0'];
const LEARNER_QUERIES = ['', '?page=2', '?page=200', '?q=%D0%98%D0%B2%D0%B0'];
/** Поиск под ThrottlerGuard 120/мин — зовём не чаще одного раза за шесть итераций. */
const SEARCH_QUERIES = ['2024-0', '%D0%9F%D0%B5%D1%82%D1%80'];

const timed = (trend, path) => {
  const res = http.get(`${BASE_URL}${path}`, { headers, tags: { name: path.split('?')[0] } });
  trend.add(res.timings.duration);
  check(res, { 'ответ 200': (r) => r.status === 200 });
  return res;
};

export default function () {
  const iteration = __ITER;
  timed(groupsDuration, `/groups${GROUP_QUERIES[iteration % GROUP_QUERIES.length]}`);
  timed(learnersDuration, `/learners${LEARNER_QUERIES[iteration % LEARNER_QUERIES.length]}`);
  if (iteration % 6 === 0) {
    timed(searchDuration, `/search?q=${SEARCH_QUERIES[(iteration / 6) % SEARCH_QUERIES.length]}`);
  }
  sleep(0.2);
}

export function handleSummary(data) {
  const p = (name) => {
    const m = data.metrics[name];
    return m
      ? `p50 ${Math.round(m.values.med)} мс · p95 ${Math.round(m.values['p(95)'])} мс · max ${Math.round(m.values.max)} мс · n=${m.values.count}`
      : 'нет';
  };
  const failed = data.metrics.http_req_failed ? data.metrics.http_req_failed.values.rate : 0;
  const lines = [
    `Объём CDOPROF, VUS=${VUS}, ${DURATION}`,
    `  /groups   ${p('groups_list_ms')}`,
    `  /learners ${p('learners_list_ms')}`,
    `  /search   ${p('search_ms')}`,
    `  ошибок    ${(failed * 100).toFixed(2)} %`
  ];
  return { stdout: `${lines.join('\n')}\n` };
}
