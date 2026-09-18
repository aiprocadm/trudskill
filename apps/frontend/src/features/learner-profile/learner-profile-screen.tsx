'use client';

import Link from 'next/link';

import { ProfileCard } from '../../components/profile-card';
import { PageContainer, PageHeader, SectionCard } from '../../components/state-wrappers';
import { ThemeAppearanceSettings } from '../../components/theme-appearance-settings';
import { type PermissionLink, linksForPermissions } from '../../lib/rbac/visible-links';
import { useAuth } from '../auth/context';
import { TwoFactorCard } from '../auth/two-factor-card';

/**
 * Профиль слушателя — пятый раздел его меню (ТЗ 5 «Стабилизация, UX и развитие», 6.1 / С1).
 *
 * Зачем он появился. У слушателя было двенадцать пунктов меню: семь сверху и пять под «Ещё».
 * ТЗ сводит их к пяти, и два раздела — «Подтверждение личности» и «Мои оплаты» — по прямому
 * указанию уходят «в профиль» (журнал 490). Профиля у слушателя не было вовсе: общий экран
 * настроек живёт под правом `iam.manage_roles`, которого у него нет.
 *
 * Здесь собрано то, что человек меняет про СЕБЯ: свои данные, вход и внешний вид, — плюс два
 * раздела, которые касаются только его. Разделы показываются по правам: без права на оплату
 * ссылка на оплаты не рисуется, а не отвечает отказом (Э2).
 */

/**
 * Разделы, переехавшие в профиль из меню. Подписи и адреса — те же, что были: раздел не
 * переименован и не перенесён, он просто открывается отсюда (правило «одно имя — одно место»).
 */
const PROFILE_LINKS: PermissionLink[] = [
  {
    href: '/learner/identity',
    label: 'Подтверждение личности',
    hint: 'Селфи и фото паспорта — нужны, чтобы центр выдал документы на ваше имя.',
    permission: 'identity.submit'
  },
  {
    href: '/learner/payments',
    label: 'Мои оплаты',
    hint: 'История ваших заказов и платежей.',
    permission: 'payments.self_purchase'
  }
];

export const LearnerProfileScreen = () => {
  const { session } = useAuth();
  const links = linksForPermissions(PROFILE_LINKS, session?.permissions ?? []);

  return (
    <PageContainer>
      <PageHeader
        title="Профиль"
        subtitle="Ваши данные, вход и разделы, которые касаются только вас"
      />

      <ProfileCard />

      <SectionCard title="Безопасность">
        <TwoFactorCard />
      </SectionCard>

      <SectionCard title="Внешний вид">
        <ThemeAppearanceSettings />
      </SectionCard>

      {links.length > 0 ? (
        <SectionCard title="Ваши разделы">
          <ul className="ui-bare-list ui-stack">
            {links.map((item) => (
              <li key={item.href}>
                <Link className="ui-link" href={item.href}>
                  {item.label}
                </Link>
                <p className="ui-hint">{item.hint}</p>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}
    </PageContainer>
  );
};
