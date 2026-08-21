/*
 * Календарь окончаний обучения (`UI-021`): стили переехали из styled-jsx страницы
 * `app/learning/calendar/page.tsx` — внутри styled-jsx их не видели сторожа токенов
 * (слепая зона `UI-020`/`UI-022`). Хардкоды заменены токенами при переносе.
 */
export const calendarStyles = `
.calendar-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; margin-top: 8px; }
.calendar-grid__dow { font-size: var(--ui-font-size-sm); font-weight: var(--ui-font-weight-semibold); text-align: center; color: var(--ui-text-muted); }
.calendar-grid__cell { border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); min-height: 88px; padding: 4px; background: var(--ui-surface); }
.calendar-grid__cell--muted { opacity: 0.45; }
.calendar-grid__day { font-weight: var(--ui-font-weight-semibold); font-size: var(--ui-font-size-sm); }
.calendar-grid__list { list-style: none; margin: 4px 0 0; padding: 0; font-size: var(--ui-font-size-xs); }
.calendar-grid__list li { display: flex; flex-direction: column; gap: 2px; margin-bottom: 4px; }
`;
