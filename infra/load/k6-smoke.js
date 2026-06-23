// CDOProf — k6 load/smoke harness (Phase 11 «Нагрузочное тестирование»).
//
// Status: v1 has NO agreed numeric SLA (see docs/NFR_LAUNCH_V1.md) — so by default this script
// runs as a light smoke/ramp with LENIENT thresholds. When the customer agrees concurrency +
// latency targets, set THRESHOLD_P95_MS / THRESHOLD_ERROR_RATE (or edit `options.thresholds`)
// and record the run results back in NFR_LAUNCH_V1.md.
//
// Run:
//   k6 run -e BASE_URL=https://app.example.ru infra/load/k6-smoke.js                 // unauth smoke
//   k6 run -e BASE_URL=... -e TENANT_ID=tenant_demo -e TOKEN=<jwt> infra/load/k6-smoke.js  // + authed reads
//   k6 run -e VUS=50 -e DURATION=5m -e THRESHOLD_P95_MS=800 ... infra/load/k6-smoke.js      // ramped + SLA
//
// The harness only exercises READ + liveness endpoints — it never mutates data, so it is safe to
// point at a staging deployment seeded with the pilot tenant.

import { check, sleep } from 'k6';
import http from 'k6/http';
import { Rate } from 'k6/metrics';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3001').replace(/\/+$/, '');
const API_PREFIX = __ENV.API_PREFIX || '/api/v1';
const TOKEN = __ENV.TOKEN || '';
const TENANT_ID = __ENV.TENANT_ID || '';
const VUS = Number(__ENV.VUS || 10);
const DURATION = __ENV.DURATION || '30s';

// Optional SLA gates — only enforced when explicitly provided (v1 has none by default).
const thresholds = {};
if (__ENV.THRESHOLD_P95_MS) {
  thresholds['http_req_duration'] = [`p(95)<${Number(__ENV.THRESHOLD_P95_MS)}`];
}
thresholds['errors'] = [`rate<${Number(__ENV.THRESHOLD_ERROR_RATE || 0.05)}`];

export const options = {
  scenarios: {
    ramp: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '10s', target: VUS },
        { duration: DURATION, target: VUS },
        { duration: '10s', target: 0 }
      ]
    }
  },
  thresholds
};

const errorRate = new Rate('errors');

function url(path) {
  return `${BASE_URL}${API_PREFIX}${path}`;
}

function authedHeaders() {
  if (!TOKEN || !TENANT_ID) return null;
  return {
    Authorization: `Bearer ${TOKEN}`,
    // TenantGuard requires the header to match the JWT tenant claim.
    'x-tenant-id': TENANT_ID
  };
}

export default function () {
  // 1) Liveness/readiness — no auth, always available.
  const ready = http.get(url('/health/ready'));
  check(ready, { 'health/ready 200': (r) => r.status === 200 });
  errorRate.add(ready.status !== 200);

  // 2) Representative authenticated READ (skipped unless TOKEN + TENANT_ID are supplied).
  const headers = authedHeaders();
  if (headers) {
    const summary = http.get(url('/workspace/summary'), { headers });
    check(summary, {
      'workspace/summary 200': (r) => r.status === 200,
      'envelope has data': (r) => {
        try {
          return typeof JSON.parse(r.body).data !== 'undefined';
        } catch {
          return false;
        }
      }
    });
    errorRate.add(summary.status >= 400);
  }

  sleep(1);
}
