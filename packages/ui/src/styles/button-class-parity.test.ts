import { describe, expect, it } from 'vitest';

import { uiGlobalStyles } from './index.js';

/**
 * `UI-020` / `ФТ-H4`: у кнопки один вид независимо от того, каким классом её позвали.
 *
 * История. Модификатор кнопки живёт в двух написаниях сразу — `ui-button--primary` (новое,
 * 22 места) и `ui-button-primary` (прежнее, 12 мест). Цвет им задан общим правилом, а вот
 * базовое — высота, рамка, радиус, отступы — перечисляло **только прежнее** написание.
 * Настоящую кнопку это спасало: правило начинается с голого `button`. А `<Link>` — это тег
 * `a`, и ссылка с одним лишь `ui-button--primary` оставалась коралловым прямоугольником без
 * отступов и высоты; на телефоне она не дотягивала до 44×44px, то есть нарушала решение
 * владельца №C. Так были сломаны «Создать курс» и переход к группе после импорта.
 *
 * Сторож держит паритет: каждый класс-модификатор кнопки обязан стоять и в базовом правиле,
 * и в правиле телефона, и в правиле ссылки-кнопки.
 */

const MODIFIERS = [
  '.ui-button--primary',
  '.ui-button--secondary',
  '.ui-button--ghost',
  '.ui-button--danger',
  '.ui-button-primary',
  '.ui-button-secondary',
  '.ui-button-ghost',
  '.ui-button-danger'
];

/** Правило, у которого в селекторе есть `нужное` и в теле — `свойство`. */
const ruleWith = (selectorPart: string, declaration: string): string | undefined =>
  uiGlobalStyles
    .split('\n')
    .find((line) => line.includes(selectorPart) && line.includes(declaration));

describe('UI-020 · оба написания модификатора кнопки одеты одинаково', () => {
  const base = ruleWith('button,.ui-button,', 'height: 40px');
  const phone = ruleWith('button,.ui-button,', 'height: 44px');
  const asLink = ruleWith('a.ui-button,', 'text-decoration: none');

  it('базовое правило кнопки найдено', () => {
    expect(base, 'правило высоты кнопки не найдено — сторож ослеп').toBeTruthy();
    expect(phone, 'правило высоты кнопки на телефоне не найдено').toBeTruthy();
    expect(asLink, 'правило «ссылка в одежде кнопки» не найдено').toBeTruthy();
  });

  it.each(MODIFIERS)('%s получает высоту, рамку и отступы', (modifier) => {
    expect(base!.includes(`${modifier},`) || base!.includes(`${modifier} `)).toBe(true);
  });

  it.each(MODIFIERS)('%s дотягивает до 44px на телефоне (ФТ-H4)', (modifier) => {
    expect(phone!.includes(`${modifier},`) || phone!.includes(`${modifier} `)).toBe(true);
  });

  /*
   * Ссылке правило нужно поимённо: голый `button` в базовом селекторе её не покрывает.
   * Проверяются только те написания, которыми в продукте одевают ссылки.
   */
  it.each(['.ui-button--primary', '.ui-button--secondary', '.ui-button-primary'])(
    'ссылка с %s ведёт себя как кнопка',
    (modifier) => {
      expect(asLink!.includes(`a${modifier},`) || asLink!.includes(`a${modifier} `)).toBe(true);
    }
  );
});
