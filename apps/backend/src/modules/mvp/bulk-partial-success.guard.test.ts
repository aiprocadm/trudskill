import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Массовая операция переживает одну плохую строку.
 *
 * Правило продукта (CLAUDE.md): «валидные строки принимаются, отказы показываются ПОИМЁННО
 * с причиной, вся пачка из-за одной плохой строки не отменяется». Оно записано, соблюдается
 * в ввозе слушателей и в рассылке — и до ревизии 2026-09-07 не было подперто ничем.
 *
 * Цена нарушения видна на живом сценарии центра: администратор зачисляет двести человек,
 * на сто первом правило не пускает — и не зачислен НИКТО, а какой именно человек помешал,
 * на экране не видно. Ровно так и вело себя массовое зачисление на любом отказе, кроме двух
 * заранее перечисленных (§5.425).
 *
 * Инвариант: про каждый цикл по строкам запроса принято решение — либо он собирает отказы
 * построчно (и это подперто тестом), либо он «всё или ничего» по названной причине. Молча
 * ронять пачку нельзя.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '..', '..');

/**
 * Циклы по строкам запроса — решение по каждому.
 *
 * Ключ — место (`файл: цикл по <чему>`), значение — решение и его причина. «Всё или ничего»
 * законно там, где строки не независимы: одна настройка, один документ, одна проверка.
 */
const DECIDED: Record<string, string> = {
  'modules/mvp/groups/issue-readiness.ts for (const issue of input.examIssues)':
    'всё или ничего не грозит: «что мешает выпустить документы» (МГ-F5.1, срез 20.1) только ' +
    'СОБИРАЕТ отчёт по готовым проверкам экзамена — ни одной записи он не делает и не бросает; ' +
    'проблемы раскладываются по слушателям, а не прерывают сбор',
  'modules/mvp/groups/issue-readiness.ts for (const learner of input.learners)':
    'частичный успех по построению: каждый слушатель проверяется отдельно и попадает в отчёт ' +
    'поимённо со своими проблемами (МГ-F5.1, срез 20.1) — ни одной записи цикл не делает',
  'modules/mvp/mvp.service.ts for (const field of request.docExtraFields)':
    'всё или ничего: это именованные поля ОДНОГО курса (МГ-E2.1, срез 16.1) — повтор ключа ' +
    'сделал бы переменную `{course.extra.<ключ>}` неоднозначной, поэтому правка курса ' +
    'отклоняется целиком с названием повторённого ключа',
  'modules/mvp/infrastructure/repositories/in-memory-learners.repository.ts for (const id of learnerIds)':
    'всё или ничего не грозит: цикл только СОБИРАЕТ сведения реестра (компания, группа, вход, ' +
    'согласие) по идентификаторам страницы — ни одной записи он не делает, а слушатель другого ' +
    'центра просто пропускается (МГ-C3.2, срез 11.1)',
  'modules/mvp/exam/exam-outcome.service.ts for (const questionId of wrongQuestionIds)':
    'всё или ничего не грозит: цикл только СОБИРАЕТ темы, в которых слушатель ошибся ' +
    '(ТЗ 10.4, Р9 пункт 4) — ни одной записи он не делает, а вопрос без темы просто не ' +
    'добавляет в список, вместо того чтобы прервать сбор',
  'modules/mvp/dashboards/manager-dashboard.util.ts for (const row of input.courseProgress)':
    'всё или ничего не грозит: панель руководителя (ТЗ 8.3) только СЧИТАЕТ по снимку ' +
    'состояния — ни одной записи она не делает и ничего не бросает',
  'modules/mvp/dashboards/manager-dashboard.util.ts for (const document of input.documents)':
    'всё или ничего не грозит: тот же подсчёт — сколько документов выдано по зачислению',
  'modules/mvp/dashboards/manager-dashboard.util.ts for (const enrollment of input.enrollments)':
    'всё или ничего не грозит: тот же подсчёт — кто не успевает и что горит по срокам',
  'modules/mvp/mvp.service.ts for (const learnerId of uniqueLearnerIds)':
    'частичный успех: отказ домена по строке уходит в `errors` со своим кодом, поломка ' +
    'поднимается наверх (тесты «одна строка с отказом третьего вида не отменяет всю пачку» ' +
    'и «поломка не выдаётся за отказ строки» в `mvp.service.test.ts`)',
  'modules/mvp/mvp.service.ts for (const item of input.answerScores)':
    'всё или ничего: это оценки ОДНОЙ работы одного слушателя — принять половину оценок ' +
    'значило бы выставить итог по неполной проверке',
  'modules/mvp/mvp.service.ts for (const entry of request.entries)':
    'всё или ничего: это один комплект документов курса, его позиции проверяются как целое ' +
    '(0..N-1 без дыр) — принять часть значило бы сохранить сломанный комплект',
  'modules/mvp/mvp.service.ts for (const e of request.entries)':
    'всё или ничего: вторая половина той же проверки комплекта документов курса',
  'modules/communication/notification-dispatcher.service.ts for (const recipient of input.recipients)':
    'частичный успех: отправка каждому в своём `try`, отказ пишется строкой доставки со ' +
    'статусом `failed`, остальные получатели письмо получают',
  'modules/iam/services/known-password-audit.ts for (const user of input.users)':
    'всё или ничего не грозит: цикл только читает и считает, бросать в нём нечему',
  'modules/iam/services/iam.service.ts for (const userId of userIds)':
    'всё или ничего не грозит: это dev-путь БЕЗ базы у `roleCodesOfUsers` (ТЗ 5.6 / Э6) — ' +
    'цикл читает роли из карты в памяти и ничего не бросает. Боевой путь идёт мимо цикла: ' +
    'роли всей страницы берутся ОДНИМ запросом `user_id = any($2)`',
  'modules/mvp/close-group-chain.service.ts for (const groupId of groupIds)':
    'частичный успех ВЕРХНЕГО уровня: каждая группа закрывается в своём `try`, отказ ложится ' +
    'строкой отчёта с причиной человеческим языком и не отменяет остальные — иначе одна ' +
    'группа без комиссии означала бы работу заново для всех сорока (тесты «неготовая группа ' +
    'не отменяет остальные» и «группа без курса пропускается с объяснением» в ' +
    '`close-group-chain.service.test.ts`)',
  'modules/mvp/close-group-chain.ts for (const issue of input.learnerIssues)':
    'всё или ничего не грозит: цикл собирает список проблем группы, бросать в нём нечему',
  'modules/mvp/close-group-chain.ts for (const enrollment of input.enrollments)':
    'всё или ничего не грозит: тот же сбор проблем, только по зачислениям',
  'modules/mvp/dashboards/methodist-dashboard.util.ts for (const enrollment of input.enrollments)':
    'всё или ничего не грозит: чистый подсчёт для сводки методиста',
  'modules/mvp/dashboards/methodist-dashboard.util.ts for (const groupCourse of input.groupCourses)':
    'всё или ничего не грозит: тот же подсчёт по курсам групп',
  'modules/documents/missed-issuance.finder.ts for (const document of input.issued)':
    'всё или ничего не грозит: поиск пропущенных выдач только читает',
  'modules/documents/missed-issuance.finder.ts for (const enrollment of input.completed)':
    'всё или ничего не грозит: та же выборка по завершённым',
  /*
   * Обходы по арендаторам — то же правило для фоновых работ: сломанные данные ОДНОГО центра
   * не должны оставлять без напоминаний и без уборки все остальные. Все четыре ловят отказ
   * внутри цикла и продолжают со следующего центра, записав отказ в журнал.
   */
  'modules/mvp/reminders/reminders-scheduler.service.ts for (const tenantId of tenantIds)':
    'частичный успех: отказ по одному центру пишется в журнал, обход идёт дальше',
  'modules/mvp/identity/identity-retention-scheduler.service.ts for (const tenantId of tenantIds)':
    'частичный успех: отказ по одному центру пишется в журнал, уборка идёт дальше',
  'modules/mvp/proctoring/proctoring-retention-scheduler.service.ts for (const tenantId of tenantIds)':
    'частичный успех: отказ по одному центру пишется в журнал, уборка идёт дальше',
  'modules/mvp/assessment/expired-attempts.scheduler.service.ts for (const tenantId of tenantIds)':
    'частичный успех: отказ по одному центру пишется в журнал, закрытие попыток идёт дальше',
  'modules/mvp/groups/group-status.scheduler.service.ts for (const tenantId of tenantIds)':
    'частичный успех: отказ по одному центру пишется в журнал, обход статусов групп идёт дальше',
  'modules/mvp/groups/group-wizard.service.ts for (const course of request.courses)':
    'уже назначенный курс пропускается, остальные назначаются; иной отказ — поломка, поднимается',
  'modules/mvp/groups/group-wizard.service.ts for (const learnerId of request.learners)':
    'всё или ничего не грозит: цикл только собирает id уже существующих слушателей в список, бросать в нём нечему',
  'modules/mvp/group-progress-summary.service.ts for (const gId of groupIds)':
    'всё или ничего не грозит: цикл только складывает числа для сводки, бросать в нём нечему',
  'modules/mvp/infrastructure/postgres-mvp-persistence.backend.ts for (const entityId of allIds)':
    'всё или ничего НАМЕРЕННО: это запись состояния центра одной транзакцией — половина ' +
    'сохранённого состояния хуже, чем несохранённое целиком',
  'modules/documents/infrastructure/postgres-documents-persistence.backend.ts for (const entityId of allIds)':
    'всё или ничего НАМЕРЕННО: та же запись состояния одной транзакцией, но для документов',
  'infrastructure/webinar-provider/fake-webinar.provider.ts for (const e of body.events)':
    'заглушка для стенда, в бою не работает',
  'infrastructure/video-provider/fake-video.provider.ts for (const raw of body.events)':
    'заглушка для стенда, в бою не работает'
};

/** Цикл по полю входного объекта: `for (const x of request.learnerIds)`. */
const LOOP =
  /for \(const (\w+) of ((?:request|input|body|payload|dto)\.\w+|[A-Za-z_$][\w$]*Ids)\b[^)]*\)/g;

const sourcesUnder = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourcesUnder(full, acc);
      continue;
    }
    if (entry.endsWith('.ts') && !entry.includes('.test.') && !entry.endsWith('.stub.ts')) {
      acc.push(full);
    }
  }
  return acc;
};

const loops = (): Array<{ key: string; location: string }> => {
  const found: Array<{ key: string; location: string }> = [];
  for (const file of sourcesUnder(SRC)) {
    const source = readFileSync(file, 'utf8');
    const relativeFile = relative(SRC, file).split('\\').join('/');
    for (const match of source.matchAll(LOOP)) {
      const line = source.slice(0, match.index).split('\n').length;
      found.push({
        key: `${relativeFile} for (const ${match[1]} of ${match[2]})`,
        location: `${relativeFile}:${line}`
      });
    }
  }
  return found;
};

const found = loops();

describe('массовая операция переживает одну плохую строку', () => {
  it('сторож видит циклы, а не пустой список', () => {
    expect(found.length).toBeGreaterThanOrEqual(10);
  });

  it('про каждый цикл по строкам запроса принято решение', () => {
    const undecided = found
      .filter((loop) => !(loop.key in DECIDED))
      .map((loop) => `${loop.location} — ${loop.key}`);
    expect(undecided, `циклов без решения: ${undecided.length}`).toEqual([]);
  });

  it('список не протухает — записанный цикл всё ещё существует', () => {
    const keys = new Set(found.map((loop) => loop.key));
    const gone = Object.keys(DECIDED)
      .filter((key) => !keys.has(key))
      .map((key) => `${key} — записан в стороже, но такого цикла в коде больше нет`);
    expect(gone).toEqual([]);
  });

  it('у каждого решения есть причина, а не отметка «проверено»', () => {
    const empty = Object.entries(DECIDED)
      .filter(([, reason]) => reason.trim().length < 30)
      .map(([key]) => key);
    expect(empty).toEqual([]);
  });
});
