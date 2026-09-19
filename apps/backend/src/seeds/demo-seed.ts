import { DEMO_DATASET_SHAPE, buildDemoDataset } from './demo-dataset.js';

/**
 * Запись демонстрационного набора в базу (ТЗ 18.1, решение Р19).
 *
 * **Почему выражения собираются отдельно от состава.** Состав — решение владельца и меняется
 * редко; запись меняется вместе со схемой. Держать их вместе значит переписывать решение каждый
 * раз, когда в таблице появился столбец (журнал 588).
 *
 * **Почему всё «не мешать, если уже есть» (`on conflict do nothing`).** Скрипт запускают на
 * стенде повторно — после обновления, после чистки, просто чтобы убедиться. Повторный запуск,
 * который падает или задваивает данные, приводит к тому, что им перестают пользоваться.
 *
 * **Почему второй центр остаётся ПУСТЫМ.** Так решил владелец (Р19): на нём показывают мастер
 * первого запуска. Наполнить его — лишиться самой убедительной части показа.
 */

/** Экранирование строки для SQL. Тот же приём, что в наполнении стенда. */
const quote = (value: string): string => `'${value.replace(/'/g, "''")}'`;

/** Отступ во времени: `now() - interval 'N months'`. */
const monthsAgo = (months: number): string => `now() - interval '${months} months'`;

/** Состояние группы в терминах базы. */
const groupStatus = (state: 'recruiting' | 'in_progress' | 'closed'): string =>
  state === 'closed' ? 'closed' : state === 'in_progress' ? 'active' : 'draft';

export function demoSeedStatements(): string[] {
  const data = buildDemoDataset();
  const main = data.tenants.find((tenant) => tenant.populated)!;
  const empty = data.tenants.find((tenant) => !tenant.populated)!;
  const t = quote(main.id);

  const statements: string[] = [
    `insert into core.tenants (id, code, name, status)
     values (${t}, 'demo', ${quote(main.name)}, 'active'),
            (${quote(empty.id)}, 'demo-new', ${quote(empty.name)}, 'active')
     on conflict (id) do nothing`,

    /*
     * Компании-заказчики: 3 по Р19. Реквизиты вымышленные — ИНН из диапазона, который не
     * выдаётся, чтобы набор нельзя было принять за данные живой организации.
     */
    `insert into crm.counterparties (id, tenant_id, code, name, legal_name, tax_number, status)
     values ${data.counterparties
       .map(
         (cp, index) =>
           `(${quote(cp.id)}, ${t}, ${quote(`demo-cp-${index + 1}`)}, ${quote(cp.name)}, ${quote(cp.name)}, ${quote(`00000000${index + 1}`)}, 'active')`
       )
       .join(', ')}
     on conflict (id) do nothing`,

    `insert into learning.courses (id, tenant_id, code, title, status, payload)
     values ${data.courses
       .map(
         (course, index) =>
           `(${quote(course.id)}, ${t}, ${quote(`demo-course-${index + 1}`)}, ${quote(course.title)}, 'active', ${quote(
             JSON.stringify({ academicHours: course.hours })
           )}::jsonb)`
       )
       .join(', ')}
     on conflict (id) do nothing`,

    /*
     * Группы разложены по месяцам начала — отсюда и берётся динамика на графиках. Набор, где
     * всё началось вчера, рисует ту же плоскую линию, что и пустая база.
     */
    `insert into learning.groups (id, tenant_id, code, name, status, starts_at, created_at)
     values ${data.groups
       .map(
         (group, index) =>
           `(${quote(group.id)}, ${t}, ${quote(`demo-group-${index + 1}`)}, ${quote(group.title)}, ${quote(
             groupStatus(group.state)
           )}, ${monthsAgo(group.startedMonthsAgo)}, ${monthsAgo(group.startedMonthsAgo)})`
       )
       .join(', ')}
     on conflict (id) do nothing`
  ];

  /*
   * Слушатели вставляются порциями: одно выражение на сто двадцать записей вырастает в
   * километровую строку, которую невозможно прочитать в журнале ошибок, если что-то пойдёт не
   * так.
   */
  const chunkSize = 30;
  for (let from = 0; from < data.learners.length; from += chunkSize) {
    const chunk = data.learners.slice(from, from + chunkSize);
    statements.push(
      `insert into learning.learners (id, tenant_id, first_name, last_name, middle_name, status, payload, created_at)
       values ${chunk
         .map((learner, index) => {
           const [last, first, middle] = learner.fullName.split(' ');
           /* Разброс по времени создания: все записи «сегодня» выглядят как заглушка. */
           const age = (from + index) % DEMO_DATASET_SHAPE.historyMonths;
           return `(${quote(learner.id)}, ${t}, ${quote(first ?? '')}, ${quote(last ?? '')}, ${quote(
             middle ?? ''
           )}, 'active', ${quote(JSON.stringify({ snils: learner.snils, demoStage: learner.stage }))}::jsonb, ${monthsAgo(age)})`;
         })
         .join(', ')}
       on conflict (id) do nothing`
    );
  }

  /*
   * Зачисления: каждый слушатель попадает в группу по кругу. Без них списки полны, а все
   * аналитические экраны пусты — именно они считают по зачислениям.
   */
  for (let from = 0; from < data.learners.length; from += chunkSize) {
    const chunk = data.learners.slice(from, from + chunkSize);
    statements.push(
      `insert into learning.enrollments (id, tenant_id, group_id, learner_id, status, enrolled_at)
       values ${chunk
         .map((learner, index) => {
           const position = from + index;
           const group = data.groups[position % data.groups.length]!;
           const status =
             learner.stage === 'passed'
               ? 'completed'
               : learner.stage === 'notStarted'
                 ? 'pending'
                 : 'active';
           return `(${quote(`enr_demo_${position + 1}`)}, ${t}, ${quote(group.id)}, ${quote(learner.id)}, ${quote(status)}, ${monthsAgo(group.startedMonthsAgo)})`;
         })
         .join(', ')}
       on conflict (group_id, learner_id) do nothing`
    );
  }

  return statements;
}
