'use client';

import Link from 'next/link';

import { SETTINGS_LINK_SECTIONS, visibleSettingsSections } from './sections';
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
 * нужную настройку перебором. Стало: один экран с оглавлением наверху и якорями.
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
  const linkSections = visibleSettingsSections(session);

  return (
    <PageContainer>
      <PageHeader
        title="Настройки"
        subtitle="Параметры учебного центра, интеграции и ваш профиль — в одном месте."
      />

      <SectionCard title="Разделы настроек">
        <nav aria-label="Разделы настроек">
          <ul className="ui-settings-toc">
            {SETTINGS_LINK_SECTIONS.filter((section) =>
              linkSections.some((visible) => visible.id === section.id)
            ).map((section) => (
              <li key={section.id} className="ui-settings-toc__item">
                {section.href ? (
                  <Link href={section.href} className="ui-settings-toc__link">
                    <span className="ui-settings-toc__title">{section.title}</span>
                    <span className="ui-settings-toc__hint">{section.hint}</span>
                  </Link>
                ) : (
                  <a href={`#${section.id}`} className="ui-settings-toc__link">
                    <span className="ui-settings-toc__title">{section.title}</span>
                    <span className="ui-settings-toc__hint">{section.hint}</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </SectionCard>

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

      <div id="profile">
        <ProfileCard />
      </div>
      <SectionCard title="Безопасность">
        <TwoFactorCard />
      </SectionCard>
      <SectionCard title="Внешний вид">
        <ThemeAppearanceSettings />
      </SectionCard>
    </PageContainer>
  );
}
