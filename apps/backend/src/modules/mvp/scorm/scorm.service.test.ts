import 'reflect-metadata';
import { Readable } from 'node:stream';

import { EventEmitter2 } from '@nestjs/event-emitter';
import AdmZip from 'adm-zip';
import { describe, expect, it, vi } from 'vitest';

import { ScormService } from './scorm.service.js';
import { TenantScopedRepository } from '../../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../../audit/audit.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MvpService } from '../mvp.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { S3StorageClient } from '../../../infrastructure/storage/s3-storage.client.js';
import type { DocumentsService } from '../../documents/documents.service.js';
import type { FilesService } from '../../files/files.service.js';
import type { Material } from '../mvp.types.js';

const noopDocumentsService = {
  listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 })
} as unknown as DocumentsService;

const T = 'tenant_demo';
const ADMIN = 'u_tenant_admin';
const ctx: RequestContext = {
  requestId: 'req_1',
  correlationId: 'corr_1',
  tenantId: T,
  userId: ADMIN,
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

const VALID_MANIFEST = `<?xml version="1.0"?>
<manifest identifier="m1">
  <metadata><schemaversion>1.2</schemaversion></metadata>
  <organizations default="org1"><organization identifier="org1">
    <title>Курс ОТ</title><item identifier="i1" identifierref="res1"><title>Урок</title></item>
  </organization></organizations>
  <resources><resource identifier="res1" type="webcontent" href="index.html">
    <file href="index.html"/></resource></resources>
</manifest>`;

const MANIFEST_2004 = `<?xml version="1.0"?>
<manifest identifier="m1">
  <metadata><schemaversion>2004 4th Edition</schemaversion></metadata>
  <organizations default="org1"><organization identifier="org1">
    <title>Курс</title><item identifier="i1" identifierref="res1"><title>Урок</title></item>
  </organization></organizations>
  <resources><resource identifier="res1" type="webcontent" href="index.html">
    <file href="index.html"/></resource></resources>
</manifest>`;

function makeZip(files: Record<string, string>): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) {
    zip.addFile(name, Buffer.from(content, 'utf8'));
  }
  return zip.toBuffer();
}

/**
 * Build a zip buffer that contains a traversal-path entry (../evil.js).
 * adm-zip.addFile() sanitizes entry names on write, so we use a same-length
 * placeholder name and patch the binary buffer directly — this produces a
 * valid zip that adm-zip can parse back with the traversal name intact.
 */
function makeZipWithTraversal(files: Record<string, string>, traversalName: string): Buffer {
  // placeholder must be same byte-length as traversalName for a clean in-place replacement
  const placeholder = 'X'.repeat(traversalName.length);
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) {
    zip.addFile(name, Buffer.from(content, 'utf8'));
  }
  zip.addFile(placeholder, Buffer.from('<evil>', 'utf8'));
  let buf = zip.toBuffer();

  const search = Buffer.from(placeholder);
  const replacement = Buffer.from(traversalName);
  let pos = 0;
  while (true) {
    const idx = buf.indexOf(search, pos);
    if (idx === -1) break;
    replacement.copy(buf, idx);
    pos = idx + replacement.length;
  }
  return buf;
}

function makeServices() {
  const state = new InMemoryMvpState();

  const filesMock = {
    createUploadIntent: vi.fn(async () => ({
      fileId: 'file_test_001',
      uploadUrl: 'https://minio.local/PUT-signed',
      storageKey: 'scorm-packages/tenant_demo/x.zip',
      expiresInSeconds: 900
    })),
    getReadableFile: vi.fn(async () => ({ storageKey: 'k', sizeBytes: 0 }))
  } as unknown as FilesService;

  const storageMock = {
    getObjectStream: vi.fn(),
    putObject: vi.fn(async () => undefined),
    deleteObject: vi.fn(async () => undefined),
    listObjectKeys: vi.fn(async () => [] as string[])
  } as unknown as S3StorageClient;

  const mvp = new MvpService(
    state,
    new TenantScopedRepository(),
    new AuditService(),
    noopDocumentsService,
    filesMock,
    new EventEmitter2()
  );

  const scorm = new ScormService(state, mvp, filesMock, storageMock, new AuditService());

  return { state, mvp, scorm, filesMock, storageMock };
}

function givenZip(
  buf: Buffer,
  filesMock: { getReadableFile: ReturnType<typeof vi.fn> },
  storageMock: { getObjectStream: ReturnType<typeof vi.fn> }
) {
  filesMock.getReadableFile.mockResolvedValue({ storageKey: 'k', sizeBytes: buf.length });
  storageMock.getObjectStream.mockResolvedValue(Readable.from(buf));
}

// ---------------------------------------------------------------------------
// registerPackage
// ---------------------------------------------------------------------------

describe('ScormService.registerPackage', () => {
  it('creates an uploaded package with deterministic storagePrefix scorm/<tenant>/<id>', () => {
    const { scorm } = makeServices();
    const pkg = scorm.registerPackage(T, ADMIN, { zipFileId: 'file_001' }, ctx);

    expect(pkg.packageStatus).toBe('uploaded');
    expect(pkg.zipFileId).toBe('file_001');
    expect(pkg.storagePrefix).toBe(`scorm/${T}/${pkg.id}`);
    expect(pkg.status).toBe('active');
    expect(pkg.tenantId).toBe(T);
  });

  it('uses provided title over default', () => {
    const { scorm } = makeServices();
    const pkg = scorm.registerPackage(T, ADMIN, { zipFileId: 'file_002', title: 'My Course' }, ctx);
    expect(pkg.title).toBe('My Course');
  });
});

// ---------------------------------------------------------------------------
// createPackageUploadIntent
// ---------------------------------------------------------------------------

describe('ScormService.createPackageUploadIntent', () => {
  it('calls files.createUploadIntent with keyPrefix scorm-packages, zip allowlist and env limit', async () => {
    const { scorm, filesMock } = makeServices();
    const result = await scorm.createPackageUploadIntent(T, {
      originalName: 'course.zip',
      contentType: 'application/zip',
      sizeBytes: 1024
    });

    expect(filesMock.createUploadIntent).toHaveBeenCalledWith(
      T,
      expect.objectContaining({ originalName: 'course.zip', contentType: 'application/zip' }),
      expect.objectContaining({
        keyPrefix: 'scorm-packages',
        mimeAllowlist: expect.any(Set),
        maxBytes: expect.any(Number)
      })
    );
    expect(result.fileId).toBe('file_test_001');
  });

  it('passes zip mime allowlist that includes application/zip and application/x-zip-compressed', async () => {
    const { scorm, filesMock } = makeServices();
    await scorm.createPackageUploadIntent(T, {
      originalName: 'course.zip',
      contentType: 'application/zip',
      sizeBytes: 1024
    });

    const callOptions = (filesMock.createUploadIntent as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(callOptions.mimeAllowlist.has('application/zip')).toBe(true);
    expect(callOptions.mimeAllowlist.has('application/x-zip-compressed')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// processPackage — happy path
// ---------------------------------------------------------------------------

describe('ScormService.processPackage — valid zip', () => {
  it('sets packageStatus=ready, calls putObject per entry with correct key and contentType', async () => {
    const { scorm, filesMock, storageMock } = makeServices();
    const zipBuf = makeZip({
      'imsmanifest.xml': VALID_MANIFEST,
      'index.html': '<html><body>SCORM</body></html>'
    });
    givenZip(zipBuf, filesMock as never, storageMock as never);

    const pkg = scorm.registerPackage(T, ADMIN, { zipFileId: 'file_zip' }, ctx);
    const processed = await scorm.processPackage(T, ADMIN, pkg.id, ctx);

    expect(processed.packageStatus).toBe('ready');
    expect(processed.launchHref).toBe('index.html');
    expect(processed.manifestTitle).toBe('Курс ОТ');
    expect(processed.entryCount).toBe(2);
    expect(typeof processed.totalBytes).toBe('number');

    // putObject called for each non-directory entry
    expect(storageMock.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: `${pkg.storagePrefix}/imsmanifest.xml`,
        contentType: 'application/xml'
      })
    );
    expect(storageMock.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: `${pkg.storagePrefix}/index.html`,
        contentType: 'text/html; charset=utf-8'
      })
    );
  });

  it('uses manifest title as package title when title was the default', async () => {
    const { scorm, filesMock, storageMock } = makeServices();
    const zipBuf = makeZip({
      'imsmanifest.xml': VALID_MANIFEST,
      'index.html': '<html>'
    });
    givenZip(zipBuf, filesMock as never, storageMock as never);

    const pkg = scorm.registerPackage(T, ADMIN, { zipFileId: 'file_z' }, ctx);
    const processed = await scorm.processPackage(T, ADMIN, pkg.id, ctx);

    expect(processed.title).toBe('Курс ОТ');
  });
});

// ---------------------------------------------------------------------------
// processPackage — missing imsmanifest.xml
// ---------------------------------------------------------------------------

describe('ScormService.processPackage — missing imsmanifest.xml', () => {
  it('sets packageStatus=failed, error=scorm_manifest_missing, does not throw', async () => {
    const { scorm, filesMock, storageMock } = makeServices();
    const zipBuf = makeZip({ 'index.html': '<html>' });
    givenZip(zipBuf, filesMock as never, storageMock as never);

    const pkg = scorm.registerPackage(T, ADMIN, { zipFileId: 'file_no_manifest' }, ctx);
    const result = await scorm.processPackage(T, ADMIN, pkg.id, ctx);

    expect(result.packageStatus).toBe('failed');
    expect(result.error).toBe('scorm_manifest_missing');
  });
});

// ---------------------------------------------------------------------------
// processPackage — SCORM 2004 manifest
// ---------------------------------------------------------------------------

describe('ScormService.processPackage — SCORM 2004 manifest', () => {
  it('sets packageStatus=failed, error=scorm_version_unsupported, does not throw', async () => {
    const { scorm, filesMock, storageMock } = makeServices();
    const zipBuf = makeZip({
      'imsmanifest.xml': MANIFEST_2004,
      'index.html': '<html>'
    });
    givenZip(zipBuf, filesMock as never, storageMock as never);

    const pkg = scorm.registerPackage(T, ADMIN, { zipFileId: 'file_2004' }, ctx);
    const result = await scorm.processPackage(T, ADMIN, pkg.id, ctx);

    expect(result.packageStatus).toBe('failed');
    expect(result.error).toBe('scorm_version_unsupported');
  });
});

// ---------------------------------------------------------------------------
// processPackage — unsafe path (../)
// ---------------------------------------------------------------------------
//
// We craft a zip binary where the entry name is literally '../evil.js':
// adm-zip.addFile() sanitizes on write, so we use a same-length placeholder
// name ('XXXXXXXXXX') and patch the bytes in the serialized buffer.
// This produces a valid, parseable zip where adm-zip sees the traversal name.

describe('ScormService.processPackage — unsafe zip path', () => {
  it('sets packageStatus=failed, error=scorm_zip_unsafe_path, calls listObjectKeys+deleteObject for cleanup', async () => {
    const { scorm, filesMock, storageMock } = makeServices();

    const traversalName = '../evil.js'; // 10 bytes
    const traversalBuf = makeZipWithTraversal(
      { 'imsmanifest.xml': VALID_MANIFEST, 'index.html': '<html>' },
      traversalName
    );

    const pkg = scorm.registerPackage(T, ADMIN, { zipFileId: 'file_unsafe' }, ctx);

    // Use the actual package's storagePrefix so cleanup verification targets the right prefix
    (storageMock.listObjectKeys as ReturnType<typeof vi.fn>).mockResolvedValue([
      `${pkg.storagePrefix}/imsmanifest.xml`
    ]);
    (filesMock.getReadableFile as ReturnType<typeof vi.fn>).mockResolvedValue({
      storageKey: 'k',
      sizeBytes: traversalBuf.length
    });
    (storageMock.getObjectStream as ReturnType<typeof vi.fn>).mockResolvedValue(
      Readable.from(traversalBuf)
    );

    const result = await scorm.processPackage(T, ADMIN, pkg.id, ctx);

    expect(result.packageStatus).toBe('failed');
    expect(result.error).toBe('scorm_zip_unsafe_path');
    // cleanup should have been attempted against the correct storagePrefix
    expect(storageMock.listObjectKeys).toHaveBeenCalled();
    expect(storageMock.deleteObject).toHaveBeenCalledWith(
      expect.objectContaining({ key: expect.stringContaining(pkg.storagePrefix) })
    );
  });
});

// ---------------------------------------------------------------------------
// processPackage — idempotency (ready → no-op)
// ---------------------------------------------------------------------------

describe('ScormService.processPackage — idempotency', () => {
  it('returns package immediately when already ready, getReadableFile not called again', async () => {
    const { scorm, filesMock, storageMock } = makeServices();
    const zipBuf = makeZip({
      'imsmanifest.xml': VALID_MANIFEST,
      'index.html': '<html>'
    });
    givenZip(zipBuf, filesMock as never, storageMock as never);

    const pkg = scorm.registerPackage(T, ADMIN, { zipFileId: 'file_idem' }, ctx);
    await scorm.processPackage(T, ADMIN, pkg.id, ctx); // first call

    // Reset mock call counts
    vi.clearAllMocks();

    const result = await scorm.processPackage(T, ADMIN, pkg.id, ctx); // second call
    expect(result.packageStatus).toBe('ready');
    expect(filesMock.getReadableFile).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deletePackage — in use
// ---------------------------------------------------------------------------

describe('ScormService.deletePackage — in use', () => {
  it('throws 409 scorm_package_in_use when a material references the package', async () => {
    const { state, scorm } = makeServices();
    const pkg = scorm.registerPackage(T, ADMIN, { zipFileId: 'file_del' }, ctx);

    // Push a material directly into state referencing this package
    const mat: Material = {
      id: 'mat_001',
      tenantId: T,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      moduleId: 'mod_001',
      title: 'SCORM Material',
      materialType: 'scorm',
      sortOrder: 0,
      minViewSeconds: 0,
      isRequired: true,
      scormPackageId: pkg.id
    };
    state.materials.push(mat);

    await expect(scorm.deletePackage(T, ADMIN, pkg.id, ctx)).rejects.toMatchObject({
      response: { code: 'scorm_package_in_use' }
    });
  });
});

// ---------------------------------------------------------------------------
// deletePackage — no references
// ---------------------------------------------------------------------------

describe('ScormService.deletePackage — no references', () => {
  it('calls listObjectKeys and deleteObject for cleanup, sets status=deleted', async () => {
    const { scorm, storageMock } = makeServices();
    const pkg = scorm.registerPackage(T, ADMIN, { zipFileId: 'file_del2' }, ctx);

    (storageMock.listObjectKeys as ReturnType<typeof vi.fn>).mockResolvedValue([
      `${pkg.storagePrefix}/imsmanifest.xml`,
      `${pkg.storagePrefix}/index.html`
    ]);

    const result = await scorm.deletePackage(T, ADMIN, pkg.id, ctx);

    expect(result).toEqual({ id: pkg.id, deleted: true });
    expect(storageMock.listObjectKeys).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: `${pkg.storagePrefix}/` })
    );
    expect(storageMock.deleteObject).toHaveBeenCalledTimes(2);

    // package should be soft-deleted
    expect(pkg.status).toBe('deleted');
  });

  it('throws NotFoundException when trying to get deleted package', async () => {
    const { scorm } = makeServices();
    const pkg = scorm.registerPackage(T, ADMIN, { zipFileId: 'file_del3' }, ctx);
    await scorm.deletePackage(T, ADMIN, pkg.id, ctx);

    expect(() => scorm.getPackageView(T, pkg.id)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Seed helper for launch/commit tests
// ---------------------------------------------------------------------------

function makeScormSeed() {
  const { state, mvp, scorm } = makeServices();

  const course = mvp.createCourse(T, ADMIN, { code: 'C1', title: 'Course' }, ctx);
  const version = mvp.createCourseVersion(T, course.id);
  const moduleEntity = mvp.createModule(
    T,
    ADMIN,
    { courseVersionId: version.id, title: 'M1', minViewSeconds: 0, isRequired: true },
    ctx
  );

  // Register a ready SCORM package (bypassing processPackage by mutating fields directly)
  const pkg = scorm.registerPackage(T, ADMIN, { zipFileId: 'file_1', title: 'P' }, ctx);
  pkg.packageStatus = 'ready';
  pkg.launchHref = 'index.html';

  // Push a scorm material directly (createMaterial scorm support is Task 12)
  const now = new Date().toISOString();
  const material: Material = {
    id: 'mat_scorm',
    tenantId: T,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    moduleId: moduleEntity.id,
    title: 'SCORM',
    materialType: 'scorm',
    sortOrder: 0,
    minViewSeconds: 0,
    isRequired: true,
    scormPackageId: pkg.id
  };
  state.materials.push(material);

  const group = mvp.createGroup(T, ADMIN, { code: 'G1', name: 'G' }, ctx);
  mvp.createGroupCourse(T, { groupId: group.id, courseId: course.id });

  const learner = mvp.createLearner(
    T,
    ADMIN,
    { code: 'L1', name: 'Jane Doe', linkedIamUserId: 'u_l1' },
    ctx
  );
  const enrollment = mvp.createEnrollment(
    T,
    ADMIN,
    { groupId: group.id, learnerId: learner.id },
    ctx
  );

  const ctxL1: RequestContext = { ...ctx, userId: 'u_l1' };

  return { state, mvp, scorm, pkg, material, learner, enrollment, ctxL1 };
}

// ---------------------------------------------------------------------------
// launchScormMaterial
// ---------------------------------------------------------------------------

describe('ScormService.launchScormMaterial — happy path', () => {
  it('creates an attempt with lessonStatus=not attempted, returns token and launchUrl', () => {
    const { scorm, enrollment } = makeScormSeed();
    const ctxL1: RequestContext = { ...ctx, userId: 'u_l1' };

    const res = scorm.launchScormMaterial(
      T,
      'u_l1',
      'mat_scorm',
      { enrollmentId: enrollment.id },
      ctxL1
    );

    expect(res.attempt.lessonStatus).toBe('not attempted');
    expect(res.attempt.enrollmentId).toBe(enrollment.id);
    expect(res.attempt.materialId).toBe('mat_scorm');
    expect(typeof res.token).toBe('string');
    expect(res.token.length).toBeGreaterThan(0);
    expect(res.launchUrl).toBe(`/api/v1/scorm-content/${res.token}/index.html`);
  });

  it('repeated launch returns the same attempt (one record per enrollment+material)', () => {
    const { scorm, enrollment, state } = makeScormSeed();
    const ctxL1: RequestContext = { ...ctx, userId: 'u_l1' };

    const res1 = scorm.launchScormMaterial(
      T,
      'u_l1',
      'mat_scorm',
      { enrollmentId: enrollment.id },
      ctxL1
    );
    const res2 = scorm.launchScormMaterial(
      T,
      'u_l1',
      'mat_scorm',
      { enrollmentId: enrollment.id },
      ctxL1
    );

    expect(res1.attempt.id).toBe(res2.attempt.id);
    // Only one record per enrollment+material in state
    const attempts = state.scormAttempts.filter(
      (a) => a.enrollmentId === enrollment.id && a.materialId === 'mat_scorm'
    );
    expect(attempts).toHaveLength(1);
  });
});

describe('ScormService.launchScormMaterial — non-scorm material → 412', () => {
  it('throws 412 domain_rule_violation when material is not scorm type', () => {
    const { state, scorm, enrollment } = makeScormSeed();
    const ctxL1: RequestContext = { ...ctx, userId: 'u_l1' };

    // Push a video material
    const now = new Date().toISOString();
    const videoMat: Material = {
      id: 'mat_video',
      tenantId: T,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      moduleId: state.modules.find((m) => m.tenantId === T)!.id,
      title: 'Video',
      materialType: 'video',
      sortOrder: 1,
      minViewSeconds: 0,
      isRequired: false
    };
    state.materials.push(videoMat);

    expect(() =>
      scorm.launchScormMaterial(T, 'u_l1', 'mat_video', { enrollmentId: enrollment.id }, ctxL1)
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'domain_rule_violation' })
      })
    );
  });
});

describe('ScormService.launchScormMaterial — package not ready → 412', () => {
  it('throws 412 scorm_package_not_ready when packageStatus is not ready', () => {
    const { scorm, pkg, enrollment } = makeScormSeed();
    const ctxL1: RequestContext = { ...ctx, userId: 'u_l1' };

    // Downgrade package back to uploaded
    pkg.packageStatus = 'uploaded';

    expect(() =>
      scorm.launchScormMaterial(T, 'u_l1', 'mat_scorm', { enrollmentId: enrollment.id }, ctxL1)
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: 'scorm_package_not_ready' })
      })
    );
  });
});

describe('ScormService.launchScormMaterial — wrong actor → ForbiddenException', () => {
  it('throws ForbiddenException when actorId does not match linkedIamUserId', () => {
    const { scorm, enrollment } = makeScormSeed();
    // Actor is u_other, not u_l1
    const ctxOther: RequestContext = { ...ctx, userId: 'u_other' };

    expect(() =>
      scorm.launchScormMaterial(
        T,
        'u_other',
        'mat_scorm',
        { enrollmentId: enrollment.id },
        ctxOther
      )
    ).toThrow(
      expect.objectContaining({ response: expect.objectContaining({ code: 'forbidden' }) })
    );
  });
});

// ---------------------------------------------------------------------------
// commitScormAttempt
// ---------------------------------------------------------------------------

describe('ScormService.commitScormAttempt — merge cmi + sum sessionSeconds', () => {
  it('merges cmi fields and sums sessionSeconds into totalSeconds', () => {
    const { scorm, enrollment } = makeScormSeed();
    const ctxL1: RequestContext = { ...ctx, userId: 'u_l1' };

    const { attempt } = scorm.launchScormMaterial(
      T,
      'u_l1',
      'mat_scorm',
      { enrollmentId: enrollment.id },
      ctxL1
    );

    const result = scorm.commitScormAttempt(
      T,
      'u_l1',
      attempt.id,
      {
        lessonStatus: 'incomplete',
        lessonLocation: 'page_2',
        suspendData: 'abc123',
        scoreRaw: 75,
        scoreMax: 100,
        scoreMin: 0,
        sessionSeconds: 30
      },
      ctxL1
    );

    expect(result.lessonStatus).toBe('incomplete');
    expect(result.lessonLocation).toBe('page_2');
    expect(result.suspendData).toBe('abc123');
    expect(result.scoreRaw).toBe(75);
    expect(result.scoreMax).toBe(100);
    expect(result.scoreMin).toBe(0);
    expect(result.totalSeconds).toBe(30);
    expect(result.lastCommitAt).toBeDefined();
  });

  it('accumulates totalSeconds across multiple commits', () => {
    const { scorm, enrollment } = makeScormSeed();
    const ctxL1: RequestContext = { ...ctx, userId: 'u_l1' };

    const { attempt } = scorm.launchScormMaterial(
      T,
      'u_l1',
      'mat_scorm',
      { enrollmentId: enrollment.id },
      ctxL1
    );

    scorm.commitScormAttempt(T, 'u_l1', attempt.id, { sessionSeconds: 40 }, ctxL1);
    const result = scorm.commitScormAttempt(T, 'u_l1', attempt.id, { sessionSeconds: 60 }, ctxL1);

    expect(result.totalSeconds).toBe(100);
  });
});

describe('ScormService.commitScormAttempt — lessonStatus=passed sets completedAt + materialProgress', () => {
  it('sets completedAt and creates materialProgress with status=completed on passed', () => {
    const { scorm, enrollment, state } = makeScormSeed();
    const ctxL1: RequestContext = { ...ctx, userId: 'u_l1' };

    const { attempt } = scorm.launchScormMaterial(
      T,
      'u_l1',
      'mat_scorm',
      { enrollmentId: enrollment.id },
      ctxL1
    );

    scorm.commitScormAttempt(
      T,
      'u_l1',
      attempt.id,
      { lessonStatus: 'passed', sessionSeconds: 10 },
      ctxL1
    );

    expect(attempt.completedAt).toBeDefined();
    // materialProgress should be created and completed
    const progress = state.materialProgress.find(
      (p) => p.enrollmentId === enrollment.id && p.materialId === 'mat_scorm'
    );
    expect(progress).toBeDefined();
    expect(progress!.status).toBe('completed');
  });

  it('repeat commit with passed does NOT change completedAt and progress remains completed', () => {
    const { scorm, enrollment, state } = makeScormSeed();
    const ctxL1: RequestContext = { ...ctx, userId: 'u_l1' };

    const { attempt } = scorm.launchScormMaterial(
      T,
      'u_l1',
      'mat_scorm',
      { enrollmentId: enrollment.id },
      ctxL1
    );

    scorm.commitScormAttempt(
      T,
      'u_l1',
      attempt.id,
      { lessonStatus: 'passed', sessionSeconds: 10 },
      ctxL1
    );
    const firstCompletedAt = attempt.completedAt;

    // Second commit with passed — should NOT change completedAt
    scorm.commitScormAttempt(
      T,
      'u_l1',
      attempt.id,
      { lessonStatus: 'passed', sessionSeconds: 5 },
      ctxL1
    );

    expect(attempt.completedAt).toBe(firstCompletedAt);

    // Still completed in progress
    const progress = state.materialProgress.filter(
      (p) => p.enrollmentId === enrollment.id && p.materialId === 'mat_scorm'
    );
    expect(progress.every((p) => p.status === 'completed')).toBe(true);
  });
});

describe('ScormService.commitScormAttempt — wrong actor → ForbiddenException', () => {
  it('throws ForbiddenException when committing another learner attempt', () => {
    const { scorm, enrollment } = makeScormSeed();
    const ctxL1: RequestContext = { ...ctx, userId: 'u_l1' };
    const ctxOther: RequestContext = { ...ctx, userId: 'u_other' };

    const { attempt } = scorm.launchScormMaterial(
      T,
      'u_l1',
      'mat_scorm',
      { enrollmentId: enrollment.id },
      ctxL1
    );

    expect(() =>
      scorm.commitScormAttempt(T, 'u_other', attempt.id, { sessionSeconds: 10 }, ctxOther)
    ).toThrow(
      expect.objectContaining({ response: expect.objectContaining({ code: 'forbidden' }) })
    );
  });
});
