'use client';

import { DataTable, LoadingState } from '@cdoprof/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../src/components/state-wrappers';
import { useAuth } from '../../src/features/auth/context';
import { mvpApi } from '../../src/features/mvp/api';
import { pushGlobalErrorToast } from '../../src/lib/toast/global-handlers';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

import type { Learner } from '../../src/features/mvp/types';

type LearnerRow = { code: string; fullName: string; status: string };

const toRows = (items: Learner[]): LearnerRow[] =>
  items.map((l) => ({
    code: l.learnerNo ?? l.id.slice(0, 8),
    fullName: `${l.lastName} ${l.firstName}`.trim(),
    status: l.status
  }));

export default function LearnersRegistryPage() {
  const { session } = useAuth();
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Learner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void (async () => {
      try {
        const res = await mvpApi.listLearners(session, {});
        if (!cancelled) setRows(res.items);
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : 'Ошибка загрузки';
          setErr(msg);
          pushGlobalErrorToast('Слушатели', msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Слушатели"
          subtitle="Реестр слушателей (п. 5.3, 5.9 ТЗ) — API /learners"
        />
        <SectionCard title="Список">
          {loading ? <LoadingState message="Загрузка списка слушателей…" /> : null}
          {err ? <SectionError message={err} /> : null}
          {!loading && !err && rows.length === 0 ? (
            <SectionEmpty
              message="Нет слушателей"
              hint="Проверьте право learners.read или добавьте слушателей в системе."
            />
          ) : null}
          {!loading && !err && rows.length > 0 ? (
            <div className="ui-table-wrap">
              <DataTable
                columns={[
                  { key: 'code', title: 'Код' },
                  { key: 'fullName', title: 'ФИО' },
                  { key: 'status', title: 'Статус' }
                ]}
                rows={toRows(rows)}
              />
              <div className="ui-stack" style={{ gap: 8, marginTop: 12 }}>
                {rows.map((learner) => (
                  <Link key={learner.id} href={`/learners/${learner.id}`}>
                    Открыть карточку {learner.learnerNo ?? learner.id.slice(0, 8)} —{' '}
                    {`${learner.lastName} ${learner.firstName}`.trim()}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
