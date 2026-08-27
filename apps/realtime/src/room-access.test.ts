import { describe, expect, it } from 'vitest';

import { canAccessRoom } from './room-access.js';

const staff = { tenantId: 't1', userId: 'u_admin', roles: ['tenant_admin'] };
const learner = { tenantId: 't1', userId: 'u_learner', roles: ['learner'] };
const teacherAndLearner = { tenantId: 't1', userId: 'u_both', roles: ['learner', 'teacher'] };

/*
 * Ревизия 2026-08-27 (порция 36, журнал 282): общая комната центра пускала любого
 * вошедшего — а свой идентификатор центра человек читает прямо из собственного токена.
 * Значит рядовой слушатель мог получать поток событий всего центра.
 */
describe('доступ к комнатам живой ленты (порция 36)', () => {
  it('персонал центра слушает общую комнату', () => {
    expect(canAccessRoom(staff, 'tenant:t1')).toBe(true);
  });

  it('слушатель в общую комнату центра не допускается', () => {
    expect(canAccessRoom(learner, 'tenant:t1')).toBe(false);
  });

  it('роль сверх слушателя открывает общую комнату', () => {
    expect(canAccessRoom(teacherAndLearner, 'tenant:t1')).toBe(true);
  });

  it('чужой центр закрыт и для персонала', () => {
    expect(canAccessRoom(staff, 'tenant:t2')).toBe(false);
  });

  it('свою личную комнату слушает каждый, чужую — никто', () => {
    expect(canAccessRoom(learner, 'user:u_learner')).toBe(true);
    expect(canAccessRoom(learner, 'user:u_admin')).toBe(false);
  });

  it('комнаты предметов — в пределах своего центра', () => {
    expect(canAccessRoom(learner, 'dialog:t1:dlg_1')).toBe(true);
    expect(canAccessRoom(learner, 'dialog:t2:dlg_1')).toBe(false);
    expect(canAccessRoom(learner, 'task:t1:task_1')).toBe(true);
    expect(canAccessRoom(learner, 'webinar:t1:web_1')).toBe(true);
  });

  it('комната без предмета не открывается', () => {
    expect(canAccessRoom(learner, 'dialog:t1')).toBe(false);
  });

  it('неизвестный вид комнаты закрыт', () => {
    expect(canAccessRoom(staff, 'secrets:t1')).toBe(false);
  });

  it('без опознанного человека доступа нет', () => {
    expect(canAccessRoom({ tenantId: '', userId: '', roles: ['tenant_admin'] }, 'tenant:t1')).toBe(
      false
    );
  });
});
