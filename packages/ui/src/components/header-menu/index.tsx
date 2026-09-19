'use client';

import { useEffect, useRef } from 'react';

import type { ReactNode } from 'react';

/**
 * Выпадающее меню шапки (ТЗ «Стабилизация, UX и развитие», 14.1, пункт 3).
 *
 * **Что было.** Меню собиралось на родном раскрывающемся блоке браузера. Роли были
 * расставлены правильно, но вести себя как меню он не умеет: **Esc его не закрывает**, и клик
 * мимо тоже. Открыл «Ещё» — и меню висит поверх страницы, пока не нажмёшь ровно в тот же
 * заголовок. Человек с клавиатуры оказывался заперт: привычное «отменить» не срабатывало, а
 * чтобы закрыть, приходилось прощёлкивать Tab до заголовка меню и жать пробел (журнал 570).
 *
 * **Что стало.** Esc закрывает меню и **возвращает фокус на его заголовок** — то же правило,
 * что у всплывающих слоёв: человек остаётся там, откуда пришёл. Клик мимо тоже закрывает.
 *
 * **Почему обёртка, а не два одинаковых куска кода.** Такое меню в продукте в двух местах —
 * в шапке приложения и в заголовке страницы. Скопированная механика расходится молча: в одном
 * месте Esc работает, в другом нет, и замечает это только тот, кому она нужна.
 */
export const HeaderMenu = ({
  summary,
  children,
  className,
  summaryClassName,
  summaryLabel
}: {
  /** Что видно, пока меню закрыто. */
  summary: ReactNode;
  children: ReactNode;
  className?: string;
  summaryClassName?: string;
  /** Подпись для читалки экрана, когда в заголовке нет слов (например, только инициалы). */
  summaryLabel?: string;
}) => {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const close = (returnFocus: boolean) => {
      if (!element.open) return;
      element.open = false;
      /*
       * Фокус возвращается на заголовок меню только после Esc. После клика мимо — нет: человек
       * уже показал мышью, куда смотрит, и утаскивать фокус обратно значит мешать ему.
       */
      if (returnFocus) element.querySelector('summary')?.focus();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(true);
    };
    const onPointerDown = (event: Event) => {
      if (!element.contains(event.target as Node)) close(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, []);

  return (
    <details ref={ref} className={className ? `ui-header-menu ${className}` : 'ui-header-menu'}>
      <summary
        className={summaryClassName}
        {...(summaryLabel ? { 'aria-label': summaryLabel } : {})}
      >
        {summary}
      </summary>
      <div className="ui-header-menu__list" role="menu">
        {children}
      </div>
    </details>
  );
};
