import { BadRequestException, Body, Controller, Get, Inject, Put, UseGuards } from '@nestjs/common';

import { validateBrandingInput } from './tenant-branding.js';
import {
  DEFAULT_IDENTITY_IMAGE_RETENTION_DAYS,
  MAX_IDENTITY_IMAGE_RETENTION_DAYS,
  MIN_IDENTITY_IMAGE_RETENTION_DAYS,
  TENANT_IDENTITY_SETTINGS_KEY,
  isValidRetentionDays,
  readTenantIdentitySettings
} from './tenant-identity-settings.js';
import { UpdateTenantRequisitesDto, UpdateTenantSettingsDto } from './tenant.request-dto.js';
import { TenantService } from './tenant.service.js';
import { assertValidDto } from '../../common/app-validation.pipe.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../iam/permission.decorator.js';
import { PermissionGuard } from '../iam/permission.guard.js';

import type { RequestContext } from '../../common/context/request-context.js';

@Controller('tenant')
@UseGuards(TenantGuard)
export class TenantController {
  constructor(@Inject(TenantService) private readonly tenantService: TenantService) {}

  /*
   * Ревизия 2026-08-26. Чтение карточки центра стояло БЕЗ права: экран `/academy/*` закрыт
   * `tenant.read`, а сама ручка отдавала данные любому вошедшему — то есть защита жила
   * только на фронте. Представитель компании-заказчика, у которого `tenant.read` нет
   * (проверено по `iam.role_permissions` живой базы, а не по названию роли), мог прочитать
   * реквизиты и состав аттестационной комиссии обычным запросом.
   *
   * Содержимое сегодня безобидно (название, ИНН, ФИО членов комиссии — они и так печатаются
   * в удостоверении), поэтому это не дыра, а fail-open: право не объявлено, и завтра в тот же
   * `payload` положат что-нибудь чувствительное. Ставим то право, которое уже требует экран.
   */
  @Get('me')
  @UseGuards(PermissionGuard)
  @RequirePermissions('tenant.read')
  async me(@CurrentContext() context: RequestContext) {
    return this.tenantService.getTenantById(context.tenantId!);
  }

  @Get('settings')
  @UseGuards(PermissionGuard)
  @RequirePermissions('tenant.read')
  async settings(@CurrentContext() context: RequestContext) {
    return this.tenantService.getSettings(context.tenantId!);
  }

  @Get('requisites')
  @UseGuards(PermissionGuard)
  @RequirePermissions('tenant.read')
  async requisites(@CurrentContext() context: RequestContext) {
    return this.tenantService.getRequisites(context.tenantId!);
  }

  /*
   * Правка карточки центра — операция администрации, а не «любого вошедшего».
   *
   * Раньше обе ручки стояли без права, и это было опаснее, чем выглядит: экран «Реквизиты»
   * открыт по праву `tenant.read`, которое есть у ВСЕХ ролей, включая слушателя. А из
   * реквизитов берутся юридическое название, ИНН и картинки подписи с печатью, которые
   * попадают в ВЫДАВАЕМЫЕ документы. Право заведено миграцией 0083.
   */
  @Put('settings')
  @UseGuards(PermissionGuard)
  @RequirePermissions('tenant.settings.write')
  async updateSettings(@CurrentContext() context: RequestContext, @Body() raw: unknown) {
    /* Ревизия 2026-08-26: тело-литерал не проверялось (см. tenant.request-dto.ts). */
    const body = assertValidDto(UpdateTenantSettingsDto, raw);
    return this.tenantService.updateSettings(context.tenantId!, body, context);
  }

  @Put('requisites')
  @UseGuards(PermissionGuard)
  @RequirePermissions('tenant.settings.write')
  async updateRequisites(@CurrentContext() context: RequestContext, @Body() raw: unknown) {
    /* Юридическое название и ИНН печатаются в удостоверении — вход проверяется. */
    const body = assertValidDto(UpdateTenantRequisitesDto, raw);
    return this.tenantService.updateRequisites(context.tenantId!, body, context);
  }

  /**
   * ФТ-D3.1 (Фаза 4 Task 4): бренд центра. Чтение — любому авторизованному
   * пользователю тенанта (тема красится каждому), запись — отдельное право
   * `tenant.branding.configure` (0075): витрину центра правит администрация.
   */
  @Get('branding')
  async branding(@CurrentContext() context: RequestContext) {
    const branding = await this.tenantService.getBranding(context.tenantId!);
    return { branding, isDefault: Object.keys(branding).length === 0 };
  }

  @Put('branding')
  @UseGuards(PermissionGuard)
  @RequirePermissions('tenant.branding.configure')
  async updateBranding(
    @CurrentContext() context: RequestContext,
    @Body() body: Record<string, unknown>
  ) {
    const { branding, issues } = validateBrandingInput(body ?? {});
    if (issues.length > 0) {
      // Строгая запись: «#зелёненький» — это ошибка админу, а не молчаливый дефолт
      // (терпимое чтение прикрывает только данные, попавшие в payload в обход ручки).
      throw new BadRequestException({
        code: 'invalid_branding',
        message: 'Branding payload is invalid',
        issues
      });
    }
    const updated = await this.tenantService.updateBranding(context.tenantId!, branding);
    return { branding: updated, isDefault: Object.keys(updated).length === 0 };
  }

  /**
   * ФТ-C3.1 (Фаза 3 Task 7): срок хранения снимков идентификации.
   *
   * Отдельная ручка, а не правка сырого `payload` через `PUT /tenant/requisites`:
   * значение проверяется, и менять его может только тот, кому доверена настройка
   * идентификации. Срок удаления паспортов — не то поле, которое стоит править вслепую.
   */
  @Get('identity-settings')
  @UseGuards(PermissionGuard)
  @RequirePermissions('tenant.read')
  async identitySettings(@CurrentContext() context: RequestContext) {
    const requisites = await this.tenantService.getRequisites(context.tenantId!);
    const settings = readTenantIdentitySettings(requisites);
    return {
      imageRetentionDays: settings.imageRetentionDays ?? DEFAULT_IDENTITY_IMAGE_RETENTION_DAYS,
      /** Значение не задано центром — работает умолчание. */
      isDefault: settings.imageRetentionDays === undefined,
      defaultDays: DEFAULT_IDENTITY_IMAGE_RETENTION_DAYS,
      minDays: MIN_IDENTITY_IMAGE_RETENTION_DAYS,
      maxDays: MAX_IDENTITY_IMAGE_RETENTION_DAYS
    };
  }

  @Put('identity-settings')
  @UseGuards(PermissionGuard)
  @RequirePermissions('identity.configure')
  async updateIdentitySettings(
    @CurrentContext() context: RequestContext,
    @Body() body: { imageRetentionDays?: number | null }
  ) {
    const raw = body?.imageRetentionDays;
    // null = «вернуть умолчание»: центр должен уметь отказаться от своей настройки.
    const next = raw === null || raw === undefined ? undefined : raw;
    if (next !== undefined && !isValidRetentionDays(next)) {
      throw new BadRequestException({
        code: 'validation_error',
        message: `Срок хранения — целое число от ${MIN_IDENTITY_IMAGE_RETENTION_DAYS} до ${MAX_IDENTITY_IMAGE_RETENTION_DAYS} дней`
      });
    }
    const current = await this.tenantService.getRequisites(context.tenantId!);
    const settings = { ...readTenantIdentitySettings(current) };
    if (next === undefined) delete settings.imageRetentionDays;
    else settings.imageRetentionDays = next;

    await this.tenantService.updateRequisites(
      context.tenantId!,
      { payload: { [TENANT_IDENTITY_SETTINGS_KEY]: settings } },
      context
    );
    return this.identitySettings(context);
  }

  @Get('commission')
  @UseGuards(PermissionGuard)
  @RequirePermissions('tenant.read')
  async commission(@CurrentContext() context: RequestContext) {
    return this.tenantService.getCommission(context.tenantId!);
  }
}
