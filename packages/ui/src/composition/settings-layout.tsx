'use client';

import type { ComponentType, PropsWithChildren, ReactElement, ReactNode } from 'react';

export interface SettingsNavSection {
  /** Совпадает с якорем на экране, если раздел встроен. */
  id: string;
  title: string;
  hint?: string;
  /** Задан — раздел живёт своим маршрутом; иначе это якорь на этом же экране. */
  href?: string;
}

/**
 * Куда ведёт строка оглавления: свой маршрут или якорь на этом же экране.
 *
 * Вынесено отдельной функцией и наружу, потому что от него зависит и ссылка, и выбранное
 * значение выпадающего списка: разойдись они — на телефоне список показывал бы «Выберите
 * раздел», стоя на открытом разделе.
 */
export const settingsSectionTarget = (section: SettingsNavSection): string =>
  section.href ?? `#${section.id}`;

/**
 * Переход по выбору в выпадающем списке (телефон).
 *
 * Список разделов на 360px не помещается ни колонкой, ни рядом, поэтому там это `select` —
 * и переход делает он сам: держать ради одного случая маршрутизатор в пакете компонентов
 * значило бы привязать пакет к приложению.
 */
const goTo = (target: string): void => {
  if (typeof window === 'undefined' || target === '') return;
  if (target.startsWith('#')) {
    window.location.hash = target;
    return;
  }
  window.location.assign(target);
};

/**
 * `TPL-005` · раскладка настроек: оглавление слева, содержимое справа.
 *
 * Зачем колонка, а не стопка. Разделов настроек шестнадцать. Стопкой блоков сверху вниз
 * человек ищет нужный перебором и прокруткой — ровно то, от чего ушли, когда 14 пунктов
 * меню свели в один экран (`IA-018`). Колонка слева показывает все разделы разом и не
 * уезжает при прокрутке содержимого.
 *
 * Три ширины (§7.5): на широком экране — две колонки; до 1024px оглавление становится
 * верхним рядом в один уровень; до 480px — выпадающим списком. Всё три состояния — это CSS
 * `.ui-settings` в `layout.ts`, кроме самого списка: он живёт в разметке всегда и просто
 * скрыт на широких экранах, потому что превратить `ul` в `select` силами CSS нельзя.
 *
 * `link` — компонент ссылки приложения (в Next это `Link`): без него переход на соседний
 * раздел перезагружал бы страницу целиком. По умолчанию — обычная `a`, чтобы пакет
 * оставался самостоятельным.
 */
export const SettingsLayout = ({
  sections,
  activeId,
  label = 'Разделы настроек',
  link: LinkComponent = 'a',
  children
}: PropsWithChildren<{
  sections: SettingsNavSection[];
  activeId?: string;
  label?: string;
  link?: ComponentType<{ href: string; className?: string; children?: ReactNode }> | 'a';
}>): ReactElement => {
  const active = sections.find((section) => section.id === activeId);

  return (
    <div className="ui-settings">
      <nav className="ui-settings__nav" aria-label={label}>
        <label className="ui-settings__picker">
          <span className="ui-field-label">{label}</span>
          <select
            className="ui-select"
            value={active ? settingsSectionTarget(active) : ''}
            onChange={(event) => goTo(event.target.value)}
          >
            <option value="">Выберите раздел</option>
            {sections.map((section) => (
              <option key={section.id} value={settingsSectionTarget(section)}>
                {section.title}
              </option>
            ))}
          </select>
        </label>

        <ul className="ui-settings-toc">
          {sections.map((section) => {
            const inner = (
              <>
                <span className="ui-settings-toc__title">{section.title}</span>
                {section.hint === undefined ? null : (
                  <span className="ui-settings-toc__hint">{section.hint}</span>
                )}
              </>
            );
            /* Свой маршрут — ссылкой приложения; якорь — обычной `a`, её `Link` не нужен. */
            return (
              <li key={section.id} className="ui-settings-toc__item">
                {section.href === undefined ? (
                  <a
                    href={`#${section.id}`}
                    className="ui-settings-toc__link"
                    {...(section.id === activeId ? { 'aria-current': 'location' as const } : {})}
                  >
                    {inner}
                  </a>
                ) : (
                  <LinkComponent href={section.href} className="ui-settings-toc__link">
                    {inner}
                  </LinkComponent>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="ui-settings__body">{children}</div>
    </div>
  );
};
