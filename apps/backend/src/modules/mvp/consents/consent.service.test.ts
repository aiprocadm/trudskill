import { beforeEach, describe, expect, it } from 'vitest';

import { ConsentService } from './consent.service.js';
import { InMemoryConsentRepository } from './in-memory-consent.repository.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { LegalLogWriter } from '../esignature/legal-log.writer.js';

const TENANT = 'tenant_demo';
const LEARNER = 'learner_1';

const ctx = (): RequestContext => ({
  requestId: 'req_1',
  correlationId: 'corr_1',
  tenantId: TENANT,
  userId: 'user_1',
  ip: '10.0.0.1',
  userAgent: 'jest'
});

interface LoggedEntry {
  eventType: string;
  entityId: string;
  payload?: Record<string, unknown>;
}

describe('ConsentService (ФТ-C3.2, Фаза 3 Task 6)', () => {
  let repo: InMemoryConsentRepository;
  let service: ConsentService;
  let entries: LoggedEntry[];

  beforeEach(() => {
    repo = new InMemoryConsentRepository();
    entries = [];
    const legalLog = {
      write: async (entry: LoggedEntry) => {
        entries.push(entry);
      }
    } as unknown as LegalLogWriter;
    service = new ConsentService(repo, legalLog);
  });

  it('по умолчанию не дано ни одного согласия', async () => {
    const status = await service.getStatus(TENANT, LEARNER);
    expect(status.personalData.granted).toBe(false);
    expect(status.photo.granted).toBe(false);
  });

  it('отзыв согласия на фото НЕ отзывает согласие на обработку данных', async () => {
    await service.grant(TENANT, LEARNER, 'personal_data', ctx());
    await service.grant(TENANT, LEARNER, 'photo', ctx());

    await service.revoke(TENANT, LEARNER, 'photo', ctx());

    const status = await service.getStatus(TENANT, LEARNER);
    expect(status.photo.granted).toBe(false);
    expect(status.personalData.granted).toBe(true);
  });

  it('отзыв согласия на ПДн НЕ отзывает согласие на фото', async () => {
    await service.grant(TENANT, LEARNER, 'personal_data', ctx());
    await service.grant(TENANT, LEARNER, 'photo', ctx());

    await service.revoke(TENANT, LEARNER, 'personal_data', ctx());

    const status = await service.getStatus(TENANT, LEARNER);
    expect(status.personalData.granted).toBe(false);
    expect(status.photo.granted).toBe(true);
  });

  it('без согласия на фото подача документов запрещена с понятным кодом', async () => {
    await service.grant(TENANT, LEARNER, 'personal_data', ctx());
    await expect(service.assertPhotoConsent(TENANT, LEARNER)).rejects.toMatchObject({
      response: { code: 'photo_consent_required' }
    });
  });

  it('после согласия на фото подача разрешена, после отзыва — снова запрещена', async () => {
    await service.grant(TENANT, LEARNER, 'photo', ctx());
    await expect(service.assertPhotoConsent(TENANT, LEARNER)).resolves.toBeUndefined();

    await service.revoke(TENANT, LEARNER, 'photo', ctx());
    await expect(service.assertPhotoConsent(TENANT, LEARNER)).rejects.toMatchObject({
      response: { code: 'photo_consent_required' }
    });
  });

  it('повторная выдача действующего согласия не сдвигает дату согласия', async () => {
    const first = await service.grant(TENANT, LEARNER, 'photo', ctx());
    const second = await service.grant(TENANT, LEARNER, 'photo', ctx());
    expect(second.id).toBe(first.id);
    expect(second.grantedAt).toBe(first.grantedAt);
  });

  it('после отзыва согласие можно дать заново — новым фактом, а не воскрешением старого', async () => {
    const first = await service.grant(TENANT, LEARNER, 'photo', ctx());
    await service.revoke(TENANT, LEARNER, 'photo', ctx());
    const again = await service.grant(TENANT, LEARNER, 'photo', ctx());
    expect(again.id).not.toBe(first.id);
    expect((await service.getStatus(TENANT, LEARNER)).photo.granted).toBe(true);
  });

  it('согласие фиксируется в юридическом журнале с хэшем показанного текста', async () => {
    const doc = await service.saveDocument(
      TENANT,
      'photo',
      'Согласие на фотографирование и обработку изображения лица.'
    );
    await service.grant(TENANT, LEARNER, 'photo', ctx());

    const granted = entries.find((e) => e.eventType === 'consent.photo_granted');
    expect(granted?.entityId).toBe(LEARNER);
    expect(granted?.payload?.bodyHash).toBe(doc.bodyHash);
    expect(granted?.payload?.documentVersion).toBe(1);
  });

  it('отзыв тоже попадает в журнал — иначе доказательная цепочка рвётся', async () => {
    await service.grant(TENANT, LEARNER, 'personal_data', ctx());
    await service.revoke(TENANT, LEARNER, 'personal_data', ctx());
    expect(entries.map((e) => e.eventType)).toContain('consent.personal_data_revoked');
  });

  it('повторный отзыв не плодит вторую запись в журнале', async () => {
    await service.grant(TENANT, LEARNER, 'photo', ctx());
    await service.revoke(TENANT, LEARNER, 'photo', ctx());
    await service.revoke(TENANT, LEARNER, 'photo', ctx());
    expect(entries.filter((e) => e.eventType === 'consent.photo_revoked')).toHaveLength(1);
  });

  it('правка текста без изменения смысла не создаёт новую версию', async () => {
    const first = await service.saveDocument(TENANT, 'photo', 'Согласие на обработку изображения.');
    const same = await service.saveDocument(
      TENANT,
      'photo',
      '  Согласие на обработку изображения.  '
    );
    expect(same.version).toBe(first.version);

    const changed = await service.saveDocument(
      TENANT,
      'photo',
      'Согласие на обработку изображения и видеозаписи.'
    );
    expect(changed.version).toBe(first.version + 1);
  });

  it('слишком короткий текст согласия не сохраняется', async () => {
    await expect(service.saveDocument(TENANT, 'personal_data', 'ок')).rejects.toMatchObject({
      response: { code: 'validation_error' }
    });
  });

  it('изменение текста после согласия просит переподписать, но не запрещает подачу', async () => {
    await service.saveDocument(TENANT, 'photo', 'Согласие на обработку изображения.');
    await service.grant(TENANT, LEARNER, 'photo', ctx());
    await service.saveDocument(TENANT, 'photo', 'Согласие на обработку изображения и видео.');

    const state = await service.getState(TENANT, LEARNER, 'photo');
    expect(state.granted).toBe(true);
    expect(state.renewalRecommended).toBe(true);
    await expect(service.assertPhotoConsent(TENANT, LEARNER)).resolves.toBeUndefined();
  });

  it('согласия разных слушателей не смешиваются', async () => {
    await service.grant(TENANT, LEARNER, 'photo', ctx());
    const other = await service.getStatus(TENANT, 'learner_2');
    expect(other.photo.granted).toBe(false);
  });
});
