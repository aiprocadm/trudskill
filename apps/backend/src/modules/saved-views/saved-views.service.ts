import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';

import {
  SAVED_VIEWS_REPOSITORY,
  SAVED_VIEW_ENTITIES,
  type SavedViewEntity,
  type SavedViewRecord,
  type SavedViewScope,
  type SavedViewsRepository
} from './saved-views.repository.js';
import { AuditService } from '../audit/audit.service.js';

import type { RequestContext } from '../../common/context/request-context.js';

/** Что отдаём экрану: без владельца-идентификатора, с признаком «своё/общее». */
export interface SavedViewDto {
  id: string;
  entity: string;
  name: string;
  scope: SavedViewScope;
  filters: Record<string, string>;
  columns: string[];
  sort?: string;
  /** Своё представление можно удалить; общее — только тому, кто вправе менять настройки центра. */
  own: boolean;
}

export interface CreateSavedViewInput {
  entity: string;
  name: string;
  filters: Record<string, string>;
  columns?: string[];
  sort?: string;
}

/** Представлений на человека и реестр — не бесконечно: список отборов должен оставаться списком. */
export const SAVED_VIEWS_PER_USER_MAX = 30;

const isEntity = (value: string): value is SavedViewEntity =>
  (SAVED_VIEW_ENTITIES as ReadonlyArray<string>).includes(value);

const toDto = (record: SavedViewRecord, userId: string): SavedViewDto => ({
  id: record.id,
  entity: record.entity,
  name: record.name,
  scope: record.scope,
  filters: record.filters,
  columns: record.columns,
  ...(record.sort ? { sort: record.sort } : {}),
  own: record.ownerUserId === userId
});

/**
 * Сохранённые представления (МГ-H4.1, срез 11.3): своё — владельцу, общее — всему центру.
 * Значения фильтров — строки, как в адресе экрана; чужие ключи не проверяются: реестр сам
 * возьмёт те, что знает (РМ107).
 */
@Injectable()
export class SavedViewsService {
  constructor(
    @Inject(SAVED_VIEWS_REPOSITORY) private readonly repo: SavedViewsRepository,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async list(tenantId: string, entity: string, userId: string): Promise<SavedViewDto[]> {
    this.assertEntity(entity);
    const rows = await this.repo.listFor(tenantId, entity, userId);
    return rows.map((row) => toDto(row, userId));
  }

  async create(
    tenantId: string,
    userId: string,
    input: CreateSavedViewInput,
    scope: SavedViewScope,
    ctx: RequestContext
  ): Promise<SavedViewDto> {
    this.assertEntity(input.entity);
    const name = input.name.trim();
    if (!name) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'Назовите представление — так оно будет подписано в списке отборов.'
      });
    }
    const own = (await this.repo.listFor(tenantId, input.entity, userId)).filter(
      (row) => row.ownerUserId === userId
    );
    if (own.length >= SAVED_VIEWS_PER_USER_MAX) {
      throw new BadRequestException({
        code: 'saved_views_limit_reached',
        message: `Представлений не больше ${SAVED_VIEWS_PER_USER_MAX} на реестр. Удалите ненужное, чтобы сохранить новое.`
      });
    }
    const record = await this.repo.insert({
      tenantId,
      ownerUserId: userId,
      entity: input.entity,
      name,
      scope,
      filters: cleanFilters(input.filters),
      columns: (input.columns ?? []).map(String).slice(0, 50),
      ...(input.sort ? { sort: input.sort } : {})
    });
    this.audit.write({
      tenantId,
      actorId: userId,
      action: 'reports.saved_view_created',
      entityType: 'reports.saved_view',
      entityId: record.id,
      newValues: { entity: record.entity, name: record.name, scope: record.scope },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return toDto(record, userId);
  }

  /** Удалить своё может каждый; общее — только тот, кто вправе менять настройки центра (`canManageShared`). */
  async remove(
    tenantId: string,
    userId: string,
    id: string,
    canManageShared: boolean,
    ctx: RequestContext
  ): Promise<void> {
    const record = await this.repo.get(tenantId, id);
    if (!record) {
      throw new NotFoundException({ code: 'not_found', message: 'Представление не найдено' });
    }
    if (record.ownerUserId !== userId && !(record.scope === 'tenant' && canManageShared)) {
      throw new ForbiddenException({
        code: 'saved_view_not_own',
        message: 'Удалить можно только своё представление; общее удаляет администратор центра.'
      });
    }
    await this.repo.remove(tenantId, id);
    this.audit.write({
      tenantId,
      actorId: userId,
      action: 'reports.saved_view_deleted',
      entityType: 'reports.saved_view',
      entityId: id,
      oldValues: { entity: record.entity, name: record.name, scope: record.scope },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
  }

  private assertEntity(entity: string): void {
    if (!isEntity(entity)) {
      throw new BadRequestException({
        code: 'validation_error',
        message: `Реестр «${entity}» не знает представлений.`
      });
    }
  }
}

/** Только строковые значения, ключи — до 40 знаков, пустые строки отбрасываются. */
const cleanFilters = (raw: Record<string, unknown>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (typeof value !== 'string' || !value.trim() || key.length > 40) continue;
    out[key] = value.trim().slice(0, 200);
  }
  return out;
};
