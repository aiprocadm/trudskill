'use client';

import { useEffect, useState } from 'react';

import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../../src/components/state-wrappers';
import { useAuth } from '../../../src/features/auth/context';
import { tenantApi } from '../../../src/lib/tenant/tenant-api';
import { pushGlobalSuccessToast } from '../../../src/lib/toast/global-handlers';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function AcademyRequisitesPage() {
  const { session } = useAuth();
  const [err, setErr] = useState<string | null>(null);
  const [legalName, setLegalName] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [academyName, setAcademyName] = useState('');
  const [timezone, setTimezone] = useState('Europe/Moscow');
  const [locale, setLocale] = useState('ru-RU');
  const [saving, setSaving] = useState(false);

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
        if (!cancelled) {
          setLegalName(requisites.legalName ?? '');
          setTaxNumber(requisites.taxNumber ?? '');
          setAcademyName(String(settings.payload?.academyName ?? me.name ?? ''));
          setTimezone(settings.timezone ?? 'Europe/Moscow');
          setLocale(settings.locale ?? 'ru-RU');
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Ошибка загрузки');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const onSave = async () => {
    if (!session) return;
    if (legalName.trim().length < 3) {
      setErr('Введите корректное юридическое название (минимум 3 символа).');
      return;
    }
    if (taxNumber.trim().length < 10) {
      setErr('ИНН должен содержать минимум 10 символов.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await Promise.all([
        tenantApi.updateRequisites(session, {
          legalName: legalName.trim(),
          taxNumber: taxNumber.trim(),
          payload: { academyName: academyName.trim() }
        }),
        tenantApi.updateSettings(session, {
          locale,
          timezone,
          payload: { academyName: academyName.trim() }
        })
      ]);
      pushGlobalSuccessToast('Реквизиты', 'Данные учебного центра сохранены');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Данные учебного заведения"
          subtitle="Чтение из API tenant/me, tenant/settings, tenant/requisites"
        />
        <SectionCard title="Реквизиты и настройки">
          {!session ? <SectionEmpty message="Нет активной сессии" /> : null}
          {err ? <SectionError message={err} /> : null}
          {session ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void onSave();
              }}
              className="ui-form"
              style={{ maxWidth: 560 }}
            >
              <label>
                Юридическое название
                <input
                  value={legalName}
                  onChange={(event) => setLegalName(event.target.value)}
                  required
                />
              </label>
              <label>
                ИНН
                <input
                  value={taxNumber}
                  onChange={(event) => setTaxNumber(event.target.value)}
                  required
                />
              </label>
              <label>
                Название академии (UI)
                <input
                  value={academyName}
                  onChange={(event) => setAcademyName(event.target.value)}
                />
              </label>
              <label>
                Часовой пояс
                <input value={timezone} onChange={(event) => setTimezone(event.target.value)} />
              </label>
              <label>
                Локаль
                <input value={locale} onChange={(event) => setLocale(event.target.value)} />
              </label>
              <button type="submit" className="ui-button ui-button--primary" disabled={saving}>
                {saving ? 'Сохранение...' : 'Сохранить изменения'}
              </button>
            </form>
          ) : null}
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
