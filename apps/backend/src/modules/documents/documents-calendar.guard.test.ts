import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Сторож журнала 300: календарная дата документа считается в поясе ЦЕНТРА, не в UTC.
 *
 * Почему сторож нужен. `new Date().toISOString().slice(0, 10)` выглядит безобидно и пишется
 * на автомате — именно так дата и оказалась в UTC. Для центра за Уралом это значило
 * вчерашнюю дату на удостоверении и номер из закрытой серии; настройка часового пояса,
 * которую центр видит на экране реквизитов, при этом не влияла ни на что.
 *
 * Сторож читает БОЕВОЙ код и следит за двумя вещами: дата и период номера идут через
 * календарь центра, и в модуле документов не появилось нового «сегодня» из UTC.
 */

const backendRoot = process.cwd().endsWith(join('apps', 'backend'))
  ? process.cwd()
  : join(process.cwd(), 'apps', 'backend');

const read = (relative: string): string => readFileSync(join(backendRoot, relative), 'utf8');

const SERVICE = 'src/modules/documents/documents.service.ts';

describe('дата документа — по календарю центра (журнал 300)', () => {
  it('дата и период номера берутся из календаря центра', () => {
    const source = read(SERVICE);

    expect(source, 'дата документа обязана считаться в поясе центра').toContain(
      'todayIn(this.state.tenantTimezone'
    );
    expect(source, 'период номера обязан считаться в поясе центра').toContain(
      'periodKeyIn(this.state.tenantTimezone'
    );
  });

  it('в сервисе документов не осталось «сегодня» из UTC-мгновения', () => {
    const source = read(SERVICE);

    // Именно этот узор и был дефектом: мгновение -> календарная дата минуя пояс центра.
    expect(source).not.toMatch(/toISOString\(\)\.slice\(0,\s*10\)/);
    expect(source).not.toMatch(/getUTCFullYear\(\)/);
    expect(source).not.toMatch(/this\.now\(\)\.slice\(0,\s*10\)/);
  });

  it('пояс доезжает до состояния на ОБОИХ путях — запрос и фоновая работа', () => {
    const assignment = 'tenantTimezone = await this.timezones.resolve(tenantId)';

    expect(
      read('src/modules/documents/infrastructure/documents-request-persistence.interceptor.ts'),
      'путь запроса обязан узнавать пояс центра'
    ).toContain(assignment);
    expect(
      read('src/modules/documents/documents-tenant-runner.service.ts'),
      'фоновый путь (выдача по завершению обучения) обязан узнавать пояс центра'
    ).toContain(assignment);
  });

  it('неизвестный пояс не роняет выпуск — в календаре есть запасной вариант', () => {
    const calendar = read('src/common/utils/tenant-calendar.ts');

    expect(calendar).toContain('DEFAULT_TENANT_TIMEZONE');
    // Без «поймать и продолжить» опечатка в настройке лишила бы центр выпуска документов.
    expect(calendar).toContain('catch');
  });
});
