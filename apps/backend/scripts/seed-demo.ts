/**
 * Наполнение демонстрационными данными (ТЗ 18.1, **решение владельца Р19**).
 *
 * Запуск одной командой из корня: `pnpm seed:demo` (адрес базы — в `DATABASE_URL`).
 *
 * **Зачем.** В ревью диаграммы аналитики выглядели как строчки с нулями — просто потому, что
 * данных не было. Для человека, которому показывают продукт, «нули» и «не работает»
 * неотличимы: он видит пустой график и делает вывод о функции, а не о наполнении.
 *
 * **Скрипт отказывается работать в боевом контуре.** Демонстрационные данные там не нужны, а
 * «случайно запустил не там» — ровно тот случай, который потом ищут неделю. Проверка та же, что
 * у наполнения стенда: на неё уже наступали.
 *
 * **Почему скрипт печатает состав.** Показывающий должен знать, что именно у него на стенде, ДО
 * того как откроет экран перед клиентом. Молчаливое наполнение приводит к «а почему здесь сто
 * двадцать, я ждал тысячу» прямо во время показа.
 */
import { Pool } from 'pg';

import { DEMO_DATASET_SHAPE, buildDemoDataset } from '../src/seeds/demo-dataset.js';
import { demoSeedStatements } from '../src/seeds/demo-seed.js';

const isProduction = (): boolean =>
  (process.env.NODE_ENV ?? '').toLowerCase() === 'production' ||
  (process.env.APP_ENV ?? '').toLowerCase() === 'production';

function printShape(): void {
  const data = buildDemoDataset();
  console.log('Демо-набор (решение Р19):');
  console.log(`  учебных центров:     ${data.tenants.length} — один наполнен, второй пуст`);
  console.log('                        (на пустом показывают мастер первого запуска)');
  console.log(`  компаний-заказчиков: ${data.counterparties.length}`);
  console.log(`  курсов:              ${data.courses.length}`);
  console.log(`  групп:               ${data.groups.length} — набор, идёт обучение, закрыта`);
  console.log(`  слушателей:          ${data.learners.length}`);
  console.log(`  документов:          ${data.documents.length}`);
  console.log(
    `  история:             ${DEMO_DATASET_SHAPE.historyMonths} месяца — графики покажут динамику`
  );
  console.log('');
  console.log('СНИЛС из диапазона, который в России не выдаётся: номера заведомо ничьи.');
  console.log('Фамилии вымышленные, фотографии — обезличенные заглушки.');
  console.log('');
}

async function main(): Promise<void> {
  if (isProduction()) {
    console.error(
      'Отказ: это демонстрационные данные, в боевом контуре им не место. Снимите NODE_ENV/APP_ENV=production.'
    );
    process.exitCode = 1;
    return;
  }

  printShape();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Отказ: не задан DATABASE_URL — некуда писать.');
    process.exitCode = 1;
    return;
  }

  const pool = new Pool({ connectionString });
  try {
    const statements = demoSeedStatements();
    /*
     * Одной транзакцией: половина набора хуже, чем его отсутствие. Если наполнение оборвётся
     * посередине, на экранах окажутся группы без слушателей и слушатели без зачислений — а это
     * выглядит как дефект продукта, а не как незавершённый скрипт.
     */
    await pool.query('begin');
    for (const statement of statements) await pool.query(statement);
    await pool.query('commit');
    console.log(`Готово: выполнено выражений — ${statements.length}.`);
    console.log('Повторный запуск безопасен: существующие записи не задваиваются.');
  } catch (error) {
    await pool.query('rollback').catch(() => undefined);
    console.error('Не получилось наполнить:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
