'use client';

import { useQuery } from '@tanstack/react-query';
import { LoadingState, StatusChip } from '@trudskill/ui';
import { useMemo, useState } from 'react';

import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../../src/components/state-wrappers';
import { useAuth } from '../../../src/features/auth/context';
import { apiRequest } from '../../../src/lib/api/client';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

interface EnrollmentRow {
  id: string;
  groupId: string;
  learnerId: string;
  status: string;
  plannedEndAt?: string;
  enrolledAt: string;
}

interface ListEnrollmentsResponse {
  items: EnrollmentRow[];
  total: number;
}

function startOfMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function endOfMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

function monthLabel(d: Date) {
  return d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function calendarGrid(month: Date) {
  const first = startOfMonth(month);
  const last = endOfMonth(month);
  const startWeekday = first.getUTCDay();
  const mondayOffset = (startWeekday + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setUTCDate(first.getUTCDate() - mondayOffset);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const c = new Date(gridStart);
    c.setUTCDate(gridStart.getUTCDate() + i);
    cells.push(c);
  }
  return { cells, first, last };
}

export default function LearningCalendarPage() {
  const { session } = useAuth();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));

  const goPrevMonth = () => {
    setCursor(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - 1, 1)));
  };
  const goNextMonth = () => {
    setCursor(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1)));
  };
  const goThisMonth = () => {
    setCursor(startOfMonth(new Date()));
  };

  const range = useMemo(() => {
    const { first, last } = calendarGrid(cursor);
    return {
      from: first.toISOString(),
      to: last.toISOString()
    };
  }, [cursor]);

  const enrollments = useQuery({
    queryKey: ['enrollments-calendar', session?.user.id, range.from, range.to],
    enabled: Boolean(session),
    queryFn: async () => {
      const params = new URLSearchParams({
        planned_end_from: range.from,
        planned_end_to: range.to,
        page_size: '500'
      });
      return apiRequest<ListEnrollmentsResponse>(`/enrollments?${params.toString()}`, {
        auth: {
          accessToken: session!.tokens.accessToken,
          tenantId: session!.user.tenantId,
          userId: session!.user.id
        }
      });
    }
  });

  const byDay = useMemo(() => {
    const map = new Map<string, EnrollmentRow[]>();
    for (const row of enrollments.data?.items ?? []) {
      if (!row.plannedEndAt) continue;
      const key = row.plannedEndAt.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return map;
  }, [enrollments.data?.items]);

  const { cells } = calendarGrid(cursor);

  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Календарь окончаний"
          subtitle="Зачисления по плановой дате завершения (planned_end_at)"
          actions={
            <div className="ui-inline">
              <button type="button" onClick={goPrevMonth}>
                Назад
              </button>
              <button type="button" onClick={goThisMonth}>
                Текущий месяц
              </button>
              <button type="button" onClick={goNextMonth}>
                Вперёд
              </button>
            </div>
          }
        />
        <SectionCard title={monthLabel(cursor)}>
          {enrollments.error ? (
            <SectionError
              message={
                enrollments.error instanceof Error
                  ? enrollments.error.message
                  : 'Не удалось загрузить зачисления'
              }
            />
          ) : null}
          {enrollments.isLoading ? <LoadingState message="Загрузка…" /> : null}
          {!enrollments.isLoading && enrollments.data && enrollments.data.total === 0 ? (
            <SectionEmpty message="Нет зачислений в выбранном диапазоне" />
          ) : null}
          {!enrollments.isLoading && enrollments.data && enrollments.data.total > 0 ? (
            <div className="calendar-grid">
              {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
                <div key={d} className="calendar-grid__dow">
                  {d}
                </div>
              ))}
              {cells.map((cell) => {
                const key = cell.toISOString().slice(0, 10);
                const inMonth = cell.getUTCMonth() === cursor.getUTCMonth();
                const rows = byDay.get(key) ?? [];
                return (
                  <div
                    key={key}
                    className={`calendar-grid__cell${inMonth ? '' : ' calendar-grid__cell--muted'}`}
                  >
                    <div className="calendar-grid__day">{cell.getUTCDate()}</div>
                    <ul className="calendar-grid__list">
                      {rows.map((row) => (
                        <li key={row.id}>
                          <StatusChip status={row.status} />
                          <span className="calendar-grid__id" title={row.id}>
                            {row.learnerId.slice(0, 8)}…
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : null}
        </SectionCard>
        <style jsx>{`
          .calendar-grid {
            display: grid;
            grid-template-columns: repeat(7, minmax(0, 1fr));
            gap: 4px;
            margin-top: 8px;
          }
          .calendar-grid__dow {
            font-size: 12px;
            font-weight: 600;
            text-align: center;
            color: var(--ui-text-muted);
          }
          .calendar-grid__cell {
            border: 1px solid var(--ui-border);
            border-radius: 6px;
            min-height: 88px;
            padding: 4px;
            background: var(--ui-surface);
          }
          .calendar-grid__cell--muted {
            opacity: 0.45;
          }
          .calendar-grid__day {
            font-weight: 600;
            font-size: 13px;
          }
          .calendar-grid__list {
            list-style: none;
            margin: 4px 0 0;
            padding: 0;
            font-size: 11px;
          }
          .calendar-grid__list li {
            display: flex;
            flex-direction: column;
            gap: 2px;
            margin-bottom: 4px;
          }
          .calendar-grid__id {
            word-break: break-all;
          }
        `}</style>
      </PageContainer>
    </ProtectedPage>
  );
}
