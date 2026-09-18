import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative } from 'node:path';

import { blockedHintId, blockedProps } from '@trudskill/ui';
import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp, fromPackages } from './app-root';
import { stripComments } from './backend-source';
import { identitySubmitBlockedReason } from '../features/identity-verification/blocked';
import { submitBlockedReason } from '../features/practical-submissions/format';

/**
 * Заблокированная кнопка выглядит заблокированной и говорит, чего не хватает
 * (ТЗ «Стабилизация, UX и развитие», 5.8 / Э8).
 *
 * **Как было.** Выключенная кнопка рисовалась как «opacity: 0.5» — то есть главная кнопка
 * становилась просто бледно-оранжевой. Человек читал это как «кнопка как кнопка» и жал по ней
 * снова и снова: «Отправить на проверку» без загруженного селфи, «Провести тест» без
 * выбранного слушателя, «Назначить курс» без выбранного курса — все три молчали (журнал 465).
 * Прозрачность вдобавок рушила контраст: подпись на 50 % прозрачности не проходит AA.
 *
 * **Что закреплено.**
 *
 * 1. Один вид «сейчас нельзя» на все кнопки: серый фон и серая подпись (пара измерена
 *    contrast-audit), «cursor: not-allowed», без прозрачности.
 * 2. Занятость — не блокировка: у кнопки с крутилкой свой вид, серой она не становится.
 * 3. Кнопка, выключенная ПО УСЛОВИЮ, называет недостающее: всплывающей подсказкой для мыши
 *    и ВИДИМОЙ строкой рядом (для телефона, клавиатуры и читалки экрана).
 * 4. Очередь молчащих кнопок сверяется на равенство и может только таять.
 */

const FORMS = fromPackages('ui', 'src', 'styles', 'forms.ts');
const BLOCKED = fromPackages('ui', 'src', 'components', 'blocked-action', 'index.tsx');
const PATTERNS = fromApp('..', '..', 'docs', 'ui', 'patterns.md');
const ROOTS = [fromApp('src', 'features'), fromApp('app')];

/** Три кнопки, названные ТЗ поимённо, плюс четвёртая с той же подписью. */
const NAMED: Record<string, string> = {
  'src/features/identity-verification/screens.tsx': 'Отправить на проверку (документы)',
  'src/features/practical-submissions/submission-screen.tsx': 'Отправить на проверку (работа)',
  'src/features/assessment/assessment-dashboard-screen.tsx': 'Провести тест',
  'src/features/groups/group-details-screen.tsx': 'Назначить курс'
};

/**
 * «Занято» — операция идёт: объяснять нечего, об этом говорит крутилка. Всё остальное —
 * условие, и его человеку нужно назвать.
 */
const BUSY =
  /\b(busy|isRunning|running|pending|saving|submitting|loading|isLoading|isPending|isSubmitting|busyId|payPending|frdoBusy|uploading|Pending|Busy)\b/g;

/**
 * Кнопки, выключенные по условию и пока молчащие. Список сверяется на РАВЕНСТВО: новая
 * молчащая кнопка не проскочит, а объяснённая потребует уменьшить число.
 *
 * Почему очередь, а не запрет. Таких мест 111 в 49 файлах: причина у каждого своя, и писать
 * её надо словами того экрана, а не шаблоном. Вид «выключено» при этом починен СРАЗУ и везде —
 * это главное, о чём просит ТЗ; объяснения доезжают по мере правки экранов.
 */
const SILENT: Record<string, number> = {
  'app/crm/deals/page.tsx': 1,
  'app/login/magic-link/[token]/page.tsx': 1,
  'src/features/assessment-admin/assignment-edit-drawer.tsx': 1,
  'src/features/assessment-admin/create-test-drawer.tsx': 1,
  'src/features/assessment-admin/question-bank-edit-drawer.tsx': 1,
  'src/features/assessment-admin/question-editor-drawer.tsx': 1,
  'src/features/assessment-admin/test-builder-screen.tsx': 2,
  'src/features/assessment-admin/test-question-picker.tsx': 1,
  'src/features/auth/magic-link-form.tsx': 1,
  'src/features/auth/two-factor-card.tsx': 2,
  'src/features/bulk-enrollments/bulk-import-screen.tsx': 1,
  'src/features/clients/client-edit-drawer.tsx': 2,
  'src/features/close-group/screens.tsx': 4,
  'src/features/commissions/commissions-screens.tsx': 3,
  'src/features/course-viewer/course-viewer-screen.tsx': 1,
  'src/features/course-viewer/table-of-contents.tsx': 1,
  'src/features/course-wizard/screens.tsx': 2,
  'src/features/courses/courses-screens.tsx': 16,
  'src/features/documents/create-template-drawer.tsx': 1,
  'src/features/documents/entity-picker.tsx': 1,
  'src/features/documents/generate-document-drawer.tsx': 2,
  'src/features/documents/template-setup-section.tsx': 3,
  'src/features/gov-export/gov-export-screen.tsx': 10,
  'src/features/group-orders/issue-order-modal.tsx': 2,
  'src/features/groups/groups-list-screen.tsx': 1,
  'src/features/identity-verification/screens.tsx': 6,
  'src/features/issuance-journal/revoke-reissue-modal.tsx': 1,
  'src/features/learner-courses/screens.tsx': 1,
  'src/features/learner-documents/documents-list.tsx': 1,
  'src/features/learners/learner-create-drawer.tsx': 1,
  'src/features/learners/learner-edit-drawer.tsx': 2,
  'src/features/learners/learner-pii-panel.tsx': 2,
  'src/features/learners/learners-list-screen.tsx': 1,
  'src/features/licenses/licenses-list.tsx': 1,
  'src/features/notification-recipients/screens.tsx': 1,
  'src/features/numbering/screens.tsx': 1,
  'src/features/payments/screens.tsx': 1,
  'src/features/platform-tenants/screens.tsx': 3,
  'src/features/practical-submissions/submission-screen.tsx': 3,
  'src/features/proctoring/screens.tsx': 4,
  'src/features/push/screens.tsx': 2,
  'src/features/recertification/approve-recert-modal.tsx': 1,
  'src/features/report-builder/screens.tsx': 3,
  'src/features/reviewer-actions/reviewer-actions-screen.tsx': 4,
  'src/features/tenant-images/screens.tsx': 3,
  'src/features/test-player/test-attempt-screen.tsx': 2,
  'src/features/test-player/tests-list-screen.tsx': 2,
  'src/features/users/users-screens.tsx': 2,
  'src/features/webinars/screens.tsx': 1
};

const collect = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) {
      collect(full, acc);
      continue;
    }
    if (entry.endsWith('.tsx') && !entry.includes('.test.')) acc.push(full);
  }
  return acc;
};

/** Таблица стилей, разобранная на правила: список селекторов + тело. */
const cssRules = (source: string): Array<{ selectors: string[]; body: string }> => {
  const rules: Array<{ selectors: string[]; body: string }> = [];
  let cursor = 0;
  for (;;) {
    const open = source.indexOf('{', cursor);
    if (open === -1) break;
    const close = source.indexOf('}', open);
    if (close === -1) break;
    rules.push({
      selectors: source
        .slice(cursor, open)
        .split(',')
        .map((line) => line.trim())
        .filter(Boolean),
      body: source.slice(open, close)
    });
    cursor = close + 1;
  }
  return rules;
};

/**
 * Правило «выключено» целиком — со ВСЕМИ его селекторами.
 *
 * Две подсаженные поломки прошли мимо первой редакции этого замера (журнал 467):
 *
 * - читать файл целиком нельзя — «background: var(--ui-surface-muted)» встречается ещё в
 *   трёх местах, и подмена цвета ВНУТРИ правила сторожа не будила;
 * - искать начало правила по строке «button:disabled:not(» тоже нельзя — поломка меняла
 *   ровно эту строку, поиск находил СЛЕДУЮЩИЙ селектор, и испорченный первый в разбор не
 *   попадал вовсе. Правило ищется по признаку («все селекторы про :disabled»), а не по
 *   тексту одного из них.
 */
const disabledRule = (source: string): { selectors: string[]; body: string } =>
  cssRules(source).find(
    (rule) => rule.selectors.length >= 4 && rule.selectors.every((one) => one.includes(':disabled'))
  ) ?? { selectors: [], body: '' };

/**
 * Текст таблицы стилей БЕЗ комментариев.
 *
 * Общий `stripComments` тут бесполезен: он пропускает содержимое строк, а файл стилей —
 * одна большая строка-шаблон, внутри которой живёт весь CSS вместе со своими
 * комментариями. Из-за этого пояснение над правилом попадало в разбор как «селекторы»,
 * и правило не находилось вовсе (журнал 468).
 */
const readCss = (file: string): string =>
  readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');

const rel = (file: string): string => relative(APP_ROOT, file).replace(/\\/g, '/');
const read = (file: string): string => stripComments(readFileSync(file, 'utf8'));

/** Выражение внутри `disabled={ … }` — по балансу скобок, а не до первой закрывающей. */
const disabledExpressions = (source: string): string[] => {
  const found: string[] = [];
  const re = /disabled=\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    let depth = 0;
    let j = m.index + m[0].length - 1;
    for (; j < source.length; j += 1) {
      if (source[j] === '{') depth += 1;
      else if (source[j] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    found.push(source.slice(m.index + m[0].length, j));
  }
  return found;
};

/** Сколько кнопок экрана выключены по УСЛОВИЮ и при этом ничего не объясняют. */
const silentCount = (source: string): number => {
  const explained = (source.match(/blockedProps\(/g) ?? []).length;
  const byCondition = disabledExpressions(source).filter((expr) =>
    /[A-Za-z_$][\w$]*/.test(expr.replace(BUSY, ''))
  ).length;
  return Math.max(0, byCondition - explained);
};

describe('заблокированная кнопка выглядит заблокированной (ТЗ 5.8)', () => {
  it('вид «сейчас нельзя» — серый, а не бледная прозрачность', () => {
    const rule = disabledRule(readCss(FORMS));
    expect(rule.selectors.length, 'правило обязано существовать').toBeGreaterThan(3);
    expect(rule.body, 'серый берётся токеном').toContain('background: var(--ui-surface-muted)');
    expect(rule.body).toContain('color: var(--ui-text-muted)');
    expect(rule.body).toContain('cursor: not-allowed');
    expect(/opacity:\s*1\b/.test(rule.body), 'прозрачность рушит контраст подписи').toBe(true);
    expect(/#[0-9a-f]{3,8}\b/i.test(rule.body), 'цвет числом мимо токенов').toBe(false);
  });

  it('занятость — не блокировка: кнопка с крутилкой серой не становится', () => {
    // Человек сам только что нажал; объяснять нечего, и одежда «нельзя» тут врёт.
    const rule = disabledRule(readCss(FORMS));
    const careless = rule.selectors.filter(
      (selector) => !selector.includes(':not(.ui-button--loading)')
    );
    expect(careless, 'каждый селектор правила обязан пропускать занятую кнопку').toEqual([]);
  });

  it('наведение на выключенную кнопку ничего не обещает', () => {
    expect(/button:disabled:hover/.test(readCss(FORMS))).toBe(true);
  });

  it('причина доходит и до мыши, и до клавиатуры, и до читалки экрана', () => {
    /*
     * Проверяется ЗНАЧЕНИЕ, а не текст файла: имя «aria-describedby» стоит ещё и в подписи
     * типа, и проверка по тексту была довольна ею, когда из возвращаемого объекта связь
     * убрали (журнал 467 — тот же класс, что 464).
     */
    const props = blockedProps('idv-submit', 'Загрузите селфи');
    expect(props.disabled).toBe(true);
    expect(props.title, 'всплывающая подсказка — для мыши').toBe('Загрузите селфи');
    expect(props['aria-describedby'], 'связь с видимой строкой — для всех остальных').toBe(
      blockedHintId('idv-submit')
    );
    expect(blockedProps('idv-submit', undefined), 'занятость объяснять не нужно').toEqual({});
    expect(read(BLOCKED)).toContain('blockedHintId');
  });

  it('четыре названные кнопки объясняют себя', () => {
    const silent: string[] = [];
    for (const [path, label] of Object.entries(NAMED)) {
      const source = read(fromApp(...path.split('/')));
      if (!/blockedProps\(/.test(source) || !/<BlockedHint\b/.test(source)) {
        silent.push(`${label} (${path})`);
      }
    }
    expect(silent, 'ТЗ 5.8 называет эти кнопки поимённо').toEqual([]);
  });

  it('причина называет недостающее ПОИМЁННО, а не «заполните всё»', () => {
    expect(
      identitySubmitBlockedReason({
        selfie: false,
        passport: false,
        personalDataGranted: true,
        photoGranted: true
      })
    ).toBe('Загрузите селфи и фото паспорта.');
    expect(
      identitySubmitBlockedReason({
        selfie: true,
        passport: false,
        personalDataGranted: true,
        photoGranted: true
      })
    ).toBe('Загрузите фото паспорта.');
    // Согласия идут первыми: без них загружать файлы бессмысленно.
    expect(
      identitySubmitBlockedReason({
        selfie: true,
        passport: true,
        personalDataGranted: false,
        photoGranted: true
      })
    ).toBe('Дайте согласие на обработку персональных данных.');
    expect(
      identitySubmitBlockedReason({
        selfie: true,
        passport: true,
        personalDataGranted: true,
        photoGranted: true
      })
    ).toBeUndefined();
  });

  it('работа, которую уже отправили, объясняет своё состояние', () => {
    expect(submitBlockedReason('draft')).toBeUndefined();
    expect(submitBlockedReason('returned')).toBeUndefined();
    expect(submitBlockedReason('submitted')).toContain('ждёт проверки');
    expect(submitBlockedReason('under_review')).toContain('проверяет');
    expect(submitBlockedReason('reviewed')).toContain('проверена');
  });

  it('очередь молчащих кнопок не растёт и не врёт', () => {
    const found: Record<string, number> = {};
    for (const file of ROOTS.flatMap((root) => collect(root))) {
      const n = silentCount(read(file));
      if (n > 0) found[rel(file)] = n;
    }
    expect(found, 'новая кнопка, выключенная по условию, обязана сказать, чего не хватает').toEqual(
      SILENT
    );
  });

  it('правило записано в docs/ui/patterns.md', () => {
    const doc = readFileSync(PATTERNS, 'utf8');
    expect(doc).toContain('## Э8');
    expect(doc).toContain('blockedProps');
  });
});
