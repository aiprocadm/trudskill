import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it } from 'vitest';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import {
  LearnersBulkImportService,
  classifyRows,
  isValidSnilsChecksum,
  normalizeSnils,
  parseFullName
} from './learners-bulk-import.service.js';
import { MvpService } from './mvp.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../audit/audit.service.js';

import type { BulkImportRow, ExistingLearnersSnapshot } from './learners-bulk-import.types.js';
import type { RequestContext } from '../../common/context/request-context.js';
import type { DocumentsService } from '../documents/documents.service.js';
import type { FilesService } from '../files/files.service.js';

const emptySnapshot: ExistingLearnersSnapshot = { learners: [] };

const noopDocumentsService = {
  listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 })
} as unknown as DocumentsService;

const noopFilesService = {
  ensureMaterialLink: async () => undefined
} as unknown as FilesService;

const ctx: RequestContext = {
  requestId: 'req_1',
  correlationId: 'corr_1',
  tenantId: 'tenant_demo',
  userId: 'u_admin',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

function makeServices(): { mvp: MvpService; bulk: LearnersBulkImportService } {
  const mvp = new MvpService(
    new InMemoryMvpState(),
    new TenantScopedRepository(),
    new AuditService(),
    noopDocumentsService,
    noopFilesService,
    new EventEmitter2()
  );
  const bulk = new LearnersBulkImportService(mvp);
  return { mvp, bulk };
}

const validRow = (over: Partial<BulkImportRow> = {}): BulkImportRow => ({
  rowNumber: 2,
  fullName: 'Иванов Иван Иванович',
  email: 'ivanov@example.ru',
  ...over
});

describe('isValidSnilsChecksum', () => {
  it('принимает sum < 100 (все 1: sum=45, checksum=45)', () => {
    expect(isValidSnilsChecksum('11111111145')).toBe(true);
  });

  it('принимает sum > 101 (digits 112345678: sum=129, mod=28)', () => {
    expect(isValidSnilsChecksum('11234567828')).toBe(true);
  });

  it('принимает sum == 101 → checksum 00', () => {
    // digits [4,5,1,1,1,1,1,0,0]: 36+40+7+6+5+4+3+0+0 = 101
    expect(isValidSnilsChecksum('45111110000')).toBe(true);
  });

  it('принимает sum > 101 с mod=0 → checksum 00', () => {
    // digits [9,9,3,2,1,1,1,1,2]: 81+72+21+12+5+4+3+2+2 = 202
    expect(isValidSnilsChecksum('99321111200')).toBe(true);
  });

  it('отклоняет невалидную чексумму', () => {
    expect(isValidSnilsChecksum('11111111199')).toBe(false);
  });

  it('отклоняет не 11 цифр', () => {
    expect(isValidSnilsChecksum('123')).toBe(false);
    expect(isValidSnilsChecksum('123456789012')).toBe(false);
  });

  it('отклоняет нецифровые символы (после нормализации не должно происходить, но guard есть)', () => {
    expect(isValidSnilsChecksum('1111111114a')).toBe(false);
  });
});

describe('normalizeSnils', () => {
  it('удаляет дефисы и пробелы', () => {
    expect(normalizeSnils('111-111-111 45')).toBe('11111111145');
  });

  it('возвращает as-is если уже только цифры', () => {
    expect(normalizeSnils('11111111145')).toBe('11111111145');
  });
});

describe('parseFullName', () => {
  it('Фамилия Имя Отчество → all three', () => {
    expect(parseFullName('Иванов Иван Иванович')).toEqual({
      lastName: 'Иванов',
      firstName: 'Иван',
      middleName: 'Иванович'
    });
  });

  it('Фамилия Имя → без middleName', () => {
    expect(parseFullName('Петрова Анна')).toEqual({
      lastName: 'Петрова',
      firstName: 'Анна'
    });
  });

  it('одно слово → lastName пусто, firstName = слово', () => {
    expect(parseFullName('Сидоров')).toEqual({ lastName: '', firstName: 'Сидоров' });
  });

  it('обрезает пробелы по краям', () => {
    expect(parseFullName('  Иванов  Иван  ')).toEqual({
      lastName: 'Иванов',
      firstName: 'Иван'
    });
  });
});

describe('classifyRows', () => {
  it('3 валидных строки без существующих → all create', () => {
    const rows: BulkImportRow[] = [
      validRow({ rowNumber: 2, email: 'a@x.ru' }),
      validRow({ rowNumber: 3, fullName: 'Петрова Анна', email: 'b@x.ru' }),
      validRow({ rowNumber: 4, fullName: 'Сидоров Иван', email: 'c@x.ru' })
    ];
    const result = classifyRows(rows, emptySnapshot);
    expect(result).toHaveLength(3);
    expect(result.every((r) => r.classification === 'create')).toBe(true);
    expect(result.every((r) => r.errors.length === 0)).toBe(true);
  });

  it('ФИО из одного слова → invalid', () => {
    const result = classifyRows([validRow({ fullName: 'Иванов' })], emptySnapshot);
    expect(result[0]!.classification).toBe('invalid');
    expect(result[0]!.errors.some((e) => e.field === 'fullName')).toBe(true);
  });

  it('ФИО с цифрой → invalid', () => {
    const result = classifyRows([validRow({ fullName: 'Иванов Иван1' })], emptySnapshot);
    expect(result[0]!.classification).toBe('invalid');
    expect(result[0]!.errors.some((e) => e.field === 'fullName')).toBe(true);
  });

  it('некорректный email → invalid', () => {
    const result = classifyRows([validRow({ email: 'not-an-email' })], emptySnapshot);
    expect(result[0]!.classification).toBe('invalid');
    expect(result[0]!.errors.some((e) => e.field === 'email')).toBe(true);
  });

  it('СНИЛС с невалидной чексуммой → invalid', () => {
    const result = classifyRows([validRow({ snils: '111-111-111 99' })], emptySnapshot);
    expect(result[0]!.classification).toBe('invalid');
    expect(result[0]!.errors.some((e) => e.field === 'snils')).toBe(true);
  });

  it('СНИЛС в формате XXX-XXX-XXX YY принят', () => {
    const result = classifyRows([validRow({ snils: '111-111-111 45' })], emptySnapshot);
    expect(result[0]!.classification).toBe('create');
    expect(result[0]!.errors).toHaveLength(0);
  });

  it('СНИЛС в формате XXXXXXXXXYY принят', () => {
    const result = classifyRows([validRow({ snils: '11111111145' })], emptySnapshot);
    expect(result[0]!.classification).toBe('create');
  });

  it('дубликат email в файле → обе строки invalid', () => {
    const result = classifyRows(
      [
        validRow({ rowNumber: 2, fullName: 'Иванов Иван', email: 'same@x.ru' }),
        validRow({ rowNumber: 3, fullName: 'Петров Пётр', email: 'same@x.ru' })
      ],
      emptySnapshot
    );
    expect(result[0]!.classification).toBe('invalid');
    expect(result[1]!.classification).toBe('invalid');
    expect(result[0]!.errors.some((e) => e.code === 'duplicate_in_file')).toBe(true);
    expect(result[1]!.errors.some((e) => e.code === 'duplicate_in_file')).toBe(true);
  });

  it('дубликат СНИЛС в файле → обе строки invalid', () => {
    const result = classifyRows(
      [
        validRow({ rowNumber: 2, email: 'a@x.ru', snils: '111-111-111 45' }),
        validRow({ rowNumber: 3, fullName: 'Петров Пётр', email: 'b@x.ru', snils: '11111111145' })
      ],
      emptySnapshot
    );
    expect(result[0]!.classification).toBe('invalid');
    expect(result[1]!.classification).toBe('invalid');
    expect(
      result[0]!.errors.some((e) => e.field === 'snils' && e.code === 'duplicate_in_file')
    ).toBe(true);
  });

  it('email совпадает с существующим → reuse', () => {
    const snapshot: ExistingLearnersSnapshot = {
      learners: [{ id: 'learner_1', email: 'EXISTING@example.ru' }]
    };
    const result = classifyRows([validRow({ email: 'existing@example.ru' })], snapshot);
    expect(result[0]!.classification).toBe('reuse');
    expect(result[0]!.reuseLearnerId).toBe('learner_1');
  });

  it('case-insensitive email match для reuse', () => {
    const snapshot: ExistingLearnersSnapshot = {
      learners: [{ id: 'learner_1', email: 'lowercase@x.ru' }]
    };
    const result = classifyRows([validRow({ email: 'LOWERCASE@X.RU' })], snapshot);
    expect(result[0]!.classification).toBe('reuse');
  });

  it('СНИЛС совпадает с существующим → reuse', () => {
    const snapshot: ExistingLearnersSnapshot = {
      learners: [{ id: 'learner_2', snils: '111-111-111 45' }]
    };
    const result = classifyRows([validRow({ email: 'new@x.ru', snils: '11111111145' })], snapshot);
    expect(result[0]!.classification).toBe('reuse');
    expect(result[0]!.reuseLearnerId).toBe('learner_2');
  });

  it('email и СНИЛС указывают на разных учётков → invalid identity_conflict', () => {
    const snapshot: ExistingLearnersSnapshot = {
      learners: [
        { id: 'learner_a', email: 'a@x.ru' },
        { id: 'learner_b', snils: '111-111-111 45' }
      ]
    };
    const result = classifyRows([validRow({ email: 'a@x.ru', snils: '11111111145' })], snapshot);
    expect(result[0]!.classification).toBe('invalid');
    expect(result[0]!.errors.some((e) => e.code === 'identity_conflict')).toBe(true);
  });

  it('email И СНИЛС на одном учётке → reuse (не конфликт)', () => {
    const snapshot: ExistingLearnersSnapshot = {
      learners: [{ id: 'learner_same', email: 'a@x.ru', snils: '111-111-111 45' }]
    };
    const result = classifyRows([validRow({ email: 'a@x.ru', snils: '11111111145' })], snapshot);
    expect(result[0]!.classification).toBe('reuse');
    expect(result[0]!.reuseLearnerId).toBe('learner_same');
  });

  it('пустой массив строк → пустой массив результатов', () => {
    expect(classifyRows([], emptySnapshot)).toEqual([]);
  });
});

describe('LearnersBulkImportService.bulkImportLearners', () => {
  function setupWithGroup() {
    const { mvp, bulk } = makeServices();
    const group = mvp.createGroup('tenant_demo', ctx.userId, { code: 'G1', name: 'Group' }, ctx);
    return { mvp, bulk, group };
  }

  it('3 валидные строки → 3 created + 3 enrollments', () => {
    const { mvp, bulk, group } = setupWithGroup();
    const outcome = bulk.bulkImportLearners(
      'tenant_demo',
      ctx.userId,
      {
        idempotencyKey: 'idem_1',
        groupId: group.id,
        rows: [
          { rowNumber: 2, fullName: 'Иванов Иван', email: 'a@x.ru' },
          { rowNumber: 3, fullName: 'Петрова Анна', email: 'b@x.ru' },
          { rowNumber: 4, fullName: 'Сидоров Пётр', email: 'c@x.ru' }
        ]
      },
      ctx
    );
    expect(outcome.total).toBe(3);
    expect(outcome.created).toBe(3);
    expect(outcome.reused).toBe(0);
    expect(outcome.failed).toBe(0);
    expect(outcome.enrolled).toBe(3);
    expect(outcome.rows.every((r) => r.status === 'created' && r.enrollmentId)).toBe(true);

    expect(mvp.listLearners('tenant_demo', { page: 1, page_size: 100 }).total).toBe(3);
  });

  it('2 валидных + 1 invalid → 2 created + 1 failed', () => {
    const { mvp, bulk, group } = setupWithGroup();
    const outcome = bulk.bulkImportLearners(
      'tenant_demo',
      ctx.userId,
      {
        idempotencyKey: 'idem_2',
        groupId: group.id,
        rows: [
          { rowNumber: 2, fullName: 'Иванов Иван', email: 'a@x.ru' },
          { rowNumber: 3, fullName: 'BadName1', email: 'b@x.ru' },
          { rowNumber: 4, fullName: 'Сидоров Пётр', email: 'c@x.ru' }
        ]
      },
      ctx
    );
    expect(outcome.created).toBe(2);
    expect(outcome.failed).toBe(1);
    expect(outcome.enrolled).toBe(2);
    expect(outcome.rows[1]!.status).toBe('failed');

    expect(mvp.listLearners('tenant_demo', { page: 1, page_size: 100 }).total).toBe(2);
  });

  it('1 reuse + 2 create → 1 reused + 2 created', () => {
    const { mvp, bulk, group } = setupWithGroup();
    const existing = mvp.createLearnerExtended(
      'tenant_demo',
      ctx.userId,
      { firstName: 'Старый', lastName: 'Учётник', email: 'reuse@x.ru' },
      ctx
    );

    const outcome = bulk.bulkImportLearners(
      'tenant_demo',
      ctx.userId,
      {
        idempotencyKey: 'idem_3',
        groupId: group.id,
        rows: [
          { rowNumber: 2, fullName: 'Учётник Старый', email: 'reuse@x.ru' },
          { rowNumber: 3, fullName: 'Иванов Иван', email: 'new1@x.ru' },
          { rowNumber: 4, fullName: 'Петрова Анна', email: 'new2@x.ru' }
        ]
      },
      ctx
    );
    expect(outcome.created).toBe(2);
    expect(outcome.reused).toBe(1);
    expect(outcome.enrolled).toBe(3);
    expect(outcome.rows[0]!.status).toBe('reused');
    expect(outcome.rows[0]!.learnerId).toBe(existing.id);
  });

  it('повторный вызов с тем же idempotencyKey → возвращён тот же outcome', () => {
    const { mvp, bulk, group } = setupWithGroup();
    const request = {
      idempotencyKey: 'idem_idem',
      groupId: group.id,
      rows: [{ rowNumber: 2, fullName: 'Иванов Иван', email: 'a@x.ru' }]
    };
    const first = bulk.bulkImportLearners('tenant_demo', ctx.userId, request, ctx);
    const second = bulk.bulkImportLearners('tenant_demo', ctx.userId, request, ctx);
    expect(second).toEqual(first);
    expect(mvp.listLearners('tenant_demo', { page: 1, page_size: 100 }).total).toBe(1);
  });

  it('все строки invalid → failed: N, ни одного учётка/зачисления', () => {
    const { mvp, bulk, group } = setupWithGroup();
    const outcome = bulk.bulkImportLearners(
      'tenant_demo',
      ctx.userId,
      {
        idempotencyKey: 'idem_all_bad',
        groupId: group.id,
        rows: [
          { rowNumber: 2, fullName: 'OnlyOne', email: 'a@x.ru' },
          { rowNumber: 3, fullName: 'Иванов Иван', email: 'not-email' }
        ]
      },
      ctx
    );
    expect(outcome.failed).toBe(2);
    expect(outcome.created).toBe(0);
    expect(outcome.enrolled).toBe(0);
    expect(mvp.listLearners('tenant_demo', { page: 1, page_size: 100 }).total).toBe(0);
  });

  it('reuse + уже существующее зачисление → status="enrolled_only"', () => {
    const { mvp, bulk, group } = setupWithGroup();
    const existing = mvp.createLearnerExtended(
      'tenant_demo',
      ctx.userId,
      { firstName: 'Старый', lastName: 'Учётник', email: 'reuse@x.ru' },
      ctx
    );
    mvp.createEnrollment(
      'tenant_demo',
      ctx.userId,
      { groupId: group.id, learnerId: existing.id },
      ctx
    );

    const outcome = bulk.bulkImportLearners(
      'tenant_demo',
      ctx.userId,
      {
        idempotencyKey: 'idem_already_enrolled',
        groupId: group.id,
        rows: [{ rowNumber: 2, fullName: 'Учётник Старый', email: 'reuse@x.ru' }]
      },
      ctx
    );
    expect(outcome.rows[0]!.status).toBe('enrolled_only');
    expect(outcome.rows[0]!.enrollmentId).toBeDefined();
    expect(outcome.enrolled).toBe(0);
    expect(outcome.reused).toBe(1);
  });

  it('tenant-isolation: учёток другого tenant НЕ доступен для reuse', () => {
    const { mvp, bulk, group } = setupWithGroup();
    mvp.createLearnerExtended(
      'tenant_other',
      ctx.userId,
      { firstName: 'Другой', lastName: 'Тенант', email: 'shared@x.ru' },
      ctx
    );
    const outcome = bulk.bulkImportLearners(
      'tenant_demo',
      ctx.userId,
      {
        idempotencyKey: 'idem_isolate',
        groupId: group.id,
        rows: [{ rowNumber: 2, fullName: 'Тенант Другой', email: 'shared@x.ru' }]
      },
      ctx
    );
    expect(outcome.rows[0]!.status).toBe('created');
  });

  it('outcome.rows сохраняет порядок исходных строк по rowNumber', () => {
    const { bulk, group } = setupWithGroup();
    const outcome = bulk.bulkImportLearners(
      'tenant_demo',
      ctx.userId,
      {
        idempotencyKey: 'idem_order',
        groupId: group.id,
        rows: [
          { rowNumber: 5, fullName: 'Пятая Строка', email: '5@x.ru' },
          { rowNumber: 2, fullName: 'Вторая Строка', email: '2@x.ru' },
          { rowNumber: 9, fullName: 'Девятая Строка', email: '9@x.ru' }
        ]
      },
      ctx
    );
    expect(outcome.rows.map((r) => r.rowNumber)).toEqual([5, 2, 9]);
  });
});
