'use client';

import { useEffect, useState } from 'react';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';
import { PageContainer, PageHeader, SectionCard, SectionEmpty, SectionError } from '../../src/components/state-wrappers';
import { useAuth } from '../../src/features/auth/context';
import { mvpApi } from '../../src/features/mvp/api';
import type { Learner } from '../../src/features/mvp/types';

export default function LearnersRegistryPage() {
  const { session } = useAuth();
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<Learner[]>([]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await mvpApi.listLearners(session, {});
        if (!cancelled) setRows(res.items);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Ошибка загрузки');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader title="Слушатели" subtitle="Реестр слушателей (п. 5.3, 5.9 ТЗ) — API /learners" />
        <SectionCard title="Список">
          {err ? <SectionError message={err} /> : null}
          {rows.length === 0 && !err ? <SectionEmpty message="Нет слушателей или нет прав learners.read" /> : null}
          {rows.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #e4e4e7' }}>
                  <th style={{ padding: '8px 4px' }}>Код</th>
                  <th style={{ padding: '8px 4px' }}>ФИО</th>
                  <th style={{ padding: '8px 4px' }}>Статус</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id} style={{ borderBottom: '1px solid #f4f4f5' }}>
                    <td style={{ padding: '8px 4px' }}>{l.learnerNo ?? l.id.slice(0, 8)}</td>
                    <td style={{ padding: '8px 4px' }}>
                      {l.lastName} {l.firstName}
                    </td>
                    <td style={{ padding: '8px 4px' }}>{l.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
