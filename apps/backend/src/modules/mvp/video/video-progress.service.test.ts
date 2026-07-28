import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { InMemoryVideoAssetsRepository } from './in-memory-video-assets.repository.js';
import { InMemoryVideoProgressRepository } from './in-memory-video-progress.repository.js';
import { VideoAccessService } from './video-access.service.js';
import { VideoProgressService } from './video-progress.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import type { MvpService } from '../mvp.service.js';

/**
 * Прогресс по реальному воспроизведению (ФТ-B3.1/B3.3, Фаза 2 Task 6).
 * Ключевое: решение «пройдено» принимает СЕРВЕР по покрытию ролика, а не клиент.
 */

const T = 'tenant_demo';
const CTX = { tenantId: T, userId: 'u1', permissions: [] } as unknown as RequestContext;
const DURATION = 600; // 10 минут

function makeState(videoCompletionPercent?: number, noSeekOnFirstView?: boolean) {
  return {
    materials: [
      { tenantId: T, id: 'mat_1', moduleId: 'mod_1', materialType: 'video', minViewSeconds: 60 }
    ],
    modules: [{ tenantId: T, id: 'mod_1', courseVersionId: 'cv_1' }],
    courseVersions: [
      {
        tenantId: T,
        id: 'cv_1',
        courseId: 'course_1',
        ...(videoCompletionPercent ? { videoCompletionPercent } : {}),
        ...(noSeekOnFirstView ? { noSeekOnFirstView } : {})
      }
    ],
    enrollments: [{ tenantId: T, id: 'enr_1', groupId: 'grp_1', learnerId: 'lrn_1' }],
    groupCourses: [{ tenantId: T, groupId: 'grp_1', courseId: 'course_1' }]
  } as unknown as InMemoryMvpState;
}

async function makeService(
  options: {
    threshold?: number;
    durationSeconds?: number | undefined;
    noSeekOnFirstView?: boolean;
  } = {}
) {
  const assets = new InMemoryVideoAssetsRepository();
  await assets.create({
    id: 'vasset_1',
    tenantId: T,
    providerCode: 'noop',
    status: 'ready',
    sizeBytes: 1,
    storageKey: 'video/t/a.mp4'
  });
  await assets.update(T, 'vasset_1', {
    materialId: 'mat_1',
    ...(options.durationSeconds === undefined
      ? { durationSeconds: DURATION }
      : { durationSeconds: options.durationSeconds })
  });

  const upsertMaterialProgress = vi.fn();
  const mvp = {
    assertActorMatchesLearnerIamLink: vi.fn(),
    upsertMaterialProgress
  } as unknown as MvpService;

  const access = new VideoAccessService(
    makeState(options.threshold, options.noSeekOnFirstView),
    mvp
  );
  const progressRepo = new InMemoryVideoProgressRepository();
  const service = new VideoProgressService(access, assets, progressRepo, mvp);
  return { service, progressRepo, upsertMaterialProgress, assets };
}

describe('VideoProgressService — засчитывается просмотр, а не открытая вкладка', () => {
  it('первый heartbeat сохраняет покрытие и позицию', async () => {
    const { service, progressRepo } = await makeService();

    const result = await service.record(
      T,
      'u1',
      'mat_1',
      { enrollmentId: 'enr_1', positionSeconds: 60, ranges: [[0, 60]] },
      CTX
    );

    expect(result.coveragePercent).toBe(10);
    expect(result.completed).toBe(false);
    expect(result.requiredPercent).toBe(90);
    const stored = await progressRepo.find(T, 'enr_1', 'mat_1');
    expect(stored?.watchedRanges).toEqual([[0, 60]]);
    expect(stored?.lastPositionSeconds).toBe(60);
  });

  it('прыжок в конец не даёт зачёта — перемотанное не просмотрено', async () => {
    const { service, upsertMaterialProgress } = await makeService();

    const result = await service.record(
      T,
      'u1',
      'mat_1',
      // Посмотрел минуту и прыгнул на последнюю минуту десятиминутного ролика.
      {
        enrollmentId: 'enr_1',
        positionSeconds: 600,
        ranges: [
          [0, 60],
          [540, 600]
        ]
      },
      CTX
    );

    expect(result.coveragePercent).toBe(20);
    expect(result.completed).toBe(false);
    expect(upsertMaterialProgress).not.toHaveBeenCalled();
  });

  it('90% ролика ставит материал пройденным через общий расчёт прогресса', async () => {
    const { service, upsertMaterialProgress } = await makeService();

    const result = await service.record(
      T,
      'u1',
      'mat_1',
      { enrollmentId: 'enr_1', positionSeconds: 540, ranges: [[0, 540]] },
      CTX
    );

    expect(result.completed).toBe(true);
    expect(upsertMaterialProgress).toHaveBeenCalledWith(
      T,
      'u1',
      'mat_1',
      expect.objectContaining({ enrollmentId: 'enr_1' }),
      CTX
    );
  });

  it('короткий ролик засчитывается даже при minViewSeconds больше его длины', async () => {
    // minViewSeconds=60, покрытие 54 секунды — без подстраховки материал завис бы «в процессе».
    const { service, upsertMaterialProgress } = await makeService({ durationSeconds: 60 });

    await service.record(
      T,
      'u1',
      'mat_1',
      { enrollmentId: 'enr_1', positionSeconds: 60, ranges: [[0, 60]] },
      CTX
    );

    const call = upsertMaterialProgress.mock.calls[0]!;
    expect((call[3] as { studiedSeconds: number }).studiedSeconds).toBeGreaterThanOrEqual(60);
  });

  it('порог курса перекрывает умолчание', async () => {
    const { service } = await makeService({ threshold: 50 });

    const result = await service.record(
      T,
      'u1',
      'mat_1',
      { enrollmentId: 'enr_1', positionSeconds: 300, ranges: [[0, 300]] },
      CTX
    );

    expect(result.requiredPercent).toBe(50);
    expect(result.completed).toBe(true);
  });

  it('без известной длительности зачёта нет — «пройдено» вслепую не ставим', async () => {
    const { service, upsertMaterialProgress } = await makeService({ durationSeconds: 0 });

    const result = await service.record(
      T,
      'u1',
      'mat_1',
      { enrollmentId: 'enr_1', positionSeconds: 9999, ranges: [[0, 9999]] },
      CTX
    );

    expect(result.coveragePercent).toBe(0);
    expect(result.completed).toBe(false);
    expect(upsertMaterialProgress).not.toHaveBeenCalled();
  });
});

describe('VideoProgressService — устойчивость к сети', () => {
  it('повторный и запоздавший heartbeat не откатывают покрытие', async () => {
    const { service } = await makeService();
    await service.record(
      T,
      'u1',
      'mat_1',
      { enrollmentId: 'enr_1', positionSeconds: 300, ranges: [[0, 300]] },
      CTX
    );

    const late = await service.record(
      T,
      'u1',
      'mat_1',
      { enrollmentId: 'enr_1', positionSeconds: 10, ranges: [[0, 10]] },
      CTX
    );

    expect(late.coveragePercent).toBe(50);
    // Максимум досмотренного не откатился — на нём держится антиперемотка (Task 7).
    expect(late.maxPositionSeconds).toBe(300);
  });

  it('накопление между heartbeat-ами складывается, а не заменяется', async () => {
    const { service } = await makeService();
    await service.record(
      T,
      'u1',
      'mat_1',
      { enrollmentId: 'enr_1', positionSeconds: 120, ranges: [[0, 120]] },
      CTX
    );

    const second = await service.record(
      T,
      'u1',
      'mat_1',
      { enrollmentId: 'enr_1', positionSeconds: 240, ranges: [[120, 240]] },
      CTX
    );

    expect(second.coveragePercent).toBe(40);
  });

  it('мусорные отрезки не ломают приём и не накручивают покрытие', async () => {
    const { service } = await makeService();

    const result = await service.record(
      T,
      'u1',
      'mat_1',
      {
        enrollmentId: 'enr_1',
        positionSeconds: 60,
        ranges: [[0, 60], 'сломай', null, [Number.NaN, 5], [-100, -50], [9999, 99999]]
      },
      CTX
    );

    expect(result.coveragePercent).toBe(10);
  });

  it('отрицательная позиция отвергается', async () => {
    const { service } = await makeService();
    await expect(
      service.record(T, 'u1', 'mat_1', { enrollmentId: 'enr_1', positionSeconds: -5 }, CTX)
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('пустой heartbeat без отрезков сохраняет накопленное', async () => {
    const { service } = await makeService();
    await service.record(
      T,
      'u1',
      'mat_1',
      { enrollmentId: 'enr_1', positionSeconds: 300, ranges: [[0, 300]] },
      CTX
    );

    const idle = await service.record(
      T,
      'u1',
      'mat_1',
      { enrollmentId: 'enr_1', positionSeconds: 300 },
      CTX
    );

    expect(idle.coveragePercent).toBe(50);
  });
});

describe('VideoProgressService — доступ и возобновление', () => {
  it('чужой пользователь прогресс не пишет', async () => {
    const { service, progressRepo } = await makeService();
    const forbidden = new Error('actor is not the learner');
    const access = (service as unknown as { access: VideoAccessService }).access;
    vi.spyOn(access, 'assertLearnerMayWatch').mockImplementation(() => {
      throw forbidden;
    });

    await expect(
      service.record(T, 'u_other', 'mat_1', { enrollmentId: 'enr_1', positionSeconds: 10 }, CTX)
    ).rejects.toBe(forbidden);
    expect(await progressRepo.find(T, 'enr_1', 'mat_1')).toBeNull();
  });

  it('getResumeState отдаёт нули для нетронутого урока', async () => {
    const { service } = await makeService();
    expect(await service.getResumeState(T, 'enr_1', 'mat_1')).toEqual({
      lastPositionSeconds: 0,
      maxPositionSeconds: 0
    });
  });
});

describe('VideoProgressService — антиперемотка (ФТ-B3.2)', () => {
  const jumpToEnd = {
    enrollmentId: 'enr_1',
    positionSeconds: 595,
    ranges: [
      [0, 60],
      [540, 600]
    ]
  };

  it('ОБХОД ЗАПРОСОМ МИМО ИНТЕРФЕЙСА: прыжок в конец не засчитывается', async () => {
    const { service, upsertMaterialProgress } = await makeService({ noSeekOnFirstView: true });

    const result = await service.record(T, 'u1', 'mat_1', jumpToEnd, CTX);

    // Засчитана только реально просмотренная минута, кусок «в конце» отброшен.
    expect(result.coveragePercent).toBe(10);
    expect(result.completed).toBe(false);
    expect(upsertMaterialProgress).not.toHaveBeenCalled();
    // Максимум не подпрыгнул до 595 — иначе одним прыжком открылся бы весь ролик.
    expect(result.maxPositionSeconds).toBeLessThan(120);
    expect(result.seekForwardBlocked).toBe(true);
  });

  it('при выключенном флаге поведение прежнее — прыжок засчитывается', async () => {
    const { service } = await makeService();

    const result = await service.record(T, 'u1', 'mat_1', jumpToEnd, CTX);

    expect(result.coveragePercent).toBe(20);
    expect(result.seekForwardBlocked).toBe(false);
  });

  it('последовательный просмотр с включённым флагом идёт нормально', async () => {
    const { service } = await makeService({ noSeekOnFirstView: true });

    await service.record(
      T,
      'u1',
      'mat_1',
      { enrollmentId: 'enr_1', positionSeconds: 120, ranges: [[0, 120]] },
      CTX
    );
    const second = await service.record(
      T,
      'u1',
      'mat_1',
      { enrollmentId: 'enr_1', positionSeconds: 240, ranges: [[0, 240]] },
      CTX
    );

    expect(second.coveragePercent).toBe(40);
  });

  it('перемотка назад разрешена и при включённом флаге', async () => {
    const { service } = await makeService({ noSeekOnFirstView: true });
    await service.record(
      T,
      'u1',
      'mat_1',
      { enrollmentId: 'enr_1', positionSeconds: 300, ranges: [[0, 300]] },
      CTX
    );

    const back = await service.record(
      T,
      'u1',
      'mat_1',
      { enrollmentId: 'enr_1', positionSeconds: 100, ranges: [[100, 150]] },
      CTX
    );

    expect(back.coveragePercent).toBe(50);
    // Максимум досмотренного при возврате назад не падает.
    expect(back.maxPositionSeconds).toBe(300);
  });

  it('после зачёта перемотка свободна — пересматривать пройденное не запрещено', async () => {
    const { service } = await makeService({ noSeekOnFirstView: true });
    // Досматриваем честно до порога.
    await service.record(
      T,
      'u1',
      'mat_1',
      { enrollmentId: 'enr_1', positionSeconds: 540, ranges: [[0, 540]] },
      CTX
    );

    const afterDone = await service.record(
      T,
      'u1',
      'mat_1',
      { enrollmentId: 'enr_1', positionSeconds: 600, ranges: [[560, 600]] },
      CTX
    );

    expect(afterDone.seekForwardBlocked).toBe(false);
    expect(afterDone.coveragePercent).toBeGreaterThanOrEqual(90);
  });
});
