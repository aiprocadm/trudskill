'use client';

import type { RegistryReadinessReport } from './types';
import type { ReactElement } from 'react';

/**
 * Поимённый список тех, из-за кого выгрузка не собрана (ФТ-C4.1, Фаза 3 Task 8).
 *
 * Раньше здесь был плоский перечень ошибок по полям («snils — некорректный СНИЛС» ×40).
 * На вопрос методиста «кого мне дозаполнить» он не отвечал: одна строка даёт несколько
 * ошибок, а один человек может попасть в выгрузку несколькими документами.
 *
 * Файл при этом НЕ формируется. Для отправки в госреестр «частичный успех» опасен:
 * пропущенные люди в реестре просто не появятся, и центр узнает об этом не сразу.
 */
export function ReadinessNotice({
  readiness
}: {
  readiness?: RegistryReadinessReport;
}): ReactElement | null {
  if (!readiness || readiness.ready) return null;

  return (
    <div className="ui-stack" data-testid="registry-readiness">
      <p>
        <strong>Выгрузка не сформирована.</strong> Незаполненные данные у{' '}
        {readiness.blockedLearners} чел. Файл не отправляется в реестр, пока список не пуст —
        неполная выгрузка означает, что этих людей в реестре не будет.
      </p>
      <ul>
        {readiness.learners.map((learner) => (
          <li key={learner.learnerId || learner.fullName}>
            <strong>{learner.fullName}</strong>
            <ul>
              {learner.problems.map((problem) => (
                <li key={`${learner.learnerId}-${problem.field}`}>{problem.message}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
