import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MvpService } from './mvp.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../audit/audit.service.js';

import type { RequestContext } from '../../common/context/request-context.js';
import type { DocumentsService } from '../documents/documents.service.js';
import type { FilesService } from '../files/files.service.js';

const noopDocumentsService = {
  listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 })
} as unknown as DocumentsService;

const noopFilesService = {
  ensureMaterialLink: async () => undefined
} as unknown as FilesService;

const context: RequestContext = {
  requestId: 'req_material_content',
  correlationId: 'corr_material_content',
  tenantId: 'tenant_demo',
  userId: 'u1',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

/**
 * Текст и ссылка у материала (ТЗ «Стабилизация, UX и развитие», 2.5.a / Б7, решение Р8).
 *
 * Из трёх базовых видов материала хранить было нечем ДВА. Текстовый урок печатал слушателю
 * «станет доступен после расширения backend полем textBody» — название поля базы вместо
 * учебного материала. Материал-ссылка всегда сообщал «ссылка пока не задана администратором»,
 * хотя задать её было НЕКУДА: поля не существовало. Курс из таких материалов пройти было
 * физически нельзя — это и есть жалоба Б7.
 */

const TENANT = 'tenant_demo';

describe('материал хранит текст и ссылку (ТЗ 2.5.a)', () => {
  let service: MvpService;
  let moduleId: string;

  beforeEach(() => {
    service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      new EventEmitter2()
    );

    const course = service.createCourse(
      TENANT,
      'u1',
      { code: 'C-1', title: 'Охрана труда' },
      context
    );
    /* Модуль крепится к ВЕРСИИ курса, а не к курсу: версия — то, что публикуют и проходят. */
    const version = service.createCourseVersion(TENANT, course.id);
    moduleId = service.createModule(
      TENANT,
      'u1',
      { courseVersionId: version.id, title: 'Вводный модуль', minViewSeconds: 0, isRequired: true },
      context
    ).id;
  });

  const createText = (textBody: string) =>
    service.createMaterial(
      TENANT,
      'u1',
      { moduleId, title: 'Текст инструктажа', materialType: 'text', textBody },
      context
    );

  const createLink = (externalUrl: string) =>
    service.createMaterial(
      TENANT,
      'u1',
      { moduleId, title: 'Запись вебинара', materialType: 'external_url', externalUrl },
      context
    );

  it('текст сохраняется и возвращается — это и есть сам материал', () => {
    const material = createText('Правила безопасной работы.\n\nВторой абзац.');
    expect(material.textBody).toContain('Правила безопасной работы.');

    const read = service
      .listMaterials(TENANT, { module_id: moduleId })
      .items.find((m) => m.id === material.id);
    expect(read?.textBody, 'прочитанный материал обязан нести текст').toContain('Второй абзац.');
  });

  it('ссылка сохраняется — раньше её негде было держать', () => {
    const material = createLink('https://webinar.example/zapis-1');
    expect(material.externalUrl).toBe('https://webinar.example/zapis-1');
  });

  it('адрес не по протоколу http(s) отвергается', () => {
    /*
     * Не придирка: значение попадает в ссылку на странице слушателя. `javascript:` — это
     * исполняемый код в его браузере, `file:` — попытка открыть чужой диск. Проверять обязан
     * сервер: административную часть можно обойти, а строка останется в базе навсегда.
     */
    expect(() => createLink('javascript:alert(1)')).toThrow(BadRequestException);
    expect(() => createLink('file:///etc/passwd')).toThrow(BadRequestException);
    expect(() => createLink('просто текст')).toThrow(BadRequestException);
  });

  it('содержимое кладётся только своему виду материала', () => {
    /* Текст у ссылки и ссылка у текста — поля, которые никто никогда не прочитает. */
    const link = service.createMaterial(
      TENANT,
      'u1',
      {
        moduleId,
        title: 'Ссылка с лишним текстом',
        materialType: 'external_url',
        externalUrl: 'https://example.org/a',
        textBody: 'этого тут быть не должно'
      },
      context
    );
    expect(link.textBody).toBeUndefined();

    const text = service.createMaterial(
      TENANT,
      'u1',
      {
        moduleId,
        title: 'Текст с лишней ссылкой',
        materialType: 'text',
        textBody: 'полезное',
        externalUrl: 'https://example.org/a'
      },
      context
    );
    expect(text.externalUrl).toBeUndefined();
  });

  it('правка меняет текст, а пустая строка его очищает', () => {
    const material = createText('было');
    service.updateMaterial(TENANT, 'u1', material.id, { textBody: 'стало' }, context);
    expect(
      service.listMaterials(TENANT, { module_id: moduleId }).items.find((m) => m.id === material.id)
        ?.textBody
    ).toBe('стало');

    service.updateMaterial(TENANT, 'u1', material.id, { textBody: '' }, context);
    expect(
      service.listMaterials(TENANT, { module_id: moduleId }).items.find((m) => m.id === material.id)
        ?.textBody,
      'пустая строка — осознанная очистка, а не «не передали»'
    ).toBeUndefined();
  });

  it('правка ссылки тоже проверяет протокол', () => {
    const material = createLink('https://example.org/a');
    expect(() =>
      service.updateMaterial(TENANT, 'u1', material.id, { externalUrl: 'javascript:1' }, context)
    ).toThrow(BadRequestException);
  });
});
