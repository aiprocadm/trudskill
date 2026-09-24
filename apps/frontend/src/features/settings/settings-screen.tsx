'use client';

import { SettingsLayout, TabPanel, isEmbeddedSection } from '@trudskill/ui';
import Link from 'next/link';
import { useEffect } from 'react';

import { LearnerFieldsSettingsSection } from './learner-fields-section';
import { visibleSettingsSections } from './sections';
import { ProfileCard } from '../../components/profile-card';
import { PageContainer, PageHeader, SectionCard } from '../../components/state-wrappers';
import { ThemeAppearanceSettings } from '../../components/theme-appearance-settings';
import { useAuth } from '../auth/context';
import { TwoFactorCard } from '../auth/two-factor-card';
import { BrandingSettingsSection } from '../branding/branding-section';
import { useTabParam } from '../navigation/use-tab-param';
import { NotificationRecipientsSection } from '../notification-recipients/screens';
import { PaymentProviderSettingsSection } from '../payments/settings-screen';
import { SmsProviderSettingsSection } from '../sms/settings-section';
import { VideoProviderSettingsSection } from '../video-upload/provider-settings-section';
import { WebinarProviderSettingsSection } from '../webinars/screens';

/*
 * IA-018: единый вход в настройки центра.
 *
 * Было: блок «Настройки и система» на 14 пунктов меню — при бюджете ≤7 человек искал
 * нужную настройку перебором. Стало: один экран с оглавлением и вкладками.
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
 * только три коротких блока настройки провайдеров — их адреса стали редиректами на вкладки.
 * Иначе получился бы второй монолит вроде mvp/screens.tsx.
 *
 * ТЗ 5.7 (Э7): оглавление разделено на две группы — «Настроить здесь» (кнопки, меняют
 * содержимое справа) и «Открыть отдельный раздел» (ссылки, уводят на свою страницу). Раньше
 * по виду они не отличались, и предсказать результат клика было нельзя.
 *
 * Права разделов берутся из карты навигации (`navigationModel`), а не выписываются здесь
 * заново: дублировать список прав — верный способ разойтись с ним при первой же правке.
 */
export function SettingsScreen() {
  const { session } = useAuth();
  const sections = visibleSettingsSections(session);
  const embeddedIds = sections.filter(isEmbeddedSection).map((section) => section.id);

  /*
   * ТЗ 5.7 (Э7): открытый раздел живёт в адресе (`?tab=`), а не в якоре. Якорь прокручивал
   * ленту, поэтому ленту и приходилось держать целиком: шестнадцать разделов подряд, и
   * человек не понимал, где кончается один и начинается другой (журнал 461).
   */
  const [activeId, setActiveId] = useTabParam(embeddedIds, embeddedIds[0] ?? '');

  /*
   * Старые ссылки с якорем продолжают работать. Три адреса уже редиректят сюда
   * (`/admin/payments/settings` → `/settings`), и такие ссылки давно разошлись по перепискам:
   * решение владельца Р2 требует, чтобы смена адреса не оставляла человека ни с чем.
   */
  useEffect(() => {
    const fromHash = window.location.hash.replace('#', '');
    if (fromHash && embeddedIds.includes(fromHash)) setActiveId(fromHash);
    /*
     * Пустой список зависимостей намеренно: якорь читается ОДИН раз, при заходе по старой
     * ссылке. Дальше вкладку ведёт адрес, и повтор этого действия перебивал бы выбор
     * человека каждый раз, когда он переключает вкладку.
     */
  }, []);

  return (
    <PageContainer>
      <PageHeader
        title="Настройки"
        subtitle="Параметры учебного центра, интеграции и ваш профиль — в одном месте."
      />

      <SettingsLayout sections={sections} activeId={activeId} onSelect={setActiveId} link={Link}>
        {/* Открыт ровно один раздел: остальные не рисуются вовсе, а не прячутся стилем. */}
        {/* МГ-C1.3: секция сама скрывается без права tenant.settings.write. */}
        <TabPanel id="learner-fields" activeId={activeId}>
          <LearnerFieldsSettingsSection />
        </TabPanel>
        <TabPanel id="payments" activeId={activeId}>
          <PaymentProviderSettingsSection />
        </TabPanel>
        <TabPanel id="notifications" activeId={activeId}>
          <NotificationRecipientsSection />
        </TabPanel>
        <TabPanel id="webinars" activeId={activeId}>
          <WebinarProviderSettingsSection />
        </TabPanel>

        {/* Обе секции сами скрываются без прав sms.configure / video.configure (журнал 309). */}
        <TabPanel id="sms" activeId={activeId}>
          <SmsProviderSettingsSection />
        </TabPanel>
        <TabPanel id="video" activeId={activeId}>
          <VideoProviderSettingsSection />
        </TabPanel>

        {/* ФТ-D3.1: секция сама скрывается без права tenant.branding.configure */}
        <TabPanel id="branding" activeId={activeId}>
          <BrandingSettingsSection />
        </TabPanel>

        {/*
         * Вход и тема стоят ВНУТРИ раздела профиля: оглавление обещает «Ваши данные, вход и
         * тема», а раздел, приводящий только к данным, это обещание нарушал.
         */}
        <TabPanel id="profile" activeId={activeId}>
          <ProfileCard />
          <SectionCard title="Безопасность">
            <TwoFactorCard />
          </SectionCard>
          <SectionCard title="Внешний вид">
            <ThemeAppearanceSettings />
          </SectionCard>
        </TabPanel>
      </SettingsLayout>
    </PageContainer>
  );
}
