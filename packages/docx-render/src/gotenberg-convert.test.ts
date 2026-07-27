import { describe, expect, it, vi } from 'vitest';

import { DocumentConversionError, convertDocxToPdf } from './gotenberg-convert.js';

const DOCX = Buffer.from('PK fake docx');
const PDF = Buffer.from('%PDF-1.7\n...binary...');
const DEPS = { gotenbergUrl: 'http://gotenberg:3000' };

describe('convertDocxToPdf (ФТ-A1.3)', () => {
  it('posts multipart to /forms/libreoffice/convert with a .docx filename', async () => {
    const fetchFn = vi.fn(async () => new Response(new Uint8Array(PDF), { status: 200 }));
    const pdf = await convertDocxToPdf(DOCX, { ...DEPS, fetchFn: fetchFn as never });

    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const [url, init] = fetchFn.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('http://gotenberg:3000/forms/libreoffice/convert');
    expect(init.method).toBe('POST');
    const form = init.body as FormData;
    const file = form.get('files') as File;
    // Расширение имени — то, по чему LibreOffice выбирает конвертер.
    expect(file.name).toBe('document.docx');
    expect(await file.text()).toContain('fake docx');
  });

  it('trims a trailing slash in the base URL', async () => {
    const fetchFn = vi.fn(async () => new Response(new Uint8Array(PDF), { status: 200 }));
    await convertDocxToPdf(DOCX, {
      gotenbergUrl: 'http://gotenberg:3000/',
      fetchFn: fetchFn as never
    });
    expect((fetchFn.mock.calls[0]! as unknown as [string])[0]).toBe(
      'http://gotenberg:3000/forms/libreoffice/convert'
    );
  });

  it('4xx (LibreOffice cannot open the file) → retryable=false: retry is pointless', async () => {
    const fetchFn = vi.fn(async () => new Response('malformed document', { status: 400 }));
    const error = await convertDocxToPdf(DOCX, { ...DEPS, fetchFn: fetchFn as never }).catch(
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(DocumentConversionError);
    expect((error as DocumentConversionError).retryable).toBe(false);
  });

  it('5xx → plain Error so the consume loop retries with backoff', async () => {
    const fetchFn = vi.fn(async () => new Response('boom', { status: 503 }));
    const error = await convertDocxToPdf(DOCX, { ...DEPS, fetchFn: fetchFn as never }).catch(
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(DocumentConversionError);
    expect((error as DocumentConversionError).retryable).toBe(true);
    expect((error as Error).message).toMatch(/http=503/);
  });

  it('network failure/timeout → retryable Error mentioning unreachable', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('connect ECONNREFUSED');
    });
    const error = await convertDocxToPdf(DOCX, { ...DEPS, fetchFn: fetchFn as never }).catch(
      (e: unknown) => e
    );
    expect((error as DocumentConversionError).retryable).toBe(true);
    expect((error as Error).message).toMatch(/unreachable/);
  });

  it('200 but a non-PDF body → retryable service error (never stored as a document)', async () => {
    const fetchFn = vi.fn(async () => new Response('<html>proxy error</html>', { status: 200 }));
    const error = await convertDocxToPdf(DOCX, { ...DEPS, fetchFn: fetchFn as never }).catch(
      (e: unknown) => e
    );
    expect((error as DocumentConversionError).retryable).toBe(true);
    expect((error as Error).message).toMatch(/non-PDF/);
  });
});
