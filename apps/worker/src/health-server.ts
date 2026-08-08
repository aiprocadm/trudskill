import { type Server, createServer } from 'node:http';

/**
 * Служебная ручка воркера: «жив ли он и что успел» (ФТ-I1, Фаза 6 Task 5).
 *
 * ЗАЧЕМ. Воркер выпускает документы. До этой правки он не подавал ни одного признака
 * жизни: не поднимал порт, не писал отметок, а в `docker-compose.prod.yml` у него —
 * единственного из всех сервисов — не было `healthcheck`. Умерший воркер выглядел
 * ровно как живой: очередь просто копилась, и узнавали об этом по звонку «где моё
 * удостоверение».
 *
 * ЧТО ОТДАЁТ:
 *   GET /healthz — 200, пока последняя обработка была недавно; 503, если воркер
 *                  «завис» (см. stallThresholdMs). Годится как healthcheck в compose.
 *   GET /metrics — счётчики воркера в формате Prometheus.
 *
 * Наружу порт не публикуется: ручка нужна docker'у и скрипту тревог внутри сети.
 */

export interface WorkerHeartbeat {
  startedAt: number;
  lastTickAt: number;
  processed: number;
  failed: number;
  retried: number;
  deadLettered: number;
}

export interface HealthServerOptions {
  port: number;
  /** Сколько молчания считать зависанием. По умолчанию 5 минут. */
  stallThresholdMs?: number;
  now?: () => number;
}

export const createHeartbeat = (now: () => number = Date.now): WorkerHeartbeat => ({
  startedAt: now(),
  lastTickAt: now(),
  processed: 0,
  failed: 0,
  retried: 0,
  deadLettered: 0
});

/**
 * Живость: воркер считается здоровым, пока он либо недавно что-то делал, либо просто
 * ждёт работы. Отличить «жду сообщений» от «завис» по одному лишь молчанию нельзя,
 * поэтому отметка обновляется и на пустом цикле — а зависанием считаем молчание
 * дольше порога.
 */
export const isAlive = (
  heartbeat: WorkerHeartbeat,
  stallThresholdMs: number,
  now: number
): boolean => now - heartbeat.lastTickAt <= stallThresholdMs;

export const renderWorkerMetrics = (heartbeat: WorkerHeartbeat, now: number): string =>
  [
    '# HELP worker_up Worker process is alive',
    '# TYPE worker_up gauge',
    'worker_up 1',
    '# HELP worker_uptime_seconds Seconds since worker start',
    '# TYPE worker_uptime_seconds gauge',
    `worker_uptime_seconds ${Math.floor((now - heartbeat.startedAt) / 1000)}`,
    '# HELP worker_last_tick_age_seconds Seconds since the worker last did anything',
    '# TYPE worker_last_tick_age_seconds gauge',
    `worker_last_tick_age_seconds ${Math.floor((now - heartbeat.lastTickAt) / 1000)}`,
    '# HELP worker_jobs_total Jobs handled by the worker since start',
    '# TYPE worker_jobs_total counter',
    `worker_jobs_total{outcome="processed"} ${heartbeat.processed}`,
    `worker_jobs_total{outcome="failed"} ${heartbeat.failed}`,
    `worker_jobs_total{outcome="retried"} ${heartbeat.retried}`,
    `worker_jobs_total{outcome="dead_lettered"} ${heartbeat.deadLettered}`,
    ''
  ].join('\n');

export function startHealthServer(
  heartbeat: WorkerHeartbeat,
  options: HealthServerOptions
): Server {
  const stallThresholdMs = options.stallThresholdMs ?? 5 * 60_000;
  const now = options.now ?? Date.now;

  const server = createServer((req, res) => {
    const url = req.url ?? '/';
    if (url.startsWith('/metrics')) {
      res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' });
      res.end(renderWorkerMetrics(heartbeat, now()));
      return;
    }
    if (url.startsWith('/healthz')) {
      const alive = isAlive(heartbeat, stallThresholdMs, now());
      res.writeHead(alive ? 200 : 503, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          status: alive ? 'ok' : 'stalled',
          lastTickAgeSeconds: Math.floor((now() - heartbeat.lastTickAt) / 1000),
          processed: heartbeat.processed,
          failed: heartbeat.failed,
          deadLettered: heartbeat.deadLettered
        })
      );
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });

  server.listen(options.port);
  // Служебная ручка не должна удерживать процесс при остановке воркера.
  server.unref();
  return server;
}

/**
 * Отметка «я на связи» на простое.
 *
 * Живость ломалась ровно там, где нужнее всего: ночью очередь пуста, сообщений нет,
 * отметка не обновляется — и через пять минут исправный воркер отчитывался «завис», а
 * docker принимался его перезапускать. Пустой цикл — это НЕ зависание.
 *
 * Тикаем только пока `isConnected()` истинно: если связь с очередью потеряна, воркер
 * молчит по делу, и это должно быть видно.
 */
export function startIdleTicker(
  heartbeat: WorkerHeartbeat,
  isConnected: () => boolean,
  options: { intervalMs?: number; now?: () => number } = {}
): NodeJS.Timeout {
  const now = options.now ?? Date.now;
  const timer = setInterval(() => {
    if (isConnected()) {
      heartbeat.lastTickAt = now();
    }
  }, options.intervalMs ?? 60_000);
  timer.unref();
  return timer;
}
