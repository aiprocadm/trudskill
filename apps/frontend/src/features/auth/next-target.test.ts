import { describe, expect, it } from 'vitest';

import { parseSafeNextTarget, resolveNextTarget } from './next-target';

describe('parseSafeNextTarget: открытый редирект', () => {
  // Каждая строка ниже — способ увести человека на чужой сайт по ссылке вида
  // /login?next=<...>. Все они обязаны отвергаться: после входа мы уходим только
  // на собственный адрес.
  const hostile: Array<[string, string]> = [
    ['протокол-относительный адрес', '//evil.com'],
    ['протокол-относительный с путём', '//evil.com/steal'],
    ['абсолютный https', 'https://evil.com'],
    ['абсолютный http', 'http://evil.com/path'],
    ['протокол в верхнем регистре', 'HTTPS://evil.com'],
    ['javascript-псевдопротокол', 'javascript:alert(1)'],
    ['data-псевдопротокол', 'data:text/html,<script>alert(1)</script>'],
    ['обратный слэш вместо второго', '/\\evil.com'],
    ['два обратных слэша', '\\\\evil.com'],
    ['закодированный обратный слэш', '/%5Cevil.com'],
    ['управляющий символ рвёт проверку', '/\t/evil.com'],
    ['перевод строки внутри', '/\n/evil.com'],
    ['пробел перед протокол-относительным', '  //evil.com'],
    ['адрес с логином-приманкой', 'https://our.site@evil.com'],
    ['без ведущего слэша', 'evil.com'],
    ['относительный подъём вверх', '../admin'],
    ['пустая строка', ''],
    ['только пробелы', '   '],
    /*
     * Точечные сегменты — обход, который проверка НАЧАЛА строки увидеть не может:
     * «/..//evil.com» начинается с одного «/», а после схлопывания `..` разбором
     * превращается в «//evil.com», то есть в чужой хост. Найдено рецензентом; до
     * правки все три варианта проходили и возвращали готовый протокол-относительный
     * адрес. Проверять надо результат разбора, а не то, что прислали.
     */
    ['подъём вверх схлопывается в чужой хост', '/..//evil.com'],
    ['точка-сегмент схлопывается в чужой хост', '/.//evil.com'],
    ['подъём из глубины схлопывается в чужой хост', '/foo/../..//evil.com'],
    ['подъём с обратным слэшем', '/..\\\\evil.com'],
    ['закодированный подъём', '/%2e%2e//evil.com']
  ];

  it.each(hostile)('отвергает: %s', (_title, raw) => {
    expect(parseSafeNextTarget(raw)).toBeNull();
  });

  it('отвергает отсутствующее значение', () => {
    expect(parseSafeNextTarget(null)).toBeNull();
    expect(parseSafeNextTarget(undefined)).toBeNull();
  });
});

describe('parseSafeNextTarget: страницы входа и выхода', () => {
  // Вернуть человека на форму входа сразу после успешного входа — это выглядит как
  // «вход не сработал», а /logout мгновенно выкинет его обратно.
  it.each(['/login', '/login/magic-link/abc', '/logout', '/logout?reason=x'])(
    'отвергает %s',
    (raw) => {
      expect(parseSafeNextTarget(raw)).toBeNull();
    }
  );

  it('не путает похожий по началу адрес с формой входа', () => {
    expect(parseSafeNextTarget('/login-history')).toBe('/login-history');
  });
});

describe('parseSafeNextTarget: нормальные внутренние адреса', () => {
  it.each([
    '/',
    '/learner',
    '/learner/courses',
    '/learner/courses/course_1',
    '/groups?status=active&page=2',
    '/documents#section-3',
    '/admin/cockpit?tab=queue#row'
  ])('принимает %s', (raw) => {
    expect(parseSafeNextTarget(raw)).toBe(raw);
  });

  it('обрезает пробелы по краям', () => {
    expect(parseSafeNextTarget('  /learner  ')).toBe('/learner');
  });

  it('сохраняет кириллический путь (в процентной записи адреса)', () => {
    const parsed = parseSafeNextTarget('/курсы');
    expect(parsed).not.toBeNull();
    expect(decodeURIComponent(parsed ?? '')).toBe('/курсы');
  });
});

describe('resolveNextTarget', () => {
  it('ведёт на запрошенный адрес, если он безопасен', () => {
    expect(resolveNextTarget('/learner/courses', '/')).toBe('/learner/courses');
  });

  it('возвращает запасной адрес, если next опасен', () => {
    expect(resolveNextTarget('//evil.com', '/')).toBe('/');
  });

  it('возвращает запасной адрес, если next нет', () => {
    expect(resolveNextTarget(null, '/')).toBe('/');
  });

  it('уважает нестандартный запасной адрес', () => {
    expect(resolveNextTarget('javascript:alert(1)', '/workspace')).toBe('/workspace');
  });

  it('для next="/" даёт тот же результат, что и без next', () => {
    expect(resolveNextTarget('/', '/')).toBe(resolveNextTarget(null, '/'));
  });
});
