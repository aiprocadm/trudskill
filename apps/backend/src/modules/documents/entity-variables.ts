/**
 * Resolver'ы категорий `tenant.*`, `counterparty.*`, `group.*`, `course.*`, `learner.*`
 * (ФТ-A2.3, Фаза 1 Task 4) — пять категорий каталога, которых не хватало рядом с
 * `program`/`commission`/`enrollment`/`document`/`group_learners` из `pillar-a-variables.ts`.
 *
 * Контракт тот же: pure functions, caller передаёт снимки, на выходе плоский словарь
 * `{ 'learner.full_name': 'Иванов Иван Иванович' }`. Неизвестный ключ и ключ вне
 * namespace → пустая строка (бланк не должен падать из-за незаполненного поля).
 */
import { formatRussianDateWords } from './date-words.js';
import { tenantImageFileId } from '../tenant/tenant-document-images.js';

import type { Counterparty, Course, GroupEntity, Learner } from '../mvp/mvp.types.js';
import type { TrainingLicense } from '../org/licenses.types.js';
import type { Tenant, TenantRequisites } from '../tenant/tenant.types.js';

/** Сборка резолвера: одинаковый обход имён для всех категорий. */
function resolveNamespace(
  namespace: string,
  varNames: string[],
  resolveKey: (key: string) => unknown
): Record<string, unknown> {
  const prefix = `${namespace}.`;
  const result: Record<string, unknown> = {};
  for (const fullName of varNames) {
    if (!fullName.startsWith(prefix)) {
      result[fullName] = '';
      continue;
    }
    result[fullName] = resolveKey(fullName.slice(prefix.length));
  }
  return result;
}

// ---------------------------------------------------------------------------
// tenant.* — учебный центр: имя, реквизиты, лицензия и аккредитация
// ---------------------------------------------------------------------------

export interface TenantVariableContext {
  tenant: Tenant;
  requisites?: TenantRequisites;
  /**
   * Лицензии/аккредитации центра (`org.training_licenses`). Номер лицензии — НЕ поле
   * тенанта: берём активную запись нужного типа, поэтому резолвер принимает список.
   */
  licenses?: TrainingLicense[];
}

/** Активная лицензия заданного типа; при нескольких — самая свежая по дате выдачи. */
function activeLicense(
  licenses: TrainingLicense[] | undefined,
  licenseType: TrainingLicense['licenseType']
): TrainingLicense | undefined {
  return (licenses ?? [])
    .filter((item) => item.licenseType === licenseType && item.status === 'active')
    .sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1))[0];
}

export function resolveTenantVariables(
  ctx: TenantVariableContext,
  varNames: string[]
): Record<string, unknown> {
  const license = activeLicense(ctx.licenses, 'education_license');
  const accreditation = activeLicense(ctx.licenses, 'accreditation');

  return resolveNamespace('tenant', varNames, (key) => {
    switch (key) {
      case 'name':
        return ctx.tenant.name ?? '';
      case 'code':
        return ctx.tenant.code ?? '';
      case 'legal_name':
        return ctx.requisites?.legalName ?? '';
      case 'tax_number':
        return ctx.requisites?.taxNumber ?? '';
      case 'license_number':
        return license?.licenseNumber ?? '';
      case 'license_issuer':
        return license?.issuerName ?? '';
      case 'license_issued_at':
        return license?.issuedAt ?? '';
      case 'license_issued_at_words':
        return formatRussianDateWords(license?.issuedAt);
      case 'accreditation_number':
        return accreditation?.licenseNumber ?? '';
      case 'accreditation_issuer':
        return accreditation?.issuerName ?? '';
      // ФТ-A7.1: значение переменной-картинки — fileId; сам файл подставляет конвейер
      // рендера. Не загружено — пусто, и бланк печатается без подписи/печати.
      case 'signature_image':
        return tenantImageFileId(ctx.requisites, 'signature');
      case 'stamp_image':
        return tenantImageFileId(ctx.requisites, 'stamp');
      default:
        return '';
    }
  });
}

// ---------------------------------------------------------------------------
// learner.* — слушатель
// ---------------------------------------------------------------------------

export interface LearnerVariableContext {
  learner: Learner;
}

/** «Иванов И. И.» — форма для протоколов и публичной проверки (ФТ-A6.1). */
export function formatLearnerInitials(learner: Learner): string {
  const initials = [learner.firstName, learner.middleName]
    .filter((part): part is string => Boolean(part && part.trim()))
    .map((part) => `${part.trim()[0]!.toUpperCase()}.`)
    .join(' ');
  const lastName = learner.lastName?.trim() ?? '';
  if (!lastName) return initials;
  return initials ? `${lastName} ${initials}` : lastName;
}

export function resolveLearnerVariables(
  ctx: LearnerVariableContext,
  varNames: string[]
): Record<string, unknown> {
  const l = ctx.learner;
  return resolveNamespace('learner', varNames, (key) => {
    switch (key) {
      case 'full_name':
        return [l.lastName, l.firstName, l.middleName]
          .filter((part) => Boolean(part && part.trim()))
          .join(' ');
      case 'last_name':
        return l.lastName ?? '';
      case 'first_name':
        return l.firstName ?? '';
      case 'middle_name':
        return l.middleName ?? '';
      case 'initials':
        return formatLearnerInitials(l);
      case 'snils':
        return l.snils ?? '';
      case 'position':
        return l.position ?? '';
      case 'birth_date':
        return l.dateOfBirth ?? '';
      case 'birth_date_words':
        return formatRussianDateWords(l.dateOfBirth);
      case 'email':
        return l.email ?? '';
      case 'learner_no':
        return l.learnerNo ?? '';
      default:
        return '';
    }
  });
}

// ---------------------------------------------------------------------------
// counterparty.* — заказчик обучения (организация слушателя)
// ---------------------------------------------------------------------------

export interface CounterpartyVariableContext {
  counterparty?: Counterparty;
}

export function resolveCounterpartyVariables(
  ctx: CounterpartyVariableContext,
  varNames: string[]
): Record<string, unknown> {
  const c = ctx.counterparty;
  return resolveNamespace('counterparty', varNames, (key) => {
    switch (key) {
      case 'name':
        return c?.name ?? '';
      case 'legal_name':
        return c?.legalName ?? '';
      case 'code':
        return c?.code ?? '';
      case 'inn':
        return c?.inn ?? '';
      case 'kpp':
        return c?.kpp ?? '';
      case 'legal_address':
        return c?.legalAddress ?? '';
      case 'contact_email':
        return c?.contactEmail ?? '';
      case 'contact_phone':
        return c?.contactPhone ?? '';
      default:
        return '';
    }
  });
}

// ---------------------------------------------------------------------------
// group.* — учебная группа
// ---------------------------------------------------------------------------

export interface GroupVariableContext {
  group?: GroupEntity;
  /** Имя заказчика группы — для шапки протокола, без второго запроса из шаблона. */
  counterparty?: Counterparty;
}

export function resolveGroupVariables(
  ctx: GroupVariableContext,
  varNames: string[]
): Record<string, unknown> {
  return resolveNamespace('group', varNames, (key) => {
    switch (key) {
      case 'code':
        return ctx.group?.code ?? '';
      case 'name':
        return ctx.group?.name ?? '';
      case 'counterparty_name':
        return ctx.counterparty?.name ?? '';
      default:
        return '';
    }
  });
}

// ---------------------------------------------------------------------------
// course.* — программа обучения (карточка курса; часы/вид — в `program.*`)
// ---------------------------------------------------------------------------

export interface CourseVariableContext {
  course?: Course;
}

export function resolveCourseVariables(
  ctx: CourseVariableContext,
  varNames: string[]
): Record<string, unknown> {
  return resolveNamespace('course', varNames, (key) => {
    switch (key) {
      case 'code':
        return ctx.course?.code ?? '';
      case 'title':
        return ctx.course?.title ?? '';
      case 'description':
        return ctx.course?.description ?? '';
      default:
        return '';
    }
  });
}
