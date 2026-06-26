import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';

import { LICENSES_REPOSITORY } from './licenses.repository.js';
import { AuditService } from '../audit/audit.service.js';

import type { CreateLicenseRequest, UpdateLicenseRequest } from './licenses.dto.js';
import type { LicensesRepository } from './licenses.repository.js';
import type { LicenseStatus, TrainingLicense } from './licenses.types.js';
import type { RequestContext } from '../../common/context/request-context.js';

/**
 * Pillar A Plan C §5.10 — управление образовательными лицензиями.
 *
 * Кросс-tenant изоляция: все методы фильтруют по `tenantId` явно;
 * операторы tenant_A не могут читать/писать лицензии tenant_B.
 *
 * Matching правила для `findActiveLicensesFor`:
 *   - status === 'active'.
 *   - permittedTrainingTypes пустой/undefined === универсальная (matches любой trainingType).
 *   - permittedDirections пустой/undefined === все направления (matches любой directionId).
 */
@Injectable()
export class LicensesService {
  constructor(
    @Inject(LICENSES_REPOSITORY) private readonly repo: LicensesRepository,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  list(tenantId: string, status?: LicenseStatus): Promise<TrainingLicense[]> {
    return this.repo.list(tenantId, status);
  }

  async get(tenantId: string, id: string): Promise<TrainingLicense> {
    const license = await this.repo.getById(tenantId, id);
    if (!license) {
      throw new NotFoundException({ code: 'license_not_found', message: 'Лицензия не найдена' });
    }
    return license;
  }

  async create(
    tenantId: string,
    actorId: string | undefined,
    request: CreateLicenseRequest,
    context: RequestContext
  ): Promise<TrainingLicense> {
    if (request.validUntil && request.validUntil < request.issuedAt) {
      throw new BadRequestException({
        code: 'license_valid_until_before_issued_at',
        message: 'validUntil не может быть раньше issuedAt'
      });
    }
    const duplicate = await this.repo.findByTypeAndNumber(
      tenantId,
      request.licenseType,
      request.licenseNumber
    );
    if (duplicate) {
      throw new ConflictException({
        code: 'license_number_conflict',
        message: 'Лицензия с таким номером и типом уже существует в этом центре'
      });
    }
    const entity: TrainingLicense = {
      id: this.id(),
      tenantId,
      licenseType: request.licenseType,
      licenseNumber: request.licenseNumber,
      issuerName: request.issuerName,
      issuedAt: request.issuedAt,
      validUntil: request.validUntil,
      scanFileId: request.scanFileId,
      permittedTrainingTypes:
        request.permittedTrainingTypes && request.permittedTrainingTypes.length > 0
          ? request.permittedTrainingTypes
          : undefined,
      permittedDirections:
        request.permittedDirections && request.permittedDirections.length > 0
          ? request.permittedDirections
          : undefined,
      status: 'active',
      notes: request.notes,
      createdAt: this.now(),
      updatedAt: this.now()
    };
    await this.repo.insert(entity);
    await this.auditService.writeCritical({
      tenantId,
      actorId,
      action: 'org.license_created',
      entityType: 'org.training_license',
      entityId: entity.id,
      newValues: entity as unknown as Record<string, unknown>,
      requestId: context.requestId,
      correlationId: context.correlationId,
      ip: context.ip,
      userAgent: context.userAgent
    });
    return entity;
  }

  async update(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: UpdateLicenseRequest,
    context: RequestContext
  ): Promise<TrainingLicense> {
    const license = await this.get(tenantId, id);
    if (license.status !== 'active') {
      throw new BadRequestException({
        code: 'license_not_editable',
        message: 'Можно редактировать только active лицензии'
      });
    }
    const oldValues = { ...license };
    if (request.licenseNumber !== undefined) license.licenseNumber = request.licenseNumber;
    if (request.issuerName !== undefined) license.issuerName = request.issuerName;
    if (request.validUntil !== undefined) license.validUntil = request.validUntil;
    if (request.scanFileId !== undefined) license.scanFileId = request.scanFileId;
    if (request.permittedTrainingTypes !== undefined) {
      license.permittedTrainingTypes =
        request.permittedTrainingTypes.length > 0 ? request.permittedTrainingTypes : undefined;
    }
    if (request.permittedDirections !== undefined) {
      license.permittedDirections =
        request.permittedDirections.length > 0 ? request.permittedDirections : undefined;
    }
    if (request.notes !== undefined) license.notes = request.notes;
    if (license.validUntil && license.validUntil < license.issuedAt) {
      throw new BadRequestException({
        code: 'license_valid_until_before_issued_at',
        message: 'validUntil не может быть раньше issuedAt'
      });
    }
    license.updatedAt = this.now();
    await this.repo.update(license);
    await this.auditService.writeCritical({
      tenantId,
      actorId,
      action: 'org.license_updated',
      entityType: 'org.training_license',
      entityId: license.id,
      oldValues: oldValues as unknown as Record<string, unknown>,
      newValues: license as unknown as Record<string, unknown>,
      requestId: context.requestId,
      correlationId: context.correlationId,
      ip: context.ip,
      userAgent: context.userAgent
    });
    return license;
  }

  async revoke(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    context: RequestContext
  ): Promise<TrainingLicense> {
    const license = await this.get(tenantId, id);
    if (license.status === 'revoked') return license;
    const oldValues = { ...license };
    license.status = 'revoked';
    license.updatedAt = this.now();
    await this.repo.update(license);
    await this.auditService.writeCritical({
      tenantId,
      actorId,
      action: 'org.license_revoked',
      entityType: 'org.training_license',
      entityId: license.id,
      oldValues: oldValues as unknown as Record<string, unknown>,
      newValues: license as unknown as Record<string, unknown>,
      requestId: context.requestId,
      correlationId: context.correlationId,
      ip: context.ip,
      userAgent: context.userAgent
    });
    return license;
  }

  /**
   * Возвращает все active лицензии центра, разрешающие указанную пару
   * `(trainingType, directionId?)`. Используется publishCourseVersion.
   *
   * Универсальная лицензия (`permittedTrainingTypes === undefined`) проходит
   * любую проверку trainingType; то же для directions. Это безопасный default —
   * центры с одной «всеохватной» лицензией не упрутся в false negative.
   */
  async findActiveLicensesFor(
    tenantId: string,
    trainingType: string,
    directionId?: string
  ): Promise<TrainingLicense[]> {
    const active = await this.repo.list(tenantId, 'active');
    const today = this.now().slice(0, 10);
    return active.filter((l) => {
      // Time-expired license fails the publish gate even though status stays 'active'
      // (nothing flips active→expired). validUntil is inclusive; undefined = бессрочная.
      if (l.validUntil && l.validUntil < today) {
        return false;
      }
      if (l.permittedTrainingTypes && !l.permittedTrainingTypes.includes(trainingType)) {
        return false;
      }
      if (l.permittedDirections && (!directionId || !l.permittedDirections.includes(directionId))) {
        return false;
      }
      return true;
    });
  }

  /** Active licenses expiring at/before `dateInclusive` (YYYY-MM-DD), for the expiry scanner. */
  findActiveExpiringBefore(tenantId: string, dateInclusive: string): Promise<TrainingLicense[]> {
    return this.repo.findActiveExpiringBefore(tenantId, dateInclusive);
  }

  private id(): string {
    return `license_${Math.random().toString(36).slice(2, 10)}`;
  }

  private now(): string {
    return new Date().toISOString();
  }
}
