import type { Learner } from '../mvp.types.js';

/**
 * Что портал заказчика показывает про сотрудника (ревизия 2026-08-26).
 *
 * Портал звал общий `listLearners` и отдавал карточку слушателя ЦЕЛИКОМ: вместе с ФИО и
 * почтой во внешнюю компанию уходили СНИЛС, дата рождения, телефон, должность и привязка к
 * учётной записи. Экран при этом показывает четыре колонки — фамилию, имя, почту и статус.
 *
 * Разница не косметическая. Портал — единственное место, где данные из системы учебного
 * центра уходят ЗА ЕГО ПРЕДЕЛЫ: к представителю компании-заказчика. Отдавать туда больше,
 * чем нужно для цели, — это нарушение принципа минимизации (152-ФЗ ст. 5 ч. 5), и заметить
 * такое можно только открыв инструменты разработчика: на экране лишнего не видно.
 *
 * Возражение «работодатель и так знает СНИЛС своих сотрудников» верно ровно наполовину:
 * в группу центр мог зачислить и человека, которого заказчик не передавал, — а порядок
 * обмена данными не должен зависеть от того, совпали ли списки.
 *
 * Общий `listLearners` не трогаем: персоналу центра СНИЛС нужен — по нему сверяют
 * удостоверения и собирают выгрузки в госреестры.
 */
export interface PortalLearnerView {
  id: string;
  tenantId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  lastName: string;
  firstName: string;
  middleName?: string;
  email?: string;
  /** Учётный номер: по нему заказчик сверяет своего сотрудника со своим же списком. */
  learnerNo?: string;
}

/** Оставляет только то, что нужно порталу. Всё остальное не уезжает за пределы центра. */
export const toPortalLearnerView = (learner: Learner): PortalLearnerView => ({
  id: learner.id,
  tenantId: learner.tenantId,
  status: learner.status,
  createdAt: learner.createdAt,
  updatedAt: learner.updatedAt,
  lastName: learner.lastName,
  firstName: learner.firstName,
  ...(learner.middleName ? { middleName: learner.middleName } : {}),
  ...(learner.email ? { email: learner.email } : {}),
  ...(learner.learnerNo ? { learnerNo: learner.learnerNo } : {})
});
