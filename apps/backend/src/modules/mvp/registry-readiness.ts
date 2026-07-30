/**
 * Готовность к выгрузке в госреестр (ФТ-C4.1, Фаза 3 Task 8).
 *
 * **Здесь сознательно нарушается принцип «частичного успеха»**, действующий в проекте для
 * массовых операций. Для ИМПОРТА он верен: взять хорошие строки, показать плохие. Для
 * ОТПРАВКИ В ГОСРЕЕСТР — нет. Неполный файл означает, что пропущенные люди в реестре
 * просто не появятся, и никто этого не заметит: центр видит «выгрузка сформирована»,
 * реестр видит меньше людей, а слушатель узнаёт об этом через год, когда ему понадобится
 * подтверждение. Поэтому выгрузка не собирается, пока список пробелов не пуст.
 *
 * Второе требование ТЗ — список должен быть ПОИМЁННЫМ. Плоский перечень ошибок по полям
 * («snils — некорректный СНИЛС» ×40) не отвечает на вопрос методиста «кого мне
 * дозаполнить»: одна и та же строка даёт несколько ошибок, а один человек может быть
 * в выгрузке несколькими документами.
 */

/** Ошибка строки выгрузки — общая форма у всех пяти реестров. */
export interface RegistryRowIssue {
  learnerId: string;
  fullName: string;
  field: string;
  message: string;
}

export interface RegistryReadinessLearner {
  learnerId: string;
  fullName: string;
  /** Поля, которые надо дозаполнить, с человеческим объяснением. */
  problems: Array<{ field: string; message: string }>;
}

export interface RegistryReadinessReport {
  ready: boolean;
  /** Сколько человек мешают выгрузке — именно людей, а не ошибок. */
  blockedLearners: number;
  learners: RegistryReadinessLearner[];
}

/** Строки без разрешённого слушателя — их некому дозаполнить, показываем отдельно. */
const UNKNOWN_LEARNER = '—';

/**
 * Группирует ошибки строк по слушателю.
 *
 * Дубли по паре (поле, сообщение) схлопываются: человек с двумя удостоверениями и одним
 * незаполненным СНИЛСом должен увидеть одну строку «нет СНИЛС», а не две одинаковых.
 */
export function buildReadinessReport(issues: RegistryRowIssue[]): RegistryReadinessReport {
  const byLearner = new Map<string, RegistryReadinessLearner>();

  for (const issue of issues) {
    const key = issue.learnerId || UNKNOWN_LEARNER;
    let entry = byLearner.get(key);
    if (!entry) {
      entry = {
        learnerId: issue.learnerId,
        fullName: issue.fullName?.trim() || UNKNOWN_LEARNER,
        problems: []
      };
      byLearner.set(key, entry);
    }
    // ФИО может быть пустым в одной строке и заполненным в другой — берём заполненное,
    // иначе методист увидит «—» и не поймёт, о ком речь.
    if (entry.fullName === UNKNOWN_LEARNER && issue.fullName?.trim()) {
      entry.fullName = issue.fullName.trim();
    }
    const already = entry.problems.some(
      (p) => p.field === issue.field && p.message === issue.message
    );
    if (!already) entry.problems.push({ field: issue.field, message: issue.message });
  }

  const learners = [...byLearner.values()].sort((a, b) =>
    a.fullName.localeCompare(b.fullName, 'ru')
  );
  return {
    ready: learners.length === 0,
    blockedLearners: learners.length,
    learners
  };
}
