import { describe, expect, it } from 'vitest';

import {
  type LibraryCourseContent,
  buildCopyPlan,
  buildLibrarySnapshot,
  portableProgramMeta
} from './library-course.util.js';

const source = {
  course: { id: 'c1', code: 'OT-2026', title: 'Охрана труда', description: 'Базовый курс' },
  versions: [
    { id: 'v1', courseId: 'c1', versionNo: 1, academicHours: 16 },
    {
      id: 'v2',
      courseId: 'c1',
      versionNo: 2,
      academicHours: 40,
      recertificationPeriodMonths: 36,
      commissionId: 'com_source',
      programAttachmentFileId: 'file_source',
      sequentialModules: true
    },
    { id: 'v_other', courseId: 'c_other', versionNo: 1, academicHours: 8 }
  ],
  modules: [
    { id: 'm2', courseVersionId: 'v2', title: 'Практика', sortOrder: 2, isRequired: true },
    { id: 'm1', courseVersionId: 'v2', title: 'Теория', sortOrder: 1, isRequired: true },
    { id: 'm_old', courseVersionId: 'v1', title: 'Старый модуль', sortOrder: 1, isRequired: true }
  ],
  materials: [
    {
      id: 'mat1',
      moduleId: 'm1',
      title: 'Лекция',
      materialType: 'text',
      sortOrder: 1,
      minViewSeconds: 60,
      isRequired: true
    },
    {
      id: 'mat2',
      moduleId: 'm1',
      title: 'Видеоурок',
      materialType: 'video',
      sortOrder: 2,
      minViewSeconds: 300,
      isRequired: true
    },
    {
      id: 'mat3',
      moduleId: 'm2',
      title: 'Методичка',
      materialType: 'file',
      sortOrder: 1,
      minViewSeconds: 0,
      isRequired: false
    },
    {
      id: 'mat4',
      moduleId: 'm2',
      title: 'Ссылка на ГОСТ',
      materialType: 'external_url',
      sortOrder: 2,
      minViewSeconds: 0,
      isRequired: false
    }
  ]
};

describe('снимок курса для библиотеки (ФТ-D6)', () => {
  it('берётся ПОСЛЕДНЯЯ версия курса — она и есть актуальная программа', () => {
    const snapshot = buildLibrarySnapshot(source);
    expect(snapshot.programMeta.academicHours).toBe(40);
    expect(snapshot.modules.map((m) => m.title)).toEqual(['Теория', 'Практика']);
  });

  it('чужие курсы и старые версии в снимок не попадают', () => {
    const snapshot = buildLibrarySnapshot(source);
    expect(snapshot.modules.flatMap((m) => m.materials).map((m) => m.title)).not.toContain(
      'Старый модуль'
    );
  });

  it('арендаторские поля меты не переносятся: комиссия и бланк программы — свои у каждого', () => {
    const meta = portableProgramMeta(source.versions[1]!);
    expect(meta.recertificationPeriodMonths).toBe(36);
    expect(meta.sequentialModules).toBe(true);
    expect('commissionId' in meta).toBe(false);
    expect('programAttachmentFileId' in meta).toBe(false);
  });

  it('материалы из хранилища центра помечаются needsContent, остальные — нет', () => {
    const snapshot = buildLibrarySnapshot(source);
    const byTitle = Object.fromEntries(
      snapshot.modules.flatMap((m) => m.materials).map((m) => [m.title, m.needsContent])
    );
    expect(byTitle['Видеоурок']).toBe(true);
    expect(byTitle['Методичка']).toBe(true);
    expect(byTitle['Лекция']).toBe(false);
    expect(byTitle['Ссылка на ГОСТ']).toBe(false);
  });

  it('курс без версий даёт пустой, но валидный снимок', () => {
    const snapshot = buildLibrarySnapshot({ ...source, versions: [], modules: [], materials: [] });
    expect(snapshot.modules).toEqual([]);
    expect(snapshot.programMeta).toEqual({});
    expect(snapshot.course.code).toBe('OT-2026');
  });

  it('снимок не содержит идентификаторов источника — он самодостаточен', () => {
    const json = JSON.stringify(buildLibrarySnapshot(source));
    for (const id of ['c1', 'v2', 'm1', 'mat2', 'com_source', 'file_source']) {
      expect(json).not.toContain(`"${id}"`);
    }
  });
});

describe('копия курса в центр (ФТ-D6)', () => {
  const content: LibraryCourseContent = buildLibrarySnapshot(source);

  it('структура и правила переносятся полностью', () => {
    const plan = buildCopyPlan(content, []);
    expect(plan.course.title).toBe('Охрана труда');
    expect(plan.programMeta.academicHours).toBe(40);
    expect(plan.modules.map((m) => m.title)).toEqual(['Теория', 'Практика']);
    expect(plan.modules[0]!.materials[0]!.minViewSeconds).toBe(60);
  });

  it('материалы без содержимого приезжают заготовками, а не «рабочими» файлами', () => {
    const plan = buildCopyPlan(content, []);
    const video = plan.modules[0]!.materials[1]!;
    expect(video.materialType).toBe('text');
    expect(video.title).toContain('требуется загрузить материал');
    expect(plan.materialsNeedingContent).toBe(2);
  });

  it('текст и внешняя ссылка переносятся как есть', () => {
    const plan = buildCopyPlan(content, []);
    expect(plan.modules[0]!.materials[0]!.materialType).toBe('text');
    expect(plan.modules[1]!.materials[1]!.materialType).toBe('external_url');
  });

  it('занятый код курса получает суффикс, чужой курс не перезаписывается', () => {
    expect(buildCopyPlan(content, ['OT-2026']).course.code).toBe('OT-2026-2');
    expect(buildCopyPlan(content, ['OT-2026', 'OT-2026-2']).course.code).toBe('OT-2026-3');
    expect(buildCopyPlan(content, ['DRUGOY']).course.code).toBe('OT-2026');
  });
});
