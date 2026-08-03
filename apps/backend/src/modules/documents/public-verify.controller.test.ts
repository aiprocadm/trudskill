import { Module, NotFoundException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { InMemoryDocumentsState } from './in-memory-documents.state.js';
import { DOCUMENTS_PERSISTENCE_BACKEND } from './infrastructure/documents-persistence.token.js';
import { MemoryDocumentsPersistenceBackend } from './infrastructure/memory-documents-persistence.backend.js';
import { PublicVerifyController } from './public-verify.controller.js';
import { AuditService } from '../audit/audit.service.js';
import { TenantService } from '../tenant/tenant.service.js';

import type { GeneratedDocumentEntity } from './documents.types.js';

function makeDoc(overrides: Partial<GeneratedDocumentEntity> = {}): GeneratedDocumentEntity {
  return {
    id: 'gdoc_x',
    tenantId: 't1',
    templateId: 'tpl',
    templateVersionId: 'tplv',
    documentType: 'certificate',
    name: 'Doc',
    sourceEntityType: 'enrollment',
    sourceEntityId: 'enr',
    fileId: 'f',
    status: 'generated',
    documentNumber: 'N-1',
    documentDate: '2026-05-26',
    isFinal: false,
    generatedAt: '2026-05-26T00:00:00.000Z',
    qrToken: 'AbC123XyZ_-token456789',
    ...overrides
  };
}

// ФТ-D3.1: заглушка TenantService для подписи центра; поведение переопределяется в тестах.
function makeTenantServiceStub(
  overrides: { getTenantById?: () => Promise<unknown>; getBranding?: () => Promise<unknown> } = {}
) {
  return {
    getTenantById:
      overrides.getTenantById ??
      (async () => ({ id: 't1', code: 'demo', name: 'Demo Tenant', status: 'active' })),
    getBranding: overrides.getBranding ?? (async () => ({}))
  } as never;
}

function makeService(tenantService = makeTenantServiceStub()) {
  // The public path has NO tenant context and NO request-scoped state — it must find
  // documents cross-tenant in the DURABLE backend. We seed the backend (not a hand-held
  // service state), which is exactly the production wiring the old test failed to exercise.
  const backend = new MemoryDocumentsPersistenceBackend();
  const audit = new AuditService();
  const controller = new PublicVerifyController(backend, audit, tenantService);

  async function seed(doc: GeneratedDocumentEntity): Promise<void> {
    const state = new InMemoryDocumentsState();
    await backend.loadIntoState(doc.tenantId, state);
    state.generatedDocuments.push(doc);
    await backend.saveFromState(doc.tenantId, state);
  }

  return { backend, audit, controller, seed };
}

describe('PublicVerifyController (Plan C §5.8)', () => {
  it('finds a document that lives only in the durable backend (regression: empty request state)', async () => {
    const { controller, seed } = makeService();
    // No request-scoped state is ever populated — the doc is only in persistence.
    await seed(makeDoc({ id: 'gdoc_real', qrToken: 'realtoken1234567890ab' }));
    const result = await controller.verify('realtoken1234567890ab');
    expect(result.status).toBe('valid');
    expect(result.documentId).toBe('gdoc_real');
    expect(result.documentNumber).toBe('N-1');
    expect(result.documentType).toBe('certificate');
    expect(result.issueDate).toBe('2026-05-26');
  });

  // === ФТ-D3.1 — подпись выдавшего центра на публичной странице ===

  it('без бренда issuerName = название тенанта, логотип/цвет не отдаются', async () => {
    const { controller, seed } = makeService();
    await seed(makeDoc({ id: 'gdoc_issuer', qrToken: 'issuertoken1234567890' }));
    const result = await controller.verify('issuertoken1234567890');
    expect(result.issuerName).toBe('Demo Tenant');
    expect(result.issuerLogoUrl).toBeUndefined();
    expect(result.issuerBrandColor).toBeUndefined();
  });

  it('бренд перекрывает название и добавляет логотип и цвет', async () => {
    const tenantService = makeTenantServiceStub({
      getBranding: async () => ({
        displayName: 'УЦ «Пример»',
        logoUrl: 'https://cdn.example.ru/logo.png',
        brandColor: '#3b4fe4'
      })
    });
    const { controller, seed } = makeService(tenantService);
    await seed(makeDoc({ id: 'gdoc_brand', qrToken: 'brandtoken12345678901' }));
    const result = await controller.verify('brandtoken12345678901');
    expect(result.issuerName).toBe('УЦ «Пример»');
    expect(result.issuerLogoUrl).toBe('https://cdn.example.ru/logo.png');
    expect(result.issuerBrandColor).toBe('#3b4fe4');
  });

  it('сбой чтения бренда не валит публичную проверку — ответ без подписи центра', async () => {
    const tenantService = makeTenantServiceStub({
      getTenantById: async () => {
        throw new Error('db down');
      },
      getBranding: async () => {
        throw new Error('db down');
      }
    });
    const { controller, seed } = makeService(tenantService);
    await seed(makeDoc({ id: 'gdoc_nobrand', qrToken: 'nobrandtoken123456789' }));
    const result = await controller.verify('nobrandtoken123456789');
    expect(result.status).toBe('valid');
    expect(result.issuerName).toBeUndefined();
  });

  it('throws NotFoundException with document_not_found code for unknown token', async () => {
    const { controller } = makeService();
    await expect(controller.verify('unknown_token_aaaaaaaaa')).rejects.toBeInstanceOf(
      NotFoundException
    );
    const caught = await controller.verify('unknown_token_aaaaaaaaa').catch((e: unknown) => e);
    const response = (caught as NotFoundException).getResponse() as Record<string, unknown>;
    expect(response.code).toBe('document_not_found');
  });

  it('finds a document in ANOTHER tenant without leaking tenantId', async () => {
    const { controller, seed } = makeService();
    await seed(
      makeDoc({ id: 'gdoc_t2', tenantId: 'secret_tenant', qrToken: 'tt_token_1234567890ab' })
    );
    const result = await controller.verify('tt_token_1234567890ab');
    expect(result.status).toBe('valid');
    expect(result.documentId).toBe('gdoc_t2');
    expect(Object.keys(result)).not.toContain('tenantId');
    expect(JSON.stringify(result)).not.toContain('secret_tenant');
  });

  it('writes audit entry via writeCritical (awaited)', async () => {
    const { audit, controller, seed } = makeService();
    const spy = vi.spyOn(audit, 'writeCritical');
    await seed(makeDoc({ qrToken: 'AbCdEFGhIJKLMNOPQRSTUV' }));
    await controller.verify('AbCdEFGhIJKLMNOPQRSTUV');
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'public',
        action: 'documents.qr_verification_requested'
      })
    );
    const call = spy.mock.calls[0]?.[0] as { entityId?: string } | undefined;
    expect(call?.entityId).toBe('AbCd…');
    expect(call?.entityId).not.toContain('IJKL');
  });

  it('returns status="revoked" for revoked documents (Plan C §5.9 wiring)', async () => {
    const { controller, seed } = makeService();
    await seed(
      makeDoc({ id: 'gdoc_rev', qrToken: 'rev_token_1234567890ab', status: 'revoked' as never })
    );
    const result = await controller.verify('rev_token_1234567890ab');
    expect(result.status).toBe('revoked');
  });

  it('rejects empty / too-short tokens as not_found', async () => {
    const { controller } = makeService();
    await expect(controller.verify('')).rejects.toThrow(NotFoundException);
    await expect(controller.verify('abc')).rejects.toThrow(NotFoundException);
  });
});

describe('PublicVerifyController PII protection', () => {
  it('response does NOT include learnerFullName, snils, programTitle, academicHours', async () => {
    const { controller, seed } = makeService();
    await seed(makeDoc({ id: 'gdoc_pii', qrToken: 'pii_token_1234567890ab' }));
    const result = await controller.verify('pii_token_1234567890ab');
    const keys = Object.keys(result);
    expect(keys).not.toContain('learnerFullName');
    expect(keys).not.toContain('snils');
    expect(keys).not.toContain('programTitle');
    // issuerName — НЕ ПДн слушателя, а имя выдавшей организации: с ФТ-D3.1 оно
    // намеренно публично (подпись центра на странице проверки). tenantId по-прежнему скрыт.
    expect(keys).not.toContain('tenantId');
    expect(keys).not.toContain('academicHours');
  });

  it('revoked response — НЕ раскрывает revokedBy (actor)', async () => {
    const { controller, seed } = makeService();
    await seed(
      makeDoc({
        id: 'gdoc_revoked',
        qrToken: 'rev_pii_1234567890ab',
        status: 'revoked' as never,
        revokedBy: 'secret_admin_id',
        revokedAt: '2026-05-01T00:00:00.000Z',
        revocationReason: 'причина'
      } as never)
    );
    const result = await controller.verify('rev_pii_1234567890ab');
    expect(result.status).toBe('revoked');
    expect(result).not.toHaveProperty('revokedBy');
    expect(JSON.stringify(result)).not.toContain('secret_admin_id');
  });
});

describe('PublicVerifyController rate-limit configuration', () => {
  it('verify method has @Throttle decorator with limit=30 ttl=60s', () => {
    const verifyFn = PublicVerifyController.prototype.verify;
    const ttl = Reflect.getMetadata('THROTTLER:TTLdefault', verifyFn) as number | undefined;
    const limit = Reflect.getMetadata('THROTTLER:LIMITdefault', verifyFn) as number | undefined;
    expect(ttl).toBe(60_000);
    expect(limit).toBe(30);
  });

  it('verify method применяет ThrottlerGuard — без него @Throttle «спит» (ФТ-G2)', () => {
    // Глобального ThrottlerGuard в app.module нет: лимиты навешиваются по-роутно через
    // @UseGuards(ThrottlerGuard). Если guard забыт — @Throttle не действует и это регрессия.
    const guards =
      (Reflect.getMetadata('__guards__', PublicVerifyController.prototype.verify) as
        | Array<{ name?: string }>
        | undefined) ?? [];
    expect(guards.some((g) => g === ThrottlerGuard || g?.name === 'ThrottlerGuard')).toBe(true);
  });
});

describe('PublicVerifyController rate-limit enforcement (HTTP, ФТ-G2)', () => {
  let app: { close: () => Promise<void>; getHttpServer: () => { address: () => unknown } };
  let baseUrl = '';

  beforeAll(async () => {
    @Module({
      imports: [ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 30 }] })],
      controllers: [PublicVerifyController],
      providers: [
        {
          provide: DOCUMENTS_PERSISTENCE_BACKEND,
          useValue: new MemoryDocumentsPersistenceBackend()
        },
        { provide: AuditService, useValue: new AuditService() },
        { provide: TenantService, useValue: makeTenantServiceStub() }
      ]
    })
    class TestModule {}

    const created = await NestFactory.create(TestModule, { logger: false, abortOnError: false });
    await created.listen(0, '127.0.0.1');
    const addr = created.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
    app = created as never;
  }, 120_000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('31-й запрос за минуту с одного IP → 429 (лимит 30/мин реально применяется)', async () => {
    const url = `${baseUrl}/public/verify/unknown_token_aaaaaaaaa`;
    // Первые 30 — проходят до контроллера (вернут 404 unknown token), 31-й — отбит throttler.
    let lastStatus = 0;
    for (let i = 0; i < 30; i += 1) {
      lastStatus = (await fetch(url)).status;
    }
    expect(lastStatus).toBe(404); // до лимита — обычный ответ контроллера
    const blocked = await fetch(url);
    expect(blocked.status).toBe(429); // 31-й — Too Many Requests
  }, 30_000);
});
