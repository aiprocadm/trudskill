import { describe, expect, it } from 'vitest';

import {
  readTenantBranding,
  resolveTenantDisplayName,
  validateBrandingInput
} from './tenant-branding.js';

describe('tenant branding (ФТ-D3.1)', () => {
  describe('readTenantBranding — терпимое чтение (мусор не ломает вёрстку)', () => {
    it('валидный бренд читается целиком, цвета нормализуются к нижнему регистру', () => {
      const branding = readTenantBranding({
        payload: {
          branding: {
            displayName: '  УЦ «Пример»  ',
            logoUrl: 'https://cdn.example.ru/logo.png',
            brandColor: '#3B4FE4',
            accentColor: '#ff7a45'
          }
        }
      });
      expect(branding).toEqual({
        displayName: 'УЦ «Пример»',
        logoUrl: 'https://cdn.example.ru/logo.png',
        brandColor: '#3b4fe4',
        accentColor: '#ff7a45'
      });
    });

    it.each([
      ['нет settings', undefined],
      ['нет payload', {}],
      ['branding не объект', { payload: { branding: 'зелёненький' } }],
      ['branding массив', { payload: { branding: ['#fff'] } }]
    ])('%s → пустой бренд (полный дефолт)', (_label, settings) => {
      expect(readTenantBranding(settings as never)).toEqual({});
    });

    it('каждое кривое поле отбрасывается независимо, валидные остаются', () => {
      const branding = readTenantBranding({
        payload: {
          branding: {
            displayName: '   ',
            logoUrl: 'javascript:alert(1)',
            brandColor: '#12345', // короткий hex
            accentColor: '#FF7A45'
          }
        }
      });
      expect(branding).toEqual({ accentColor: '#ff7a45' });
    });

    it('rgb()/имена цветов и слишком длинные значения не проходят', () => {
      const branding = readTenantBranding({
        payload: {
          branding: {
            brandColor: 'rgb(59,79,228)',
            accentColor: 'coral',
            displayName: 'x'.repeat(121),
            logoUrl: `https://x.ru/${'a'.repeat(500)}`
          }
        }
      });
      expect(branding).toEqual({});
    });
  });

  describe('validateBrandingInput — строгая запись', () => {
    it('кривой цвет — ошибка с кодом, а не молчаливый дефолт', () => {
      const { issues } = validateBrandingInput({ brandColor: '#зелёный' });
      expect(issues).toEqual([{ field: 'brandColor', code: 'invalid_brand_color' }]);
    });

    it('пустая строка = сброс поля (undefined), это не ошибка', () => {
      const { branding, issues } = validateBrandingInput({ logoUrl: '', displayName: 'УЦ' });
      expect(issues).toEqual([]);
      expect('logoUrl' in branding).toBe(true);
      expect(branding.logoUrl).toBeUndefined();
      expect(branding.displayName).toBe('УЦ');
    });

    it('не переданные поля не трогаются (частичное обновление)', () => {
      const { branding } = validateBrandingInput({ accentColor: '#FF7A45' });
      expect(branding).toEqual({ accentColor: '#ff7a45' });
      expect('displayName' in branding).toBe(false);
    });
  });

  describe('resolveTenantDisplayName', () => {
    it('бренд → имя тенанта → нейтральное, по цепочке', () => {
      expect(resolveTenantDisplayName({ displayName: 'УЦ' }, 'Demo Tenant')).toBe('УЦ');
      expect(resolveTenantDisplayName({}, 'Demo Tenant')).toBe('Demo Tenant');
      expect(resolveTenantDisplayName({}, '   ')).toBe('учебный центр');
      expect(resolveTenantDisplayName({}, null)).toBe('учебный центр');
    });
  });
});
