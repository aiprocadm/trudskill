/**
 * Пометка «прогресс курса не сохранился».
 *
 * Дефект, ради которого это заведено: финальная отправка прогресса при уходе со страницы
 * глоталась молча (`// Best-effort: ignore`). Человек проходил урок, закрывал вкладку —
 * последняя порция не доезжала из-за обрыва связи, и он узнавал об этом только тогда,
 * когда занятие оказывалось незачтённым. То есть не узнавал вовсе, а проходил заново.
 *
 * Показать сообщение в этот момент нельзя: экран уже уходит. Поэтому неудача **помечается**
 * и показывается при следующем открытии того же курса — там, где человек может что-то
 * сделать: проверить связь и пройти последний фрагмент ещё раз.
 *
 * Хранилище браузера: сбой связи — местное событие, серверу о нём сообщить как раз и не
 * удалось. Ключ с префиксом `trudskill.`, как у сессии.
 */

const KEY_PREFIX = 'trudskill.scorm.unsaved.';

/** Записать неудачу последней отправки. Ошибки хранилища гасим: экран уже закрывается. */
export const markUnsavedProgress = (materialId: string): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${KEY_PREFIX}${materialId}`, new Date().toISOString());
  } catch {
    /* Приватный режим или переполнение: предупредить не выйдет, но и падать незачем. */
  }
};

/** Была ли неудача — и когда. `null`, если всё сохранилось. */
export const readUnsavedProgress = (materialId: string): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(`${KEY_PREFIX}${materialId}`);
  } catch {
    return null;
  }
};

/** Снять пометку — вызывается после успешной отправки. */
export const clearUnsavedProgress = (materialId: string): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(`${KEY_PREFIX}${materialId}`);
  } catch {
    /* см. выше */
  }
};
