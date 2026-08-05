'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { methodistHomeApi } from './api';
import {
  GlobalLoading,
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
import { useAuth } from '../auth/context';

/**
 * ФТ-H2 (Фаза 5 Task 2): дашборд методиста.
 *
 * **Порядок разделов = порядок срочности, а не удобство вёрстки.** Сначала просрочки
 * (уже больно), потом ближайшие дедлайны (будет больно), потом очередь проверки
 * (копится), и только затем пробелы в программах (важно, но не горит сегодня).
 *
 * Пустой раздел показывается ЯВНО («просрочек нет»), а не скрывается: исчезнувший
 * блок читается как «не загрузилось», и методист идёт проверять руками то, что и так
 * в порядке.
 */
export function MethodistHomeScreen() {
  const { session } = useAuth();

  const dashboard = useQuery({
    queryKey: ['methodist-dashboard', session?.user.id],
    enabled: Boolean(session),
    queryFn: async () => methodistHomeApi.loadDashboard(session!)
  });

  if (!session || dashboard.isLoading) {
    return <GlobalLoading message="Собираем сводку по обучению…" />;
  }

  // Ошибка проверяется по `error`, а не по `isError`: в проекте своя обёртка над
  // useQuery, и поля `isError` у неё нет.
  if (dashboard.error || !dashboard.data) {
    return (
      <PageContainer>
        <PageHeader title="Обучение: сводка" />
        <SectionError message="Не удалось загрузить сводку" />
      </PageContainer>
    );
  }

  const data = dashboard.data;
  // Скрытый раздел показывается как «нет доступа», а не исчезает: пропавший блок
  // читается как поломка, и человек идёт искать несуществующую проблему.
  const hidden = (key: string) => data.hiddenSections.includes(key);

  return (
    <PageContainer>
      <PageHeader
        title="Обучение: сводка"
        subtitle={
          hidden('schedule')
            ? 'Сроки и группы доступны сотрудникам с правом на зачисления'
            : `Групп в работе: ${data.totals.activeGroups} · слушателей: ${data.totals.activeLearners}`
        }
      />

      <SectionCard title={`Просрочено (${data.overdueGroups.length})`}>
        {hidden('schedule') ? (
          <SectionEmpty message="Нет доступа к срокам обучения" />
        ) : data.overdueGroups.length === 0 ? (
          <SectionEmpty message="Просрочек нет" />
        ) : (
          <ul className="ui-stack">
            {data.overdueGroups.map((item) => (
              <li key={item.groupId}>
                <Link href={`/groups/${item.groupId}`}>{item.groupName}</Link> — срок вышел{' '}
                {item.daysOverdue} дн. назад, людей: {item.learnersCount}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title={`Ближайшие сроки, ${data.horizonDays} дн. (${data.upcomingDeadlines.length})`}
      >
        {hidden('schedule') ? (
          <SectionEmpty message="Нет доступа к срокам обучения" />
        ) : data.upcomingDeadlines.length === 0 ? (
          <SectionEmpty message="В ближайшие две недели сроков нет" />
        ) : (
          <ul className="ui-stack">
            {data.upcomingDeadlines.map((item) => (
              <li key={item.groupId}>
                <Link href={`/groups/${item.groupId}`}>{item.groupName}</Link> — осталось{' '}
                {item.daysLeft} дн., людей: {item.learnersCount}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title={`Ждут проверки (${data.reviewQueue?.total ?? 0})`}>
        {!data.reviewQueue ? (
          <SectionEmpty message="Проверка работ не входит в ваши задачи" />
        ) : data.reviewQueue.total === 0 ? (
          <SectionEmpty message="Непроверенных работ нет" />
        ) : (
          <p className="ui-prose-muted">
            Экзаменационных попыток: {data.reviewQueue.pendingAttempts}, практических работ:{' '}
            {data.reviewQueue.pendingSubmissions}.{' '}
            <Link href="/teacher/review">Перейти к проверке</Link>
          </p>
        )}
      </SectionCard>

      <SectionCard title={`Программы без итогового экзамена (${data.coursesWithoutExam.length})`}>
        {data.coursesWithoutExam.length === 0 ? (
          <SectionEmpty message="У всех программ в группах есть опубликованный экзамен" />
        ) : (
          <>
            <p className="ui-hint">
              Слушатели дойдут до конца программы и упрутся: итоговый тест не опубликован.
            </p>
            <ul className="ui-stack">
              {data.coursesWithoutExam.map((item) => (
                <li key={`${item.groupId ?? 'all'}:${item.courseId}`}>
                  {/* Название группы приходит только тем, кому разрешено видеть состав
                      обучения; остальным показывается сама программа. */}
                  {item.groupName ? `${item.groupName} — ` : ''}
                  <Link href={`/courses/${item.courseId}`}>{item.courseTitle}</Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </SectionCard>
    </PageContainer>
  );
}
