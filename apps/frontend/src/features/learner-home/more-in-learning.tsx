'use client';

import Link from 'next/link';

import { SectionCard } from '../../components/state-wrappers';
import { type PermissionLink, linksForPermissions } from '../../lib/rbac/visible-links';
import { useAuth } from '../auth/context';

/**
 * «Что ещё есть в обучении» — блок на главной кабинета слушателя (ТЗ 6.1 / С1).
 *
 * Зачем. ТЗ сводит меню слушателя к пяти пунктам и велит убрать «Задания», «Вебинары» и
 * «Календарь» внутрь «Обучения». Просто убрать их из меню значило бы сделать разделы
 * недостижимыми: других путей туда нет (журнал 491). Поэтому сначала появляется вход с
 * главной, и только потом пункты уходят из меню.
 *
 * Разделы показываются по правам: без права на задания ссылка не рисуется вовсе, а не ведёт
 * в отказ (Э2). У слушателя без вебинаров блок покажет только то, что ему доступно; если не
 * доступно ничего — блока нет.
 */

/** Подписи и адреса — те же, что были в меню: раздел не переименован (правило 3.4). */
const LINKS: PermissionLink[] = [
  {
    href: '/learner/assignments',
    label: 'Мои задания',
    hint: 'Практические работы: что сдать и что уже проверено.',
    permission: 'assessment.assignments.read'
  },
  {
    href: '/learner/webinars',
    label: 'Мои вебинары',
    hint: 'Занятия с преподавателем: расписание и записи.',
    permission: 'webinars.attend'
  },
  {
    href: '/learning/calendar',
    label: 'Календарь окончаний',
    hint: 'Когда заканчивается обучение и когда истекают документы.',
    permission: 'enrollments.read'
  }
];

export const MoreInLearning = () => {
  const { session } = useAuth();
  const links = linksForPermissions(LINKS, session?.permissions ?? []);
  if (links.length === 0) return null;

  return (
    <SectionCard title="Что ещё есть в обучении">
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
  );
};
