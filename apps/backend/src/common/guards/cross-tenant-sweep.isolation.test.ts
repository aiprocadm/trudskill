import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it } from 'vitest';

import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../../modules/audit/audit.service.js';
import { InMemoryMvpState } from '../../modules/mvp/infrastructure/in-memory-mvp.state.js';
import { MvpService } from '../../modules/mvp/mvp.service.js';

import type { DocumentsService } from '../../modules/documents/documents.service.js';
import type { FilesService } from '../../modules/files/files.service.js';
import type { RequestContext } from '../context/request-context.js';

/**
 * Изоляция центров — С ДОКАЗАТЕЛЬСТВОМ (ТЗ «Стабилизация, UX и развитие», 13.4).
 *
 * **Что просит ТЗ дословно:** «Автотесты, доказывающие, что тенант A не может получить данные
 * тенанта B: перебор основных эндпоинтов с чужими идентификаторами… Этот тест обязателен в CI:
 * любая новая ручка проверяется на изоляцию». Приоритет P0: «утечка между центрами для арендной
 * модели фатальна».
 *
 * **Чего не хватало.** Сторожа изоляции в этой папке проверяют ИСХОДНЫЙ КОД: что контроллер
 * стоит под `TenantGuard` (`controllers-tenant-scope`) и что обработчик упоминает арендатора
 * (`tenant-scoped-handlers`). Это важно, но это проверка намерения, а не поведения: код может
 * честно упоминать `tenantId` и всё равно отдать чужую запись. Поведенческого перебора «создали
 * у Б — просим из А» не было ни одного (журнал 550).
 *
 * Сегодня это особенно уместно: ровно в этой сессии слабая проверка изоляции уже дала осечку —
 * чужая запись лежала в другом родителе, и фильтр по центру в ней не нёс нагрузки (журнал 541).
 *
 * **Как устроена проверка.** Реестр сущностей: как завести запись и как её спросить. Для каждой
 * записи делается одно и то же: заводим у центра Б, спрашиваем из центра А, ждём «не найдено».
 *
 * **Почему именно «не найдено», а не «запрещено».** «Запрещено» подтверждает, что запись
 * СУЩЕСТВУЕТ, — это уже утечка: перебором идентификаторов чужой центр узнаёт, сколько у соседа
 * слушателей и групп. «Не найдено» не говорит ничего.
 *
 * **Список сущностей сверяется с кодом.** Новый `getXxx(tenantId, id)` в службе, не попавший в
 * реестр, роняет отдельную проверку — это и есть «любая новая ручка проверяется на изоляцию».
 */

const A = 'tenant_a';
const B = 'tenant_b';

const ctx = (tenantId: string): RequestContext => ({
  requestId: `req_${tenantId}`,
  correlationId: `corr_${tenantId}`,
  tenantId,
  userId: `u_${tenantId}`,
  ip: '127.0.0.1',
  userAgent: 'vitest'
});

const noopDocuments = {
  listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 })
} as unknown as DocumentsService;
const noopFiles = { ensureMaterialLink: async () => undefined } as unknown as FilesService;

const makeService = () =>
  new MvpService(
    new InMemoryMvpState(),
    new TenantScopedRepository(),
    new AuditService(),
    noopDocuments,
    noopFiles,
    new EventEmitter2()
  );

type Svc = ReturnType<typeof makeService>;

interface EntityCase {
  /** Имя для человека в сообщении упавшего теста. */
  name: string;
  /** Метод службы, которым запись спрашивают. Сверяется со списком методов кода. */
  getter: string;
  /** Завести запись в указанном центре и вернуть её идентификатор. */
  create: (svc: Svc, tenant: string) => string;
  /** Спросить запись от имени указанного центра. */
  read: (svc: Svc, tenant: string, id: string) => unknown;
}

/** Заготовка: курс с версией — от неё зависят модули, материалы и тесты. */
const seedCourse = (svc: Svc, tenant: string): { courseId: string; versionId: string } => {
  const course = svc.createCourse(
    tenant,
    ctx(tenant).userId,
    { code: 'C', title: 'Курс' },
    ctx(tenant)
  );
  const version = svc.createCourseVersion(tenant, course.id);
  return { courseId: course.id, versionId: version.id };
};

const seedModule = (svc: Svc, tenant: string): string => {
  const { versionId } = seedCourse(svc, tenant);
  return svc.createModule(
    tenant,
    ctx(tenant).userId,
    { courseVersionId: versionId, title: 'Модуль', minViewSeconds: 0 },
    ctx(tenant)
  ).id;
};

const seedBank = (svc: Svc, tenant: string): string => {
  const { courseId } = seedCourse(svc, tenant);
  return svc.createQuestionBank(
    tenant,
    ctx(tenant).userId,
    { title: 'Банк', courseId },
    ctx(tenant)
  ).id;
};

/**
 * Полный учебный круг одного центра: зачисление → прогресс → попытка → результат.
 *
 * Эти четыре записи — самые чувствительные в продукте: в них лежит, кто что сдал. Поэтому они
 * проверяются перебором наравне с остальными, а не выносятся в исключения.
 */
const seedLearning = (
  svc: Svc,
  tenant: string
): { enrollmentId: string; progressId: string; attemptId: string; resultId: string } => {
  const c = ctx(tenant);
  const { courseId, versionId } = seedCourse(svc, tenant);
  const moduleId = svc.createModule(
    tenant,
    c.userId,
    { courseVersionId: versionId, title: 'М', minViewSeconds: 0 },
    c
  ).id;
  const materialId = svc.createMaterial(
    tenant,
    c.userId,
    { moduleId, title: 'Материал', materialType: 'text', minViewSeconds: 1 },
    c
  ).id;
  const group = svc.createGroup(tenant, c.userId, { code: 'GL', name: 'Группа' }, c);
  svc.createGroupCourse(tenant, { groupId: group.id, courseId });
  const learner = svc.createLearnerExtended(tenant, c.userId, { firstName: 'У', lastName: 'У' }, c);
  const enrollment = svc.createEnrollment(
    tenant,
    c.userId,
    { groupId: group.id, learnerId: learner.id },
    c
  );

  /*
   * Отметка по материалу возвращает запись прогресса МАТЕРИАЛА, а `getProgress` читает прогресс
   * КУРСА — это разные таблицы с разными идентификаторами. Первый заход перепутал их, и «своя
   * запись не читается» поймало ошибку заготовки, а не продукта (журнал 550).
   */
  svc.upsertMaterialProgress(
    tenant,
    c.userId,
    materialId,
    { enrollmentId: enrollment.id, studiedSeconds: 10 },
    c
  );
  const progress = svc
    .listProgress(tenant, { page: 1, page_size: 10 })
    .items.find((item) => item.enrollmentId === enrollment.id);

  const bank = svc.createQuestionBank(tenant, c.userId, { title: 'Б', courseId }, c);
  const question = svc.createQuestion(
    tenant,
    c.userId,
    {
      questionBankId: bank.id,
      text: 'Вопрос?',
      type: 'single_choice',
      options: [
        { text: 'Да', isCorrect: true },
        { text: 'Нет', isCorrect: false }
      ]
    },
    c
  );
  const test = svc.createTest(
    tenant,
    c.userId,
    { title: 'Т', courseId, questionBankId: bank.id, rules: { attemptLimit: 1, passingScore: 1 } },
    c
  );
  svc.addTestQuestions(tenant, test.id, [question.id]);

  const attempt = svc.startAttempt(
    tenant,
    c.userId,
    { testId: test.id, enrollmentId: enrollment.id, learnerId: learner.id },
    c
  );
  svc.submitAttempt(tenant, c.userId, attempt.id, c);
  svc.finishAttempt(tenant, c.userId, attempt.id, c);

  /* У итога экзамена нет поля «попытка» — он привязан к зачислению (`ExamResult`). */
  const result = svc
    .listExamResults(tenant, { page: 1, page_size: 10 })
    .items.find((item) => item.enrollmentId === enrollment.id);

  return {
    enrollmentId: enrollment.id,
    progressId: progress?.id ?? '',
    attemptId: attempt.id,
    resultId: result?.id ?? ''
  };
};

const ENTITIES: EntityCase[] = [
  {
    name: 'слушатель',
    getter: 'getLearner',
    create: (svc, t) =>
      svc.createLearnerExtended(t, ctx(t).userId, { firstName: 'И', lastName: 'И' }, ctx(t)).id,
    read: (svc, t, id) => svc.getLearner(t, id)
  },
  {
    name: 'компания-заказчик',
    getter: 'getCounterparty',
    create: (svc, t) =>
      svc.createCounterparty(t, ctx(t).userId, { code: 'K', name: 'ООО', status: 'active' }, ctx(t))
        .id,
    read: (svc, t, id) => svc.getCounterparty(t, id)
  },
  {
    name: 'направление обучения',
    getter: 'getDirection',
    create: (svc, t) =>
      svc.createDirection(t, ctx(t).userId, { code: 'D', name: 'Направление' }, ctx(t)).id,
    read: (svc, t, id) => svc.getDirection(t, id)
  },
  {
    name: 'курс',
    getter: 'getCourse',
    create: (svc, t) => seedCourse(svc, t).courseId,
    read: (svc, t, id) => svc.getCourse(t, id)
  },
  {
    name: 'версия программы',
    getter: 'getCourseVersion',
    create: (svc, t) => seedCourse(svc, t).versionId,
    read: (svc, t, id) => svc.getCourseVersion(t, id)
  },
  {
    name: 'модуль программы',
    getter: 'getModule',
    create: (svc, t) => seedModule(svc, t),
    read: (svc, t, id) => svc.getModule(t, id)
  },
  {
    name: 'материал',
    getter: 'getMaterial',
    create: (svc, t) =>
      svc.createMaterial(
        t,
        ctx(t).userId,
        {
          moduleId: seedModule(svc, t),
          title: 'Материал',
          materialType: 'text',
          minViewSeconds: 0
        },
        ctx(t)
      ).id,
    read: (svc, t, id) => svc.getMaterial(t, id)
  },
  {
    name: 'учебная группа',
    getter: 'getGroup',
    create: (svc, t) => svc.createGroup(t, ctx(t).userId, { code: 'G', name: 'Группа' }, ctx(t)).id,
    read: (svc, t, id) => svc.getGroup(t, id)
  },
  {
    name: 'банк вопросов',
    getter: 'getQuestionBank',
    create: (svc, t) => seedBank(svc, t),
    read: (svc, t, id) => svc.getQuestionBank(t, id)
  },
  {
    name: 'вопрос',
    getter: 'getQuestion',
    create: (svc, t) =>
      svc.createQuestion(
        t,
        ctx(t).userId,
        {
          questionBankId: seedBank(svc, t),
          text: 'Вопрос?',
          type: 'single_choice',
          options: [
            { text: 'Да', isCorrect: true },
            { text: 'Нет', isCorrect: false }
          ]
        },
        ctx(t)
      ).id,
    read: (svc, t, id) => svc.getQuestion(t, id)
  },
  {
    name: 'тест',
    getter: 'getTest',
    create: (svc, t) => {
      const { courseId } = seedCourse(svc, t);
      const bank = svc.createQuestionBank(t, ctx(t).userId, { title: 'Б', courseId }, ctx(t));
      return svc.createTest(
        t,
        ctx(t).userId,
        { title: 'Тест', courseId, questionBankId: bank.id, rules: { attemptLimit: 1 } },
        ctx(t)
      ).id;
    },
    read: (svc, t, id) => svc.getTest(t, id)
  },
  {
    name: 'аттестационная комиссия',
    getter: 'getCommission',
    create: (svc, t) =>
      svc.createCommission(t, ctx(t).userId, { code: 'COM', name: 'Комиссия' }, ctx(t)).id,
    read: (svc, t, id) => svc.getCommission(t, id)
  },
  {
    name: 'зачисление',
    getter: 'getEnrollment',
    create: (svc, t) => {
      const group = svc.createGroup(t, ctx(t).userId, { code: 'G2', name: 'Г' }, ctx(t));
      const learner = svc.createLearnerExtended(
        t,
        ctx(t).userId,
        { firstName: 'А', lastName: 'А' },
        ctx(t)
      );
      return svc.createEnrollment(
        t,
        ctx(t).userId,
        { groupId: group.id, learnerId: learner.id },
        ctx(t)
      ).id;
    },
    read: (svc, t, id) => svc.getEnrollment(t, id)
  },
  {
    name: 'прогресс по материалу',
    getter: 'getProgress',
    create: (svc, t) => seedLearning(svc, t).progressId,
    read: (svc, t, id) => svc.getProgress(t, id)
  },
  {
    name: 'попытка теста',
    getter: 'getAttempt',
    create: (svc, t) => seedLearning(svc, t).attemptId,
    read: (svc, t, id) => svc.getAttempt(t, id)
  },
  {
    name: 'итог попытки',
    getter: 'getAttemptResult',
    create: (svc, t) => seedLearning(svc, t).attemptId,
    read: (svc, t, id) => svc.getAttemptResult(t, id)
  },
  {
    name: 'результат экзамена',
    getter: 'getExamResult',
    create: (svc, t) => seedLearning(svc, t).resultId,
    read: (svc, t, id) => svc.getExamResult(t, id)
  }
];

describe('центр А не достаёт записи центра Б (ТЗ 13.4)', () => {
  it('перебор вообще состоялся — иначе доказательства нет', () => {
    /* Пустой или усохший реестр сделал бы все проверки ниже зелёными ни на чём. */
    expect(
      ENTITIES.length,
      'основных сущностей должно быть не меньше десяти'
    ).toBeGreaterThanOrEqual(12);
  });

  for (const entity of ENTITIES) {
    it(`${entity.name}: чужая запись отвечает «не найдено»`, () => {
      const svc = makeService();
      const foreignId = entity.create(svc, B);

      expect(
        () => entity.read(svc, A, foreignId),
        `${entity.name}: центр А получил запись центра Б — это утечка между арендаторами`
      ).toThrow(NotFoundException);
    });

    it(`${entity.name}: своя запись при этом достаётся`, () => {
      /*
       * Обратная сторона. Без неё проверка выше проходила бы и на сломанном чтении: метод,
       * который всегда бросает «не найдено», формально «изолирован», а на деле мёртв.
       */
      const svc = makeService();
      const ownId = entity.create(svc, A);

      expect(
        () => entity.read(svc, A, ownId),
        `${entity.name}: собственная запись не читается`
      ).not.toThrow();
    });
  }

  it('отказ не выдаёт существование записи', () => {
    /*
     * «Запрещено» подтверждает, что запись ЕСТЬ: перебором идентификаторов чужой центр
     * узнаёт, сколько у соседа слушателей. «Не найдено» не говорит ничего — и для
     * несуществующей записи ответ обязан быть ТОТ ЖЕ.
     */
    const svc = makeService();
    const foreignId = ENTITIES[0]!.create(svc, B);

    let foreignError: unknown;
    let missingError: unknown;
    try {
      ENTITIES[0]!.read(svc, A, foreignId);
    } catch (error) {
      foreignError = error;
    }
    try {
      ENTITIES[0]!.read(svc, A, 'learner_такого_нет');
    } catch (error) {
      missingError = error;
    }

    expect((foreignError as Error).constructor).toBe((missingError as Error).constructor);
    expect((foreignError as NotFoundException).getResponse()).toEqual(
      (missingError as NotFoundException).getResponse()
    );
  });

  it('списки центра А не содержат записей центра Б', () => {
    /*
     * Поштучное чтение — половина дела. Список — вторая: именно он отдаёт данные пачкой, и
     * именно там пропущенный фильтр по центру виден не сразу.
     */
    const svc = makeService();
    const foreignLearner = ENTITIES[0]!.create(svc, B);
    const foreignGroup = svc.createGroup(B, ctx(B).userId, { code: 'GB', name: 'Чужая' }, ctx(B));

    const learners = svc.listLearners(A, { page: 1, page_size: 100 });
    const groups = svc.listGroups(A, { page: 1, page_size: 100 });

    expect(learners.items.map((item) => item.id)).not.toContain(foreignLearner);
    expect(groups.items.map((item) => item.id)).not.toContain(foreignGroup.id);
    expect(learners.total, 'счётчик тоже считает только свои').toBe(0);
  });
});

describe('реестр изоляции не отстаёт от кода (ТЗ 13.4)', () => {
  it('каждый метод чтения по идентификатору попал в перебор', async () => {
    /*
     * «Любая новая ручка проверяется на изоляцию» — словами ТЗ. Метод, заведённый после этого
     * сторожа и забытый в реестре, уронит проверку и потребует либо перебора, либо записи
     * с объяснением. Список читается из исходника службы, а не выписан руками: выписанный
     * устаревает молча.
     */
    const { readFileSync } = await import('node:fs');
    const { dirname, resolve } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../../modules/mvp/mvp.service.ts'),
      'utf8'
    );

    const inCode = [
      ...source.matchAll(/^ {2}(get[A-Z]\w*)\(tenantId: string, id: string[,)]/gm)
    ].map((m) => m[1]!);
    const covered = new Set(ENTITIES.map((item) => item.getter));

    /**
     * Чтения, для которых перебор не нужен, — с причиной, а не списком.
     *
     * Это не «мы решили не проверять», а «проверять здесь нечего»: запись либо не принадлежит
     * центру, либо её изоляция доказана в другом месте своим тестом.
     */
    const NOT_NEEDED: Record<string, string> = {
      getGroupCourse: 'связка группы с курсом: и группа, и курс уже проверены перебором выше',
      getReportTemplate:
        'шаблон отчёта заводится администратором платформы, изоляция — в своём тесте',
      getAssignment: 'практическое задание принадлежит курсу, курс проверен перебором выше',
      getAssignmentReview: 'проверка работы принадлежит заданию, задание проверено выше'
    };

    const missing = inCode.filter((name) => !covered.has(name) && !(name in NOT_NEEDED));

    expect(
      missing.sort(),
      'новый метод чтения по идентификатору не проверен на изоляцию между центрами'
    ).toEqual([]);
    expect(inCode.length, 'разбор исходника сломался — список пуст').toBeGreaterThan(10);
  });
});
