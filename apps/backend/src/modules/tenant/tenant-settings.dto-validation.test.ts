import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { UpdateTenantSettingsDto } from './tenant.request-dto.js';

/**
 * Настройки центра проверяются ПО СУЩЕСТВУ, а не по форме (журнал 303/304).
 *
 * Пока часовой пояс ни на что не влиял, узор `Europe/Что-угодно` был безобиден. С тех пор
 * как по нему считаются дата удостоверения и сроки, несуществующий пояс — это дефект:
 * центр сохранял опечатку, расчёт молча уходил на пояс по умолчанию, и человек никогда
 * не узнавал, почему даты «не те».
 */

const errorsFor = (payload: Record<string, unknown>) =>
  validateSync(plainToInstance(UpdateTenantSettingsDto, payload));

const messagesFor = (payload: Record<string, unknown>) =>
  errorsFor(payload)
    .flatMap((error) => Object.values(error.constraints ?? {}))
    .join(' | ');

describe('UpdateTenantSettingsDto — часовой пояс', () => {
  it('настоящие зоны принимаются', () => {
    for (const zone of ['Europe/Moscow', 'Asia/Novosibirsk', 'Asia/Kamchatka', 'UTC']) {
      expect(errorsFor({ timezone: zone }), `${zone} обязан приниматься`).toHaveLength(0);
    }
  });

  it('пояс, похожий на настоящий, но несуществующий — отклоняется', () => {
    // Ровно то, что пропускал прежний узор.
    expect(errorsFor({ timezone: 'Europe/Atlantis' })).not.toHaveLength(0);
    expect(errorsFor({ timezone: 'Asia/Новосибирск' })).not.toHaveLength(0);
    expect(errorsFor({ timezone: 'Moscow' })).not.toHaveLength(0);
  });

  it('ошибка называет пример, а не только запрет', () => {
    // Правило продукта: ошибка говорит, что произошло И что делать.
    expect(messagesFor({ timezone: 'Europe/Atlantis' })).toContain('Europe/Moscow');
  });
});

describe('UpdateTenantSettingsDto — язык интерфейса', () => {
  it('русский принимается', () => {
    expect(errorsFor({ locale: 'ru-RU' })).toHaveLength(0);
  });

  it('язык, которого в продукте нет, не принимается', () => {
    // Раньше «en-US» сохранялся и не влиял ни на что — обещание без исполнения.
    expect(errorsFor({ locale: 'en-US' })).not.toHaveLength(0);
    expect(errorsFor({ locale: 'de' })).not.toHaveLength(0);
  });

  it('ошибка объясняет, что переводов пока нет', () => {
    expect(messagesFor({ locale: 'en-US' })).toContain('ru-RU');
  });
});

describe('UpdateTenantSettingsDto — общее', () => {
  it('пустое тело допустимо: правят по одному полю', () => {
    expect(errorsFor({})).toHaveLength(0);
  });
});
