import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import {
  buildLearnerEmployerRecipients,
  buildStaffRecipients,
  resolveCourseTitleByVersion,
  resolveCourseVersionIdForGroup,
  resolveLearnerDisplay
} from './reminder-recipients.js';
import { TenantSerialGateway } from '../../../infrastructure/request/tenant-serial.gateway.js';
import { NotificationDispatcher } from '../../communication/notification-dispatcher.service.js';
import { DOCUMENT_REVOKED_EVENT } from '../../documents/document-revoked.event.js';
import { MvpTenantRunner } from '../infrastructure/mvp-tenant-runner.service.js';

import type { DocumentRevokedPayload } from '../../documents/document-revoked.event.js';

@Injectable()
export class DocumentRevokedEmailListener {
  private readonly logger = new Logger(DocumentRevokedEmailListener.name);

  constructor(
    @Inject(MvpTenantRunner) private readonly mvpRunner: MvpTenantRunner,
    @Inject(NotificationDispatcher) private readonly dispatcher: NotificationDispatcher,
    @Inject(TenantSerialGateway) private readonly tenantGateway: TenantSerialGateway
  ) {}

  @OnEvent(DOCUMENT_REVOKED_EVENT, { async: true })
  async handle(payload: DocumentRevokedPayload): Promise<void> {
    if (!payload.sourceEntityId) {
      return;
    }
    try {
      /*
       * Ревизия 2026-08-27 (порция 38, журнал 286). Слушатель запускается ОТСОЕДИНЁННОЙ
       * веткой из-под запроса, отозвавшего документ, и по наследству получает его замок
       * арендатора (так устроен AsyncLocalStorage — см. порцию 26). Данных это не портит:
       * читаем без сохранения. Но читаем мы при этом снимок, который прямо сейчас меняет
       * чужая секция, — письмо могло собраться по состоянию «в середине правки».
       * Отсоединяемся: пусть чтение честно дождётся своей очереди.
       */
      const resolved = await this.tenantGateway.runDetached(() =>
        this.mvpRunner.runWithTenantState(payload.tenantId, async (state) => {
          const enrollment = state.enrollments.find(
            (e) => e.tenantId === payload.tenantId && e.id === payload.sourceEntityId
          );
          if (!enrollment) {
            return null;
          }
          const recipients = [
            ...buildLearnerEmployerRecipients(state, payload.tenantId, enrollment),
            ...buildStaffRecipients(state, payload.tenantId)
          ];
          const courseVersionId = resolveCourseVersionIdForGroup(
            state,
            payload.tenantId,
            enrollment.groupId
          );
          const courseTitle = courseVersionId
            ? resolveCourseTitleByVersion(state, payload.tenantId, courseVersionId)
            : undefined;
          return {
            recipients,
            learnerName: resolveLearnerDisplay(state, payload.tenantId, enrollment.learnerId).name,
            courseTitle: courseTitle ?? ''
          };
        })
      );

      if (!resolved || resolved.recipients.length === 0) {
        return;
      }

      await this.dispatcher.dispatch({
        tenantId: payload.tenantId,
        templateKey: 'document_revoked',
        recipients: resolved.recipients,
        variables: {
          learnerName: resolved.learnerName,
          courseTitle: resolved.courseTitle,
          reason: payload.reason
        },
        relatedEntityType: 'documents.generated_document',
        relatedEntityId: payload.documentId,
        dedupKey: `revoked:${payload.documentId}`
      });
    } catch (err) {
      this.logger.error(
        `Failed to dispatch document_revoked for document ${payload.documentId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}
