'use client';

import { AsyncSection, DataTable, FilterBar, StatGrid } from '@trudskill/ui';
import { useState } from 'react';

import { BarChart } from './charts';
import { formatDays, formatPercent } from './format';
import { useAnalyticsDashboard } from './hooks';
import { PageContainer, PageHeader, SectionCard } from '../../components/state-wrappers';
import { CourseSelect } from '../courses/course-picker';
import { useCounterpartiesList, useGroupsList } from '../mvp/hooks';

import type { AnalyticsFilterQuery } from './types';

export function AnalyticsDashboardScreen() {
  const [courseId, setCourseId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [clientId, setClientId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const groups = useGroupsList({ page: 1, page_size: 100 });
  const counterparties = useCounterpartiesList({ page: 1, page_size: 100 });

  const query: AnalyticsFilterQuery = {
    ...(courseId.trim() ? { course_id: courseId.trim() } : {}),
    ...(groupId.trim() ? { group_id: groupId.trim() } : {}),
    ...(clientId.trim() ? { client_id: clientId.trim() } : {}),
    ...(from ? { enrolled_from: from } : {}),
    ...(to ? { enrolled_to: to } : {})
  };
  const dash = useAnalyticsDashboard(query);
  const d = dash.data;

  return (
    <PageContainer>
      <PageHeader
        title="Аналитика обучения"
        subtitle="Завершаемость, сдача экзаменов, средний срок и балл — с отбором по курсу, группе и заказчику"
      />
      <FilterBar
        activeCount={[courseId, groupId, clientId, from, to].filter(Boolean).length}
        onReset={() => {
          setCourseId('');
          setGroupId('');
          setClientId('');
          setFrom('');
          setTo('');
        }}
        primary={
          <>
            {/* Было три поля с подсказками course_id / group_id / client_id: администратор
                должен был откуда-то взять идентификаторы и вставить их руками. */}
            <CourseSelect value={courseId} onChange={setCourseId} label="Курс" />
            <label className="ui-field">
              <span className="ui-field-label">Учебная группа</span>
              <select
                className="ui-select"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
              >
                <option value="">Все группы</option>
                {(groups.data?.items ?? []).map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name} ({group.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="ui-field">
              <span className="ui-field-label">Заказчик</span>
              <select
                className="ui-select"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                <option value="">Все заказчики</option>
                {(counterparties.data?.items ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        }
        secondary={
          <>
            <label className="ui-field">
              <span className="ui-field-label">Зачислены с</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="ui-field">
              <span className="ui-field-label">по</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </>
        }
      />

      <AsyncSection
        isLoading={dash.loading}
        {...(dash.error ? { error: new Error(dash.error) } : {})}
        onRetry={() => void dash.refetch()}
      >
        {d ? (
          <>
            <SectionCard title="Ключевые показатели">
              <StatGrid
                items={[
                  {
                    label: 'Зачислений',
                    value: d.enrollmentsTotal,
                    sub: `завершено ${d.enrollmentsCompleted}`
                  },
                  { label: 'Завершаемость', value: formatPercent(d.completionRate) },
                  {
                    label: 'Сдача экзаменов',
                    value: formatPercent(d.examPassRate),
                    sub: `${d.examResultsPassed}/${d.examResultsTotal}`
                  },
                  {
                    label: 'Средний срок прохождения',
                    value: formatDays(d.averageCompletionDays)
                  },
                  { label: 'Средний балл', value: formatPercent(d.averageScorePercent) },
                  {
                    label: 'Забросили обучение',
                    value: d.dropOffCount,
                    sub: `нет активности больше ${d.dropOffThresholdDays} дн.`
                  }
                ]}
              />
            </SectionCard>

            <SectionCard title="Завершаемость по курсам">
              <BarChart
                ariaLabel="Завершённые зачисления по курсам"
                data={d.byCourse.map((r) => ({ label: r.label, value: r.enrollmentsCompleted }))}
              />
            </SectionCard>

            <SectionCard title="С какой попытки сдают экзамен">
              <BarChart
                ariaLabel="Распределение попыток до сдачи"
                data={[
                  { label: 'С 1-й попытки', value: d.attemptDistribution.passedFirstAttempt },
                  { label: 'Со 2-й попытки', value: d.attemptDistribution.passedSecondAttempt },
                  { label: '3+ попытки', value: d.attemptDistribution.passedThirdPlusAttempt }
                ]}
              />
            </SectionCard>

            <SectionCard title="Разбивка по курсам">
              <DataTable
                columns={[
                  { key: 'label', title: 'Курс' },
                  { key: 'enrollmentsTotal', title: 'Зачислений' },
                  { key: 'enrollmentsCompleted', title: 'Завершено' },
                  { key: 'completionRateText', title: 'Завершаемость' },
                  { key: 'examPassRateText', title: 'Сдача' },
                  { key: 'avgScoreText', title: 'Средний балл' }
                ]}
                rows={d.byCourse.map((r) => ({
                  ...r,
                  completionRateText: formatPercent(r.completionRate),
                  examPassRateText: formatPercent(r.examPassRate),
                  avgScoreText: formatPercent(r.averageScorePercent)
                }))}
              />
            </SectionCard>

            <SectionCard title="Разбивка по группам">
              <DataTable
                columns={[
                  { key: 'label', title: 'Группа' },
                  { key: 'enrollmentsTotal', title: 'Зачислений' },
                  { key: 'enrollmentsCompleted', title: 'Завершено' },
                  { key: 'completionRateText', title: 'Завершаемость' },
                  { key: 'examPassRateText', title: 'Сдача' },
                  { key: 'avgScoreText', title: 'Средний балл' }
                ]}
                rows={d.byGroup.map((r) => ({
                  ...r,
                  completionRateText: formatPercent(r.completionRate),
                  examPassRateText: formatPercent(r.examPassRate),
                  avgScoreText: formatPercent(r.averageScorePercent)
                }))}
              />
            </SectionCard>
          </>
        ) : null}
      </AsyncSection>
    </PageContainer>
  );
}
