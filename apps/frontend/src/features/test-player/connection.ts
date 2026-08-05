/**
 * ФТ-H5 (Фаза 5 Task 3): состояние сохранности ответов на экзамене.
 *
 * **Зачем.** Таймер и автосохранение в раннере были и раньше, но человек, у которого
 * пропала сеть, узнавал об этом только при нажатии «Завершить тест» — то есть когда
 * поздно. Сохранение шло молча: неудачный запрос никак не отображался, а вкладку можно
 * было закрыть с несохранённым ответом без единого предупреждения.
 *
 * **Почему отдельным модулем.** Это чистая функция от четырёх признаков — её можно
 * проверить на все сочетания без браузера и без React. Компонентных тестов в проекте
 * нет вовсе, поэтому логика, оставленная внутри JSX, осталась бы непроверенной.
 */

export interface ConnectionInput {
  /** `navigator.onLine`. Браузер знает только про физическое подключение. */
  online: boolean;
  /** Сколько ответов изменено и ещё не подтверждено сервером. */
  unsavedCount: number;
  /** Прямо сейчас идёт запрос сохранения. */
  saving: boolean;
  /** Текст последней неудачи сохранения, если она была. */
  lastError: string | null;
}

export type ConnectionLevel = 'ok' | 'saving' | 'warning' | 'danger';

export interface ConnectionStatus {
  level: ConnectionLevel;
  message: string;
  /** Есть что терять: этим же признаком включается предупреждение при уходе со страницы. */
  hasUnsaved: boolean;
}

/**
 * Порядок проверок = порядок опасности, а не удобства чтения. Сначала то, из-за чего
 * ответы пропадут (нет сети при несохранённых), потом то, что просто требует внимания.
 */
export function resolveConnectionStatus(input: ConnectionInput): ConnectionStatus {
  const hasUnsaved = input.unsavedCount > 0;

  if (!input.online && hasUnsaved) {
    return {
      level: 'danger',
      message: `Нет связи. Не сохранено ответов: ${input.unsavedCount}. Не закрывайте страницу — отправим, как только сеть вернётся.`,
      hasUnsaved
    };
  }

  if (!input.online) {
    // Сеть пропала, но терять нечего — пугать человека посреди экзамена незачем.
    return {
      level: 'warning',
      message: 'Нет связи. Всё, что вы уже ответили, сохранено.',
      hasUnsaved
    };
  }

  if (input.lastError && hasUnsaved) {
    return {
      level: 'danger',
      message: `Ответ не сохранился: ${input.lastError}. Не закрывайте страницу.`,
      hasUnsaved
    };
  }

  // Сеть есть и несохранённого нет: прошлая ошибка уже неактуальна — она бы только
  // отвлекала. Показывать «была ошибка» рядом с «всё сохранено» значит путать.
  if (input.saving) {
    return { level: 'saving', message: 'Сохраняем ответ…', hasUnsaved };
  }

  if (hasUnsaved) {
    return { level: 'warning', message: 'Есть несохранённые ответы.', hasUnsaved };
  }

  return { level: 'ok', message: 'Все ответы сохранены.', hasUnsaved };
}

/** Текст в диалоге браузера при уходе со страницы. */
export const LEAVE_CONFIRMATION =
  'Есть несохранённые ответы. Если уйти со страницы, они потеряются.';
