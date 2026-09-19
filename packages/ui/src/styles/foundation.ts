export const foundationStyles = `
[data-ui-theme] {
  background: var(--ui-bg);
  color: var(--ui-text);
  min-height: 100dvh;
  font-family: var(--font-sans), 'Segoe UI', system-ui, -apple-system, Arial, sans-serif;
  font-size: var(--ui-font-size-md);
  line-height: var(--ui-line-height-normal);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}
* { box-sizing: border-box; }
/* UI-017: потолок контента. Токен --ui-content-max был объявлен и не применялся нигде —
   потолок существовал на бумаге (запись 163). Реестр занимает всю доступную ширину ВНУТРИ
   потолка; форма дополнительно ужимается своим --ui-form-max. */
.ui-page,.ui-page-container { display: grid; gap: var(--ui-space-lg); padding: 24px clamp(16px, 3vw, 32px); width: 100%; max-width: var(--ui-content-max); margin-inline: auto; }
/* UI-016, контекст «просторно» (дашборд, форма): между блоками xxl (32), внутренний отступ
   карточек xl (24). Отдельный модификатор, потому что один универсальный каркас не может быть
   одновременно плотным для реестра и просторным для дашборда. */
.ui-page--spacious,.ui-page-container--spacious { gap: var(--ui-space-xxl); }
/* GOAL-3: «ниже сгиба» — разметочная граница, а не украшение. Вид не меняется:
   контейнер повторяет сетку страницы, поэтому расстояния между блоками те же. */
.ui-below-fold { display: grid; gap: inherit; }
.ui-page--spacious .ui-section-card,.ui-page-container--spacious .ui-section-card { padding: var(--ui-space-xl); }
/* CMP-015: меню «Ещё» в шапке — вторичные действия не соревнуются с первичной кнопкой. */
.ui-header-menu { position: relative; }
.ui-header-menu > summary { list-style: none; cursor: pointer; }
.ui-header-menu > summary::-webkit-details-marker { display: none; }
.ui-header-menu[open] > summary { border-color: var(--ui-brand-600); }
.ui-header-menu__list { position: absolute; right: 0; top: calc(100% + 4px); z-index: 200; min-width: 220px; display: grid; background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); box-shadow: var(--ui-shadow); padding: var(--ui-space-xs); }
.ui-header-menu__item { text-align: left; background: none; border: none; font: inherit; color: var(--ui-text); padding: 10px 12px; min-height: 44px; border-radius: var(--ui-radius-sm); cursor: pointer; }
.ui-header-menu__item:hover { background: var(--ui-surface-muted); }
/* Э4 (ТЗ 5.4): необратимое действие в меню шапки — красным, как в меню «…» строки таблицы. */
.ui-header-menu__item--danger { color: var(--ui-danger-600); }
/* ТЗ 5.1 (CMP-001): меню «…» строки таблицы — тот же приём, что «Ещё» в шапке; опасные
   пункты внизу, за разделителем, красным. */
.ui-overflow-menu { position: relative; display: inline-block; }
.ui-overflow-menu > summary { list-style: none; cursor: pointer; }
.ui-overflow-menu > summary::-webkit-details-marker { display: none; }
.ui-overflow-menu[open] > summary { border-color: var(--ui-brand-600); }
.ui-overflow-menu__list { position: absolute; right: 0; top: calc(100% + 4px); z-index: 200; min-width: 220px; display: grid; text-align: left; background: var(--ui-surface); border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); box-shadow: var(--ui-shadow); padding: var(--ui-space-xs); }
.ui-overflow-menu__item { text-align: left; background: none; border: none; font: inherit; color: var(--ui-text); padding: 10px 12px; min-height: 44px; border-radius: var(--ui-radius-sm); cursor: pointer; white-space: nowrap; }
.ui-overflow-menu__item:hover { background: var(--ui-surface-muted); }
.ui-overflow-menu__item:disabled { color: var(--ui-text-muted); cursor: default; background: none; }
.ui-overflow-menu__item--danger { color: var(--ui-danger-600); }
.ui-overflow-menu__divider { height: 1px; background: var(--ui-border); margin: var(--ui-space-xs) 0; }
.ui-page-header { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; }
/* ТЗ 7.4 (Р5): ЗАГОЛОВКИ набраны Onest — он и даёт интерфейсу лицо. Текст остаётся Inter:
   читаемость таблиц и полей, где человек проводит часы, менять нельзя. */
.ui-page-title { font-family: var(--font-display), var(--font-sans), 'Segoe UI', system-ui, sans-serif; margin:0; font-size: clamp(var(--ui-font-size-xl), 1.2rem + 1vw, var(--ui-font-size-2xl)); font-weight: var(--ui-font-weight-bold); letter-spacing: -0.025em; line-height: var(--ui-line-height-tight); color: var(--ui-text); }
/*
 * UI-012 — ширина строки у сплошного текста. Строка во всю ширину широкого экрана читается
 * плохо: дочитав до края, глаз теряет начало следующей. Ограничение ставится только там, где
 * текст читают предложениями (подзаголовок, пояснение пустого экрана, подсказка, абзац);
 * таблицы и заголовки не трогаем — им ширина нужна.
 */
.ui-page-subtitle { margin:6px 0 0; color: var(--ui-text-muted); font-size: var(--ui-font-size-md); line-height: var(--ui-line-height-normal); max-width: var(--ui-measure); }
/* UI-019: у статичной карточки тени нет — её отделяют фон, рамка и расстояние.
   Тень оставлена только всплывающим слоям: модалке, выдвижной панели, палитре, выпадашке. */
.ui-section-card,.ui-card { background: var(--ui-surface); border-radius: var(--ui-radius-lg); }
/* UI-016, контекст «карточка объекта»: внутренний отступ lg (16). Прежние 20 и 14 — вне шкалы. */
.ui-section-card { padding: var(--ui-space-lg); display:grid; gap: var(--ui-space-md); }
/*
 * ТЗ 5.11 (Э11): страница НЕ едет вбок.
 *
 * Карточка курса в окне 1560px имела ширину 2343px — колонки «Вид» и «Минимум просмотра»
 * уезжали за экран, и горизонтальная полоса появлялась у ВСЕЙ страницы (журнал 474).
 *
 * Причина не в таблице. Элемент сетки или флекса по умолчанию имеет "min-width: auto" —
 * то есть НЕ МОЖЕТ сжаться уже своего содержимого. Обёртка таблицы с собственной
 * прокруткой ("overflow-x: auto") из-за этого не прокручивалась, а просто росла и
 * растягивала карточку, страницу и оболочку. Одна строка правил чинит это везде разом:
 * широкому содержимому возвращается право сжиматься, и его прокрутка наконец включается.
 */
.ui-page,.ui-page-container,.ui-section-card,.ui-card { min-width: 0; }
.ui-page > *,.ui-page-container > *,.ui-section-card > *,.ui-card > *,.ui-stack > * { min-width: 0; }
.ui-section-title { font-family: var(--font-display), var(--font-sans), 'Segoe UI', system-ui, sans-serif; margin:0; font-size: var(--ui-font-size-lg); font-weight: var(--ui-font-weight-bold); letter-spacing: -0.01em; color: var(--ui-text); display:flex; align-items:center; gap:9px; }
.ui-section-title::before { content:''; width:4px; height:1.05em; border-radius:var(--ui-radius-pill); background: var(--ui-brand-600); flex:none; }
.ui-section-head { display:flex; justify-content:space-between; align-items:flex-start; gap: var(--ui-space-md); }
.ui-empty,.ui-error,.ui-loading { border: 1px dashed var(--ui-border); border-radius: var(--ui-radius-md); background: var(--ui-surface-muted); padding: 16px; color: var(--ui-text-muted); }
.ui-error { border-color: var(--ui-error-border); color: var(--ui-danger-600); }
.ui-empty-hint { margin: 10px 0 0; font-size: var(--ui-font-size-sm); line-height: var(--ui-line-height-normal); color: var(--ui-text-muted); max-width: var(--ui-measure); }
/* CMP-014: пустое состояние предлагает первое действие, а не просто сообщает о пустоте. */
.ui-empty-action { margin: var(--ui-space-lg) 0 0; }
.ui-empty-action .ui-button-primary { display: inline-flex; align-items: center; text-decoration: none; }
.ui-filter-bar,.ui-inline,.ui-toolbar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
.ui-stack { display:flex; flex-direction:column; gap: var(--ui-space-md); }
.ui-grid { display:grid; gap:12px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
.ui-list { list-style:none; margin:0; padding:0; display:grid; gap:0; }
.ui-list-title { font-weight: var(--ui-font-weight-semibold); color: var(--ui-text); font-size: var(--ui-font-size-md); }
/* Карточка-строка списка (тесты, задания и т.п.) */
.entry-card { display: flex; flex-direction: column; gap: var(--ui-space-sm); align-items: flex-start; border-radius: var(--ui-radius-md); padding: var(--ui-space-lg); transition: border-color var(--ui-duration-fast) var(--ui-ease), box-shadow var(--ui-duration-fast) var(--ui-ease); }
.entry-card:hover { border-color: var(--ui-brand-600); }
.entry-card + .entry-card { margin-top: 10px; }
/* Слайд-овер дровер (создание/редактирование сущностей) — фикс. панель справа + затемнение */
.ui-drawer { position: fixed; top: 0; right: 0; z-index: 10050; isolation: isolate; height: 100dvh; width: min(480px, 100vw); background: var(--ui-surface); border-left: 1px solid var(--ui-border); box-shadow: var(--ui-shadow-strong); overflow-y: auto; padding: 20px; display: grid; gap: 16px; align-content: start; }
.ui-drawer::before { content: ''; position: fixed; inset: 0; background: var(--ui-overlay); z-index: -1; pointer-events: none; }
.ui-drawer-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.ui-drawer-header h2 { margin: 0; font-size: var(--ui-font-size-lg); font-weight: var(--ui-font-weight-bold); color: var(--ui-text); }
/* Формы внутри дроверов/модалок */
.ui-form { display: grid; gap: 12px; max-width: var(--ui-form-max); }
.ui-form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.ui-fieldset { border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); padding: 12px 14px; display: grid; gap: 10px; }
.ui-option-row { justify-content: space-between; width: 100%; }
/* Текстовые/служебные классы */
.ui-hint { margin: 0; font-size: var(--ui-font-size-sm); color: var(--ui-text-muted); line-height: var(--ui-line-height-normal); max-width: var(--ui-measure-narrow); }
.ui-subheading { margin: 0; font-size: var(--ui-font-size-md); font-weight: var(--ui-font-weight-bold); color: var(--ui-text); }
.ui-bare-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
/* Дерево программы курса (ТЗ 8.4): модуль → материалы. Отступ показывает вложенность,
   а не украшает: без него список материалов сливается со списком модулей. */
.ui-program-tree { display: grid; gap: var(--ui-space-md); }
.ui-program-tree__module { display: grid; gap: var(--ui-space-xs); }
.ui-program-tree__materials { padding-left: var(--ui-space-lg); }
.ui-program-tree__material { display: grid; }
.ui-link { color: var(--ui-brand-700); font-weight: var(--ui-font-weight-semibold); text-decoration: underline; text-underline-offset: 2px; }
.ui-link:hover { color: var(--ui-brand-600); }
/* Ссылка без класса иначе остаётся браузерным синим #0000EE: на тёмных поверхностях это ~1.1:1,
   текст неотличим от фона. Селектор элементного уровня — любой класс на ссылке перекрывает его. */
a:not([class]) { color: var(--ui-brand-700); font-weight: var(--ui-font-weight-semibold); text-decoration: underline; text-underline-offset: 2px; }
a:not([class]):hover { color: var(--ui-brand-600); }
/* Кнопка-ссылка — вид ссылки, поведение кнопки */
.ui-link-button, .ui-button-link { background: none; border: none; padding: 0; height: auto; font: inherit; color: var(--ui-brand-700); font-weight: var(--ui-font-weight-semibold); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
.ui-link-button:hover, .ui-button-link:hover { color: var(--ui-brand-600); background: none; }
fieldset { border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); padding: 12px 14px; margin: 0; }
legend { font-size: var(--ui-font-size-sm); font-weight: var(--ui-font-weight-semibold); color: var(--ui-text-muted); padding: 0 6px; }
/* ТЗ 7.2: плашка статуса — приглушённый фон и насыщенный текст ОДНОГО тона, а не белым по
   цвету. Цвет текста задаёт класс тона, поэтому в общем правиле его больше нет: белый
   хардкодом и был причиной, по которой в тёмной теме плашки не читались. Тонкая рамка
   выводится из тех же двух токенов, третьего заводить не нужно. */
.ui-badge { border-radius: var(--ui-radius-pill); padding: 3px 11px; font-size: var(--ui-font-size-xs); font-weight: var(--ui-font-weight-semibold); letter-spacing: 0.01em; border: 1px solid transparent; }
.ui-badge--neutral { background: var(--ui-tone-neutral-bg); color: var(--ui-tone-neutral-text); border-color: color-mix(in srgb, var(--ui-tone-neutral-text) 22%, var(--ui-tone-neutral-bg)); }
.ui-badge--success { background: var(--ui-tone-success-bg); color: var(--ui-tone-success-text); border-color: color-mix(in srgb, var(--ui-tone-success-text) 22%, var(--ui-tone-success-bg)); }
.ui-badge--warning { background: var(--ui-tone-warning-bg); color: var(--ui-tone-warning-text); border-color: color-mix(in srgb, var(--ui-tone-warning-text) 22%, var(--ui-tone-warning-bg)); }
.ui-badge--danger { background: var(--ui-tone-danger-bg); color: var(--ui-tone-danger-text); border-color: color-mix(in srgb, var(--ui-tone-danger-text) 22%, var(--ui-tone-danger-bg)); }
.ui-badge--off { background: var(--ui-tone-off-bg); color: var(--ui-tone-off-text); border-color: color-mix(in srgb, var(--ui-tone-off-text) 22%, var(--ui-tone-off-bg)); }
.ui-text-muted { color: var(--ui-text-muted); }
/* ТЗ 5.8 (Э8): строка «чего не хватает» рядом с выключенной кнопкой. */
.ui-hint--blocked { margin-top: var(--ui-space-xs); }
.ui-visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.ui-prose { margin: 0; color: var(--ui-text); line-height: var(--ui-line-height-normal); max-width: var(--ui-measure); }
.ui-prose-muted { margin: 0; color: var(--ui-text-muted); line-height: var(--ui-line-height-normal); max-width: var(--ui-measure); }
.ui-prose-muted--tight { margin: 0 0 12px; }
/* Страница-сообщение системы (ТЗ 2.1/Б3): отказ в доступе, «не найдено», сбой, нет сети.
   Действия идут строкой — их там одно-два, и столбцом они выглядят как список разделов. */
.ui-system-message { display: grid; gap: var(--ui-space-md); justify-items: start; max-width: var(--ui-measure); }
.ui-system-message > .ui-stack { flex-direction: row; flex-wrap: wrap; align-items: center; }
.ui-system-message > details > summary { cursor: pointer; color: var(--ui-text-muted); font-size: var(--ui-font-size-sm); }
.ui-list-row { padding: 12px 0; border-bottom: 1px solid var(--ui-border); }
.ui-list-row:last-child { border-bottom: none; }
.ui-list-row-meta { font-size: var(--ui-font-size-sm); color: var(--ui-text-muted); margin-top: 4px; }
.ui-stepper { display: flex; gap: 8px; flex-wrap: wrap; margin: 0; padding: 0; list-style: none; }
.ui-step { border: 1px solid var(--ui-border); border-radius: var(--ui-radius-pill); padding: 4px 12px; font-size: var(--ui-font-size-xs); color: var(--ui-text-muted); background: var(--ui-surface-muted); }
/* CMP-012: быстрые отборы списка. Вид — «таблетка», как у шагов мастера: это не кнопка
   действия, а переключатель среза, и соревноваться с первичной кнопкой ему нельзя. */
.ui-saved-views { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-space-xs); }
.ui-saved-views__label { font-size: var(--ui-font-size-sm); color: var(--ui-text-muted); }
.ui-saved-views__item { display: inline-flex; align-items: center; gap: 2px; }
.ui-saved-views__input { max-width: 220px; }
.ui-chip { border: 1px solid var(--ui-border); border-radius: var(--ui-radius-pill); padding: 6px 14px; min-height: 32px; font-size: var(--ui-font-size-sm); color: var(--ui-text); background: var(--ui-surface); cursor: pointer; }
.ui-chip:hover { background: var(--ui-surface-muted); }
.ui-chip--active { border-color: var(--ui-brand-600); color: var(--ui-brand-600); font-weight: var(--ui-font-weight-semibold); }
.ui-saved-views__remove { border: none; background: none; color: var(--ui-text-muted); cursor: pointer; font-size: var(--ui-font-size-md); line-height: 1; padding: 4px 6px; border-radius: var(--ui-radius-sm); }
.ui-saved-views__remove:hover { color: var(--ui-danger-600); background: var(--ui-surface-muted); }
.ui-step--active { color: var(--ui-on-brand); border-color: var(--ui-brand-600); background: var(--ui-brand-600); }
.ui-step--done { color: var(--ui-on-color); border-color: var(--ui-success-600); background: var(--ui-success-600); }
/* TPL-004: шаг — кнопка (доступен с клавиатуры), но выглядит как текст внутри пилюли. */
.ui-step__button { background: none; border: none; padding: 0; height: auto; font: inherit; color: inherit; cursor: pointer; }
.ui-step__button:disabled { cursor: default; opacity: 1; }
.ui-step__button:hover { background: none; }
/* TPL-004 §7.4: на телефоне полоса шагов уступает место строке «Шаг 2 из 3» —
   пилюли на 360px переносятся в три ряда и съедают экран до первого поля. */
.ui-stepper__counter { display: none; margin: 0; font-size: var(--ui-font-size-sm); font-weight: var(--ui-font-weight-semibold); color: var(--ui-text-muted); }
@media (max-width: 480px) {
  .ui-stepper { display: none; }
  .ui-stepper__counter { display: block; }
  /* ФТ-H4: на телефоне «таблетка» отбора и крестик — полноценная тач-зона 44px. */
  .ui-chip { min-height: 44px; }
  .ui-saved-views__remove { min-width: 44px; min-height: 44px; }
}

/* Плашки-уведомления (info/warning/success/danger) — единый тематический паттерн */
.ui-callout { border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); padding: 12px 14px; margin: 0; display: flex; gap: 10px; align-items: flex-start; line-height: var(--ui-line-height-normal); color: var(--ui-text); background: var(--ui-surface-muted); }
.ui-callout--info { border-color: var(--ui-info-600); background: color-mix(in srgb, var(--ui-info-600) 10%, var(--ui-surface)); }
.ui-callout--warning { border-color: var(--ui-warning-600); background: color-mix(in srgb, var(--ui-warning-600) 12%, var(--ui-surface)); }
.ui-callout--success { border-color: var(--ui-success-600); background: color-mix(in srgb, var(--ui-success-600) 10%, var(--ui-surface)); }
.ui-callout--danger { border-color: var(--ui-danger-600); background: color-mix(in srgb, var(--ui-danger-600) 10%, var(--ui-surface)); }
.ui-callout__title { margin: 0 0 4px; font-weight: var(--ui-font-weight-semibold); font-size: var(--ui-font-size-sm); }

/* Вордмарк trudskill (фирменная подпись) — плотный гротеск, тесный трекинг */
.ui-wordmark { font-family: var(--font-display), var(--font-sans), 'Segoe UI', system-ui, sans-serif; font-weight: var(--ui-font-weight-bold); font-size: var(--ui-font-size-xl); letter-spacing: -0.02em; line-height: 1; display: inline-flex; align-items: baseline; }

/* Прогресс-бары курсов — «золото зачёта» вместо дефолтного браузерного вида */
/* Дорожка — токен ПОВЕРХНОСТИ, не нейтральной шкалы: в тёмной теме neutral-100 остаётся
   почти белым (это оттенок для тёмного текста), и пустая полоса выглядела заполненной.
   В светлой теме surface-muted и neutral-100 совпадают — вид не меняется. */
progress { -webkit-appearance: none; appearance: none; width: 100%; height: 9px; border: none; border-radius: var(--ui-radius-pill); background: var(--ui-surface-muted); overflow: hidden; }
progress::-webkit-progress-bar { background: var(--ui-surface-muted); border-radius: var(--ui-radius-pill); }
progress::-webkit-progress-value { background: linear-gradient(90deg, var(--ui-brand-700), var(--ui-brand-600)); border-radius: var(--ui-radius-pill); transition: width var(--ui-duration-slow) var(--ui-ease); }
progress::-moz-progress-bar { background: var(--ui-brand-600); border-radius: var(--ui-radius-pill); }
/* Общая полоса заполнения (компонент ProgressBar): та же геометрия, что у progress выше,
   плюс тон — «сколько заполнено» и «хорошо ли это» задаются раздельно. */
.ui-progress { display: flex; flex-direction: column; gap: 4px; }
.ui-progress__track { width: 100%; height: 9px; border-radius: var(--ui-radius-pill); background: var(--ui-surface-muted); overflow: hidden; }
.ui-progress__fill { height: 100%; border-radius: var(--ui-radius-pill); transition: width var(--ui-duration-slow) var(--ui-ease); background: linear-gradient(90deg, var(--ui-brand-700), var(--ui-brand-600)); }
.ui-progress__track--ok .ui-progress__fill { background: var(--ui-success-600); }
.ui-progress__track--warning .ui-progress__fill { background: var(--ui-warning-600); }
.ui-progress__track--danger .ui-progress__fill { background: var(--ui-danger-600); }
.ui-progress__caption { color: var(--ui-text-muted); font-variant-numeric: tabular-nums; }
/* Превью присланного документа (селфи, паспорт, скан) на экране проверки. */
.ui-doc-preview { display: block; margin-top: 8px; max-width: 320px; width: 100%; border-radius: var(--ui-radius-md); border: 1px solid var(--ui-border); }
.ui-doc-preview--wide { max-width: 480px; }
.ui-doc-link { display: inline-block; margin-top: 8px; }
.ui-video-player { display: block; width: 100%; max-width: 640px; border-radius: var(--ui-radius-md); background: var(--ui-neutral-900, #000); }

/* Герой «Следующий шаг» — доминанта экрана ученика */
/* UI-009/UI-010: герой — плоская карточка без декора (печать и eyebrow удалены),
   бренд-акцент несёт заголовок, тень обычная. */
.ui-hero { border-radius: var(--ui-radius-lg); padding: clamp(22px, 3vw, 32px); background: var(--ui-hero-bg); color: var(--ui-hero-text); display: grid; gap: 14px; }
.ui-hero__title { font-family: var(--font-display), var(--font-sans), 'Segoe UI', system-ui, sans-serif; font-size: clamp(var(--ui-font-size-xl), 1.05rem + 1.8vw, var(--ui-font-size-3xl)); line-height: var(--ui-line-height-tight); font-weight: var(--ui-font-weight-bold); margin: 0; color: var(--ui-brand-700); letter-spacing: -0.02em; max-width: 30ch; }
.ui-hero__desc { margin: 0; color: var(--ui-hero-muted); font-size: var(--ui-font-size-md); line-height: var(--ui-line-height-normal); max-width: 56ch; }
.ui-hero__cta { justify-self: start; display: inline-flex; align-items: center; gap: 10px; height: 48px; padding: 0 24px; border-radius: var(--ui-radius-md); background: var(--ui-accent-600); color: var(--ui-on-accent); border: none; font-family: inherit; font-weight: var(--ui-font-weight-bold); font-size: var(--ui-font-size-md); text-decoration: none; cursor: pointer; box-shadow: 0 10px 24px -12px rgba(0, 0, 0, 0.55); transition: transform var(--ui-duration-fast) var(--ui-ease), background var(--ui-duration-fast) var(--ui-ease), box-shadow var(--ui-duration-fast) var(--ui-ease); }
.ui-hero__cta::after { content: '\\2192'; font-size: 1.15em; line-height: 1; transition: transform var(--ui-duration-fast) var(--ui-ease); }
.ui-hero__cta:hover { background: var(--ui-accent-700); transform: translateY(-1px); box-shadow: 0 16px 30px -12px rgba(0, 0, 0, 0.6); }
.ui-hero__cta:hover::after { transform: translateX(3px); }
.ui-hero--calm { background: var(--ui-surface); color: var(--ui-text); }
.ui-hero--calm .ui-hero__title { color: var(--ui-text); }
.ui-hero--calm .ui-hero__desc { color: var(--ui-text-muted); }
.ui-hero--calm .ui-hero__seal { opacity: 0.4; }

/* Домашний экран ученика — адаптивные колонки.
   Flex с переносом: «Мои курсы» занимают всю ширину, когда карточки документов нет (она может не рендериться). */
.learner-home-columns { display: flex; flex-wrap: wrap; gap: 18px; align-items: flex-start; }
.learner-home-columns > * { flex: 1 1 320px; min-width: 0; }
.learner-home-columns > :first-child { flex: 2 1 420px; }
/* Карточки списка «Мои курсы» — лёгкие строки с подсветкой при наведении */
.learner-home-courses { display: grid; gap: 4px; list-style: none; padding: 0; margin: 0; }
.learner-home-course { display: grid; gap: 9px; padding: 12px 14px; border-radius: var(--ui-radius-md); transition: background var(--ui-duration-fast) var(--ui-ease); }
.learner-home-course:hover { background: var(--ui-surface-muted); }
.learner-home-course__head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.learner-home-course__title { font-weight: var(--ui-font-weight-semibold); color: var(--ui-text); text-decoration: none; }
.learner-home-course__title:hover { color: var(--ui-brand-700); text-decoration: underline; }
.learner-home-course__meta { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; font-size: var(--ui-font-size-sm); color: var(--ui-text-muted); }
.learner-home-course__percent { font-weight: var(--ui-font-weight-semibold); color: var(--ui-text); font-variant-numeric: tabular-nums; }
/* Недавно выданные документы — компактный список без маркеров */
.learner-home-recent-docs { list-style: none; padding: 0; margin: 0; display: grid; gap: 0; }
.learner-home-recent-docs__item { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--ui-border); line-height: var(--ui-line-height-normal); }
.learner-home-recent-docs__item:last-child { border-bottom: none; }

/* Каталог курсов ученика — адаптивная сетка карточек */
.course-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(258px, 1fr)); gap: 14px; list-style: none; padding: 0; margin: 0; }
.course-card { display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: var(--ui-radius-md); background: var(--ui-surface); transition: border-color var(--ui-duration-fast) var(--ui-ease), box-shadow var(--ui-duration-fast) var(--ui-ease), transform var(--ui-duration-fast) var(--ui-ease); }
.course-card:hover { border-color: var(--ui-brand-600); transform: translateY(-2px); }
/* Декоративная «обложка» — фирменная полоска индиго→коралл (без картинок) */
/* UI-003: коралл — только у первичной кнопки. Декоративная полоса карточки курса красилась
   в коралл тоже: сетка из десяти карточек давала десять акцентных пятен на экран. */
.course-card__banner { height: 6px; border-radius: var(--ui-radius-pill); background: linear-gradient(90deg, var(--ui-brand-700), var(--ui-brand-600)); }
.course-card__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.course-card__title { margin: 0; font-size: var(--ui-font-size-md); font-weight: var(--ui-font-weight-bold); line-height: var(--ui-line-height-tight); color: var(--ui-text); }
.course-card__body { display: grid; gap: 8px; margin-top: auto; }
.course-card__meta { display: flex; justify-content: space-between; align-items: baseline; font-size: var(--ui-font-size-sm); color: var(--ui-text-muted); }
.course-card__percent { font-weight: var(--ui-font-weight-semibold); color: var(--ui-text); font-variant-numeric: tabular-nums; }
.course-card__cta { width: 100%; margin-top: 4px; display: inline-flex; align-items: center; justify-content: center; text-decoration: none; }

/* Тренажёр теста — варианты ответа как выбираемые карточки */
.test-options { display: grid; gap: 8px; }
/* ФТ-H5: вариант ответа — тач-зона не меньше 44px по высоте. Прежние 12px отступов
   давали ~43px при одной строке текста: на телефоне промах по соседнему варианту в
   экзамене стоит балла, и «почти достаточно» здесь не годится. */
.ui-option { display: flex; align-items: center; gap: 10px; padding: 12px 14px; min-height: 44px; border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); cursor: pointer; transition: border-color var(--ui-duration-fast) var(--ui-ease), background var(--ui-duration-fast) var(--ui-ease); }
.ui-option:hover { border-color: var(--ui-brand-600); background: var(--ui-surface-muted); }
.ui-option:has(input:checked) { border-color: var(--ui-brand-600); background: var(--ui-surface-accent); }
.ui-option input { accent-color: var(--ui-brand-600); width: 18px; height: 18px; flex: none; margin: 0; }
/* Счётчик вопросов + таймер */
.test-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.test-counter { font-size: var(--ui-font-size-sm); color: var(--ui-text-muted); font-weight: var(--ui-font-weight-semibold); }
.test-timer { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: var(--ui-radius-pill); font-weight: var(--ui-font-weight-bold); font-variant-numeric: tabular-nums; background: var(--ui-surface-muted); color: var(--ui-text); border: 1px solid var(--ui-border); }
.test-timer--warning { background: color-mix(in srgb, var(--ui-warning-600) 14%, var(--ui-surface)); border-color: var(--ui-warning-600); color: var(--ui-warning-700); }
.test-timer--danger { background: color-mix(in srgb, var(--ui-danger-600) 14%, var(--ui-surface)); border-color: var(--ui-danger-600); color: var(--ui-danger-600); }
.test-nav { display: flex; justify-content: space-between; gap: 12px; }
/* ФТ-H5: состояние сохранности ответов. Показывается всегда — в спокойном виде тоже,
   иначе появление плашки само по себе читалось бы как новая беда. */
.test-connection { margin: 0; padding: 8px 12px; border-radius: var(--ui-radius-md); border: 1px solid var(--ui-border); background: var(--ui-surface-muted); color: var(--ui-text-muted); font-size: var(--ui-font-size-sm); }
.test-connection--saving { color: var(--ui-text); }
.test-connection--warning { border-color: var(--ui-warning-600); background: color-mix(in srgb, var(--ui-warning-600) 12%, var(--ui-surface)); color: var(--ui-warning-700); }
.test-connection--danger { border-color: var(--ui-danger-600); background: color-mix(in srgb, var(--ui-danger-600) 12%, var(--ui-surface)); color: var(--ui-danger-600); font-weight: var(--ui-font-weight-semibold); }
/* ТЗ 6.2 (С2): режим экзамена. Страница без оболочки — своя раскладка и своя верхняя полоса. */
.ui-focus { min-height: 100dvh; background: var(--ui-bg); }
/* Верхний отступ — с поправкой на вырез телефона (ТЗ 14.2 п.4): таймер обязан быть виден всегда. */
.exam-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: calc(12px + env(safe-area-inset-top, 0px)) clamp(12px, 3vw, 32px) 12px; border-bottom: 1px solid var(--ui-border); background: var(--ui-surface); position: sticky; top: 0; z-index: 20; }
.exam-bar__test { font-weight: var(--ui-font-weight-semibold); margin-right: auto; }
/* Карта вопросов: видно, что отвечено, что пропущено, и куда можно перейти одним нажатием. */
.exam-map { display: flex; flex-wrap: wrap; gap: 8px; padding: 0; margin: 0; list-style: none; }
.exam-map__item { min-width: 44px; min-height: 44px; padding: 0 10px; border-radius: var(--ui-radius-md); border: 1px solid var(--ui-border); background: var(--ui-surface); color: var(--ui-text-muted); font-weight: var(--ui-font-weight-semibold); font-variant-numeric: tabular-nums; cursor: pointer; transition: border-color var(--ui-duration-fast) var(--ui-ease), background var(--ui-duration-fast) var(--ui-ease); }
.exam-map__item:hover { border-color: var(--ui-brand-600); }
/* Отвечен и пропущен различаются НЕ ТОЛЬКО цветом: у отвеченного галочка (A11Y — цвет не единственный признак). */
.exam-map__item--answered { border-color: var(--ui-success-600); background: color-mix(in srgb, var(--ui-success-600) 12%, var(--ui-surface)); color: var(--ui-text); }
.exam-map__item--current { border-color: var(--ui-brand-600); background: var(--ui-surface-accent); color: var(--ui-text); box-shadow: inset 0 0 0 1px var(--ui-brand-600); }
.exam-map__mark { margin-left: 4px; }
/* Текст вопроса: заголовком карточки стоит счётчик, поэтому сам вопрос выделен здесь. */
.ui-question-text { margin: 0; font-size: var(--ui-font-size-lg); font-weight: var(--ui-font-weight-semibold); line-height: var(--ui-line-height-normal); }

/* Результат теста — заметный баннер успеха/провала */
.test-result__banner { display: flex; align-items: center; gap: 16px; padding: 20px; border-radius: var(--ui-radius-lg); border: 1px solid var(--ui-border); }
.test-result__banner--pass { background: color-mix(in srgb, var(--ui-success-600) 12%, var(--ui-surface)); border-color: var(--ui-success-600); }
.test-result__banner--fail { background: color-mix(in srgb, var(--ui-danger-600) 10%, var(--ui-surface)); border-color: var(--ui-danger-600); }
.test-result__icon { width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; font-size: var(--ui-font-size-2xl); line-height: 1; flex: none; color: #fff; }
.test-result__banner--pass .test-result__icon { background: var(--ui-success-600); }
.test-result__banner--fail .test-result__icon { background: var(--ui-danger-600); }
.test-result__headline { margin: 0; font-size: var(--ui-font-size-lg); font-weight: var(--ui-font-weight-bold); color: var(--ui-text); }
.test-result__score { margin: 3px 0 0; font-size: var(--ui-font-size-md); color: var(--ui-text-muted); }
.test-result__score strong { color: var(--ui-text); font-size: var(--ui-font-size-lg); font-variant-numeric: tabular-nums; }

/* Карточка профиля (настройки) */
.profile-head { display: flex; align-items: center; gap: 14px; }
.profile-avatar { width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; flex: none; font-weight: var(--ui-font-weight-bold); font-size: var(--ui-font-size-lg); color: var(--ui-on-brand); background: var(--ui-brand-600); }
.profile-name { margin: 0; font-weight: var(--ui-font-weight-bold); font-size: var(--ui-font-size-lg); color: var(--ui-text); }
.profile-role { margin: 2px 0 0; font-size: var(--ui-font-size-sm); color: var(--ui-text-muted); }
/* Переиспользуемый key/value список (профиль, карточки сущностей) */
.kv-list { display: grid; gap: 0; margin: 0; }
.kv-list__row { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding: 10px 0; border-bottom: 1px solid var(--ui-border); }
.kv-list__row:last-child { border-bottom: none; }
.kv-list dt { color: var(--ui-text-muted); font-size: var(--ui-font-size-sm); }
.kv-list dd { margin: 0; color: var(--ui-text); font-weight: var(--ui-font-weight-medium); text-align: right; word-break: break-word; }
/* Алиасы того же key/value паттерна, использовавшиеся в детальных экранах без определения */
.ui-data-list { display: grid; gap: 0; margin: 0; }
.ui-data-list__row { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding: 10px 0; border-bottom: 1px solid var(--ui-border); }
.ui-data-list__row:last-child { border-bottom: none; }
.ui-data-list dt { color: var(--ui-text-muted); font-size: var(--ui-font-size-sm); }
.ui-data-list dd { margin: 0; color: var(--ui-text); font-weight: var(--ui-font-weight-medium); text-align: right; word-break: break-word; }
.ui-defs { display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; margin: 0; }
.ui-defs dt { color: var(--ui-text-muted); font-size: var(--ui-font-size-sm); }
.ui-defs dd { margin: 0; color: var(--ui-text); }
.ui-muted { color: var(--ui-text-muted); }
/* Карточки-метрики для дашбордов (аналитика, cockpit) */
.stat-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
.stat-card { border-radius: var(--ui-radius-md); background: var(--ui-surface); padding: var(--ui-space-lg); display: grid; gap: 4px; align-content: start; }
.stat-card__label { font-size: var(--ui-font-size-sm); color: var(--ui-text-muted); }
.stat-card__value { font-size: var(--ui-font-size-2xl); font-weight: var(--ui-font-weight-bold); color: var(--ui-text); font-variant-numeric: tabular-nums; line-height: var(--ui-line-height-tight); }
.stat-card__sub { font-size: var(--ui-font-size-xs); color: var(--ui-text-muted); }
/* CMP-004: сравнение и переход. Тон отделён от направления — рост блокеров это «вверх» и «плохо». */
.stat-card__trend { font-size: var(--ui-font-size-sm); font-weight: var(--ui-font-weight-semibold); }
.stat-card__trend--positive { color: var(--ui-success-600); }
.stat-card__trend--negative { color: var(--ui-danger-600); }
.stat-card__trend--neutral { color: var(--ui-text-muted); }
.stat-card--link { text-decoration: none; color: inherit; transition: border-color var(--ui-duration-fast) var(--ui-ease), box-shadow var(--ui-duration-fast) var(--ui-ease); }
.stat-card--link:hover { border-color: var(--ui-brand-600); }
/* CMP-013: очередь «Разобрать» — один список по убыванию срочности, а не оглавление по типам. */
.ui-attention__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ui-space-xs); }
.ui-attention__item { border-left: 3px solid var(--ui-border); border-radius: var(--ui-radius-sm); background: var(--ui-surface); }
.ui-attention__item--high { border-left-color: var(--ui-danger-600); }
.ui-attention__item--medium { border-left-color: var(--ui-warning-600); }
.ui-attention__item--low { border-left-color: var(--ui-neutral-500); }
.ui-attention__link { display: flex; flex-direction: column; gap: 2px; padding: var(--ui-space-sm) var(--ui-space-md); min-height: 44px; justify-content: center; text-decoration: none; color: var(--ui-text); }
.ui-attention__link:hover { background: var(--ui-surface-muted); }
.ui-attention__title { font-weight: var(--ui-font-weight-semibold); }
.ui-attention__meta { font-size: var(--ui-font-size-sm); color: var(--ui-text-muted); }
.ui-attention__rest { margin: var(--ui-space-sm) 0 0; font-size: var(--ui-font-size-sm); color: var(--ui-text-muted); }

/*
 * UI-029: загрузка НЕ анимируется. Здесь была бесконечная бегущая подсветка — она не
 * заканчивается никогда и продолжает двигаться всё время, пока данные едут. Людям, которым
 * движение противопоказано (вестибулярные нарушения, склонность к укачиванию, мигрень),
 * такая полоса мешает физически, а пользы не несёт: смысл скелетона в том, что он ПОКАЗЫВАЕТ
 * форму будущего содержимого, а не в том, что он мерцает.
 */
.ui-skeleton-line {
  height: 12px;
  border-radius: 6px;
  background: var(--ui-surface-muted);
  border: 1px solid var(--ui-border);
}
.ui-skeleton-block { display: grid; gap: 10px; padding: 4px 0; }
/* ТЗ 7.3: экран загрузки занимает страницу ЦЕЛИКОМ. Прежний серый прямоугольник в углу
   пустой белой страницы выглядел не как загрузка, а как поломка — и на медленной сети
   висел секундами, за которые человек успевал решить, что система не работает.
   Движения здесь нет намеренно (UI-029): скелетон показывает форму будущего содержимого,
   а не мерцает. */
.ui-boot { min-height: 100dvh; display: grid; grid-template-rows: auto 1fr; gap: var(--ui-space-xl); padding: var(--ui-space-xl); background: var(--ui-bg); }
.ui-boot__mark { display: grid; justify-items: center; align-content: end; gap: var(--ui-space-xs); padding-top: var(--ui-space-xxl); }
.ui-boot__logo { display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: var(--ui-radius-lg); background: var(--ui-brand-600); color: var(--ui-on-brand); font-size: var(--ui-font-size-2xl); font-weight: var(--ui-font-weight-bold); }
.ui-boot__title { font-size: var(--ui-font-size-lg); font-weight: var(--ui-font-weight-semibold); color: var(--ui-text); }
.ui-boot__message { font-size: var(--ui-font-size-sm); color: var(--ui-text-muted); }
.ui-boot__frame { display: grid; grid-template-columns: 220px 1fr; gap: var(--ui-space-xl); max-width: 1100px; width: 100%; margin: 0 auto; }
.ui-boot__sidebar { display: grid; gap: var(--ui-space-md); align-content: start; }
.ui-boot__main { display: grid; gap: var(--ui-space-xl); align-content: start; }
.ui-boot__topbar { display: grid; gap: var(--ui-space-sm); }
.ui-boot__table { display: grid; gap: var(--ui-space-md); }
.ui-boot__line--wide { height: 28px; }
.ui-boot__line--short { max-width: 240px; }
@media (max-width: 480px) {
  /* Телефон: бокового меню там не будет, и рисовать его значило бы обещать несуществующее. */
  .ui-boot { padding: var(--ui-space-md); }
  .ui-boot__frame { grid-template-columns: 1fr; }
  .ui-boot__sidebar { display: none; }
}
@keyframes ui-spin { to { transform: rotate(360deg); } }
@keyframes ui-rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
.ui-ordered-list { margin: 0; padding-left: 20px; color: var(--ui-text-muted); line-height: var(--ui-line-height-normal); }
.ui-code-block { margin: 0; overflow: auto; font-size: var(--ui-font-size-sm); background: var(--ui-surface-muted); padding: 12px; border-radius: var(--ui-radius-md); border: 1px solid var(--ui-border); color: var(--ui-text); }
.ui-link-primary { color: var(--ui-brand-700); font-weight: var(--ui-font-weight-semibold); text-decoration: underline; text-underline-offset: 2px; }
.ui-link-primary:hover { color: var(--ui-brand-600); }
button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible,summary:focus-visible { outline: 2px solid var(--ui-focus); outline-offset: 2px; border-radius: var(--ui-radius-sm); }

@media (prefers-reduced-motion: no-preference) {
  .ui-page > *,.ui-page-container > * { animation: ui-rise var(--ui-duration-slow) cubic-bezier(.21,.68,.24,1) both; }
  .ui-page > *:nth-child(1),.ui-page-container > *:nth-child(1) { animation-delay: .02s; }
  .ui-page > *:nth-child(2),.ui-page-container > *:nth-child(2) { animation-delay: .08s; }
  .ui-page > *:nth-child(3),.ui-page-container > *:nth-child(3) { animation-delay: .14s; }
  .ui-page > *:nth-child(4),.ui-page-container > *:nth-child(4) { animation-delay: .20s; }
  .ui-page > *:nth-child(n+5),.ui-page-container > *:nth-child(n+5) { animation-delay: .24s; }
}

@media (max-width: 1024px) {
  .ui-page,.ui-page-container{padding:16px;}
}
@media (max-width: 768px) {
  .ui-page-header { flex-direction: column; align-items: flex-start; }
  .ui-filter-bar,.ui-inline,.ui-toolbar { align-items: stretch; }
  .ui-filter-bar > *,
  .ui-toolbar > * { width: 100%; }
  .ui-hero__cta { width: 100%; justify-content: center; }
}
/* ФТ-H4 (Фаза 5): телефон ≤480px — кабинет читается на 360px без горизонтальной
   прокрутки, кнопки навигации теста растягиваются в удобные тач-зоны. */
@media (max-width: 480px) {
  .ui-page,.ui-page-container { padding: 14px 12px; gap: 14px; }
  .ui-section-card { padding: var(--ui-space-lg) var(--ui-space-md); }
  .test-nav > * { flex: 1 1 auto; }
  /* ТЗ 6.2 на телефоне: полоса экзамена переносится, название теста не выдавливает таймер. */
  .exam-bar { padding: 10px 12px; gap: 8px; }
  .exam-bar__test { flex: 1 1 100%; margin-right: 0; }
  .kv-list__row, .ui-data-list__row { flex-wrap: wrap; }
}
`;
