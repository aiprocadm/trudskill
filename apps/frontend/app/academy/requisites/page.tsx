'use client';

import { useEffect, useState } from 'react';

import { PageContainer, PageHeader, SectionCard, SectionError } from '../../../src/components/state-wrappers';
import { useAuth } from '../../../src/features/auth/context';
import { tenantApi } from '../../../src/lib/tenant/tenant-api';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function AcademyRequisitesPage() {
  const { session } = useAuth();
  const [err, setErr] = useState<string | null>(null);
  const [json, setJson] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      try {
        const [me, settings, requisites] = await Promise.all([
          tenantApi.me(session),
          tenantApi.settings(session),
          tenantApi.requisites(session)
        ]);
        if (!cancelled) setJson({ tenant: me, settings, requisites });
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
        <PageHeader title="Данные учебного заведения" subtitle="Чтение из API tenant/me, tenant/settings, tenant/requisites" />
        <SectionCard title="Состояние">
          {!session ? <p>Нет сессии</p> : null}
          {err ? <SectionError message={err} /> : null}
          {json ? (
            <pre style={{ margin: 0, overflow: 'auto', fontSize: 13, background: '#fafafa', padding: 12, borderRadius: 8 }}>
              {JSON.stringify(json, null, 2)}
            </pre>
          ) : null}
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
