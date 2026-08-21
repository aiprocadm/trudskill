export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const shadows = {
  sm: '0 1px 2px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.08)',
  md: '0 14px 36px -12px rgba(15, 23, 42, 0.20), 0 4px 12px -6px rgba(15, 23, 42, 0.10)',
  lg: '0 28px 64px -20px rgba(8, 15, 30, 0.42)'
} as const;

export const semanticStatusMap = {
  active: 'var(--ui-success-600)',
  inactive: 'var(--ui-neutral-500)',
  archived: 'var(--ui-warning-700)',
  pending: 'var(--ui-warning-600)',
  failed: 'var(--ui-danger-600)',
  running: 'var(--ui-brand-600)',
  queued: 'var(--ui-warning-600)',
  completed: 'var(--ui-success-600)',
  draft: 'var(--ui-neutral-500)',
  published: 'var(--ui-success-600)',
  blocked: 'var(--ui-danger-600)',
  suspended: 'var(--ui-danger-600)',
  cancelled: 'var(--ui-danger-600)'
} as const;

/**
 * Ключ карты цветов — то, что уходит в проп `status` компонента `StatusChip` (`UI-023`).
 *
 * Доменных статусов в продукте больше, чем цветов: «истекла», «отозвана», «одобрен»,
 * «на проверке». Экран сам сопоставляет свой статус одному из этих ключей — тип не даёт
 * ошибиться в написании, а `semanticStatusMap` остаётся прежним (13 состояний, 5 цветов).
 */
export type SemanticStatus = keyof typeof semanticStatusMap;

// trudskill — бренд-палитра: индиго (#3B4FE4, структура) + коралл (#FF7A45, действие).
// Нейтрали — холодная slate-шкала, почти чёрный текст. Все цвета проверены на WCAG AA
// как текст на белом (≥4.5:1). Герой — индиго-градиент с коралловой CTA (тёмный текст).
export const lightThemeVars = {
  /*
   * UI-014: карточка отделяется ФОНОМ, а не рамкой. Прежний фон страницы `#f8fafc` отличался
   * от белой карточки на доли процента яркости — без рамки карточка попросту растворялась.
   * Фон страницы сделан заметнее: разница «страница ↔ карточка» теперь видна глазом, и
   * рамка карточке больше не нужна.
   */
  '--ui-bg': '#eef2f7',
  '--ui-surface': '#ffffff',
  '--ui-surface-muted': '#f1f5f9',
  '--ui-surface-accent': '#eef1fe',
  '--ui-border': '#e2e8f0',
  /*
   * Граница ЭЛЕМЕНТА УПРАВЛЕНИЯ — поля ввода, кнопки, флажка (`UI-001`, WCAG 1.4.11).
   * Обычный `--ui-border` даёт на белом 1.23:1: разделитель карточек так и задуман,
   * но у поля ввода граница — единственный признак, что сюда можно писать, и её
   * обязан различать человек со слабым зрением. Измерено: 3.50:1 на белом,
   * 3.35:1 на фоне страницы (порог 3:1).
   */
  '--ui-border-strong': '#7c8aa0',
  '--ui-text': '#0f172a',
  '--ui-text-muted': '#475569',
  '--ui-neutral-50': '#f8fafc',
  '--ui-neutral-100': '#f1f5f9',
  '--ui-neutral-300': '#cbd5e1',
  '--ui-neutral-700': '#334155',
  '--ui-neutral-900': '#0f172a',
  '--ui-brand-600': '#3b4fe4',
  '--ui-brand-700': '#2c3ac0',
  // Акцент = коралл (главные кнопки/прогресс). С белым текстом коралл проваливает AA (2.6:1),
  // поэтому коралловые кнопки используют тёмный текст --ui-text (6.4:1).
  '--ui-accent-600': '#ff7a45',
  '--ui-accent-700': '#ea6326',
  // Текст на коралле — всегда тёмный (в обеих темах коралл светлый). Белый текст = провал AA.
  '--ui-on-accent': '#0f172a',
  '--ui-info-600': '#0b6aa6',
  // success/warning затемнены до AA-уровня как текст на белом (яркие #16A34A/#F59E0B давали 3.2:1).
  '--ui-success-600': '#15803d',
  '--ui-warning-600': '#b45309',
  '--ui-warning-700': '#92400e',
  '--ui-danger-600': '#dc2626',
  '--ui-neutral-500': '#64748b',
  '--ui-focus': '#3b4fe4',
  '--ui-shadow': shadows.sm,
  '--ui-shadow-strong': shadows.md,
  // Боковая навигация — глубокий индиго «рейка», белый активный пункт (высокий контраст)
  '--ui-nav-sidebar-bg': '#1e2150',
  '--ui-nav-hover-bg': '#2c2f6b',
  '--ui-nav-active-bg': 'rgba(255, 255, 255, 0.13)',
  '--ui-nav-active-text': '#ffffff',
  '--ui-nav-text': '#e9ecfb',
  '--ui-nav-text-muted': '#a9afd6',
  '--ui-error-border': '#fecaca',
  /*
   * Герой «Следующий шаг» (`UI-009`/`UI-010`): плоская подложка в тон --ui-surface-accent
   * вместо градиента, бренд-акцент — на заголовке (см. .ui-hero__title). Из переменных
   * остались пять; hover CTA берёт --ui-accent-700. Контрасты пар — в contrast-audit.
   */
  '--ui-hero-bg': '#eef1fe',
  '--ui-hero-text': '#0f172a',
  '--ui-hero-muted': '#475569',
  '--ui-hero-cta-bg': '#ff7a45',
  '--ui-hero-cta-text': '#0f172a',
  /* Подложка всплывающих слоёв: модалка, палитра команд, выдвижное меню. */
  '--ui-overlay': 'rgba(15, 23, 42, 0.45)'
} as const;

// Тёмная тема — те же роли, осветлённые версии бренда/акцента для контраста на тёмном фоне.
export const darkThemeVars = {
  '--ui-bg': '#0b1120',
  '--ui-surface': '#151b2e',
  '--ui-surface-muted': '#1c2438',
  '--ui-surface-accent': '#222c46',
  '--ui-border': '#2a3550',
  /* Измерено: 3.84:1 на поверхности карточки, 4.23:1 на фоне страницы. */
  '--ui-border-strong': '#6b7891',
  '--ui-text': '#f1f5f9',
  '--ui-text-muted': '#aeb9cd',
  '--ui-neutral-50': '#f6f8fb',
  '--ui-neutral-100': '#e6ebf2',
  '--ui-neutral-300': '#9aa6ba',
  '--ui-neutral-700': '#46536b',
  '--ui-neutral-900': '#0b1120',
  '--ui-brand-600': '#6b7bf0',
  '--ui-brand-700': '#a9b5f8',
  '--ui-accent-600': '#ff8a5c',
  '--ui-accent-700': '#ff9e78',
  '--ui-on-accent': '#1a1205',
  '--ui-info-600': '#3aa6e0',
  '--ui-success-600': '#34d27a',
  '--ui-warning-600': '#f0a93a',
  '--ui-warning-700': '#d9942e',
  '--ui-danger-600': '#f0795f',
  '--ui-neutral-500': '#aab6cb',
  '--ui-focus': '#6b7bf0',
  '--ui-shadow': '0 1px 2px rgba(0, 0, 0, 0.34)',
  '--ui-shadow-strong': '0 18px 44px -16px rgba(0, 0, 0, 0.64)',
  '--ui-nav-sidebar-bg': '#0a0e1c',
  '--ui-nav-hover-bg': '#1a2238',
  '--ui-nav-active-bg': 'rgba(255, 255, 255, 0.14)',
  '--ui-nav-active-text': '#ffffff',
  '--ui-nav-text': '#e9ecfb',
  '--ui-nav-text-muted': '#9fa8cf',
  '--ui-error-border': '#7f2418',
  /* Герой — плоская подложка в тон тёмного --ui-surface-accent (UI-009/UI-010). */
  '--ui-hero-bg': '#222c46',
  '--ui-hero-text': '#f1f5f9',
  '--ui-hero-muted': '#aeb9cd',
  '--ui-hero-cta-bg': '#ff8a5c',
  '--ui-hero-cta-text': '#1a1205',
  /* Под подложкой в тёмной теме лежит тёмный фон: прозрачность 0.45 почти не
     отделяла бы всплывающий слой от страницы, поэтому плотнее и глубже. */
  '--ui-overlay': 'rgba(2, 6, 23, 0.66)'
} as const;

// CSS-мост: базовые (не зависящие от темы) переменные — отступы, радиусы, типографика.
// Значения синхронизированы с JS-токенами spacing/radius (гарантируется base-vars.test.ts).
// Вёрстка в styles/* должна ссылаться на эти var(--ui-*), а не хардкодить px.
export const baseVars = {
  '--ui-space-xs': `${spacing.xs}px`,
  '--ui-space-sm': `${spacing.sm}px`,
  '--ui-space-md': `${spacing.md}px`,
  '--ui-space-lg': `${spacing.lg}px`,
  '--ui-space-xl': `${spacing.xl}px`,
  '--ui-space-xxl': `${spacing.xxl}px`,
  '--ui-radius-sm': `${radius.sm}px`,
  '--ui-radius-md': `${radius.md}px`,
  '--ui-radius-lg': `${radius.lg}px`,
  '--ui-radius-pill': `${radius.pill}px`,
  '--ui-font-size-xs': '12px',
  '--ui-font-size-sm': '13px',
  '--ui-font-size-md': '15px',
  '--ui-font-size-lg': '17px',
  '--ui-font-size-xl': '22px',
  /*
   * UI-011 — верхние ступени шкалы. До них заголовок героя набирался `clamp()` до 33 px,
   * то есть самый крупный текст продукта жил ВНЕ шкалы: менялся отдельно от всего
   * остального и не участвовал в сравнении экранов.
   */
  '--ui-font-size-2xl': '28px',
  '--ui-font-size-3xl': '34px',
  /*
   * UI-028 — движение задаётся токенами, а не числами по месту.
   *
   * До этого длительности были записаны прямо в стилях и вразнобой: `.15s`, `0.15s`,
   * `.18s`, `0.2s`, `.4s`. Разнобой не виден глазом, поменять скорость разом нельзя,
   * а проверить — нечем.
   *
   * `fast` — отклик на наведение и нажатие: человек должен чувствовать, что попал.
   * `base` — раскрытие и сворачивание: панели, списки, подсказки.
   * `slow` — только заполнение полосы прогресса, где движение и есть смысл.
   */
  '--ui-duration-fast': '150ms',
  '--ui-duration-base': '200ms',
  '--ui-duration-slow': '400ms',
  '--ui-ease': 'ease',
  '--ui-font-weight-medium': '500',
  '--ui-font-weight-semibold': '600',
  '--ui-font-weight-bold': '700',
  '--ui-line-height-tight': '1.2',
  '--ui-line-height-normal': '1.5',
  // TPL-004: одна колонка формы. Шире 720px строка ввода перестаёт читаться как поле,
  // а глаз теряет связь между подписью слева и значением справа.
  '--ui-form-max': '720px',
  /*
   * UI-012 — ширина строки текста. Строка во всю ширину широкого экрана читается плохо:
   * дочитав до края, глаз теряет начало следующей. Типографская норма — 60–75 знаков.
   *
   * Значение в `ch` (ширина знака текущего шрифта), а не в пикселях: при смене шрифта или
   * размера норма сохранится сама, без пересчёта.
   *
   * `narrow` — для подсказок под полем и коротких пояснений: там строка должна быть ещё
   * короче, иначе подпись выглядит абзацем и перестаёт читаться как подпись.
   */
  '--ui-measure': '68ch',
  '--ui-measure-narrow': '48ch',
  // UI-017: предельная ширина полосы содержимого — дальше строки таблиц и заголовки
  // расползаются, и взгляду не за что зацепиться.
  '--ui-content-max': '1280px'
} as const;
