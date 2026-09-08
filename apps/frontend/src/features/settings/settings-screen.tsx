'use client';

import { SettingsLayout } from '@trudskill/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { visibleSettingsSections } from './sections';
import { ProfileCard } from '../../components/profile-card';
import { PageContainer, PageHeader, SectionCard } from '../../components/state-wrappers';
import { ThemeAppearanceSettings } from '../../components/theme-appearance-settings';
import { useAuth } from '../auth/context';
import { TwoFactorCard } from '../auth/two-factor-card';
import { BrandingSettingsSection } from '../branding/branding-section';
import { NotificationRecipientsSection } from '../notification-recipients/screens';
import { PaymentProviderSettingsSection } from '../payments/settings-screen';
import { SmsProviderSettingsSection } from '../sms/settings-section';
import { VideoProviderSettingsSection } from '../video-upload/provider-settings-section';
import { WebinarProviderSettingsSection } from '../webinars/screens';

/*
 * IA-018: единый вход в настройки центра.
 *
 * Было: блок «Настройки и система» на 14 пунктов меню — при бюджете ≤7 человек искал
 * нужную настройку перебором. Стало: один экран с оглавлением и якорями.
 *
 * `TPL-005` (§7.5): оглавление стоит КОЛОНКОЙ СЛЕВА, а не карточкой сверху. Разделов
 * шестнадцать; карточкой сверху они уезжали за край экрана, и дальше человек искал нужный
 * прокруткой — тем самым перебором, от которого ушли. Верхний ряд ТЗ разрешает, но только
 * начиная с 1024px, а на телефоне оглавление становится выпадающим списком; всё три
 * состояния — в компоненте `SettingsLayout`.
 *
 * ⚠️ Экраны настроек НЕ слиты в один файл (ТЗ §4.7): крупные разделы (лицензии,
 * потребление, эксплуатация, интеграции, журнал обмена, телефония, реквизиты центра,
 * пользователи) остаются своими маршрутами и попадают сюда ссылками. Внутрь встроены
 * только три коротких блока настройки провайдеров — их адреса стали редиректами на якоря.
 * Иначе получился бы второй монолит вроде mvp/screens.tsx.
 *
 * Права разделов берутся из карты навигации (`navigationModel`), а не выписываются здесь
 * заново: дублировать список прав — верный способ разойтись с ним при первой же правке.
 */
export function SettingsScreen() {
  const { session } = useAuth();
  const sections = visibleSettingsSections(session);
  const [activeId, setActiveId] = useState('');

  /*
   * Открытый раздел берётся из адреса: на него ведут и оглавление, и редиректы старых
   * адресов (`/admin/payments/settings` → `/settings#payments`). Отметка нужна не для
   * красоты — в колонке из шестнадцати строк без неё не видно, где ты стоишь.
   */
  useEffect(() => {
    const sync = () => setActiveId(window.location.hash.replace('#', ''));
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  return (
    <PageContainer>
      <PageHeader
        title="Настройки"
        subtitle="Параметры учебного центра, интеграции и ваш профиль — в одном месте."
      />

      <SettingsLayout sections={sections} activeId={activeId} link={Link}>
        {/* Якоря совпадают с идентификаторами разделов: на них ведут редиректы старых адресов. */}
        <div id="payments">
          <PaymentProviderSettingsSection />
        </div>
        <div id="notifications">
          <NotificationRecipientsSection />
        </div>
        <div id="webinars">
          <WebinarProviderSettingsSection />
        </div>

        {/* Обе секции сами скрываются без прав sms.configure / video.configure (журнал 309). */}
        <div id="sms">
          <SmsProviderSettingsSection />
        </div>
        <div id="video">
          <VideoProviderSettingsSection />
        </div>

        {/* ФТ-D3.1: секция сама скрывается без права tenant.branding.configure */}
        <div id="branding">
          <BrandingSettingsSection />
        </div>

        {/*
         * Вход и тема стоят ВНУТРИ якоря профиля: оглавление обещает «Ваши данные, вход и
         * тема», а прыжок на `#profile` приводил только к данным — остальное надо было
         * искать прокруткой ниже.
         */}
        <div id="profile">
          <ProfileCard />
          <SectionCard title="Безопасность">
            <TwoFactorCard />
          </SectionCard>
          <SectionCard title="Внешний вид">
            <ThemeAppearanceSettings />
          </SectionCard>
        </div>
      </SettingsLayout>
    </PageContainer>
  );
}
