import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { TenantController } from './tenant.controller.js';

import type { RequestContext } from '../../common/context/request-context.js';

/** ФТ-D3.1 (Фаза 4 Task 4): ручки бренда — строгая запись, честный isDefault. */
describe('TenantController branding (ФТ-D3.1)', () => {
  const context = { tenantId: 'tenant_demo', userId: 'u_admin' } as RequestContext;

  const makeController = (branding: Record<string, string> = {}) => {
    const service = {
      getBranding: vi.fn().mockResolvedValue(branding),
      updateBranding: vi.fn().mockImplementation(async (_tenantId, patch) => patch)
    };
    return { controller: new TenantController(service as never), service };
  };

  it('GET: isDefault=true при пустом бренде и false при заданном', async () => {
    const empty = makeController({});
    await expect(empty.controller.branding(context)).resolves.toEqual({
      branding: {},
      isDefault: true
    });

    const branded = makeController({ displayName: 'УЦ' });
    await expect(branded.controller.branding(context)).resolves.toEqual({
      branding: { displayName: 'УЦ' },
      isDefault: false
    });
  });

  it('PUT: кривой цвет — 400 invalid_branding с перечнем полей, сервис не зовётся', async () => {
    const { controller, service } = makeController();
    await expect(
      controller.updateBranding(context, { brandColor: 'зелёненький', logoUrl: 'ftp://x' })
    ).rejects.toMatchObject({
      constructor: BadRequestException,
      response: {
        code: 'invalid_branding',
        issues: [
          { field: 'logoUrl', code: 'invalid_logo_url' },
          { field: 'brandColor', code: 'invalid_brand_color' }
        ]
      }
    });
    expect(service.updateBranding).not.toHaveBeenCalled();
  });

  it('PUT: валидный ввод нормализуется и уходит в сервис; пустая строка = сброс поля', async () => {
    const { controller, service } = makeController();
    await controller.updateBranding(context, {
      displayName: '  УЦ «Пример»  ',
      brandColor: '#3B4FE4',
      logoUrl: ''
    });
    expect(service.updateBranding).toHaveBeenCalledWith('tenant_demo', {
      displayName: 'УЦ «Пример»',
      brandColor: '#3b4fe4',
      logoUrl: undefined
    });
  });
});
