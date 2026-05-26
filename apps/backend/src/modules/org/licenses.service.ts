import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';

import { InMemoryOrgState } from './in-memory-org.state.js';
import { AuditService } from '../audit/audit.service.js';

import type { CreateLicenseRequest, UpdateLicenseRequest } from './licenses.dto.js';
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
    @Inject(InMemoryOrgState) private readonly state: InMemoryOrgState,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  list(tenantId: string, status?: LicenseStatus): TrainingLicense[] {
    return this.state.licenses
      .filter((l) => l.tenantId === tenantId && (!status || l.status === status))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  get(tenantId: string, id: string): TrainingLicense {
    const license = this.state.licenses.find((l) => l.tenantId === tenantId && l.id === id);
    if (!license) {
      throw new NotFoundException({ code: 'license_not_found', message: 'Лицензия не найдена' });
    }
    return license;
  }

  create(
    tenantId: string,
    actorId: string | undefined,
    request: CreateLicenseRequest,
    context: RequestContext
  ): TrainingLicense {
    if (request.validUntil && request.validUntil < request.issuedAt) {
      throw new BadRequestException({
        code: 'license_valid_until_before_issued_at',
        message: 'validUntil не может быть раньше issuedAt'
      });
    }
    const duplicate = this.state.licenses.find(
      (l) =>
        l.tenantId === tenantId &&
        l.licenseType === request.licenseType &&
        l.licenseNumber === request.licenseNumber
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
    this.state.licenses.push(entity);
    this.auditService.write({
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

  update(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: UpdateLicenseRequest,
    context: RequestContext
  ): TrainingLicense {
    const license = this.get(tenantId, id);
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
    this.auditService.write({
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

  revoke(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    context: RequestContext
  ): TrainingLicense {
    const license = this.get(tenantId, id);
    if (license.status === 'revoked') return license;
    const oldValues = { ...license };
    license.status = 'revoked';
    license.updatedAt = this.now();
    this.auditService.write({
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
  findActiveLicensesFor(
    tenantId: string,
    trainingType: string,
    directionId?: string
  ): TrainingLicense[] {
    return this.state.licenses.filter((l) => {
      if (l.tenantId !== tenantId) return false;
      if (l.status !== 'active') return false;
      if (l.permittedTrainingTypes && !l.permittedTrainingTypes.includes(trainingType)) {
        return false;
      }
      if (l.permittedDirections && (!directionId || !l.permittedDirections.includes(directionId))) {
        return false;
      }
      return true;
    });
  }

  private id(): string {
    return `license_${Math.random().toString(36).slice(2, 10)}`;
  }

  private now(): string {
    return new Date().toISOString();
  }
}
