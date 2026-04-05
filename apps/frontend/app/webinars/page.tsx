'use client';

import { useEffect, useState } from 'react';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';
import { PageContainer, PageHeader, SectionCard, SectionEmpty, SectionError } from '../../src/components/state-wrappers';
import { useAuth } from '../../src/features/auth/context';
import { webinarsApi, type WebinarDto } from '../../src/lib/communication/webinars-api';

export default function WebinarsPage() {
  const { session } = useAuth();
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<WebinarDto[]>([]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await webinarsApi.list(session);
        if (!cancelled) setRows(list);
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
        <PageHeader title="Вебинары" subtitle="П. 5.17 ТЗ — создание, участники, приглашения (база: GET /webinars)" />
        <SectionCard title="Список">
          {err ? <SectionError message={err} /> : null}
          {rows.length === 0 && !err ? <SectionEmpty message="Вебинаров пока нет. Создание через POST /webinars." /> : null}
          {rows.map((w) => (
            <div key={w.id} style={{ padding: '10px 0', borderBottom: '1px solid #f4f4f5' }}>
              <strong>{w.title}</strong>
              <div style={{ fontSize: 13, color: '#52525b' }}>
                {w.status} · {new Date(w.plannedStartAt).toLocaleString('ru-RU')} — {new Date(w.plannedEndAt).toLocaleString('ru-RU')}
              </div>
            </div>
          ))}
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
