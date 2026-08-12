/*
 * IA-020: однократная подсказка «меню стало короче».
 *
 * Ключ намеренно назван НОВЫМ брендом сразу. Ребрендинг (BR-020..BR-023, Фаза 8)
 * переименовывает старые ключи с периодом двойного чтения — заводить сегодня ещё
 * один ключ со словом cdoprof значило бы добавить себе работы в той фазе.
 *
 * Хранилище передаётся аргументом, а не берётся из window: так функции остаются
 * чистыми и проверяемыми (в проекте нет jsdom), включая случай приватного режима,
 * где обращение к localStorage бросает исключение.
 */
export const NAV_HINT_STORAGE_KEY = 'trudskill.ui.nav-hint.v1';

export type NavHintState = 'dismissed' | 'pending';

export const readNavHintState = (storage: Storage): NavHintState => {
  try {
    return storage.getItem(NAV_HINT_STORAGE_KEY) === 'dismissed' ? 'dismissed' : 'pending';
  } catch {
    return 'pending';
  }
};

export const writeNavHintDismissed = (storage: Storage): void => {
  try {
    storage.setItem(NAV_HINT_STORAGE_KEY, 'dismissed');
  } catch {
    // Приватный режим: подсказка покажется ещё раз. Это не повод падать.
  }
};

export const isNavHintDismissed = (state: NavHintState): boolean => state === 'dismissed';
