import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import type { TenantStatus } from '../tenant/tenant.types.js';

/** ФТ-D2.1/D2.2: полный жизненный цикл арендатора (зафиксирован CHECK-ограничением 0072). */
export const TENANT_STATUSES = [
  'trial',
  'active',
  'suspended',
  'archived'
] as const satisfies readonly TenantStatus[];

/** `POST /platform/tenants` — создание арендатора. */
export class CreatePlatformTenantRequest {
  // Код попадает в URL-ы и системные идентификаторы — только латиница/цифры/дефис.
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  @Matches(/^[a-z0-9][a-z0-9-]*$/)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @IsIn(TENANT_STATUSES)
  status?: TenantStatus;
}

/** `PATCH /platform/tenants/:id/status` — смена статуса жизненного цикла. */
export class ChangePlatformTenantStatusRequest {
  @IsString()
  @IsIn(TENANT_STATUSES)
  status!: TenantStatus;
}
