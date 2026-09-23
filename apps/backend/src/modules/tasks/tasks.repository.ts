import type {
  StaffMember,
  Task,
  TaskActor,
  TaskComment,
  TaskListPage,
  TaskListQuery
} from './tasks.types.js';

export const TASKS_REPOSITORY = Symbol('TASKS_REPOSITORY');

/**
 * Шов хранения задач (ТЗ перехода с CDOPROF, МГ-G2; Часть VI п. 5).
 *
 * Первый модуль, который пишет СРАЗУ в нормализованные таблицы (`tasks.*`, миграция 0101)
 * через репозиторий, минуя JSON-снимок центра, — тот же приём, что у лицензий
 * (`org.training_licenses`) и черновиков переаттестации, и образец для Фазы 1. Реализации:
 * Postgres для приложения, in-memory для тестов сервиса и HTTP-границы.
 *
 * Отбор «свои / все» делает репозиторий, а не сервис после выборки: на объёме CDOPROF
 * (тысячи задач) страницу обязана резать база, а не память.
 */
export interface TasksRepository {
  list(tenantId: string, actor: TaskActor, query: TaskListQuery): Promise<TaskListPage>;
  getById(tenantId: string, id: string): Promise<Task | null>;
  /** Задача + исполнители + файлы — одной транзакцией. */
  insert(task: Task): Promise<Task>;
  /** Поля задачи + полная замена исполнителей и файлов — одной транзакцией. */
  update(task: Task): Promise<Task>;
  listComments(tenantId: string, taskId: string): Promise<TaskComment[]>;
  getComment(tenantId: string, taskId: string, commentId: string): Promise<TaskComment | null>;
  insertComment(comment: TaskComment): Promise<TaskComment>;
  deleteComment(tenantId: string, taskId: string, commentId: string): Promise<void>;
  /** Из переданных — те, кто существует в центре как активный сотрудник (§4: «исполнитель — сотрудник тенанта»). */
  findStaffUserIds(tenantId: string, userIds: string[]): Promise<string[]>;
  /** Из переданных — файлы, существующие в хранилище центра. */
  findExistingFileIds(tenantId: string, fileIds: string[]): Promise<string[]>;
  /**
   * Сотрудники центра по части ФИО — для выбора исполнителя. `GET /users` закрыт правом
   * администратора, а куратор и преподаватель ставят задачи друг другу без него.
   */
  searchStaff(tenantId: string, q: string, limit: number): Promise<StaffMember[]>;
}
