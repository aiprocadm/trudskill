import { NotFoundException, PreconditionFailedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { VideoAccessService } from './video-access.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import type { MvpService } from '../mvp.service.js';

/**
 * Правила прохождения курса (ФТ-E1, Фаза 2 Task 11).
 *
 * Смысл: клиентский замок на карточке модуля снимается через инструменты разработчика
 * за минуту. Настоящий запрет — отказ выдать материал, и он проверяется здесь.
 */

const T = 'tenant_demo';
const CTX = { tenantId: T, userId: 'u1', permissions: [] } as unknown as RequestContext;

/**
 * Курс из двух модулей: в первом обязательный и необязательный материалы,
 * во втором — видео, к которому слушатель хочет прыгнуть.
 */
function makeState(options: { sequential?: boolean; firstModuleDone?: boolean } = {}) {
  return {
    materials: [
      {
        tenantId: T,
        id: 'mat_m1_required',
        moduleId: 'mod_1',
        materialType: 'video',
        isRequired: true,
        minViewSeconds: 0
      },
      {
        tenantId: T,
        id: 'mat_m1_optional',
        moduleId: 'mod_1',
        materialType: 'file',
        isRequired: false,
        minViewSeconds: 0
      },
      {
        tenantId: T,
        id: 'mat_m2',
        moduleId: 'mod_2',
        materialType: 'video',
        isRequired: true,
        minViewSeconds: 0
      }
    ],
    modules: [
      { tenantId: T, id: 'mod_1', courseVersionId: 'cv_1', sortOrder: 1, title: 'Модуль 1' },
      { tenantId: T, id: 'mod_2', courseVersionId: 'cv_1', sortOrder: 2, title: 'Модуль 2' }
    ],
    courseVersions: [
      {
        tenantId: T,
        id: 'cv_1',
        courseId: 'course_1',
        ...(options.sequential ? { sequentialModules: true } : {})
      }
    ],
    enrollments: [{ tenantId: T, id: 'enr_1', groupId: 'grp_1', learnerId: 'lrn_1' }],
    groupCourses: [{ tenantId: T, groupId: 'grp_1', courseId: 'course_1' }],
    materialProgress: options.firstModuleDone
      ? [
          {
            tenantId: T,
            enrollmentId: 'enr_1',
            materialId: 'mat_m1_required',
            status: 'completed'
          }
        ]
      : []
  } as unknown as InMemoryMvpState;
}

function makeService(options: Parameters<typeof makeState>[0] = {}) {
  const mvp = { assertActorMatchesLearnerIamLink: vi.fn() } as unknown as MvpService;
  return new VideoAccessService(makeState(options), mvp);
}

describe('VideoAccessService — строгий порядок модулей (ФТ-E1)', () => {
  it('ОБХОД ЗАПРОСОМ МИМО ИНТЕРФЕЙСА: второй модуль закрыт, пока не закрыт первый', () => {
    const access = makeService({ sequential: true });

    expect(() => access.assertLearnerMayWatch(T, 'u1', 'mat_m2', 'enr_1', CTX)).toThrow(
      PreconditionFailedException
    );
    // Сообщение называет конкретный модуль — иначе слушатель не поймёт, куда идти.
    expect(() => access.assertLearnerMayWatch(T, 'u1', 'mat_m2', 'enr_1', CTX)).toThrow(/Модуль 1/);
  });

  it('после закрытия обязательных материалов первый модуль перестаёт запирать', () => {
    const access = makeService({ sequential: true, firstModuleDone: true });

    expect(() => access.assertLearnerMayWatch(T, 'u1', 'mat_m2', 'enr_1', CTX)).not.toThrow();
  });

  it('необязательный материал не запирает курс — методичку можно не читать', () => {
    // В первом модуле обязательный закрыт, необязательный — нет.
    const access = makeService({ sequential: true, firstModuleDone: true });

    expect(() => access.assertLearnerMayWatch(T, 'u1', 'mat_m2', 'enr_1', CTX)).not.toThrow();
  });

  it('при выключенном правиле порядок свободный — идущие группы не запираются', () => {
    const access = makeService({ sequential: false });

    expect(() => access.assertLearnerMayWatch(T, 'u1', 'mat_m2', 'enr_1', CTX)).not.toThrow();
  });

  it('первый модуль доступен всегда — запирать его нечем', () => {
    const access = makeService({ sequential: true });

    expect(() =>
      access.assertLearnerMayWatch(T, 'u1', 'mat_m1_required', 'enr_1', CTX)
    ).not.toThrow();
  });

  it('правило не подменяет проверку доступа: чужой материал по-прежнему 404', () => {
    const access = makeService({ sequential: true });

    expect(() => access.assertLearnerMayWatch(T, 'u1', 'mat_missing', 'enr_1', CTX)).toThrow(
      NotFoundException
    );
  });
});
