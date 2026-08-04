import { describe, expect, it } from 'vitest';

import { normalizeHost, resolveTenantHost } from './host-resolve';

const BASE = 'lms.example.ru';

describe('resolveTenantHost (ФТ-D3.2)', () => {
  it('поддомен → код арендатора', () => {
    expect(resolveTenantHost('demo.lms.example.ru', BASE)).toEqual({
      kind: 'tenant',
      code: 'demo'
    });
    expect(resolveTenantHost('my-center.lms.example.ru', BASE)).toEqual({
      kind: 'tenant',
      code: 'my-center'
    });
  });

  it('порт и регистр не мешают', () => {
    expect(resolveTenantHost('Demo.LMS.Example.RU:3000', BASE)).toEqual({
      kind: 'tenant',
      code: 'demo'
    });
    expect(normalizeHost('  Demo.Lms.ru:443 ')).toBe('demo.lms.ru');
  });

  it('сам базовый домен и www — не арендатор, а витрина платформы', () => {
    expect(resolveTenantHost(BASE, BASE)).toEqual({ kind: 'base' });
    expect(resolveTenantHost(`www.${BASE}`, BASE)).toEqual({ kind: 'base' });
  });

  it('локальная разработка и заход по IP работают как раньше', () => {
    expect(resolveTenantHost('localhost:3000', BASE)).toEqual({ kind: 'base' });
    expect(resolveTenantHost('127.0.0.1:3000', BASE)).toEqual({ kind: 'base' });
    expect(resolveTenantHost('192.168.80.10', BASE)).toEqual({ kind: 'base' });
    expect(resolveTenantHost('[::1]:3000', BASE)).toEqual({ kind: 'base' });
  });

  it('базовый домен не настроен — режим одного арендатора, поддомены не выдумываем', () => {
    expect(resolveTenantHost('demo.lms.example.ru', '')).toEqual({ kind: 'base' });
    expect(resolveTenantHost('demo.lms.example.ru', undefined)).toEqual({ kind: 'base' });
  });

  it('чужой домен не обслуживаем', () => {
    expect(resolveTenantHost('demo.other.ru', BASE)).toEqual({ kind: 'foreign' });
    expect(resolveTenantHost('lms.example.ru.evil.com', BASE)).toEqual({ kind: 'foreign' });
    // Подстрока базового домена без точки — не поддомен: `xlms.example.ru` чужой.
    expect(resolveTenantHost('xlms.example.ru', 'lms.example.ru')).toEqual({ kind: 'foreign' });
  });

  it('многоуровневый поддомен — не код арендатора', () => {
    expect(resolveTenantHost('a.b.lms.example.ru', BASE)).toEqual({ kind: 'foreign' });
  });

  it('код с недопустимыми символами отвергается той же маской, что на сервере', () => {
    expect(resolveTenantHost('ПРИМЕР.lms.example.ru', BASE)).toEqual({ kind: 'foreign' });
    expect(resolveTenantHost('-demo.lms.example.ru', BASE)).toEqual({ kind: 'foreign' });
    expect(resolveTenantHost('de_mo.lms.example.ru', BASE)).toEqual({ kind: 'foreign' });
  });

  it('пустой Host — режим по умолчанию, а не падение', () => {
    expect(resolveTenantHost(null, BASE)).toEqual({ kind: 'base' });
    expect(resolveTenantHost('', BASE)).toEqual({ kind: 'base' });
  });
});
