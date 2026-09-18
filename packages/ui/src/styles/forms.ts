export const formStyles = `
.ui-input,.ui-select,.ui-textarea,input,select,textarea { height: 40px; border: 1px solid var(--ui-border-strong); border-radius: var(--ui-radius-md); padding: 0 12px; background: var(--ui-surface); color: var(--ui-text); font-family: inherit; font-size: var(--ui-font-size-md); transition: border-color var(--ui-duration-fast) var(--ui-ease), box-shadow var(--ui-duration-fast) var(--ui-ease); }
.ui-input:focus,.ui-select:focus,.ui-textarea:focus,input:focus,select:focus,textarea:focus { border-color: var(--ui-brand-600); }
textarea,.ui-textarea { min-height: 88px; padding: 9px 12px; }
.ui-field { display: grid; gap: 6px; }
.ui-field-label { font-size: var(--ui-font-size-sm); font-weight: var(--ui-font-weight-semibold); color: var(--ui-text-muted); }
.ui-field-hint { font-size: var(--ui-font-size-xs); color: var(--ui-text-muted); margin: 0; }
.ui-field-error { font-size: var(--ui-font-size-xs); color: var(--ui-danger-600); margin: 0; }
button,.ui-button,.ui-button--primary,.ui-button--secondary,.ui-button--ghost,.ui-button--danger,.ui-button-primary,.ui-button-secondary,.ui-button-ghost,.ui-button-danger { height: 40px; border: 1px solid var(--ui-border-strong); border-radius: var(--ui-radius-md); background: var(--ui-surface); padding: 0 14px; cursor: pointer; font-family: inherit; font-size: var(--ui-font-size-md); font-weight: var(--ui-font-weight-semibold); transition: background var(--ui-duration-fast) var(--ui-ease), border-color var(--ui-duration-fast) var(--ui-ease), box-shadow var(--ui-duration-fast) var(--ui-ease), transform var(--ui-duration-fast) var(--ui-ease); color: var(--ui-text); text-decoration: none; }
/* Ссылка в одежде кнопки (тег a с классом ui-button): без сброса подчёркивание и inline-высота
   выдают в ней ссылку. Правило узкое, чтобы не менять раскладку настоящих кнопок.
   Оба написания модификатора перечислены намеренно: правило выше применяется к тегу
   button само собой, а ссылке класс нужен поимённо — и ссылка с одним лишь
   ui-button--primary оставалась без высоты, отступов и радиуса (журнал, запись 171). */
a.ui-button, a.ui-button--primary, a.ui-button--secondary, a.ui-button--ghost, a.ui-button--danger, a.ui-button-primary, a.ui-button-secondary { display: inline-flex; align-items: center; justify-content: center; text-decoration: none; }
/* Выбор файла: настоящий input скрыт, но остаётся в фокусном порядке — фокус и
   недоступность отражаются на видимой кнопке-обёртке. */
.ui-file-picker { display: inline-flex; align-items: center; gap: 10px; cursor: pointer; }
.ui-file-picker__input { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.ui-file-picker__button { display: inline-flex; align-items: center; justify-content: center; }
.ui-file-picker__input:focus-visible ~ .ui-file-picker__button { outline: 2px solid var(--ui-focus); outline-offset: 2px; }
/* Выбор файла: та же серая одежда «сейчас нельзя», а не бледная прозрачность (ТЗ 5.8). */
.ui-file-picker__input:disabled ~ .ui-file-picker__button { background: var(--ui-surface-muted); border-color: var(--ui-border); color: var(--ui-text-muted); opacity: 1; cursor: not-allowed; }
.ui-file-picker__name { color: var(--ui-text-muted); font-size: var(--ui-font-size-sm); }
button:hover,.ui-button:hover { background: var(--ui-surface-muted); }
/*
 * ТЗ 5.8 (Э8): заблокированная кнопка ВЫГЛЯДИТ заблокированной.
 *
 * Было полупрозрачностью — и главная кнопка становилась просто бледно-оранжевой: человек читал
 * это как «кнопка как кнопка» и жал по ней снова и снова (журнал 465). Прозрачность вдобавок
 * рушит контраст: подпись на 50% прозрачности не проходит AA ни на одном фоне.
 *
 * Стало: серый — цвет «сейчас нельзя», один на все виды кнопок. Пара
 * "--ui-text-muted" на "--ui-surface-muted" измерена и проходит AA (contrast-audit).
 * ":not(.ui-button--loading)" — занятость это не блокировка: у кнопки с крутилкой свой вид,
 * и серой она быть не должна.
 *
 * (Обратные кавычки в комментарии внутри строки стилей закрывают саму строку — журнал 415.)
 */
button:disabled:not(.ui-button--loading),
.ui-button:disabled:not(.ui-button--loading),
.ui-button--primary:disabled:not(.ui-button--loading),
.ui-button-primary:disabled:not(.ui-button--loading),
.ui-button--secondary:disabled:not(.ui-button--loading),
.ui-button-secondary:disabled:not(.ui-button--loading),
.ui-button--danger:disabled:not(.ui-button--loading),
.ui-button-danger:disabled:not(.ui-button--loading),
.ui-button--ghost:disabled:not(.ui-button--loading),
.ui-button-ghost:disabled:not(.ui-button--loading) {
  background: var(--ui-surface-muted);
  border-color: var(--ui-border);
  color: var(--ui-text-muted);
  box-shadow: none;
  transform: none;
  opacity: 1;
  cursor: not-allowed;
}
/* Наведение на выключенную кнопку ничего не меняет: подсветка обещает нажатие. */
button:disabled:hover,
.ui-button:disabled:hover {
  background: var(--ui-surface-muted);
  transform: none;
}
/* Главная кнопка-действие — коралл с тёмным текстом (AA 6.4:1; белый текст на коралле = 2.6:1, провал) */
.ui-button--primary,.ui-button-primary { background: var(--ui-accent-600); border-color: var(--ui-accent-600); color: var(--ui-on-accent); box-shadow: 0 8px 18px -10px rgba(234, 99, 38, 0.55); }
.ui-button--primary:hover,.ui-button-primary:hover { background: var(--ui-accent-700); border-color: var(--ui-accent-700); transform: translateY(-1px); }
.ui-button--secondary,.ui-button-secondary { background: var(--ui-surface-accent); border-color: var(--ui-border-strong); color: var(--ui-text); }
.ui-button--ghost,.ui-button-ghost { background: transparent; border-color: transparent; color: var(--ui-brand-700); }
.ui-button--ghost:hover,.ui-button-ghost:hover { background: var(--ui-surface-muted); }
.ui-button--danger,.ui-button-danger { background: var(--ui-danger-600); border-color: var(--ui-danger-600); color: #fff; }
/*
 * UI-029/UI-030 — «занято» показывается по-разному, смотря разрешено ли движение.
 *
 * Кнопка в работе всегда заблокирована и помечена aria-busy, это не зависит от настроек.
 * А вот ВИДИМЫЙ признак разный:
 *   • движение разрешено — текст прячется, вместо него крутится колечко;
 *   • движение запрещено — колечка нет, и текст ОСТАЁТСЯ ВИДИМЫМ.
 *
 * Почему нельзя просто убрать анимацию: текст прятался в общем правиле, и без колечка
 * человек получил бы пустую серую кнопку без единого слова — хуже, чем было.
 */
.ui-button--loading { position: relative; pointer-events: none; }
@media (prefers-reduced-motion: no-preference) {
  .ui-button--loading { color: transparent; }
  .ui-button--loading::after {
    content: '';
    position: absolute;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid var(--ui-border);
    border-top-color: var(--ui-text);
    animation: ui-spin var(--ui-duration-slow) linear infinite;
  }
}
/* Спиннер подстраивается под цвет текста кнопки: тёмный на коралле, белый на красной */
.ui-button--primary.ui-button--loading::after { border-color: rgba(15,23,42,0.25); border-top-color: var(--ui-on-accent); }
.ui-button--danger.ui-button--loading::after { border-color: rgba(255,255,255,0.35); border-top-color: #fff; }
.ui-button,.ui-button--primary,.ui-button--secondary,.ui-button--ghost,.ui-button--danger { display: inline-flex; align-items: center; justify-content: center; gap: var(--ui-space-sm); }
.ui-button__icon { display: inline-flex; }
.ui-button__icon svg { width: 16px; height: 16px; }
.ui-button--loading:disabled { opacity: 1; }
/* ФТ-H4 (Фаза 5): тач-зоны на телефоне — решение владельца №C: не меньше 44×44px.
   Базовые 40px оставлены для десктопа; радио/чекбокс внутри .ui-option не трогаем —
   тач-зоной там служит вся карточка варианта (у неё свой min-height: 44px). */
@media (max-width: 480px) {
  button,.ui-button,.ui-button--primary,.ui-button--secondary,.ui-button--ghost,.ui-button--danger,.ui-button-primary,.ui-button-secondary,.ui-button-ghost,.ui-button-danger { height: 44px; }
  .ui-input,.ui-select,input,select { height: 44px; }
}
`;
