import { Injectable } from '@nestjs/common';

import { MVP_COLLECTIONS } from './mvp-collections.js';

import type { BulkImportIdempotencyRecord } from '../learners-bulk-import.types.js';
import type {
  AnswerOption,
  Assignment,
  AssignmentReview,
  AssignmentSubmission,
  AttemptAnswer,
  BulkEnrollmentIdempotencyRecord,
  CloseGroupChainIdempotencyRecord,
  Commission,
  CommissionMember,
  Counterparty,
  Course,
  CourseDocumentSetEntry,
  CourseModuleEntity,
  CourseProgress,
  CourseVersion,
  Direction,
  EisotTestingBatch,
  EisotTestingRecord,
  Enrollment,
  EnrollmentStatusHistory,
  ExamResult,
  FrdoRegistryBatch,
  FrdoRegistryRecord,
  GroupCourse,
  GroupEntity,
  IdentityVerification,
  Learner,
  Material,
  MaterialProgress,
  ModuleProgress,
  NmoBatch,
  NmoRecord,
  NotificationStaffRecipient,
  OtRegistryBatch,
  OtRegistryRecord,
  PreExamToken,
  ProctoringRecording,
  PushSubscription,
  Question,
  QuestionBank,
  ReportTemplate,
  RostechnadzorBatch,
  RostechnadzorRecord,
  ScormAttempt,
  ScormPackage,
  TestAttempt,
  TestEntity,
  TestQuestion
} from '../mvp.types.js';

/** Коллекции, которые проецируются в нормализованные таблицы при сохранении (Фаза 1, срез 1). */
export const PROJECTED_COLLECTIONS = ['counterparties', 'groups'] as const;
export type ProjectedCollection = (typeof PROJECTED_COLLECTIONS)[number];
export type ChangedEntities = { upserted: unknown[]; deletedIds: string[] } | 'all';

@Injectable()
export class InMemoryMvpState {
  /**
   * ЛЕНИВАЯ РАСКЛАДКА КОЛЛЕКЦИЙ (§12.1, 2026-08-09).
   *
   * ЗАЧЕМ. Состояние центра читается из базы одним запросом — это дёшево (3 мс). Дорого
   * другое: разложить полторы тысячи записей по полусотне коллекций, расшифровав по пути
   * ПДн всех слушателей. И платил за это КАЖДЫЙ запрос, хотя обычный показ списка трогает
   * одну-две коллекции: списку слушателей не нужны ни история статусов зачислений, ни
   * кэши идемпотентности, ни сорок остальных коллекций.
   *
   * ЧТО ДЕЛАЕМ. Сырые строки кладутся как есть, а раскладываются по первому обращению —
   * и только те, к которым обратились. Сервисы при этом не меняются ни строчкой: они как
   * читали `state.learners`, так и читают.
   *
   * Ссылка на массив стабильна: `push`/`splice` из сервисов работают как раньше.
   */
  private readonly rawByCollection = new Map<string, unknown[]>();

  private readonly materialized = new Map<string, unknown[]>();

  /**
   * Отпечаток коллекции на момент раскладки. По нему в конце запроса видно, менялась ли
   * она: нетронутая коллекция измениться не могла в принципе, а тронутая сравнивается
   * только сама с собой — вместо хеширования всего состояния целиком.
   */
  private readonly fingerprintAtLoad = new Map<string, string>();

  /**
   * Поштучные отпечатки проецируемых коллекций (Фаза 1 перехода с CDOPROF, срез 1a):
   * `id → JSON` на момент раскладки. По ним сохранение узнаёт, КАКИЕ сущности изменились,
   * чтобы записать в нормализованную таблицу только их, а не 25 000 групп целиком.
   * Отпечаток коллекции собирается из тех же частей — байт-в-байт равен `JSON.stringify`.
   */
  private readonly entityFingerprintAtLoad = new Map<string, Map<string, string>>();

  /**
   * Коллекции, которые надо переписать, даже если их содержимое в памяти не менялось.
   *
   * Единственный такой случай — старые строки с незашифрованными ПДн: они приходят из базы
   * «как есть», в памяти выглядят точно так же и потому по отпечатку считались бы
   * неизменными. Перешифровать их нужно, иначе ПДн так и останутся открытыми навсегда.
   */
  private readonly forcedDirty = new Set<string>();

  /** Как превратить сырые строки в записи коллекции (для слушателей — расшифровка ПДн). */
  private materializer: ((collection: string, raw: unknown[]) => unknown[]) | null = null;

  constructor() {
    for (const collection of MVP_COLLECTIONS) {
      Object.defineProperty(this, collection, {
        enumerable: true,
        configurable: true,
        get: () => this.readCollection(collection),
        set: (value: unknown[]) => {
          this.materialized.set(collection, value);
          this.fingerprintAtLoad.delete(collection);
          this.entityFingerprintAtLoad.delete(collection);
        }
      });
    }
  }

  private readCollection(collection: string): unknown[] {
    const existing = this.materialized.get(collection);
    if (existing) {
      return existing;
    }
    const raw = this.rawByCollection.get(collection) ?? [];
    const items = this.materializer ? this.materializer(collection, raw) : [...raw];
    this.materialized.set(collection, items);
    // Отпечаток снимаем СРАЗУ после раскладки — до того, как сервис успеет что-то поменять.
    if ((PROJECTED_COLLECTIONS as ReadonlyArray<string>).includes(collection)) {
      const byId = new Map<string, string>();
      const parts = items.map((item) => {
        const part = JSON.stringify(item);
        const id = (item as { id?: unknown } | null)?.id;
        if (typeof id === 'string') byId.set(id, part);
        return part;
      });
      this.entityFingerprintAtLoad.set(collection, byId);
      this.fingerprintAtLoad.set(collection, `[${parts.join(',')}]`);
    } else {
      this.fingerprintAtLoad.set(collection, JSON.stringify(items));
    }
    return items;
  }

  /**
   * Часовой пояс центра (журнал 301). По нему считаются КАЛЕНДАРНЫЕ даты, которые видит
   * человек: «сегодня» дневного лимита попыток, сроки, напоминания. `undefined` — пояс
   * не спрашивали (тесты, память): берётся значение по умолчанию.
   */
  tenantTimezone: string | undefined = undefined;

  /**
   * Версия снимка на момент чтения (журнал 272/292). Запись сверяет её и увеличивает:
   * если версия успела уйти вперёд, значит снимок поменял кто-то ещё — писать поверх нельзя.
   * `undefined` — состояние собрано в памяти и из базы не читалось (тесты, memory-драйвер).
   */
  stateVersionAtLoad: number | undefined = undefined;

  /** Загрузка кладёт сюда сырые строки; раскладка произойдёт по первому обращению. */
  setRawSnapshot(
    raw: Map<string, unknown[]>,
    materializer: (collection: string, rawItems: unknown[]) => unknown[]
  ): void {
    this.rawByCollection.clear();
    this.materialized.clear();
    this.fingerprintAtLoad.clear();
    this.entityFingerprintAtLoad.clear();
    this.forcedDirty.clear();
    for (const [collection, items] of raw) {
      this.rawByCollection.set(collection, items);
    }
    this.materializer = materializer;
  }

  /** Пометить коллекцию как требующую записи независимо от отпечатка. */
  markDirty(collection: string): void {
    this.forcedDirty.add(collection);
  }

  /** Коллекции, к которым запрос обращался. Остальные заведомо не менялись. */
  touchedCollections(): string[] {
    return [...this.materialized.keys()];
  }

  /**
   * Менялась ли коллекция с момента раскладки. Нетронутая — «нет» без всякой проверки:
   * до неё просто не дошли руки, и в базе она осталась прежней.
   */
  hasChanged(collection: string): boolean {
    if (this.forcedDirty.has(collection)) {
      return true;
    }
    const items = this.materialized.get(collection);
    if (!items) {
      return false;
    }
    const before = this.fingerprintAtLoad.get(collection);
    if (before === undefined) {
      // Коллекцию присвоили целиком (`state.x = [...]`) — считаем изменённой.
      return true;
    }
    return JSON.stringify(items) !== before;
  }

  /**
   * Что именно изменилось в проецируемой коллекции с момента раскладки.
   * `'all'` — поштучно сказать нельзя: коллекцию присвоили целиком или пометили `markDirty`;
   * тогда проекция делает полный upsert и удаляет из таблицы то, чего нет в снимке.
   * Нетронутая коллекция — пусто.
   */
  changedEntities(collection: ProjectedCollection): ChangedEntities {
    const items = this.materialized.get(collection);
    if (!items) return { upserted: [], deletedIds: [] };
    const before = this.entityFingerprintAtLoad.get(collection);
    if (this.forcedDirty.has(collection) || !before) return 'all';
    const upserted: unknown[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      const id = (item as { id?: unknown } | null)?.id;
      if (typeof id !== 'string') continue;
      seen.add(id);
      if (before.get(id) !== JSON.stringify(item)) upserted.push(item);
    }
    const deletedIds = [...before.keys()].filter((id) => !seen.has(id));
    return { upserted, deletedIds };
  }

  counterparties: Counterparty[] = [];
  learners: Learner[] = [];
  directions: Direction[] = [];
  courses: Course[] = [];
  courseVersions: CourseVersion[] = [];
  modules: CourseModuleEntity[] = [];
  materials: Material[] = [];
  groups: GroupEntity[] = [];
  groupCourses: GroupCourse[] = [];
  enrollments: Enrollment[] = [];
  enrollmentStatusHistory: EnrollmentStatusHistory[] = [];
  materialProgress: MaterialProgress[] = [];
  moduleProgress: ModuleProgress[] = [];
  courseProgress: CourseProgress[] = [];
  questionBanks: QuestionBank[] = [];
  questions: Question[] = [];
  answerOptions: AnswerOption[] = [];
  tests: TestEntity[] = [];
  testQuestions: TestQuestion[] = [];
  attempts: TestAttempt[] = [];
  attemptAnswers: AttemptAnswer[] = [];
  examResults: ExamResult[] = [];
  assignments: Assignment[] = [];
  assignmentSubmissions: AssignmentSubmission[] = [];
  assignmentReviews: AssignmentReview[] = [];
  /** Upserted записи идемпотентности массовых назначений (персистятся в MVP snapshot). */
  bulkEnrollmentIdempotency: BulkEnrollmentIdempotencyRecord[] = [];
  /** Phase 2 Plan A — idempotency для bulk-import учеников из Excel. */
  bulkImportIdempotency: BulkImportIdempotencyRecord[] = [];
  /** ФТ-E3 (Фаза 5 Task 7) — idempotency цепочки «экзамен → протокол → реестр». */
  closeGroupChainIdempotency: CloseGroupChainIdempotencyRecord[] = [];
  // Pillar A — Plan A collections (§5.2, §5.3)
  commissions: Commission[] = [];
  commissionMembers: CommissionMember[] = [];
  courseDocumentSets: CourseDocumentSetEntry[] = [];
  // Wave 1 Plan 2 — pre-exam identity tokens (Приказ №816); a consumed token is the verification record.
  preExamTokens: PreExamToken[] = [];
  // Phase 4 Plan A — documentary identity verification (selfie+passport); per-learner records.
  identityVerifications: IdentityVerification[] = [];
  // Phase 4 Plan B — proctoring recording sessions (webcam video of final exams).
  proctoringRecordings: ProctoringRecording[] = [];
  // Wave 2 — ОТ-реестр (Минтруд/ЕИСОТ): durable export batches + per-record set.
  otRegistryBatches: OtRegistryBatch[] = [];
  otRegistryRecords: OtRegistryRecord[] = [];
  frdoRegistryBatches: FrdoRegistryBatch[] = [];
  frdoRegistryRecords: FrdoRegistryRecord[] = [];
  // Wave 2 sub-goal C — ЕИСОТ «лица на тестирование»: durable roster batches + per-record set.
  eisotTestingBatches: EisotTestingBatch[] = [];
  eisotTestingRecords: EisotTestingRecord[] = [];
  // Phase 6 — Ростехнадзор (промышленная безопасность): durable export batches + records.
  rostechnadzorRegistryBatches: RostechnadzorBatch[] = [];
  rostechnadzorRegistryRecords: RostechnadzorRecord[] = [];
  // Phase 6 — Минздрав-НМО (НМО, ЗЕТ): durable export batches + records.
  nmoRegistryBatches: NmoBatch[] = [];
  nmoRegistryRecords: NmoRecord[] = [];
  // Phase 9 Plan A — SCORM: пакеты + cmi-прогресс учеников.
  scormPackages: ScormPackage[] = [];
  scormAttempts: ScormAttempt[] = [];
  // Phase 10 Track A — saved Excel report builder templates (tenant-level).
  reportTemplates: ReportTemplate[] = [];
  // Phase 10 Track C — web-push подписки браузеров пользователей.
  pushSubscriptions: PushSubscription[] = [];
  // Phase 5C-2 — per-tenant email сотрудников для дублирования staff-уведомлений (opt-in).
  notificationStaffRecipients: NotificationStaffRecipient[] = [];
}
