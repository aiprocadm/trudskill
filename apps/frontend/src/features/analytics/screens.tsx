'use client';

import { AsyncSection, DataTable, FilterBar, StatGrid } from '@trudskill/ui';
import { useState } from 'react';

import { BarChart } from './charts';
import { formatDays, formatPercent } from './format';
import { useAnalyticsDashboard } from './hooks';
import { PageContainer, PageHeader, SectionCard } from '../../components/state-wrappers';

import type { AnalyticsFilterQuery } from './types';

export function AnalyticsDashboardScreen() {
  const [courseId, setCourseId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [clientId, setClientId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

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
        subtitle="Завершаемость, сдача экзаменов, средний срок и балл, drop-off — с фильтром по курсу, группе и компании"
      />
      <SectionCard title="Фильтр">
        <FilterBar>
          <label>
            Курс (id)
            <input
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              placeholder="course_id"
            />
          </label>
          <label>
            Группа (id)
            <input
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              placeholder="group_id"
            />
          </label>
          <label>
            Компания (id)
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="client_id"
            />
          </label>
          <label>
            С<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            По
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </FilterBar>
      </SectionCard>

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
                    label: 'Drop-off',
                    value: d.dropOffCount,
                    sub: `нет активности > ${d.dropOffThresholdDays} дн.`
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
