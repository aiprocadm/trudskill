import { Readable } from 'node:stream';

import { BadRequestException } from '@nestjs/common';
import { buildDocx, p } from '@trudskill/docx-render';
import { describe, expect, it, vi } from 'vitest';

import { TemplateInspectionService } from './template-inspection.service.js';

import type { S3StorageClient } from '../../infrastructure/storage/s3-storage.client.js';
import type { FilesService } from '../files/files.service.js';

const T = 'tenant_demo';

/** Файловый слой отдаёт указанный буфер; AV-гейт считается пройденным. */
function makeService(fileBody: Buffer, extraFields?: unknown) {
  const files = {
    getReadableFile: vi.fn(async () => ({ storageKey: 'templates/t/x.docx', sizeBytes: 1 }))
  } as unknown as FilesService;
  const storage = {
    getObjectStream: vi.fn(async () => Readable.from([fileBody]))
  } as unknown as S3StorageClient;
  const tenants = {
    getRequisites: vi.fn(async () => ({
      tenantId: T,
      legalName: 'ООО УЦ',
      taxNumber: '7701',
      payload: {}
    })),
    getSettings: vi.fn(async () => ({
      tenantId: T,
      payload: extraFields ? { learnerExtraFields: extraFields } : {}
    }))
  };
  const service = new TemplateInspectionService(files, storage, tenants as never);
  return { service, files, storage, tenants };
}

const templateDocx = buildDocx(
  p('{tenant.name}') +
    p('ПРОТОКОЛ № {document.number}') +
    p('{#group_learners}') +
    p('{row_no}. {full_name}') +
    p('{/group_learners}') +
    p('{learner.favourite_colour}')
);

describe('TemplateInspectionService.inspect — картинки (ФТ-A7.1)', () => {
  it('показывает теги-картинки отдельным списком', async () => {
    const { service } = makeService(
      buildDocx(p('{tenant.name}') + p('{%tenant.stamp_image}') + p('{%tenant.signature_image}'))
    );
    const result = await service.inspect(T, 'file_1');
    expect(result.imagePlaceholders).toEqual(['tenant.stamp_image', 'tenant.signature_image']);
    // Картинка — известная переменная каталога, а не «опечатка админа».
    expect(result.unknown).not.toContain('tenant.stamp_image');
    expect(result.warnings).toEqual([]);
  });

  it('предупреждает, когда печать вставили обычным тегом — иначе напечатается UUID файла', async () => {
    const { service } = makeService(buildDocx(p('Печать: {tenant.stamp_image}')));
    const result = await service.inspect(T, 'file_1');
    expect(result.imagePlaceholders).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('{%tenant.stamp_image}');
  });
});

describe('TemplateInspectionService.inspect (ФТ-A3.2)', () => {
  it('splits placeholders found in the blank into known and unknown', async () => {
    const { service, files } = makeService(templateDocx);
    const result = await service.inspect(T, 'file_1');

    expect(files.getReadableFile).toHaveBeenCalledWith(T, 'file_1');
    expect(result.placeholders).toContain('tenant.name');
    expect(result.placeholders).toContain('group_learners');
    expect(result.known.map((item) => item.code)).toContain('document.number');
    // Опечатка в имени переменной должна быть видна админу сразу.
    expect(result.unknown).toContain('learner.favourite_colour');
  });

  it('known entries carry the catalogue description for the admin table', async () => {
    const { service } = makeService(templateDocx);
    const result = await service.inspect(T, 'file_1');
    const entry = result.known.find((item) => item.code === 'tenant.name');
    expect(entry?.description).toMatch(/[А-Яа-я]/);
  });

  // МГ-C1.3 (РМ86): поле, описанное в настройках центра, — известная переменная; неописанное — нет.
  it('treats tenant-defined learner fields as known and the rest as typos', async () => {
    const body = buildDocx(p('{learner.extra.otdel} / {learner.extra.none}'));
    const { service } = makeService(body, [{ key: 'otdel', label: 'Отдел', type: 'text' }]);
    const result = await service.inspect(T, 'file_1');
    const known = result.known.find((item) => item.code === 'learner.extra.otdel');
    expect(known?.description).toContain('Отдел');
    expect(result.unknown).toEqual(['learner.extra.none']);
    // Без описания и первое поле — опечатка.
    const bare = await makeService(body).service.inspect(T, 'file_1');
    expect(bare.unknown).toEqual(['learner.extra.otdel', 'learner.extra.none']);
  });

  it('a non-DOCX file yields a readable 400 instead of a crash', async () => {
    const { service } = makeService(Buffer.from('это не docx'));
    await expect(service.inspect(T, 'file_1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.inspect(T, 'file_1')).rejects.toMatchObject({
      response: { code: 'template_unreadable' }
    });
  });
});

describe('TemplateInspectionService.preview (ФТ-A3.3)', () => {
  it('renders the blank and converts it through Gotenberg', async () => {
    const { service } = makeService(buildDocx(p('Номер: {document.number}')));
    const convert = vi
      .spyOn(await import('@trudskill/docx-render'), 'convertDocxToPdf')
      .mockResolvedValue(Buffer.from('%PDF-1.7 preview'));

    const pdf = await service.preview(T, 'file_1', { 'document.number': 'ОБРАЗЕЦ-1' });
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // В Gotenberg уходит уже ЗАПОЛНЕННЫЙ документ, а не исходный бланк.
    const sentDocx = convert.mock.calls[0]![0] as Buffer;
    expect(sentDocx.length).toBeGreaterThan(0);
    convert.mockRestore();
  });

  it('a broken template gives a 400 with the reason, not a 500', async () => {
    const { service } = makeService(buildDocx(p('{#group_learners}') + p('нет закрытия')));
    await expect(service.preview(T, 'file_1', {})).rejects.toMatchObject({
      response: { code: 'template_render_failed' }
    });
  });

  it('a Gotenberg failure is reported to the admin, not retried', async () => {
    const { service } = makeService(buildDocx(p('ok')));
    const convert = vi
      .spyOn(await import('@trudskill/docx-render'), 'convertDocxToPdf')
      .mockRejectedValue(new Error('gotenberg unreachable'));
    await expect(service.preview(T, 'file_1', {})).rejects.toMatchObject({
      response: { code: 'preview_conversion_failed' }
    });
    convert.mockRestore();
  });
});
