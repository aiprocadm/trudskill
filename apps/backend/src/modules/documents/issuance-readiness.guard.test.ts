import { describe, expect, it } from 'vitest';

import { issuanceBlockedMessage } from './issuance-readiness.service.js';

import type { IssuanceReadiness } from './issuance-readiness.service.js';

/**
 * Документы не выдаются, пока центр не настроен (ТЗ 8.2, решение владельца Р6).
 *
 * **Зачем.** Удостоверение без реквизитов, без действующей лицензии, без комиссии, без бланка и
 * без номера — это не документ, а бумага: в реестре его не найти, при проверке он
 * недействителен. Р6 требует «запрет выдачи документов, пока не закрыты обязательные шаги — с
 * понятным объяснением, а не молчаливой ошибкой» (журнал 528).
 *
 * **Что закреплено.**
 *
 * 1. Пять обязательных шагов Р6 — ровно те, что названы решением.
 * 2. Отказ говорит, ЧТО не сделано и КУДА идти, а не «ошибка 412».
 * 3. Настроенный центр не получает запрета.
 */

const ready: IssuanceReadiness = {
  requisites: true,
  license: true,
  commission: true,
  template: true,
  numbering: true
};

describe('запрет выдачи документов недонастроенным центром (ТЗ 8.2, Р6)', () => {
  it('настроенный центр выдаёт документы без помех', () => {
    expect(issuanceBlockedMessage(ready)).toBeNull();
  });

  it('каждый обязательный шаг Р6 держит запрет в одиночку', () => {
    for (const key of Object.keys(ready) as Array<keyof IssuanceReadiness>) {
      const message = issuanceBlockedMessage({ ...ready, [key]: false });
      expect(message, `без шага «${key}» выдавать нельзя`).toBeTruthy();
    }
  });

  it('отказ называет, что именно не сделано и куда идти', () => {
    const message = issuanceBlockedMessage({ ...ready, numbering: false });
    expect(message).toContain('правило нумерации');
    expect(message, 'человеку нужно место, а не название таблицы').toContain('Документы');
    expect(message, 'технического кода в тексте быть не должно').not.toMatch(/[A-Za-z_]{4,}/);
  });

  it('несколько незакрытых шагов перечисляются все', () => {
    const message = issuanceBlockedMessage({
      ...ready,
      license: false,
      commission: false
    });
    expect(message).toContain('лицензию');
    expect(message, 'иначе человек починит одно и снова упрётся').toContain('комиссию');
  });

  it('обязательных шагов ровно пять — как в решении Р6', () => {
    expect(Object.keys(ready).sort()).toEqual([
      'commission',
      'license',
      'numbering',
      'requisites',
      'template'
    ]);
  });
});
