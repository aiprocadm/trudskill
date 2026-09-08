#!/usr/bin/env node
/**
 * `MET-003` — замер того, что видит человек, открывая экран.
 *
 * Зачем скрипт, а не разовый замер руками. Требование ТЗ звучит как «p95 до и после», то есть
 * число нужно СРАВНИВАТЬ. Замер, сделанный один раз в чьей-то консоли, сравнивать не с чем:
 * через полгода никто не вспомнит ни порядок прогрева, ни число заходов, ни какую страницу
 * открывали. Поэтому способ лежит в репозитории и запускается одной командой.
 *
 * Что меряется:
 *   * время ответа страницы — сколько человек ждёт, прежде чем что-то произойдёт;
 *   * вес скриптов — сколько браузер скачает, прежде чем экран станет живым.
 *
 * Чего НЕ меряется: время отрисовки в браузере. Для него нужен настоящий браузер, а в этом
 * проекте его сознательно нет (`RISK-002`: ни средства монтировать компоненты, ни браузерных
 * тестов). Заводить его ради одной метрики — решение о наборе инструментов, а не о метрике.
 *
 * Запуск:  node scripts/measure/page-latency.mjs http://127.0.0.1:3000/learners
 */

const url = process.argv[2];
if (!url) {
  console.error(
    'Укажите адрес: node scripts/measure/page-latency.mjs http://127.0.0.1:3000/learners'
  );
  process.exit(1);
}

const RUNS = Number(process.env.RUNS ?? 40);
const WARMUP = Number(process.env.WARMUP ?? 5);

const timeOnce = async () => {
  const started = performance.now();
  const res = await fetch(url);
  await res.arrayBuffer();
  return { ms: performance.now() - started, status: res.status };
};

/* Прогрев обязателен: первый заход поднимает страницу и меряет не то, что видит человек. */
for (let i = 0; i < WARMUP; i += 1) await timeOnce();

const samples = [];
let status = 0;
for (let i = 0; i < RUNS; i += 1) {
  const one = await timeOnce();
  samples.push(one.ms);
  status = one.status;
}
samples.sort((a, b) => a - b);
const at = (q) => samples[Math.min(samples.length - 1, Math.floor(samples.length * q))];

/* Вес скриптов: то, что браузер обязан скачать, прежде чем экран начнёт отвечать. */
const html = await (await fetch(url)).text();
const scripts = [...new Set([...html.matchAll(/src="(\/_next\/[^"]+\.js)"/g)].map((m) => m[1]))];
const origin = new URL(url).origin;
let bytes = 0;
for (const src of scripts) {
  bytes += (await (await fetch(origin + src)).arrayBuffer()).byteLength;
}

console.log(`Адрес:     ${url} (ответ ${status})`);
console.log(`Заходов:   ${RUNS} (после ${WARMUP} прогревочных)`);
console.log(`Медиана:   ${at(0.5).toFixed(1)} мс`);
console.log(`p95:       ${at(0.95).toFixed(1)} мс`);
console.log(`Максимум:  ${samples[samples.length - 1].toFixed(1)} мс`);
console.log(`Разметка:  ${(html.length / 1024).toFixed(1)} КБ`);
console.log(`Скрипты:   ${(bytes / 1024).toFixed(1)} КБ в ${scripts.length} файлах`);
