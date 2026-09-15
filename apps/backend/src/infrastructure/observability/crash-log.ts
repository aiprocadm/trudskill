import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Причина падения процесса — в файл рядом со стендом (ТЗ «Стабилизация, UX и развитие», 1.2).
 *
 * Зачем, если есть системный журнал. Службы стенда пишут в него (`StandardOutput=journal`), и
 * он постоянный. Но **читать его может только член групп `adm` / `systemd-journal`**: на запрос
 * `journalctl -u lms-backend` обычный пользователь получает «You are currently not seeing
 * messages from other users and the system». Запись о падении существует — а человек, которому
 * она нужна прямо сейчас, её не видит. Ровно поэтому ТЗ просит файл, «а не только stdout».
 *
 * **Главное правило места: запись о падении не имеет права сделать падение хуже.** Если писать
 * некуда — нет прав, нет места, кривой путь, — функция молчит и возвращает `false`. Второе
 * исключение поверх первого скрыло бы настоящую причину.
 */

export type CrashKind = 'uncaughtException' | 'unhandledRejection';

const describe = (error: unknown): string => {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${error.stack ?? '(без стека)'}`;
  }
  try {
    return typeof error === 'string' ? error : JSON.stringify(error);
  } catch {
    /*
     * Брошенное значение не сериализуется (циклическая ссылка, прокси). Журналировать здесь
     * нечего и некуда: мы и так внутри описания ЧУЖОГО падения, и своя ошибка разбора не
     * должна его подменить. Берём то, что даёт приведение к строке.
     */
    return String(error);
  }
};

/** Пишет одну запись о падении. Возвращает `false`, если записать не удалось. */
export const recordCrash = (kind: CrashKind, error: unknown, file: string): boolean => {
  try {
    mkdirSync(dirname(file), { recursive: true });
    const entry = [
      '',
      '────────────────────────────────────────',
      `${new Date().toISOString()} ${kind}`,
      describe(error),
      ''
    ].join('\n');
    appendFileSync(file, entry, 'utf8');
    return true;
  } catch {
    /*
     * Писать некуда: нет прав, нет места, кривой путь. Молчание здесь ОСОЗНАННОЕ — это
     * обработчик падения процесса, и второе исключение поверх первого скрыло бы настоящую
     * причину. Отказ виден вызывающему по `false`.
     */
    return false;
  }
};

/**
 * Ставит обработчики на процесс.
 *
 * Поведение процесса НЕ меняется: необработанное исключение как роняло процесс, так и роняет —
 * `Restart=always` поднимет службу через пять секунд. Меняется одно: остаётся читаемый след.
 */
export const installCrashLog = (file: string): void => {
  process.on('uncaughtException', (error) => {
    recordCrash('uncaughtException', error, file);
    throw error;
  });
  process.on('unhandledRejection', (reason) => {
    recordCrash('unhandledRejection', reason, file);
  });
};
