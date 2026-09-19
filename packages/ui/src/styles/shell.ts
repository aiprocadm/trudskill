/*
 * CSS каркаса приложения (UI-020).
 *
 * До Фазы 1 эти 288 строк жили в <style jsx> внутри app-shell.tsx и были НЕ ВИДНЫ
 * сторожам пакета: token-discipline и touch-targets читают строку uiGlobalStyles.
 * Внутри накопился хардкод (rgba подложки, радиусы 10px) и обход через
 * псевдокласс глобальной области с авторской пометкой «давний дефект каркаса».
 * Обход исчез сам: scoped-классов styled-jsx, мимо которых промахивались
 * правила, здесь больше нет.
 *
 * Отдельный слой, а не дописка в layout.ts (решение владельца №3 по существу —
 * «в пакет, под сторожа»): layout.ts занят сетками дашборда и центрированием
 * страниц входа, и совмещение дало бы файл на 355 строк с двумя назначениями.
 */
export const shellStyles = `
/* Ширина колонки меню — переменной, а не числом в трёх местах: по ней выравнивается
   липкая панель массовых действий (ТЗ 5.5), и разъезжаться им нельзя. */
.app-shell { --ui-shell-nav: 260px; min-height: 100dvh; display: grid; grid-template-columns: var(--ui-shell-nav) 1fr; position: relative; }
.app-shell__menu-toggle { display: none; }
.app-shell__skip-link {
/* ТЗ 13.5: полоса «вы работаете от имени» — над всем кабинетом, заметная, но не пугающая.
   Текст на приглушённой поверхности — пара измерена в обеих темах (UI-001); внимание держит
   полоса предупреждающего цвета снизу, а не цветной текст, который пришлось бы мерить заново. */
.app-shell__impersonation { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--ui-space-sm); padding: var(--ui-space-sm) var(--ui-space-md); background: var(--ui-surface-muted); color: var(--ui-text); border-bottom: 2px solid var(--ui-warning-600); font-size: var(--ui-font-size-sm); }
  position: absolute;
  top: -40px;
  left: 12px;
  z-index: 12000;
  background: var(--ui-surface);
  color: var(--ui-text);
  padding: 8px 10px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  text-decoration: none;
}
.app-shell__skip-link:focus { top: 12px; }
.app-shell__backdrop { display: none; }
/*
 * ТЗ 3.3 (Н2): колонка меню — отдельная фиксированная, со своей прокруткой.
 *
 * Как было: колонка ехала вместе с содержимым. Раскрыв группы, человек получал страницу в
 * несколько экранов, где слева меню, справа пустота; прокручивая длинную таблицу, он терял меню
 * из виду совсем. Высота в dvh, а не в vh: на телефоне адресная строка браузера то появляется,
 * то исчезает, и vh там врёт на её высоту. ВНИМАНИЕ: файл — шаблонная строка, обратные кавычки
 * внутри комментария закрывают её и ломают сборку (поймано здесь же).
 */
.app-shell__sidebar {
  border-right: 1px solid var(--ui-border);
  padding: 16px;
  background: var(--ui-nav-sidebar-bg, var(--ui-surface));
  position: sticky;
  top: 0;
  height: 100dvh;
  overflow-y: auto;
  overscroll-behavior: contain;
}
/* Свёрнутая колонка: остаются значки. Ширину задаёт сетка оболочки — см. .app-shell--narrow. */
.app-shell--narrow { --ui-shell-nav: 64px; }
.app-shell--narrow .app-shell__sidebar { padding: 16px 8px; }
.app-shell--narrow .app-shell__link-label,
.app-shell--narrow .app-shell__group-title,
.app-shell--narrow .app-shell__brand .ui-wordmark,
.app-shell--narrow .app-shell__role,
.app-shell--narrow .app-shell__chevron,
.app-shell--narrow .app-shell__group-items,
.app-shell--narrow .app-shell__hint { display: none; }
.app-shell--narrow .app-shell__link,
.app-shell--narrow .app-shell__group-header { justify-content: center; padding: 10px 0; }
.app-shell__sidebar-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin-bottom: 12px;
  padding: 8px;
  min-height: 44px;
  background: none;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  color: var(--ui-nav-text-muted, var(--ui-text-muted));
  cursor: pointer;
  font-size: var(--ui-font-size-sm);
}
.app-shell__sidebar-toggle:hover { color: var(--ui-nav-text, var(--ui-text)); }
.app-shell--narrow .app-shell__sidebar-toggle { justify-content: center; }
.app-shell__link-icon { display: none; }
.app-shell--narrow .app-shell__link-icon { display: inline-flex; }
.app-shell__brand { margin: 0 0 14px; color: var(--ui-nav-text, var(--ui-text)); }
.app-shell__role {
  margin: 0 0 16px;
  font-size: var(--ui-font-size-sm);
  color: var(--ui-nav-text-muted, var(--ui-text-muted));
}
.app-shell__link {
  text-decoration: none;
  color: var(--ui-nav-text, var(--ui-text));
  padding: 10px 12px;
  border-radius: var(--ui-radius-md);
  font-weight: var(--ui-font-weight-semibold);
}
.app-shell__link:hover {
  background: var(--ui-nav-hover-bg, var(--ui-surface-muted));
  color: var(--ui-nav-text, var(--ui-text));
}
.app-shell__link.is-active {
  color: var(--ui-nav-active-text, var(--ui-brand-700));
  background: var(--ui-nav-active-bg);
}
.app-shell__nav { display: flex; flex-direction: column; gap: 2px; }
.app-shell__more { margin-top: 8px; border-top: 1px solid var(--ui-border); padding-top: 8px; }
.app-shell__more-toggle,
.app-shell__group-header {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  border-radius: var(--ui-radius-md);
  color: var(--ui-nav-text, var(--ui-text));
  cursor: pointer;
}
/* UI-009: на заголовке блока стояли четыре усилителя разом — uppercase,
   letter-spacing, вес 700 и уменьшенный размер. Это неглавный элемент, он
   отделяется расстоянием, а не криком. */
.app-shell__more-toggle { font-weight: var(--ui-font-weight-semibold); font-size: var(--ui-font-size-md); }
.app-shell__group-header { font-weight: var(--ui-font-weight-semibold); font-size: var(--ui-font-size-sm); }
.app-shell__more-toggle:hover,
.app-shell__group-header:hover { background: var(--ui-nav-hover-bg, var(--ui-surface-muted)); }
.app-shell__more-title,
.app-shell__group-title { flex: 1 1 auto; text-align: left; }
.app-shell__more-panel[hidden] { display: none; }
.app-shell__chevron {
  display: inline-flex;
  color: var(--ui-nav-text-muted, var(--ui-text-muted));
  transition: transform var(--ui-duration-base) var(--ui-ease);
}
.app-shell__chevron.is-open { transform: rotate(180deg); }
.app-shell__group { display: flex; flex-direction: column; }
.app-shell__group-items { gap: 2px; padding: 2px 0 6px 12px; }
.app-shell__group-items[hidden] { display: none; }
.app-shell__hint {
  margin-top: 16px;
  padding: 12px;
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-accent);
  color: var(--ui-text);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.app-shell__hint-text { margin: 0; font-size: var(--ui-font-size-sm); line-height: var(--ui-line-height-normal); }
/*
 * UI-030 — настройка «поменьше движения» уважается ВЕЗДЕ.
 *
 * Раньше здесь гасился ровно один переход — шеврон бокового меню, — а остальные полтора
 * десятка (кнопки, поля, панели, полоса прогресса) продолжали двигаться. Человек, который
 * попросил систему не двигать картинку, всё равно получал движение: при вестибулярных
 * нарушениях, склонности к укачиванию и мигрени это не придирка, а физическая помеха.
 *
 * Правило одно и на всё: длительности сводятся к неразличимо малым, повторы отменяются,
 * плавная прокрутка выключается. Не transition: none, а почти нулевая длительность —
 * так обработчики transitionend, на которых держится часть логики, всё равно срабатывают.
 */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition-duration: 0.01ms !important;
    transition-delay: 0ms !important;
    animation-duration: 0.01ms !important;
    animation-delay: 0ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
  }
}
.app-shell__content { display: grid; grid-template-rows: 64px auto; min-width: 0; }
.app-shell__topbar {
  border-bottom: 1px solid var(--ui-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
  gap: 12px;
  background: var(--ui-surface);
  flex-wrap: wrap;
}
.app-shell__breadcrumbs {
  color: var(--ui-text-muted);
  font-size: var(--ui-font-size-sm);
  min-width: 0;
  flex: 1 1 200px;
  /* Длинный заголовок раздела раньше уезжал ПОД поиск (запись 107): хвост
     крошек обрезается многоточием, а не наезжает на соседей. */
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.app-shell__crumb { white-space: nowrap; }
.app-shell__crumb-link { color: var(--ui-text-muted); text-decoration: none; }
.app-shell__crumb-link:hover { color: var(--ui-brand-700); text-decoration: underline; }
.app-shell__crumb-current { color: var(--ui-text); font-weight: var(--ui-font-weight-medium); }
.app-shell__crumb-block { color: var(--ui-text-muted); font-weight: var(--ui-font-weight-medium); }
/* ТЗ 3.5: имя объекта ещё едет с сервера — на его месте полоса-скелетон той же высоты,
   что строка текста (цвет и скругление — от .ui-skeleton-line; без анимации, UI-029). */
.app-shell__crumb-skeleton { display: inline-block; width: 120px; vertical-align: middle; }
.app-shell__userbar { flex: 0 1 auto; justify-content: flex-end; gap: 12px; }
.app-shell__search {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface);
  color: var(--ui-text-muted);
  cursor: pointer;
  font-size: var(--ui-font-size-sm);
}
.app-shell__search:hover { color: var(--ui-text); }
.app-shell__kbd {
  font-size: var(--ui-font-size-xs);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  padding: 1px 5px;
  color: var(--ui-text-muted);
}
.app-shell__meta {
  font-size: var(--ui-font-size-sm);
  color: var(--ui-text-muted);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.app-shell__notif-link {
  text-decoration: none;
  color: inherit;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
/* UI-026: переключатель оформления в шапке — рядом с именем пользователя. */
.app-shell__theme { display: inline-flex; align-items: center; gap: 6px; }
.app-shell__theme-label { font-size: var(--ui-font-size-sm); color: var(--ui-text-muted); }
.app-shell__theme-select { height: 36px; padding: 0 8px; font-size: var(--ui-font-size-sm); }
/* На узком экране подпись уходит: список и так подписан для чтения с экрана. */
@media (max-width: 900px) {
  .app-shell__theme-label { display: none; }
}
@media (max-width: 1024px) {
  .app-shell, .app-shell--narrow { --ui-shell-nav: 0px; grid-template-columns: 1fr; }
  /* На телефоне колонка выдвижная: прилипание и свёрнутый вид там не при чём. */
  .app-shell__sidebar { position: fixed; height: 100dvh; }
  .app-shell__sidebar-toggle { display: none; }
  .app-shell__menu-toggle {
    display: inline-flex;
    position: fixed;
    /* ТЗ 14.2 п.4: вырез телефона. На экране без выреза env(...) равен нулю. */
    top: calc(12px + env(safe-area-inset-top, 0px));
    left: calc(12px + env(safe-area-inset-left, 0px));
    z-index: 10001;
    align-items: center;
    height: 40px;
    padding: 0 14px;
    border-radius: var(--ui-radius-md);
    border: 1px solid var(--ui-border);
    background: var(--ui-surface);
    color: var(--ui-text);
    font-weight: var(--ui-font-weight-semibold);
    cursor: pointer;
    box-shadow: var(--ui-shadow);
  }
  .app-shell__backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 9998;
    border: none;
    padding: 0;
    margin: 0;
    background: var(--ui-overlay);
    cursor: pointer;
  }
  .app-shell__sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: min(300px, 88vw);
    z-index: 10000;
    transform: translateX(-102%);
    transition: transform var(--ui-duration-base) var(--ui-ease);
    box-shadow: var(--ui-shadow-strong);
    overflow-y: auto;
    border-right: 1px solid var(--ui-border);
  }
  .app-shell__sidebar.is-drawer-open { transform: translateX(0); }
  .app-shell__sidebar .ui-stack {
    flex-direction: column;
    flex-wrap: unset;
    overflow-x: visible;
    padding-bottom: 0;
  }
  .app-shell__content { padding-top: 56px; }
  .app-shell__link { white-space: normal; }
}
/* ФТ-H4: телефон ≤480px. Правила для ссылок раньше приходилось оборачивать в
   псевдокласс глобальной области — их рендерит next/link, и scoped-класс
   styled-jsx на них не попадал. Слой глобальный, обход больше не нужен. */
@media (max-width: 480px) {
  .app-shell__content { grid-template-rows: auto 1fr; }
  .app-shell__topbar { padding: 8px 12px; }
  .app-shell__crumb { white-space: normal; }
  .app-shell__menu-toggle { height: 44px; }
  .app-shell__more-toggle,
  .app-shell__group-header { min-height: 44px; display: flex; align-items: center; }
  .app-shell__link,
  .app-shell__notif-link { min-height: 44px; display: flex; align-items: center; }
  .app-shell__search { height: 44px; }
}

/* Палитра команд (UI-021). Приехала сюда же: это часть каркаса, а её 76 строк
   были такой же слепой зоной для сторожей — внутри лежали та же подложка rgba и
   радиусы 14px и 10px мимо шкалы. */
.cmdk {
  position: fixed;
  inset: 0;
  z-index: 13000;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 12vh;
}
.cmdk__scrim {
  position: absolute;
  inset: 0;
  border: none;
  padding: 0;
  margin: 0;
  background: var(--ui-overlay);
  cursor: pointer;
}
.cmdk__dialog {
  position: relative;
  width: min(560px, 92vw);
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-lg);
  /* UI-019: сильная тень — только у модалки и выдвижной панели; палитре хватает обычной. */
  box-shadow: var(--ui-shadow);
  overflow: hidden;
}
.cmdk__input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--ui-border);
  color: var(--ui-text-muted);
}
/* 16px — вне шкалы намеренно: Safari на iOS увеличивает страницу при фокусе в
   поле с размером меньше 16px, и палитра прыгает под пальцем. */
.cmdk__input {
  flex: 1 1 auto;
  border: none;
  outline: none;
  background: transparent;
  font-size: var(--ui-font-size-md);
  color: var(--ui-text);
}
.cmdk__list { list-style: none; margin: 0; padding: 6px; max-height: 52vh; overflow-y: auto; }
.cmdk__option {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--ui-radius-md);
  cursor: pointer;
  color: var(--ui-text);
}
.cmdk__option.is-active {
  background: var(--ui-nav-active-bg, var(--ui-surface-muted));
  color: var(--ui-nav-active-text, var(--ui-brand-700));
}
.cmdk__option-group {
  font-size: var(--ui-font-size-xs);
  color: var(--ui-text-muted);
  white-space: nowrap;
}
.cmdk__empty { padding: 16px 12px; color: var(--ui-text-muted); text-align: center; }
`;
