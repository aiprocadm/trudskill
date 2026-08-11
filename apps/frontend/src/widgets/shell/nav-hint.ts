/*
 * IA-020: однократная подсказка после перехода на короткое меню.
 *
 * Единственное изменение Фазы 1, которое пользователь может принять за пропажу разделов:
 * привычные пункты уехали во второй уровень. Подсказка объясняет, куда именно, и больше
 * не показывается.
 *
 * Хранилище передаётся параметром: модуль импортируется и при серверном рендере, где
 * localStorage нет, а тесты пакета идут без RTL — чистые функции проверяются напрямую.
 * Ошибка чтения означает «не показывать»: подсказка не стоит белого экрана.
 */
export const NAV_HINT_STORAGE_KEY = 'cdoprof.ui.nav-hint.v1';

const DISMISSED = 'dismissed';

export const shouldShowNavHint = (read: (key: string) => string | null): boolean => {
  try {
    return read(NAV_HINT_STORAGE_KEY) !== DISMISSED;
  } catch {
    return false;
  }
};

export const dismissNavHint = (write: (key: string, value: string) => void): void => {
  try {
    write(NAV_HINT_STORAGE_KEY, DISMISSED);
  } catch {
    /* хранилище недоступно — подсказка просто появится в следующий раз */
  }
};
