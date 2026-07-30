import { PreconditionFailedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import {
  MIN_COMMISSION_MEMBERS,
  buildExamReadiness,
  checkCommission,
  checkLearners,
  commissionMemberName
} from './exam-readiness.js';
import { MvpService } from './mvp.service.js';

import type { CommissionMember } from './mvp.types.js';

const member = (over: Partial<CommissionMember> = {}): CommissionMember => ({
  id: 'cm_1',
  tenantId: 't1',
  commissionId: 'com_1',
  role: 'member',
  externalFullName: 'Петров Пётр',
  positionInOrder: 1,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  ...over
});

const fullCommission = (): CommissionMember[] => [
  member({ id: 'cm_1', role: 'chairman', externalFullName: 'Иванов Иван' }),
  member({ id: 'cm_2', role: 'member', externalFullName: 'Петров Пётр' }),
  member({ id: 'cm_3', role: 'secretary', externalFullName: 'Сидорова Анна' })
];

// Валидный СНИЛС по контрольной сумме ПФР (тот же вектор, что в тестах импорта).
const VALID_SNILS = '112-233-445 95';

describe('checkCommission (ФТ-E3.2)', () => {
  it('полная комиссия проходит', () => {
    expect(checkCommission(fullCommission())).toEqual([]);
  });

  it('комиссия из двух человек НЕ пускает к экзамену', () => {
    // Двое не образуют большинства — решение принять нечем.
    const issues = checkCommission(fullCommission().slice(0, 2));
    expect(issues.some((i) => i.code === 'commission_too_small')).toBe(true);
  });

  it('минимум — ровно три человека', () => {
    expect(MIN_COMMISSION_MEMBERS).toBe(3);
    expect(checkCommission(fullCommission())).toHaveLength(0);
  });

  it('комиссия без председателя не проходит — протокол некому подписать', () => {
    const noChair = fullCommission().map((m) =>
      m.role === 'chairman' ? { ...m, role: 'member' as const } : m
    );
    expect(checkCommission(noChair).some((i) => i.code === 'commission_chairman_missing')).toBe(
      true
    );
  });

  it('член комиссии без имени ловится до печати протокола', () => {
    // Иначе в документе окажется пустая строка, и это вскроется после печати.
    const broken = fullCommission();
    broken[1] = member({ id: 'cm_2', externalFullName: '   ' });
    expect(checkCommission(broken).some((i) => i.code === 'commission_member_unnamed')).toBe(true);
  });

  it('внутренний пользователь без ФИО — не ошибка: имя возьмётся из профиля', () => {
    const withUser = fullCommission();
    withUser[1] = member({ id: 'cm_2', externalFullName: undefined, userId: 'u_1' });
    expect(checkCommission(withUser)).toEqual([]);
  });

  it('пустая комиссия даёт обе проблемы сразу', () => {
    const issues = checkCommission([]);
    expect(issues.map((i) => i.code).sort()).toEqual([
      'commission_chairman_missing',
      'commission_too_small'
    ]);
  });
});

describe('checkLearners (ФТ-E3.2 ↔ ФТ-C4.1)', () => {
  it('слушатель с валидным СНИЛС проходит', () => {
    expect(checkLearners([{ id: 'l1', fullName: 'Иванов', snils: VALID_SNILS }])).toEqual([]);
  });

  it('без СНИЛС — поимённая проблема', () => {
    const issues = checkLearners([{ id: 'l1', fullName: 'Иванов Иван' }]);
    expect(issues[0]).toMatchObject({
      code: 'learner_snils_missing',
      subjectId: 'l1',
      subjectName: 'Иванов Иван'
    });
  });

  it('битая контрольная сумма ловится как опечатка', () => {
    const issues = checkLearners([{ id: 'l1', fullName: 'Иванов', snils: '111-111-111 11' }]);
    expect(issues[0]!.code).toBe('learner_snils_invalid');
  });

  it('пробелы вместо СНИЛС считаются отсутствием', () => {
    const issues = checkLearners([{ id: 'l1', fullName: 'Иванов', snils: '   ' }]);
    expect(issues[0]!.code).toBe('learner_snils_missing');
  });

  it('каждый проблемный слушатель назван отдельно', () => {
    const issues = checkLearners([
      { id: 'l1', fullName: 'Иванов', snils: VALID_SNILS },
      { id: 'l2', fullName: 'Петров' },
      { id: 'l3', fullName: 'Сидоров', snils: 'мусор' }
    ]);
    expect(issues).toHaveLength(2);
    expect(issues.map((i) => i.subjectId)).toEqual(['l2', 'l3']);
  });
});

describe('buildExamReadiness', () => {
  it('всё в порядке — экзамен можно проводить', () => {
    const report = buildExamReadiness(fullCommission(), [
      { id: 'l1', fullName: 'Иванов', snils: VALID_SNILS }
    ]);
    expect(report.ready).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it('одна проблема закрывает экзамен целиком', () => {
    const report = buildExamReadiness(fullCommission(), [{ id: 'l1', fullName: 'Иванов' }]);
    expect(report.ready).toBe(false);
  });

  it('проблемы комиссии и слушателей показываются вместе, а не по очереди', () => {
    // Иначе методист чинит их по одной, каждый раз упираясь в новую.
    const report = buildExamReadiness(fullCommission().slice(0, 2), [
      { id: 'l1', fullName: 'Иванов' }
    ]);
    expect(report.issues.some((i) => i.scope === 'commission')).toBe(true);
    expect(report.issues.some((i) => i.scope === 'learner')).toBe(true);
  });
});

describe('commissionMemberName', () => {
  it('внешний эксперт — по ФИО', () => {
    expect(commissionMemberName(member({ externalFullName: 'Иванов Иван' }))).toBe('Иванов Иван');
  });

  it('внутренний пользователь — по идентификатору, если ФИО не задано', () => {
    expect(commissionMemberName(member({ externalFullName: undefined, userId: 'u_1' }))).toBe(
      'u_1'
    );
  });
});

/**
 * ФТ-E3 (Фаза 3 Task 10 часть 2) — «одна кнопка»: проверки перед выпуском документов.
 *
 * Проверяем связку на уровне сервиса: незакрытая готовность обязана остановить выпуск,
 * иначе протокол с неполной комиссией уйдёт в печать.
 */
describe('closeGroupWithChecks — связка проверок и выпуска документов', () => {
  const T = 'tenant_demo';
  const ctx = {
    tenantId: T,
    requestId: 'r1',
    correlationId: 'c1',
    userId: 'u_admin'
  } as never;

  function harness(ready: boolean) {
    const closeGroup = vi.fn(() => ({
      protocol: { id: 'task_p' },
      certificates: [{ id: 'task_c' }],
      created: 2,
      retried: 0
    }));
    const service = {
      documentsService: { closeGroup },
      getExamReadiness: () =>
        ready
          ? { ready: true, issues: [] }
          : {
              ready: false,
              issues: [
                {
                  scope: 'commission' as const,
                  code: 'commission_too_small',
                  message: 'мало людей'
                }
              ]
            },
      audit: vi.fn(),
      closeGroupWithChecks: MvpService.prototype.closeGroupWithChecks
    };
    return { service, closeGroup };
  }

  const request = {
    groupId: 'grp_1',
    courseId: 'crs_1',
    protocolTemplateId: 'tpl_p',
    certificateTemplateId: 'tpl_c',
    enrollmentIds: ['enr_1']
  };

  it('незакрытая готовность ОСТАНАВЛИВАЕТ выпуск документов', () => {
    const h = harness(false);

    expect(() =>
      h.service.closeGroupWithChecks.call(h.service, T, 'u_admin', request, ctx)
    ).toThrow(PreconditionFailedException);
    // Ключевое: ни одной задачи на документы не заведено.
    expect(h.closeGroup).not.toHaveBeenCalled();
  });

  it('отказ называет причины — методисту нужно знать, что чинить', () => {
    const h = harness(false);
    try {
      h.service.closeGroupWithChecks.call(h.service, T, 'u_admin', request, ctx);
      throw new Error('должно было бросить');
    } catch (err) {
      const response = (err as { response?: { code?: string; issues?: unknown[] } }).response;
      expect(response?.code).toBe('exam_not_ready');
      expect(response?.issues).toHaveLength(1);
    }
  });

  it('при готовой группе документы выпускаются одним вызовом', () => {
    const h = harness(true);

    const result = h.service.closeGroupWithChecks.call(h.service, T, 'u_admin', request, ctx);

    expect(h.closeGroup).toHaveBeenCalledTimes(1);
    expect(result.created).toBe(2);
    // Отчёт о готовности возвращается вместе с результатом: он часть доказательства,
    // что документы выпущены на проверенных данных.
    expect(result.readiness.ready).toBe(true);
  });
});
