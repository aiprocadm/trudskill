import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it, vi } from 'vitest';

import { legacyConsentEvidence } from './consent.js';
import { ConsentService } from './consent.service.js';
import { InMemoryConsentRepository } from './in-memory-consent.repository.js';
import { TenantScopedRepository } from '../../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../../audit/audit.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MvpService } from '../mvp.service.js';

import type { LegacyConsentEvidence, PhotoConsentGate } from './consent.js';
import type { RequestContext } from '../../../common/context/request-context.js';
import type { DocumentsService } from '../../documents/documents.service.js';
import type { FilesService } from '../../files/files.service.js';
import type { LegalLogWriter } from '../esignature/legal-log.writer.js';

/**
 * Мостик для исторических согласий (ФТ-C3.2, доработка после Task 6).
 *
 * **Что чинится.** Миграция `0069` переносит старые согласия SQL-запросом из
 * `learning.identity_verifications`, но эту таблицу код НЕ заполняет: записи
 * идентификации живут в JSONB-снимке состояния. Перенос переносит ноль строк, а гейт
 * согласий про историческое поле `consentAt` ничего не знает — значит слушатель,
 * подавший документы до разделения согласий, оказывается «без согласия» и не может
 * подать заново.
 *
 * Здесь же закрывается вторая дыра: перед загрузкой снимка проверялось ТОЛЬКО согласие
 * на фото, а согласие на обработку данных — лишь на шаге подачи, когда паспорт уже
 * лежал в хранилище.
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
  const legalLog = {
    write: vi.fn(async (_entry: Parameters<LegalLogWriter['write']>[0]) => undefined)
  };
  const consents = new ConsentService(
    new InMemoryConsentRepository(),
    legalLog as unknown as LegalLogWriter
  );
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
  // Тот же гейт, что собирает контроллер после доработки.
  const gate: PhotoConsentGate = async (learnerId: string, legacy?: LegacyConsentEvidence) => {
    await consents.materializeLegacyConsents(T, learnerId, legacy);
    await consents.assertIdentityConsents(T, learnerId);
    return (await consents.getState(T, learnerId, 'photo')).grantedAt;
  };
  return { consents, service, learner, gate, legalLog };
}

const uploadSelfie = (h: ReturnType<typeof harness>, verificationId: string) =>
  h.service.createIdentityVerificationUploadIntent(
    T,
    LEARNER_USER,
    verificationId,
    { originalName: 'selfie.jpg', contentType: 'image/jpeg', sizeBytes: 1000 },
    ctx,
    h.gate
  );

describe('legacyConsentEvidence — чистая часть', () => {
  it('без исторической галочки доказательства нет', () => {
    expect(legacyConsentEvidence({})).toBeUndefined();
  });

  it('галочка без фото покрывает только обработку данных', () => {
    const ev = legacyConsentEvidence({ consentAt: '2026-01-01T10:00:00.000Z' });
    expect(ev).toEqual({ consentAt: '2026-01-01T10:00:00.000Z', hasPhoto: false });
  });

  it('галочка с загруженным селфи покрывает и фото', () => {
    const ev = legacyConsentEvidence({
      consentAt: '2026-01-01T10:00:00.000Z',
      selfieFileId: 'f_s'
    });
    expect(ev?.hasPhoto).toBe(true);
  });

  it('паспорт без селфи тоже считается загруженным фото', () => {
    expect(legacyConsentEvidence({ consentAt: 'x', passportFileId: 'f_p' })?.hasPhoto).toBe(true);
  });
});

describe('перенос исторического согласия в момент обращения', () => {
  it('слушатель со старой галочкой и фото НЕ заблокирован', async () => {
    const h = harness();
    const draft = h.service.startIdentityVerification(T, LEARNER_USER, {}, ctx);
    // Так выглядит запись, поданная до разделения согласий.
    draft.consentAt = '2026-01-01T10:00:00.000Z';
    draft.selfieFileId = 'f_old_selfie';

    await expect(uploadSelfie(h, draft.id)).resolves.toBeDefined();
  });

  it('перенос сохраняет ИСХОДНУЮ дату согласия, а не дату обнаружения', async () => {
    const h = harness();
    const draft = h.service.startIdentityVerification(T, LEARNER_USER, {}, ctx);
    draft.consentAt = '2026-01-01T10:00:00.000Z';
    draft.selfieFileId = 'f_old_selfie';

    await uploadSelfie(h, draft.id);

    const state = await h.consents.getState(T, h.learner.id, 'photo');
    expect(state.grantedAt).toBe('2026-01-01T10:00:00.000Z');
  });

  it('перенесённое согласие не притворяется подписанным под конкретный текст', async () => {
    const h = harness();
    const draft = h.service.startIdentityVerification(T, LEARNER_USER, {}, ctx);
    draft.consentAt = '2026-01-01T10:00:00.000Z';
    draft.selfieFileId = 'f_old_selfie';

    await uploadSelfie(h, draft.id);

    // Текста согласия тогда не существовало — приписывать версию значило бы
    // сфабриковать доказательство.
    const state = await h.consents.getState(T, h.learner.id, 'photo');
    expect(state.documentVersion).toBeUndefined();
  });

  it('старая галочка БЕЗ фото не открывает загрузку снимка', async () => {
    const h = harness();
    const draft = h.service.startIdentityVerification(T, LEARNER_USER, {}, ctx);
    draft.consentAt = '2026-01-01T10:00:00.000Z';

    // Согласие на обработку данных переносится, на фото — нет: человек его не давал.
    await expect(uploadSelfie(h, draft.id)).rejects.toMatchObject({
      response: { code: 'photo_consent_required' }
    });
  });

  it('перенос записывается в юридический журнал как исторический', async () => {
    const h = harness();
    const draft = h.service.startIdentityVerification(T, LEARNER_USER, {}, ctx);
    draft.consentAt = '2026-01-01T10:00:00.000Z';
    draft.selfieFileId = 'f_old_selfie';

    await uploadSelfie(h, draft.id);

    const events = h.legalLog.write.mock.calls.map((c) => c[0] as { payload?: unknown });
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => (e.payload as { legacy?: boolean }).legacy === true)).toBe(true);
  });

  it('ОТЗЫВ не перекрывается воскрешённым историческим согласием', async () => {
    const h = harness();
    await h.consents.grant(T, h.learner.id, 'personal_data', ctx);
    await h.consents.grant(T, h.learner.id, 'photo', ctx);
    await h.consents.revoke(T, h.learner.id, 'photo', ctx);

    const draft = h.service.startIdentityVerification(T, LEARNER_USER, {}, ctx);
    draft.consentAt = '2026-01-01T10:00:00.000Z';
    draft.selfieFileId = 'f_old_selfie';

    // Человек отозвал согласие ЯВНО и позже — старая галочка это не отменяет.
    await expect(uploadSelfie(h, draft.id)).rejects.toMatchObject({
      response: { code: 'photo_consent_required' }
    });
  });

  it('повторное обращение не плодит второй факт согласия', async () => {
    const h = harness();
    const draft = h.service.startIdentityVerification(T, LEARNER_USER, {}, ctx);
    draft.consentAt = '2026-01-01T10:00:00.000Z';
    draft.selfieFileId = 'f_old_selfie';

    await uploadSelfie(h, draft.id);
    const writesAfterFirst = h.legalLog.write.mock.calls.length;
    await uploadSelfie(h, draft.id);

    expect(h.legalLog.write.mock.calls.length).toBe(writesAfterFirst);
  });
});

describe('оба согласия обязательны ДО загрузки снимка', () => {
  it('согласие только на фото не открывает загрузку', async () => {
    const h = harness();
    await h.consents.grant(T, h.learner.id, 'photo', ctx);
    const draft = h.service.startIdentityVerification(T, LEARNER_USER, {}, ctx);

    // Фотография сама по себе персональные данные: принимать её без согласия на их
    // обработку нельзя, иначе паспорт окажется в хранилище раньше согласия.
    await expect(uploadSelfie(h, draft.id)).rejects.toMatchObject({
      response: { code: 'consent_required' }
    });
  });

  it('оба согласия — загрузка проходит', async () => {
    const h = harness();
    await h.consents.grant(T, h.learner.id, 'personal_data', ctx);
    await h.consents.grant(T, h.learner.id, 'photo', ctx);
    const draft = h.service.startIdentityVerification(T, LEARNER_USER, {}, ctx);

    await expect(uploadSelfie(h, draft.id)).resolves.toBeDefined();
  });

  it('отзыв согласия на обработку данных закрывает загрузку', async () => {
    const h = harness();
    await h.consents.grant(T, h.learner.id, 'personal_data', ctx);
    await h.consents.grant(T, h.learner.id, 'photo', ctx);
    await h.consents.revoke(T, h.learner.id, 'personal_data', ctx);
    const draft = h.service.startIdentityVerification(T, LEARNER_USER, {}, ctx);

    await expect(uploadSelfie(h, draft.id)).rejects.toMatchObject({
      response: { code: 'consent_required' }
    });
  });
});
