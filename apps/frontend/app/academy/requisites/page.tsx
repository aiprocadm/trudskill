'use client';

import { Button, Form, FormActions, FormField, SelectField } from '@trudskill/ui';
import { useEffect, useState } from 'react';

import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../../src/components/state-wrappers';
import { useAuth } from '../../../src/features/auth/context';
import {
  DEFAULT_TIMEZONE,
  RUSSIAN_TIMEZONES,
  SUPPORTED_LOCALES
} from '../../../src/features/tenant-settings/timezones';
import { hasPermission } from '../../../src/lib/rbac/permissions';
import { tenantApi } from '../../../src/lib/tenant/tenant-api';
import { pushGlobalSuccessToast } from '../../../src/lib/toast/global-handlers';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function AcademyRequisitesPage() {
  const { session } = useAuth();
  /*
   * Реквизиты подставляются в выдаваемые удостоверения и протоколы, поэтому правит их
   * только администрация центра (право заведено миграцией 0083). Экран при этом открыт
   * шире — по `tenant.read`, которое есть у всех ролей, включая слушателя: смотреть данные
   * своего центра можно, менять — нет. Форму без права не показываем совсем, чтобы человек
   * не заполнял поля и не упирался в отказ на кнопке.
   */
  const canEdit = hasPermission(session?.permissions ?? [], 'tenant.settings.write');
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
          // Пояс, сохранённый до появления выбора, может не совпасть ни с одним пунктом:
          // тогда показываем значение по умолчанию явно, а не первый пункт списка молча.
          const savedTimezone = settings.timezone ?? DEFAULT_TIMEZONE;
          setTimezone(
            RUSSIAN_TIMEZONES.some((zone) => zone.value === savedTimezone)
              ? savedTimezone
              : DEFAULT_TIMEZONE
          );
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
          subtitle="Название, юридические реквизиты, часовой пояс и язык интерфейса центра"
        />
        <SectionCard title="Реквизиты и настройки">
          {!session ? (
            <SectionEmpty
              message="Реквизиты видны после входа"
              hint="Данные центра подставляются в удостоверения и протоколы, поэтому доступны только вошедшему сотруднику."
            />
          ) : null}
          {err ? <SectionError message={err} /> : null}
          {session && !canEdit ? (
            <SectionEmpty
              message="У вас нет прав на изменение данных центра"
              hint="Реквизиты подставляются в удостоверения и протоколы, поэтому их правит только администрация учебного центра. Обратитесь к администратору."
            />
          ) : null}
          {session && canEdit ? (
            <Form
              onSubmit={(event) => {
                event.preventDefault();
                void onSave();
              }}
              style={{ maxWidth: 560 }}
            >
              <FormField
                label="Юридическое название"
                value={legalName}
                onChange={(event) => setLegalName(event.target.value)}
                required
              />
              <FormField
                label="ИНН"
                value={taxNumber}
                onChange={(event) => setTaxNumber(event.target.value)}
                required
              />
              <FormField
                label="Название академии (UI)"
                value={academyName}
                onChange={(event) => setAcademyName(event.target.value)}
              />
              {/*
                Выбор, а не свободный ввод (журнал 303): пояс печатался руками, опечатка
                сохранялась, а расчёт дат молча уходил на московский календарь. На экране —
                город, на сервер уходит зона: сырой код значением быть не должен.
              */}
              <SelectField
                label="Часовой пояс"
                hint="По нему считаются даты удостоверений и сроки обучения центра"
                value={timezone}
                options={RUSSIAN_TIMEZONES}
                onChange={(event) => setTimezone(event.target.value)}
              />
              {/* Языков пока один — поле показывает ровно то, что продукт умеет (журнал 304). */}
              <SelectField
                label="Язык интерфейса"
                hint="Других переводов пока нет"
                value={locale}
                options={SUPPORTED_LOCALES}
                onChange={(event) => setLocale(event.target.value)}
              />
              <FormActions>
                <Button variant="primary" type="submit" loading={saving}>
                  {/* TXT-003: занятость показывает сам компонент (loading), подпись неподвижна. */}
                  Сохранить изменения
                </Button>
              </FormActions>
            </Form>
          ) : null}
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
