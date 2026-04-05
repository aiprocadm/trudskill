'use client';

import { useEffect, useState } from 'react';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';
import { PageContainer, PageHeader, SectionCard, SectionError, SectionEmpty } from '../../../src/components/state-wrappers';
import { useAuth } from '../../../src/features/auth/context';
import { tenantApi, type TenantCommissionDto } from '../../../src/lib/tenant/tenant-api';

export default function AcademyCommissionPage() {
  const { session } = useAuth();
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<TenantCommissionDto | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      try {
        const c = await tenantApi.commission(session);
        if (!cancelled) setData(c);
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
        <PageHeader title="Комиссия учебного центра" subtitle="GET /tenant/commission — состав, председатель, секретарь (п. 5.1, 5.15 ТЗ)" />
        <SectionCard title="Состав">
          {err ? <SectionError message={err} /> : null}
          {data && data.members.length === 0 ? <SectionEmpty message="Члены комиссии не заведены (режим БД)" /> : null}
          {data && data.members.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {data.members.map((m) => (
                <li key={m.id}>
                  <strong>{m.displayName}</strong>
                  {m.position ? ` — ${m.position}` : ''}
                  {m.id === data.chairMemberId ? ' (председатель)' : ''}
                  {m.id === data.secretaryMemberId ? ' (секретарь)' : ''}
                </li>
              ))}
            </ul>
          ) : null}
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
