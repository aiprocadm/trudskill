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

  /*
   * Ревизия 2026-08-25. Комментарий в слое таблиц обещал «тач-зона 44px» рядом с
   * выделением строк, а флажок оставался 24×24 — палец промахивался ровно там, где идёт
   * массовая работа: выбрать нескольких слушателей и заархивировать.
   *
   * Проверяется ЗОНА, а не значок: флажок 44×44 выглядел бы огромным квадратом посреди
   * карточки, поэтому полем нажатия становится ячейка.
   */
  it('выделение строки на телефоне — тач-зона 44px, а не размер значка', () => {
    const phone = uiStyleLayers.tables.split('@media (max-width: 480px)')[1] ?? '';
    expect(phone).toMatch(/\.ui-table-select\s*\{[^}]*min-height:\s*44px/);
  });

  it('полоса шагов мастера на телефоне заменяется строкой «Шаг N из M» (TPL-004 §7.4)', () => {
    const phone = uiStyleLayers.foundation.split('@media (max-width: 480px)')[1] ?? '';
    expect(phone).toMatch(/\.ui-stepper\s*\{[^}]*display:\s*none/);
    expect(phone).toMatch(/\.ui-stepper__counter\s*\{[^}]*display:\s*block/);
  });

  it('пункты оглавления курса на телефоне не ниже 44px', () => {
    const phone = uiStyleLayers.courseViewer.split('@media (max-width: 480px)')[1] ?? '';
    expect(phone).toMatch(/\.course-toc__material\s*\{[^}]*min-height:\s*44px/);
  });

  /*
   * Каркас (Фаза 1 редизайна, UI-020). Пока эти правила жили в <style jsx>, сторож
   * их не видел — и вдобавок они промахивались мимо ссылок: их рендерит next/link,
   * scoped-класс styled-jsx на них не попадал, из-за чего приходилось писать
   * :global(...) с пометкой «давний дефект каркаса». Слой стал глобальным, обход
   * не нужен, а живой прогон на 360px показал 44px у всех шести элементов.
   */
  it('пункты меню и кнопки каркаса на телефоне не ниже 44px', () => {
    const phone = uiStyleLayers.shell.split('@media (max-width: 480px)')[1] ?? '';
    expect(phone).toMatch(/\.app-shell__link,[\s\S]{0,60}\{[^}]*min-height:\s*44px/);
    expect(phone).toMatch(/\.app-shell__more-toggle,[\s\S]{0,60}\{[^}]*min-height:\s*44px/);
    expect(phone).toMatch(/\.app-shell__menu-toggle\s*\{[^}]*height:\s*44px/);
    expect(phone).toMatch(/\.app-shell__search\s*\{[^}]*height:\s*44px/);
  });

  it('правила каркаса для ссылок больше не идут через :global — обход не нужен', () => {
    expect(uiStyleLayers.shell).not.toContain(':global(');
  });
});
