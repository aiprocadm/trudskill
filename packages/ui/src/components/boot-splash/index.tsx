import type { ReactElement } from 'react';

/**
 * Экран загрузки приложения (ТЗ «Стабилизация, UX и развитие», 7.3 / В3).
 *
 * **Как было.** Серый прямоугольник «Проверяем сессию…» в левом верхнем углу пустой белой
 * страницы. Человек видел это на КАЖДОМ входе и после каждого обновления вкладки, и выглядело
 * это не как «идёт загрузка», а как сломанная страница: пусто, бело, в углу непонятная
 * надпись. Хуже всего то, что при медленной сети такой экран живёт несколько секунд — и за эти
 * секунды человек успевает решить, что система не работает, и нажать обновление ещё раз.
 *
 * **Что стало.** Страница занята целиком: логотип по центру верхней части и КАРКАС будущей
 * страницы — полосы там, где через мгновение окажутся меню, шапка и таблица. Человек видит не
 * пустоту, а форму того, что грузится.
 *
 * **Почему без анимации.** `UI-029`: мерцающая полоса не заканчивается никогда, а смысл
 * скелетона в том, что он показывает ФОРМУ будущего содержимого, а не в том, что он движется.
 * Людям с вестибулярными нарушениями непрерывное движение мешает физически.
 *
 * **Почему логотип платформы, а не центра.** Этот экран живёт ДО того, как стала известна
 * сессия, — значит и арендатор ещё не известен. Подставить сюда бренд центра неоткуда; ждать
 * его ради логотипа значило бы задержать сам экран загрузки.
 */

/** Сколько полос рисовать — форма каркаса, а не число строк будущей таблицы. */
const MENU_LINES = 6;
const TABLE_LINES = 5;

export type BootSplashFrame =
  /** Страница приложения: будет боковое меню, шапка и содержимое. */
  | 'app'
  /** Вход и другие страницы без каркаса: меню там не появится, рисовать его — врать. */
  | 'plain';

export const BootSplash = ({
  frame = 'app',
  message = 'Загружаем рабочее место'
}: {
  frame?: BootSplashFrame;
  message?: string;
}): ReactElement => (
  /*
   * Единая живая область на весь экран: читалка сообщает «загружаем рабочее место» один раз, а
   * не зачитывает каждую декоративную полосу. Сами полосы от неё скрыты (`aria-hidden`).
   */
  <div className="ui-boot" role="status" aria-live="polite" aria-busy="true">
    <div className="ui-boot__mark">
      <span className="ui-boot__logo" aria-hidden>
        t
      </span>
      <span className="ui-boot__title">trudskill</span>
      <span className="ui-boot__message">{message}</span>
    </div>

    {frame === 'app' ? (
      <div className="ui-boot__frame" aria-hidden>
        <div className="ui-boot__sidebar">
          {Array.from({ length: MENU_LINES }, (_, index) => (
            <span key={index} className="ui-skeleton-line" />
          ))}
        </div>
        <div className="ui-boot__main">
          <div className="ui-boot__topbar">
            <span className="ui-skeleton-line ui-boot__line--wide" />
            <span className="ui-skeleton-line ui-boot__line--short" />
          </div>
          <div className="ui-boot__table">
            {Array.from({ length: TABLE_LINES }, (_, index) => (
              <span key={index} className="ui-skeleton-line" />
            ))}
          </div>
        </div>
      </div>
    ) : null}
  </div>
);
