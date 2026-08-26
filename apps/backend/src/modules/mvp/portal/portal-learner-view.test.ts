import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { toPortalLearnerView } from './portal-learner-view.js';

import type { Learner } from '../mvp.types.js';

/**
 * Портал заказчика — единственное место, где данные из системы учебного центра уходят
 * ЗА ЕГО ПРЕДЕЛЫ. Проверяется ровно это: наружу едет то, что показывает экран, и ничего
 * сверх.
 */

const learner = {
  id: 'lrn_1',
  tenantId: 't1',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  lastName: 'Иванов',
  firstName: 'Иван',
  middleName: 'Иванович',
  email: 'ivanov@example.com',
  learnerNo: 'УЧ-42',
  snils: '123-456-789 00',
  dateOfBirth: '1985-03-17',
  phone: '+7 999 123-45-67',
  position: 'Электромонтёр',
  organizationUnitId: 'Цех №3',
  linkedIamUserId: 'usr_9'
} as unknown as Learner;

/** Всё, что не должно уезжать во внешнюю компанию. */
const FORBIDDEN = [
  'snils',
  'dateOfBirth',
  'phone',
  'position',
  'organizationUnitId',
  'linkedIamUserId'
];

describe('портал отдаёт только то, что показывает экран', () => {
  const view = toPortalLearnerView(learner);

  it('фамилия, имя, отчество и почта остаются — по ним заказчик узнаёт сотрудника', () => {
    expect(view).toMatchObject({
      lastName: 'Иванов',
      firstName: 'Иван',
      middleName: 'Иванович',
      email: 'ivanov@example.com'
    });
  });

  it('учётный номер остаётся — по нему заказчик сверяет со своим списком', () => {
    expect(view.learnerNo).toBe('УЧ-42');
  });

  for (const field of FORBIDDEN) {
    it(`${field} не уезжает во внешнюю компанию`, () => {
      expect(Object.keys(view)).not.toContain(field);
    });
  }

  it('необязательные поля не превращаются в undefined-ключи', () => {
    const bare = toPortalLearnerView({
      id: 'lrn_2',
      tenantId: 't1',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      lastName: 'Петрова',
      firstName: 'Мария'
    } as unknown as Learner);
    expect(Object.keys(bare)).not.toContain('email');
    expect(Object.keys(bare)).not.toContain('middleName');
  });
});

describe('ручка портала не возвращает карточку целиком', () => {
  /*
   * Сторож на регресс: сегодня урезание стоит в контроллере. Если завтра его уберут или
   * заведут новую ручку `portal/learners`, наружу снова поедет СНИЛС — и заметить это
   * можно будет только в инструментах разработчика.
   */
  const HERE = dirname(fileURLToPath(import.meta.url));
  const controller = readFileSync(resolve(HERE, '..', 'mvp.controller.ts'), 'utf8');

  it('обработчик списка сотрудников портала урезает ответ', () => {
    const handler = controller.slice(
      controller.indexOf('listPortalLearners('),
      controller.indexOf('@Get(', controller.indexOf('listPortalLearners('))
    );
    expect(
      handler.includes('toPortalLearnerView'),
      'портал снова отдаёт карточку слушателя целиком — со СНИЛСом и датой рождения'
    ).toBe(true);
  });
});
