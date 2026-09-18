'use client';

import type { ComponentType, PropsWithChildren, ReactElement, ReactNode } from 'react';

export interface SettingsNavSection {
  /** Попадает в адрес (`?tab=`), если раздел встроен. */
  id: string;
  title: string;
  hint?: string;
  /** Задан — раздел живёт своим маршрутом; иначе это вкладка на этом же экране. */
  href?: string;
}

/**
 * Куда ведёт строка оглавления: свой маршрут или вкладка на этом же экране.
 *
 * Вынесено отдельной функцией и наружу, потому что от него зависит и ссылка, и выбранное
 * значение выпадающего списка: разойдись они — на телефоне список показывал бы «Выберите
 * раздел», стоя на открытом разделе.
 */
export const settingsSectionTarget = (section: SettingsNavSection): string =>
  section.href ?? `?tab=${section.id}`;

/** Раздел открывается прямо здесь, а не уводит на другую страницу. */
export const isEmbeddedSection = (section: SettingsNavSection): boolean =>
  section.href === undefined;

/**
 * Переход по выбору в выпадающем списке (телефон): только для разделов, которые уводят
 * на свой маршрут. Встроенные переключает сам экран через `onSelect`.
 */
const goTo = (target: string): void => {
  if (typeof window === 'undefined' || target === '') return;
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
 * **ТЗ 5.7 (Э7): вкладки честные.** Было: часть пунктов слева меняла содержимое справа
 * (якорь), часть уводила на другую страницу — и по виду они были неотличимы. Предсказать,
 * что произойдёт по клику, человек не мог (журнал 461). Стало: два списка с разными
 * заголовками — «Настроить здесь» (открывается справа, ничего больше не происходит) и
 * «Открыть отдельный раздел» (уводит на свою страницу, и это сказано словами). Открытый
 * встроенный раздел живёт в адресе (`?tab=`), поэтому на него можно дать ссылку.
 *
 * Три ширины (§7.5): на широком экране — две колонки; до 1024px оглавление становится
 * верхним рядом в один уровень; до 480px — выпадающим списком.
 *
 * `link` — компонент ссылки приложения (в Next это `Link`): без него переход на соседний
 * раздел перезагружал бы страницу целиком. По умолчанию — обычная `a`, чтобы пакет
 * оставался самостоятельным.
 */
export const SettingsLayout = ({
  sections,
  activeId,
  onSelect,
  label = 'Разделы настроек',
  link: LinkComponent = 'a',
  children
}: PropsWithChildren<{
  sections: SettingsNavSection[];
  activeId?: string;
  /** Открыть встроенный раздел. Адрес пишет экран: маршрутизатор приложения не в пакете. */
  onSelect?: (id: string) => void;
  label?: string;
  link?: ComponentType<{ href: string; className?: string; children?: ReactNode }> | 'a';
}>): ReactElement => {
  const embedded = sections.filter(isEmbeddedSection);
  const external = sections.filter((section) => !isEmbeddedSection(section));
  const active = sections.find((section) => section.id === activeId);

  const inner = (section: SettingsNavSection): ReactElement => (
    <>
      <span className="ui-settings-toc__title">{section.title}</span>
      {section.hint === undefined ? null : (
        <span className="ui-settings-toc__hint">{section.hint}</span>
      )}
    </>
  );

  return (
    <div className="ui-settings">
      <nav className="ui-settings__nav" aria-label={label}>
        <label className="ui-settings__picker">
          <span className="ui-field-label">{label}</span>
          <select
            className="ui-select"
            value={active ? settingsSectionTarget(active) : ''}
            onChange={(event) => {
              const target = event.target.value;
              const chosen = sections.find((section) => settingsSectionTarget(section) === target);
              if (chosen && isEmbeddedSection(chosen)) {
                onSelect?.(chosen.id);
                return;
              }
              goTo(target);
            }}
          >
            <option value="">Выберите раздел</option>
            <optgroup label="Настроить здесь">
              {embedded.map((section) => (
                <option key={section.id} value={settingsSectionTarget(section)}>
                  {section.title}
                </option>
              ))}
            </optgroup>
            <optgroup label="Открыть отдельный раздел">
              {external.map((section) => (
                <option key={section.id} value={settingsSectionTarget(section)}>
                  {section.title}
                </option>
              ))}
            </optgroup>
          </select>
        </label>

        {/*
          Встроенные разделы — КНОПКИ, а не ссылки: по клику меняется содержимое справа и
          ничего больше. Ссылка обещает переход, которого не будет.
        */}
        <p className="ui-settings-toc__group">Настроить здесь</p>
        <ul className="ui-settings-toc">
          {embedded.map((section) => (
            <li key={section.id} className="ui-settings-toc__item">
              <button
                type="button"
                className="ui-settings-toc__link"
                onClick={() => onSelect?.(section.id)}
                {...(section.id === activeId ? { 'aria-current': 'true' as const } : {})}
              >
                {inner(section)}
              </button>
            </li>
          ))}
        </ul>

        {external.length > 0 ? (
          <>
            <p className="ui-settings-toc__group">Открыть отдельный раздел</p>
            <ul className="ui-settings-toc">
              {external.map((section) => (
                <li key={section.id} className="ui-settings-toc__item">
                  <LinkComponent href={section.href!} className="ui-settings-toc__link">
                    {inner(section)}
                  </LinkComponent>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </nav>

      <div className="ui-settings__body">{children}</div>
    </div>
  );
};
