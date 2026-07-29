import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it, vi } from 'vitest';

import { ConsentService } from './consent.service.js';
import { InMemoryConsentRepository } from './in-memory-consent.repository.js';
import { TenantScopedRepository } from '../../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../../audit/audit.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MvpService } from '../mvp.service.js';

import type { PhotoConsentGate } from './consent.js';
import type { RequestContext } from '../../../common/context/request-context.js';
import type { DocumentsService } from '../../documents/documents.service.js';
import type { FilesService } from '../../files/files.service.js';
import type { LegalLogWriter } from '../esignature/legal-log.writer.js';

/**
 * ФТ-C3.2 (Фаза 3 Task 6) — согласие на фото как условие уровня 2.
 *
 * Проверяется связка целиком: слушатель, давший согласие на обработку данных, но не на
 * фото, не может подать селфи и паспорт — и узнаёт об этом ЯВНО, отдельным кодом ошибки.
 */

const T = 'tenant_demo';
const ADMIN = 'u_tenant_admin';
const LEARNER_USER = 'u_l1';
const ctx: RequestContext = {
  requestId: 'req_1',
  correlationId: 'corr_1',
  tenantId: T,
  userId: LEARNER_USER,
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

const noopDocumentsService = {
  listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 })
} as unknown as DocumentsService;

function makeFilesMock() {
  let counter = 0;
  return {
    createUploadIntent: vi.fn(async () => ({
      fileId: `file_${++counter}`,
      uploadUrl: 'https://minio.local/PUT-signed',
      storageKey: 'identity/tenant_demo/x.jpg',
      expiresInSeconds: 900
    })),
    getAntivirusStatuses: vi.fn(
      async (_t: string, ids: string[]) => new Map(ids.map((id) => [id, 'clean']))
    ),
    createDownloadUrl: vi.fn(async () => 'https://minio.local/GET-signed'),
    ensureMaterialLink: async () => undefined
  } as unknown as FilesService;
}

function harness() {
  const consents = new ConsentService(new InMemoryConsentRepository(), {
    write: async () => undefined
  } as unknown as LegalLogWriter);
  const service = new MvpService(
    new InMemoryMvpState(),
    new TenantScopedRepository(),
    new AuditService(),
    noopDocumentsService,
    makeFilesMock(),
    new EventEmitter2()
  );
  const learner = service.createLearner(
    T,
    ADMIN,
    { code: 'L1', name: 'Иванов Иван', linkedIamUserId: LEARNER_USER },
    ctx
  );
  // Тот же гейт, что собирает контроллер.
  const gate: PhotoConsentGate = async (learnerId: string) => {
    await consents.assertPhotoConsent(T, learnerId);
    return (await consents.getState(T, learnerId, 'photo')).grantedAt;
  };
  return { consents, service, learner, gate };
}

async function submitDocuments(
  h: ReturnType<typeof harness>,
  verificationId: string
): Promise<ReturnType<MvpService['submitIdentityVerification']>> {
  const selfie = await h.service.createIdentityVerificationUploadIntent(
    T,
    LEARNER_USER,
    verificationId,
    { originalName: 'selfie.jpg', contentType: 'image/jpeg', sizeBytes: 1000 },
    ctx,
    h.gate
  );
  const passport = await h.service.createIdentityVerificationUploadIntent(
    T,
    LEARNER_USER,
    verificationId,
    { originalName: 'passport.jpg', contentType: 'image/jpeg', sizeBytes: 1000 },
    ctx,
    h.gate
  );
  return h.service.submitIdentityVerification(
    T,
    LEARNER_USER,
    verificationId,
    { selfieFileId: selfie.fileId, passportFileId: passport.fileId, consent: true },
    ctx,
    h.gate
  );
}

describe('согласие на фото и подтверждение личности (ФТ-C3.2)', () => {
  it('без согласия на фото загрузка селфи не принимается', async () => {
    const h = harness();
    await h.consents.grant(T, h.learner.id, 'personal_data', ctx);
    const draft = h.service.startIdentityVerification(T, LEARNER_USER, {}, ctx);

    await expect(
      h.service.createIdentityVerificationUploadIntent(
        T,
        LEARNER_USER,
        draft.id,
        { originalName: 'selfie.jpg', contentType: 'image/jpeg', sizeBytes: 1000 },
        ctx,
        h.gate
      )
    ).rejects.toMatchObject({ response: { code: 'photo_consent_required' } });
  });

  it('с согласием на фото документы подаются, и момент согласия попадает в запись', async () => {
    const h = harness();
    await h.consents.grant(T, h.learner.id, 'personal_data', ctx);
    const granted = await h.consents.grant(T, h.learner.id, 'photo', ctx);
    const draft = h.service.startIdentityVerification(T, LEARNER_USER, {}, ctx);

    const submitted = await submitDocuments(h, draft.id);
    expect(submitted.verificationStatus).toBe('pending');
    expect(submitted.photoConsentAt).toBe(granted.grantedAt);
    // Согласия хранятся раздельно — метка ПДн своя, не копия фото-метки.
    expect(submitted.consentAt).toBeDefined();
  });

  it('отзыв согласия на фото между загрузкой и подачей останавливает подачу', async () => {
    const h = harness();
    await h.consents.grant(T, h.learner.id, 'photo', ctx);
    const draft = h.service.startIdentityVerification(T, LEARNER_USER, {}, ctx);
    const selfie = await h.service.createIdentityVerificationUploadIntent(
      T,
      LEARNER_USER,
      draft.id,
      { originalName: 'selfie.jpg', contentType: 'image/jpeg', sizeBytes: 1000 },
      ctx,
      h.gate
    );
    const passport = await h.service.createIdentityVerificationUploadIntent(
      T,
      LEARNER_USER,
      draft.id,
      { originalName: 'passport.jpg', contentType: 'image/jpeg', sizeBytes: 1000 },
      ctx,
      h.gate
    );

    await h.consents.revoke(T, h.learner.id, 'photo', ctx);

    await expect(
      h.service.submitIdentityVerification(
        T,
        LEARNER_USER,
        draft.id,
        { selfieFileId: selfie.fileId, passportFileId: passport.fileId, consent: true },
        ctx,
        h.gate
      )
    ).rejects.toMatchObject({ response: { code: 'photo_consent_required' } });
  });

  it('отзыв согласия на фото НЕ отменяет уже принятое решение модератора', async () => {
    const h = harness();
    await h.consents.grant(T, h.learner.id, 'personal_data', ctx);
    await h.consents.grant(T, h.learner.id, 'photo', ctx);
    const draft = h.service.startIdentityVerification(T, LEARNER_USER, {}, ctx);
    const submitted = await submitDocuments(h, draft.id);

    const approved = h.service.reviewIdentityVerification(
      T,
      ADMIN,
      submitted.id,
      { decision: 'approve' },
      ctx
    );
    expect(approved.verificationStatus).toBe('approved');

    await h.consents.revoke(T, h.learner.id, 'photo', ctx);

    // Решение осталось: отзыв запрещает НОВУЮ обработку, а не переписывает историю.
    const after = await h.service.getIdentityVerificationView(T, submitted.id);
    expect(after.verificationStatus).toBe('approved');
    expect(after.photoConsentAt).toBeDefined();
    // При этом новую заявку без согласия подать уже нельзя.
    await expect(h.consents.assertPhotoConsent(T, h.learner.id)).rejects.toMatchObject({
      response: { code: 'photo_consent_required' }
    });
  });

  it('отзыв согласия на фото не трогает согласие на обработку данных', async () => {
    const h = harness();
    await h.consents.grant(T, h.learner.id, 'personal_data', ctx);
    await h.consents.grant(T, h.learner.id, 'photo', ctx);

    await h.consents.revoke(T, h.learner.id, 'photo', ctx);

    const status = await h.consents.getStatus(T, h.learner.id);
    expect(status.personalData.granted).toBe(true);
    expect(status.photo.granted).toBe(false);
  });
});
