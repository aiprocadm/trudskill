import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { DEFAULT_TIMEZONE, RUSSIAN_TIMEZONES, SUPPORTED_LOCALES } from './timezones';
import { fromApp } from '../../e2e/app-root';

/**
 * Настройки центра выбираются, а не печатаются (журнал 303/304).
 *
 * Пояс вводился свободным текстом: опечатка сохранялась, сервер проверял только форму, а
 * расчёт дат молча уходил на московский календарь — центр в Новосибирске мог годами
 * выпускать документы по чужому времени и не узнать об этом.
 */

describe('часовые пояса для выбора', () => {
  it('каждый предлагаемый пояс существует на самом деле', () => {
    // Сервер проверяет пояс по списку платформы. Если экран предложит несуществующий,
    // сохранение упадёт у человека на глазах — сверяем тем же способом, что и сервер.
    for (const zone of RUSSIAN_TIMEZONES) {
      expect(
        () => new Intl.DateTimeFormat('en-CA', { timeZone: zone.value }).format(new Date()),
        `${zone.value} не существует — сервер такой пояс не примет`
      ).not.toThrow();
    }
  });

  it('подпись человеческая, а не сырой код', () => {
    for (const zone of RUSSIAN_TIMEZONES) {
      // Правило продукта: сырой код (`Asia/Novosibirsk`) значением в интерфейсе быть не может.
      expect(zone.label).not.toContain('/');
      expect(zone.label).toMatch(/[А-Яа-я]/);
      expect(zone.label).toContain('UTC');
    }
  });

  it('покрыты все одиннадцать поясов страны', () => {
    expect(RUSSIAN_TIMEZONES).toHaveLength(11);
    expect(RUSSIAN_TIMEZONES.map((zone) => zone.value)).toContain('Europe/Kaliningrad');
    expect(RUSSIAN_TIMEZONES.map((zone) => zone.value)).toContain('Asia/Kamchatka');
  });

  it('пояс по умолчанию есть в списке — иначе выбор откроется пустым', () => {
    expect(RUSSIAN_TIMEZONES.map((zone) => zone.value)).toContain(DEFAULT_TIMEZONE);
  });

  it('язык предлагается только тот, который продукт умеет', () => {
    expect(SUPPORTED_LOCALES).toEqual([{ value: 'ru-RU', label: 'Русский' }]);
  });
});

describe('экран реквизитов', () => {
  /*
   * Путь от ФАЙЛА, а не от текущего каталога: у набора два штатных запуска с разным cwd —
   * `pnpm test:frontend` из корня репозитория и `vitest` из `apps/frontend`. С `process.cwd()`
   * этот тест падал с ENOENT при первом и проходил при втором, то есть проверка зависела от
   * способа запуска, а не от кода.
   */
  const screen = readFileSync(fromApp('app', 'academy', 'requisites', 'page.tsx'), 'utf8');

  it('пояс и язык выбираются из списка, а не печатаются', () => {
    expect(screen, 'поля настроек обязаны быть выбором').toContain('SelectField');
    expect(screen).toContain('options={RUSSIAN_TIMEZONES}');
    expect(screen).toContain('options={SUPPORTED_LOCALES}');
  });

  it('свободного ввода пояса и языка не осталось', () => {
    // Именно этот узор и был дефектом: FormField — обычное текстовое поле.
    expect(screen).not.toMatch(/<FormField[\s\S]{0,120}label="Часовой пояс"/);
    expect(screen).not.toMatch(/<FormField[\s\S]{0,120}label="Язык интерфейса"/);
  });

  it('сохранённый ранее пояс вне списка не подменяется молча первым пунктом', () => {
    // <select> с неизвестным value показывает первый пункт: без явной проверки человек
    // увидел бы Калининград и «сохранил» его, не заметив подмены.
    expect(screen).toContain('RUSSIAN_TIMEZONES.some');
  });
});
