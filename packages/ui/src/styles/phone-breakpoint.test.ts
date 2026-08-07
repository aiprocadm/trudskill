import { describe, expect, it } from 'vitest';

import { uiStyleLayers } from './index.js';

/**
 * ФТ-H4 (Фаза 5, Task 4): кабинет слушателя на 360px.
 *
 * Решение владельца №C: на телефоне — без горизонтальной прокрутки, тач-зоны
 * не меньше 44×44 px. До этой задачи самый узкий брейкпоинт был 768px, и на
 * 360px таблицы уезжали в горизонтальный скролл, а кнопки оставались 40px.
 */
describe('телефонный брейкпоинт 480px (ФТ-H4)', () => {
  it('слой таблиц содержит брейкпоинт телефона', () => {
    expect(uiStyleLayers.tables).toMatch(/@media \(max-width: 480px\)/);
  });

  it('таблица на телефоне превращается в карточки: шапка скрыта, подписи из data-label', () => {
    const phone = uiStyleLayers.tables.split('@media (max-width: 480px)')[1] ?? '';
    expect(phone).toMatch(/\.ui-table thead\s*\{[^}]*display:\s*none/);
    expect(phone).toMatch(/content:\s*attr\(data-label\)/);
  });

  it('карточный режим отключает горизонтальную прокрутку обёртки', () => {
    const phone = uiStyleLayers.tables.split('@media (max-width: 480px)')[1] ?? '';
    expect(phone).toMatch(/\.ui-table-wrap\s*\{[^}]*overflow-x:\s*visible/);
  });

  it('кнопки и поля ввода на телефоне не ниже 44px', () => {
    const phone = uiStyleLayers.forms.split('@media (max-width: 480px)')[1] ?? '';
    expect(phone).toMatch(/button[^{]*\{[^}]*height:\s*44px/);
    expect(phone).toMatch(/\.ui-input[^{]*\{[^}]*height:\s*44px/);
  });

  it('пункты оглавления курса на телефоне не ниже 44px', () => {
    const phone = uiStyleLayers.courseViewer.split('@media (max-width: 480px)')[1] ?? '';
    expect(phone).toMatch(/\.course-toc__material\s*\{[^}]*min-height:\s*44px/);
  });
});
