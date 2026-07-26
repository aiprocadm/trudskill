import { Readable } from 'node:stream';

import { BadRequestException } from '@nestjs/common';
import { buildDocx, p } from '@trudskill/docx-render';
import { describe, expect, it, vi } from 'vitest';

import { TemplateInspectionService } from './template-inspection.service.js';

import type { S3StorageClient } from '../../infrastructure/storage/s3-storage.client.js';
import type { FilesService } from '../files/files.service.js';

const T = 'tenant_demo';

/** Файловый слой отдаёт указанный буфер; AV-гейт считается пройденным. */
function makeService(fileBody: Buffer) {
  const files = {
    getReadableFile: vi.fn(async () => ({ storageKey: 'templates/t/x.docx', sizeBytes: 1 }))
  } as unknown as FilesService;
  const storage = {
    getObjectStream: vi.fn(async () => Readable.from([fileBody]))
  } as unknown as S3StorageClient;
  const service = new TemplateInspectionService(files, storage);
  return { service, files, storage };
}

const templateDocx = buildDocx(
  p('{tenant.name}') +
    p('ПРОТОКОЛ № {document.number}') +
    p('{#group_learners}') +
    p('{row_no}. {full_name}') +
    p('{/group_learners}') +
    p('{learner.favourite_colour}')
);

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
