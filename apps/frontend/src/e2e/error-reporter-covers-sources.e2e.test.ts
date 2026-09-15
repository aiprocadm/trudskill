import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { fromApp } from './app-root';
import { stripComments } from './backend-source';

/**
 * Сбор ошибок видит все три источника, которые называет ТЗ (15.1).
 *
 * ТЗ перечисляет поимённо: «необработанные исключения, ошибки запросов, срабатывания
 * ErrorBoundary». Источник, отвалившийся при переделке, пропал бы МОЛЧА: сбор продолжал бы
 * работать, просто перестал бы видеть целый класс сбоев — а заметить это можно только по
 * отсутствию событий, то есть никогда.
 *
 * Сторож проверяет ещё и то, что подключение вообще смонтировано в корне приложения: файл,
 * который никто не подключил, — это не сбор ошибок, а его имитация.
 */

const INSTALL = fromApp('src', 'lib', 'observability', 'install.tsx');
const PROVIDERS = fromApp('src', 'app', 'providers.tsx');

describe('сбор ошибок подключён ко всем источникам', () => {
  it('подключены все три источника из ТЗ', () => {
    const code = stripComments(readFileSync(INSTALL, 'utf8'));

    const missing: string[] = [];
    if (!/subscribeRenderErrors\s*\(/.test(code)) missing.push('падения отрисовки (ErrorBoundary)');
    if (!/subscribeQueryErrors\s*\(/.test(code)) missing.push('отказы запросов');
    if (!/addEventListener\(\s*'error'/.test(code)) missing.push('необработанные исключения');
    if (!/addEventListener\(\s*'unhandledrejection'/.test(code)) {
      missing.push('необработанные отказы обещаний');
    }

    expect(
      missing,
      `источники, за которыми больше никто не следит:\n${missing.join('\n')}`
    ).toEqual([]);
  });

  it('номер случая уходит вместе с отказом запроса', () => {
    const code = stripComments(readFileSync(INSTALL, 'utf8'));
    expect(
      /requestId/.test(code),
      'без номера человек и разработчик не сойдутся на одном случае — это прямое требование 15.1'
    ).toBe(true);
  });

  it('сбор смонтирован в корне приложения', () => {
    const code = stripComments(readFileSync(PROVIDERS, 'utf8'));
    expect(
      /<ErrorReporting\s*\/>/.test(code),
      'неподключённый сбор ошибок — это его имитация, а не сбор'
    ).toBe(true);
  });
});
