'use client';

import { DataTable, LoadingState } from '@trudskill/ui';
import Link from 'next/link';

import { readinessSummary, useIssueReadiness } from './issue-readiness';
import { SectionCard, SectionError } from '../../components/state-wrappers';

import type { ReactNode } from 'react';

/**
 * «Что мешает выпустить документы» (МГ-F5.1, срез 20.1).
 *
 * Раньше человек узнавал о проблеме, нажав «Закрыть группу» и получив отказ; а текст отказа
 * «экзамен не готов» отправлял его «в карточку группы, там перечислено» — где ничего перечислено
 * не было (журнал 659). Теперь карточка сама показывает все три уровня: центр, группа, слушатели
 * поимённо — с тем, что исправить.
 */
export function IssueReadinessSection({
  groupId,
  children
}: {
  groupId: string;
  /** МГ-F5.1 (срез 20.2): «Образец документа» — рядом с тем, что мешает выпуску. */
  children?: ReactNode;
}) {
  const query = useIssueReadiness(groupId);
  const report = query.data;

  return (
    <SectionCard title="Что мешает выпустить документы">
      {query.isLoading ? <LoadingState message="Проверяем готовность к выпуску…" /> : null}
      {query.error ? <SectionError error={query.error} /> : null}
      {report ? (
        <div className="ui-stack">
          <p role="status">{readinessSummary(report)}</p>
          {report.center.length > 0 ? (
            <div className="ui-stack">
              <strong>Настройки центра</strong>
              <ul>
                {report.center.map((item) => (
                  <li key={item.code}>{item.message}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {report.group.length > 0 ? (
            <div className="ui-stack">
              <strong>Группа и программа</strong>
              <ul>
                {report.group.map((item) => (
                  <li key={`${item.code}:${item.message}`}>{item.message}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {report.learners.length > 0 ? (
            <DataTable
              columns={[
                {
                  key: 'learnerName',
                  title: 'Слушатель',
                  render: (row) => (
                    <Link className="ui-link" href={`/learners/${row.learnerId}`}>
                      {row.learnerName}
                    </Link>
                  )
                },
                {
                  key: 'issuesView',
                  title: 'Что исправить'
                }
              ]}
              rows={report.learners.map((row) => ({
                ...row,
                issuesView: row.issues.map((issue) => issue.message).join('; ')
              }))}
            />
          ) : null}
          {report.consentRequired ? null : (
            <p className="ui-hint">
              Согласие на обработку персональных данных перед выпуском не проверяется — так настроен
              центр.
            </p>
          )}
        </div>
      ) : null}
      {children}
    </SectionCard>
  );
}
