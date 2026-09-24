import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  PII_REVEAL_PERMISSION,
  canRevealPii,
  maskLearnerRow,
  maskedBirthDate,
  maskedPassport,
  maskedSnils,
  piiAccessMetadata
} from './pii-masking.js';

/**
 * Персональные данные в списках показываются частично (ТЗ «Стабилизация, UX и развитие», 17.2).
 *
 * **Что было.** Список слушателей отдавал СНИЛС ПОЛНОСТЬЮ — всем, у кого есть право видеть
 * список. А список открыт менеджеру, который ведёт клиентов, и преподавателю, который ведёт
 * группу: им нужно узнать человека в строке, а не его номер в пенсионном фонде.
 *
 * Разница принципиальная. Полный номер на экране можно переписать, сфотографировать, выгрузить
 * в таблицу и унести — причём незаметно: следа в системе такой просмотр не оставлял, и на
 * проверке ответить «кто видел эти данные» было нечем (журнал 577).
 *
 * **Что закреплено.** В списках и в карточке — частично, всегда, независимо от прав. Полностью
 * — по отдельному действию, с отдельным правом и записью в журнал доступа.
 */

const here = dirname(fileURLToPath(import.meta.url));
const controller = readFileSync(resolve(here, 'mvp.controller.ts'), 'utf8');
const piiService = readFileSync(resolve(here, 'pii', 'learner-pii.service.ts'), 'utf8');

describe('что именно остаётся видно (ТЗ 17.2)', () => {
  it('от СНИЛС — последние две цифры', () => {
    /*
     * Сотруднику в списке нужно одно: не перепутать двух Ивановых. Для этого хватает двух
     * цифр, а восстановить по ним номер нельзя.
     */
    expect(maskedSnils('123-456-789 00')).toBe('***-***-*** 00');
    expect(maskedSnils('12345678900')).toBe('***-***-*** 00');
  });

  it('от паспорта — последние три цифры номера, серия скрыта целиком', () => {
    /*
     * Серия почти не различает людей: она общая для целого региона и года. А вот вместе с
     * номером это уже готовый документ.
     */
    expect(maskedPassport('4510 123456')).toBe('**** ***456');
  });

  it('от даты рождения — только год', () => {
    /* День и месяц спрашивают при подтверждении личности по телефону. В списке они не нужны. */
    expect(maskedBirthDate('1985-03-17')).toBe('**.**.1985');
  });

  it('пусто превращается в прочерк, а не в пустую ячейку', () => {
    /* Пустая ячейка выглядит как сбой загрузки, и человек нажимает «обновить» без нужды. */
    expect(maskedSnils(undefined)).toBe('—');
    expect(maskedPassport(null)).toBe('—');
    expect(maskedBirthDate('')).toBe('—');
  });

  it('обрывок не выдаёт себя за целое значение', () => {
    expect(maskedSnils('12')).toBe('***');
    expect(maskedPassport('7')).toBe('***');
    expect(maskedBirthDate('позавчера')).toBe('***');
  });
});

describe('маска не портит исходные данные (ТЗ 17.2)', () => {
  it('возвращается новая запись, исходная не меняется', () => {
    /*
     * Состояние арендатора в этом модуле живёт в общей структуре: изменить запись на месте
     * значило бы испортить данные для всех последующих запросов, и маска утекла бы в базу.
     */
    const learner = { id: 'l1', snils: '123-456-789 00', passport: '4510 123456' };
    const masked = maskLearnerRow(learner);
    expect(masked).not.toBe(learner);
    expect(learner.snils, 'исходная запись испорчена').toBe('123-456-789 00');
    expect(masked.snils).toBe('***-***-*** 00');
  });

  it('поля, которых в записи нет, не появляются', () => {
    /*
     * Иначе в ответе возникали бы прочерки там, где полей отродясь не было, и экран показывал
     * бы колонки, которых у этой сущности нет.
     */
    const masked = maskLearnerRow({ id: 'l1' } as { id: string; snils?: string });
    expect('snils' in masked).toBe(false);
    expect('passport' in masked).toBe(false);
  });
});

describe('раскрытие — отдельное право и отдельное действие (ТЗ 17.2)', () => {
  it('право берётся из разрешённого множества, а не из названия роли', () => {
    /*
     * Набор прав роли живёт в базе и не совпадает с тем, что подсказывает название: на этом
     * в проекте обжигались дважды за одну сессию.
     */
    expect(canRevealPii(['learners.read'])).toBe(false);
    expect(canRevealPii([PII_REVEAL_PERMISSION])).toBe(true);
    expect(canRevealPii(undefined)).toBe(false);
  });

  it('в журнал попадает, ЧТО именно раскрыли', () => {
    /*
     * На проверке спрашивают точно: какие поля видели. «Что-то смотрели» — не ответ.
     */
    expect(
      piiAccessMetadata({ action: 'pii.revealed', learnerId: 'l1', fields: ['snils'] })
    ).toEqual({ learnerId: 'l1', fields: ['snils'] });
  });

  it('причина попадает в журнал, если её назвали', () => {
    expect(
      piiAccessMetadata({
        action: 'pii.revealed',
        learnerId: 'l1',
        fields: ['snils'],
        reason: 'обращение слушателя по телефону'
      }).reason
    ).toBe('обращение слушателя по телефону');
  });

  it('сами персональные данные в журнал НЕ попадают', () => {
    /*
     * Иначе журнал доступа сам стал бы копией персональных данных — и его утечка была бы
     * равносильна утечке самой базы.
     */
    const metadata = piiAccessMetadata({
      action: 'pii.revealed',
      learnerId: 'l1',
      fields: ['snils', 'passport']
    });
    expect(JSON.stringify(metadata)).not.toMatch(/\d{3}-\d{3}-\d{3}/);
  });
});

describe('маска действительно применена, а не только написана (ТЗ 17.2)', () => {
  /*
   * «Построено и не подключено» — самая частая находка в этом коде. Функции проверены выше;
   * здесь проверяется, что ими ПОЛЬЗУЮТСЯ там, где данные уходят наружу.
   */
  it('список слушателей маскирует каждую строку', () => {
    expect(controller).toMatch(
      /listLearners\([\s\S]{0,900}items: page\.items\.map\(\(item\) => maskLearnerRow\(item\)\)/
    );
  });

  it('карточка слушателя тоже маскирует — и из снимка, и из таблицы (Фаза 1, срез 2b)', () => {
    expect(controller).toMatch(/maskLearnerRow\(this\.mvpService\.getLearner\(/);
    expect(controller).toMatch(/maskLearnerRow\(await this\.normalizedReads\.getLearner\(/);
  });

  it('раскрытие защищено правом на персональные данные', () => {
    const reveal = controller.slice(controller.indexOf("@Post('learners/:id/pii/reveal')"));
    expect(reveal.slice(0, 400)).toContain("@RequirePermissions('learners.pii.manage')");
  });

  it('раскрытие пишется в журнал', () => {
    expect(piiService).toMatch(/action: 'learners\.pii_revealed'/);
    expect(piiService).toMatch(/piiAccessMetadata\(/);
  });
});

// МГ-C1.1 (срез 8.12, РМ78): дата рождения под своим именем поля и паспорт-объект тоже маскируются.
describe('маска знает поле dateOfBirth и паспорт-объект', () => {
  it('dateOfBirth оставляет только год, паспорт-объект — последние три цифры номера', () => {
    const row = maskLearnerRow({
      id: 'l1',
      dateOfBirth: '1990-05-01',
      passport: { series: '4512', number: '123456', issuedBy: 'ОВД' }
    });
    expect(row.dateOfBirth).toBe('**.**.1990');
    expect(row.passport).toBe('**** ***456');
    expect(JSON.stringify(row)).not.toContain('4512');
  });
});
