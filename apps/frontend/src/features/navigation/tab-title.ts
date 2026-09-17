import type { BreadcrumbItem } from './breadcrumbs';

/**
 * Заголовок вкладки браузера (ТЗ «Стабилизация, UX и развитие», 4.3 / Я3).
 *
 * **Как было.** `<title>` не задавала ни одна из 102 страниц, корневая раскладка — тоже
 * (журнал 394). Человек с пятью вкладками не различал их; закладка и история браузера не
 * говорили, что в них лежит.
 *
 * **Что закреплено.** Название берётся из того же реестра, что меню, заголовок страницы и
 * крошки, — через сами крошки, в одном месте (оболочка). Форма: «Раздел — Центр», у карточки —
 * «Имя объекта — Раздел — Центр». Пока имя объекта едет с сервера, вкладка называет раздел:
 * скелетон в заголовке не нарисуешь.
 */
export const TAB_TITLE_SEPARATOR = ' — ';

export const tabTitle = (crumbs: readonly BreadcrumbItem[], wordmark: string): string => {
  /* Блок ИА («Люди и группы») — подпись без ссылки, во вкладку не идёт: там нужен раздел. */
  const named = crumbs.filter((crumb) => crumb.href && !crumb.pending && crumb.label);
  const last = named.at(-1);
  if (!last) return wordmark;
  const parts = [last.label];
  if (last.object) {
    const section = named.at(-2);
    if (section) parts.push(section.label);
  }
  return [...parts, wordmark].join(TAB_TITLE_SEPARATOR);
};
