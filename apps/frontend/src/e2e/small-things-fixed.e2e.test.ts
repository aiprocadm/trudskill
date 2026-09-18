import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { fromApp } from './app-root';
import { stripComments } from './backend-source';
import { getVisibleNavigation } from '../features/navigation/helpers';
import { navigationModel } from '../features/navigation/model';

import type { UserSession } from '../entities/session/model';

/**
 * Мелочи, которые раздражают каждый день (ТЗ «Стабилизация, UX и развитие», 5.12 / Э12).
 *
 * Девять пунктов, каждый сам по себе мелкий, а вместе — ощущение неаккуратной системы.
 * Три из них («пустой заголовок вкладки», «две главные кнопки на Отчётности» и обрывок
 * подписи «Блокеры 1 ↑ рост:») закрылись раньше, в задачах 4.3 и 5.4; здесь закреплены
 * остальные шесть.
 *
 * **Решения владельца.** Р3 — чат убран из меню всех ролей: пустой список диалогов без
 * объяснения и без кнопки «Написать» был тупиком, а незаконченная функция хуже
 * отсутствующей. Р4 — «Аналитика» показывает, «Отчёты» выгружают, а вычисления у них общие,
 * чтобы цифры совпадали.
 */

const AUDIT = fromApp('src', 'features', 'audit', 'audit-screen.tsx');
const CLIENTS = fromApp('src', 'features', 'clients', 'clients-list-screen.tsx');
const DOCS_SCREEN = fromApp('src', 'features', 'learner-documents', 'learner-documents-screen.tsx');
const CHARTS = fromApp('src', 'features', 'analytics', 'charts.tsx');
const ANALYTICS = fromApp('src', 'features', 'analytics', 'screens.tsx');
const METRICS = fromApp('..', 'backend', 'src', 'modules', 'mvp', 'learning-metrics.ts');
const DASHBOARD = fromApp('..', 'backend', 'src', 'modules', 'mvp', 'analytics-dashboard.ts');
const SERVICE = fromApp('..', 'backend', 'src', 'modules', 'mvp', 'mvp.service.ts');
const AUDIT_SERVICE = fromApp('..', 'backend', 'src', 'modules', 'audit', 'audit.service.ts');
const PATTERNS = fromApp('..', '..', 'docs', 'ui', 'patterns.md');

const read = (file: string): string => stripComments(readFileSync(file, 'utf8'));

/** Сессия с правами, при которых чат был бы виден, будь он включён. */
const sessionWith = (permissions: string[]): UserSession =>
  ({
    permissions,
    user: { id: 'u1', tenantId: 't1' },
    tokens: { accessToken: 'x' }
  }) as unknown as UserSession;

describe('мелочи, которые раздражают каждый день (ТЗ 5.12)', () => {
  it('журнал действий показывает время, а не только дату', () => {
    // 5.12.1: порядок событий внутри дня по одной дате не прочитать.
    const source = read(AUDIT);
    expect(source).toContain('formatDateTime(event.createdAt)');
    expect(/formatDate\(event\.createdAt\)/.test(source)).toBe(false);
  });

  it('дата и время печатаются ОДНИМ способом на всё приложение', () => {
    /*
     * Было две копии с разным видом: «18.09.2026, 11:45:12» в эксплуатации и
     * «2026-09-18 11:45» в проверке работ — один момент выглядел по-разному (журнал 479).
     */
    for (const feature of ['operations', 'assessment-admin']) {
      const source = read(fromApp('src', 'features', feature, 'format.ts'));
      expect(source, `${feature}: свой формат вместо общего`).toContain(
        "from '../mvp/screen-helpers'"
      );
      expect(/function formatDateTime|const formatDateTime = \(/.test(source)).toBe(false);
    }
  });

  it('служебные события журнала скрыты, но НЕ удалены', () => {
    /*
     * 5.12.2: «Сеанс продлён» пишется при каждом обновлении токена. Запись остаётся в базе —
     * журнал это доказательство, а не лента новостей, — но по умолчанию не показывается.
     */
    const service = read(AUDIT_SERVICE);
    expect(service).toContain('SERVICE_ACTIONS');
    expect(service).toContain("'auth.refresh'");
    /*
     * Веток отбора ДВЕ — в памяти (режим без базы) и в SQL, — и проверять надо обе: первая
     * редакция искала подстроку `filter.includeService`, а она осталась в аргументах запроса,
     * когда отбор в памяти убрали. Поломка прошла мимо (журнал 485). Само поведение
     * проверяется тестом рядом с кодом: `service-actions-hidden.service.test.ts`.
     */
    expect(
      /!filter\.includeService && SERVICE_ACTIONS\.includes/.test(service),
      'отбор в памяти (режим без базы)'
    ).toBe(true);
    expect(/not \(l\.action = any\(/.test(service), 'отбор в SQL').toBe(true);
    expect(read(AUDIT), 'на экране есть переключатель').toContain('include_service');
  });

  it('в «Компаниях» один призыв, а не два оранжевых', () => {
    // 5.12.4: «Добавить компанию» в шапке и «Добавить первую компанию» в пустом состоянии.
    const source = read(CLIENTS);
    expect(source).toContain('hasClients');
    expect(
      /primaryAction=\{\{ label: 'Добавить компанию'/.test(source),
      'кнопка шапки обязана зависеть от того, есть ли уже компании'
    ).toBe(false);
  });

  it('«Мои документы» не повторяют заголовок трижды', () => {
    // 5.12.5: страница → блок → пустое состояние, и все три про одно и то же.
    expect(read(DOCS_SCREEN)).toContain('title={null}');
  });

  it('чат убран из меню ВСЕХ ролей (решение Р3)', () => {
    const chat = navigationModel.find((item) => item.href === '/chat');
    expect(chat, 'раздел остаётся в модели — его код не удаляют').toBeDefined();
    expect(chat?.featureFlag, 'показ раздела решает флаг функции').toBe('chat');

    // Права, при которых он был бы виден: `tenant.read` есть у всех ролей.
    const visible = getVisibleNavigation(sessionWith(['tenant.read', 'learners.read']));
    expect(
      visible.some((item) => item.href === '/chat'),
      'при выключенном флаге чата в меню нет ни у одной роли'
    ).toBe(false);
    expect(visible.length, 'остальные разделы на месте').toBeGreaterThan(0);
  });

  it('диаграмма на нулевых данных объясняет себя, а не рисует пустоту', () => {
    // 5.12.7: строки есть, значения нули — столбики нулевой длины выглядят как поломка.
    const source = read(CHARTS);
    expect(source).toContain('data.every((one) => one.value === 0)');
    expect(source, 'у диаграммы есть ось отсчёта').toContain('<line');
  });

  it('с каждого графика есть путь к выгрузке (решение Р4)', () => {
    const source = read(ANALYTICS);
    const links = (source.match(/Выгрузить в отчёт/g) ?? []).length;
    const charts = (source.match(/<BarChart\b/g) ?? []).length;
    expect(charts, 'графики обязаны находиться').toBeGreaterThan(1);
    expect(links, 'ссылка — у каждого графика, а не одна на экран').toBe(charts);
  });

  it('завершаемость и сдачу считает ОДИН слой на аналитику и отчёты (решение Р4)', () => {
    /*
     * Правила совпадали слово в слово в двух местах — и именно поэтому их разъезд был
     * вопросом времени: поправят одно, а второе продолжит считать по-старому (журнал 483).
     */
    const metrics = read(METRICS);
    expect(metrics).toContain('export const completionRate');
    expect(metrics).toContain('export const examPassRate');
    expect(metrics).toContain('export const isGenuinePass');

    for (const [name, file] of [
      ['аналитика', DASHBOARD],
      ['сводка показателей', SERVICE]
    ] as const) {
      expect(read(file), `${name} обязана брать расчёт из общего слоя`).toContain(
        "from './learning-metrics.js'"
      );
    }
    expect(
      /passed && \w+\.status !== 'needs_review'/.test(read(SERVICE)),
      'своё правило сдачи рядом с общим — это и есть будущий разъезд'
    ).toBe(false);
  });

  it('правило записано в docs/ui/patterns.md', () => {
    const doc = readFileSync(PATTERNS, 'utf8');
    expect(doc).toContain('## Э12');
    expect(doc).toContain('featureFlag');
  });
});
