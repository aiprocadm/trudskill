import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import {
  ChangePlatformTenantStatusRequest,
  CreatePlatformTenantRequest
} from './platform-tenants.dto.js';

/** ФТ-D2.2: схема запросов платформенной админки тенантов. */
describe('CreatePlatformTenantRequest', () => {
  it('валидный запрос проходит', () => {
    const dto = plainToInstance(CreatePlatformTenantRequest, {
      code: 'uc-1',
      name: 'Новый центр',
      status: 'trial'
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('код — только латиница/цифры/дефис: он попадает в URL и системные идентификаторы', () => {
    for (const code of ['Центр', 'UC 1', '-lead', 'a_b', '']) {
      const dto = plainToInstance(CreatePlatformTenantRequest, { code, name: 'X' });
      expect(validateSync(dto).length, `code=${JSON.stringify(code)}`).toBeGreaterThan(0);
    }
  });

  it('статус вне жизненного цикла отбивается', () => {
    const dto = plainToInstance(CreatePlatformTenantRequest, {
      code: 'uc1',
      name: 'X',
      status: 'deleted'
    });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
});

describe('ChangePlatformTenantStatusRequest', () => {
  it('принимает каждый из четырёх статусов жизненного цикла', () => {
    for (const status of ['trial', 'active', 'suspended', 'archived']) {
      const dto = plainToInstance(ChangePlatformTenantStatusRequest, { status });
      expect(validateSync(dto), status).toHaveLength(0);
    }
  });

  it('произвольная строка не проходит', () => {
    const dto = plainToInstance(ChangePlatformTenantStatusRequest, { status: 'frozen' });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
});
