import { Body, Controller, Get, Inject, Param, Post, Query, Res, UseGuards } from '@nestjs/common';

import { IssueRentalInvoiceRequest } from './rental-billing.dto.js';
import { RentalBillingService } from './rental-billing.service.js';
import { assertValidDto } from '../../common/app-validation.pipe.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../iam/permission.decorator.js';
import { PermissionGuard } from '../iam/permission.guard.js';

import type { RequestContext } from '../../common/context/request-context.js';
import type { Response } from 'express';

/**
 * ФТ-D5.1 (Фаза 4 Task 6): счета аренды.
 *
 * Выставление и отметка оплаты — `platform.tenants.write` (управление арендатором
 * включает его деньги). Свои счета арендатор смотрит правом `tenant.usage.read` —
 * это та же биллинговая картина, что и экран «Использование».
 */
@Controller()
@UseGuards(TenantGuard)
export class RentalBillingController {
  constructor(@Inject(RentalBillingService) private readonly billing: RentalBillingService) {}

  @Get('platform/rental-invoices')
  @UseGuards(PermissionGuard)
  @RequirePermissions('platform.tenants.read')
  listAll(@Query('tenantId') tenantId?: string) {
    return this.billing.listInvoices(tenantId);
  }

  /** Свои счета — арендатору; чужие через эту ручку недоступны by construction. */
  @Get('tenant/rental-invoices')
  @UseGuards(PermissionGuard)
  @RequirePermissions('tenant.usage.read')
  listOwn(@CurrentContext() c: RequestContext) {
    return this.billing.listInvoices(c.tenantId!);
  }

  @Post('platform/rental-invoices')
  @UseGuards(PermissionGuard)
  @RequirePermissions('platform.tenants.write')
  async issue(@CurrentContext() c: RequestContext, @Body() body: unknown) {
    const dto = assertValidDto(IssueRentalInvoiceRequest, body);
    const result = await this.billing.issueInvoice(c.userId, dto, c);
    // `documentReady` — флаг в ТЕЛЕ, а не имя файла в заголовке: номер счёта бывает
    // кириллицей, а в значении HTTP-заголовка допустим только ASCII (RFC 7230) —
    // на живом прогоне это валило ответ уже после создания счёта. Сам PDF
    // забирается отдельной ручкой ниже.
    return { ...result.invoice, documentReady: Boolean(result.document) };
  }

  /** Печатная форма счёта: пересобирается на лету, файл нигде не хранится. */
  @Get('platform/rental-invoices/:id/pdf')
  @UseGuards(PermissionGuard)
  @RequirePermissions('platform.tenants.read')
  async downloadPdf(@Param('id') id: string, @Res() response: Response) {
    const document = await this.billing.renderInvoiceDocument(id);
    // Имя файла в заголовке — только ASCII; человекочитаемое идёт RFC 5987-кодировкой.
    const asciiName = document.fileName.replaceAll(/[^\w.-]/g, '_');
    response.setHeader('content-type', document.contentType);
    response.setHeader(
      'content-disposition',
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(document.fileName)}`
    );
    response.send(document.content);
  }

  @Post('platform/rental-invoices/:id/paid')
  @UseGuards(PermissionGuard)
  @RequirePermissions('platform.tenants.write')
  markPaid(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.billing.markPaid(c.userId, id, c);
  }
}
