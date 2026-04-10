import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';

import { EsignService } from './esign.service.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../iam/permission.decorator.js';
import { PermissionGuard } from '../iam/permission.guard.js';

import type {
  CreateEsignApplicationFileRequest,
  CreateEsignApplicationRequest,
  CreateSigningParticipantRequest,
  CreateSigningProcessRequest,
  EsignBaseFilter,
  ParticipantActionRequest,
  RejectEsignApplicationFileRequest,
  RejectEsignApplicationRequest,
  StartSigningProcessRequest,
  UpdateEsignApplicationRequest,
  UpdateSigningParticipantRequest
} from './esign.dto.js';
import type { RequestContext } from '../../common/context/request-context.js';

@Controller('esign')
@UseGuards(TenantGuard)
export class EsignController {
  constructor(@Inject(EsignService) private readonly esignService: EsignService) {}
  @Get('applications')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esign.applications.read')
  listApplications(@CurrentContext() c: RequestContext, @Query() q: EsignBaseFilter) {
    return this.esignService.listApplications(c.tenantId!, q);
  }
  @Post('applications')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esign.applications.write')
  createApplication(@CurrentContext() c: RequestContext, @Body() b: CreateEsignApplicationRequest) {
    return this.esignService.createApplication(c.tenantId!, c.userId, b, c);
  }
  @Get('applications/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esign.applications.read')
  getApplication(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.esignService.getApplication(c.tenantId!, id);
  }
  @Patch('applications/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esign.applications.write')
  patchApplication(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() b: UpdateEsignApplicationRequest
  ) {
    return this.esignService.updateApplication(c.tenantId!, c.userId, id, b);
  }
  @Post('applications/:id/submit')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esign.applications.submit')
  submitApplication(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.esignService.submitApplication(c.tenantId!, c.userId, id);
  }
  @Post('applications/:id/start-review')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esign.applications.review')
  startReview(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.esignService.startReview(c.tenantId!, c.userId, id);
  }
  @Post('applications/:id/approve')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esign.applications.review')
  approveApplication(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.esignService.approveApplication(c.tenantId!, c.userId, id);
  }
  @Post('applications/:id/reject')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esign.applications.review')
  rejectApplication(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() b: RejectEsignApplicationRequest
  ) {
    return this.esignService.rejectApplication(c.tenantId!, c.userId, id, b);
  }
  @Post('applications/:id/reuse-check')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esign.applications.read')
  reuseCheck(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.esignService.reuseCheck(c.tenantId!, c.userId, id);
  }
  @Get('application-files')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esign.applications.read')
  listApplicationFiles(@CurrentContext() c: RequestContext, @Query() q: EsignBaseFilter) {
    return this.esignService.listApplicationFiles(c.tenantId!, q);
  }
  @Post('application-files')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esign.applications.write')
  createApplicationFile(
    @CurrentContext() c: RequestContext,
    @Body() b: CreateEsignApplicationFileRequest
  ) {
    return this.esignService.createApplicationFile(c.tenantId!, c.userId, b);
  }
  @Get('application-files/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esign.applications.read')
  getApplicationFile(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.esignService.getApplicationFile(c.tenantId!, id);
  }
  @Post('application-files/:id/verify')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esign.applications.review')
  verifyApplicationFile(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.esignService.verifyApplicationFile(c.tenantId!, c.userId, id);
  }
  @Post('application-files/:id/reject')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esign.applications.review')
  rejectApplicationFile(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() b: RejectEsignApplicationFileRequest
  ) {
    return this.esignService.rejectApplicationFile(c.tenantId!, c.userId, id, b);
  }
  @Delete('application-files/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esign.applications.write')
  deleteApplicationFile(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.esignService.deleteApplicationFile(c.tenantId!, id, c.userId);
  }
  @Get('processes')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esign.processes.read')
  listProcesses(@CurrentContext() c: RequestContext, @Query() q: EsignBaseFilter) {
    return this.esignService.listProcesses(c.tenantId!, q);
  }
  @Post('processes')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esign.processes.write')
  createProcess(@CurrentContext() c: RequestContext, @Body() b: CreateSigningProcessRequest) {
    return this.esignService.createProcess(c.tenantId!, c.userId, b);
  }
  @Get('processes/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esign.processes.read')
  getProcess(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.esignService.getProcess(c.tenantId!, id);
  }
  @Post('processes/:id/start')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esign.processes.write')
  startProcess(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() b: StartSigningProcessRequest
  ) {
    return this.esignService.startProcess(c.tenantId!, c.userId, id, b);
  }
  @Post('processes/:id/cancel')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esign.processes.write')
  cancelProcess(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.esignService.cancelProcess(c.tenantId!, c.userId, id);
  }
  @Get('processes/:id/status')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esign.processes.read')
  processStatus(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.esignService.getProcessStatus(c.tenantId!, id);
  }
  @Get('participants')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esign.processes.read')
  listParticipants(@CurrentContext() c: RequestContext, @Query() q: EsignBaseFilter) {
    return this.esignService.listParticipants(c.tenantId!, q);
  }
  @Post('participants')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esign.processes.write')
  createParticipant(
    @CurrentContext() c: RequestContext,
    @Body() b: CreateSigningParticipantRequest
  ) {
    return this.esignService.createParticipant(c.tenantId!, c.userId, b);
  }
  @Patch('participants/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esign.processes.write')
  patchParticipant(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() b: UpdateSigningParticipantRequest
  ) {
    return this.esignService.updateParticipant(c.tenantId!, id, b);
  }
  @Post('participants/:id/invite')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esign.processes.write')
  invite(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.esignService.inviteParticipant(c.tenantId!, c.userId, id);
  }
  @Post('participants/:id/mark-viewed')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esign.participants.sign')
  viewed(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.esignService.markViewed(c.tenantId!, c.userId, id);
  }
  @Post('participants/:id/sign')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esign.participants.sign')
  sign(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() b: ParticipantActionRequest
  ) {
    return this.esignService.signParticipant(c.tenantId!, c.userId, id, b);
  }
  @Post('participants/:id/reject')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esign.participants.sign')
  reject(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() b: ParticipantActionRequest
  ) {
    return this.esignService.rejectParticipant(c.tenantId!, c.userId, id, b);
  }
  @Post('participants/:id/skip')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esign.processes.write')
  skip(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() b: ParticipantActionRequest
  ) {
    return this.esignService.skipParticipant(c.tenantId!, c.userId, id, b);
  }
  @Get('events') @UseGuards(PermissionGuard) @RequirePermissions('esign.processes.read') listEvents(
    @CurrentContext() c: RequestContext,
    @Query() q: EsignBaseFilter
  ) {
    return this.esignService.listEvents(c.tenantId!, q);
  }
  @Get('events/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esign.processes.read')
  getEvent(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.esignService.getEvent(c.tenantId!, id);
  }
  @Get('legal-log')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esign.legal.read')
  listLegalLog(@CurrentContext() c: RequestContext, @Query() q: EsignBaseFilter) {
    return this.esignService.listLegalLog(c.tenantId!, q);
  }
  @Get('legal-log/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('esign.legal.read')
  getLegalLog(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.esignService.getLegalLogEntry(c.tenantId!, id);
  }
}
