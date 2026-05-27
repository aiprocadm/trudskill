import { describe, expect, it } from 'vitest';

import { learnerDocumentsApi } from './api';
import { LearnerDocumentsList } from './documents-list';
import { LearnerDocumentsScreen } from './learner-documents-screen';

import type { LearnerDocument, LearnerDocumentsResponse } from './types';

describe('LearnerDocument type (Phase 1 §4.3)', () => {
  it('минимальная форма документа', () => {
    const doc: LearnerDocument = {
      id: 'd_1',
      documentType: 'certificate',
      name: 'Удостоверение №1',
      status: 'final',
      enrollmentId: 'enr_1',
      courseTitle: 'Охрана труда',
      downloadUrl: '',
      isDownloadable: false
    };
    expect(doc.id).toBe('d_1');
    expect(doc.isDownloadable).toBe(false);
  });

  it('Принимает все опциональные поля §5.8/§5.9', () => {
    const doc: LearnerDocument = {
      id: 'd_2',
      documentType: 'diploma',
      name: 'Диплом №7',
      documentNumber: 'ДП-007',
      documentDate: '2026-05-10',
      status: 'revoked',
      qrToken: 'qr_abc',
      enrollmentId: 'enr_1',
      courseId: 'course_1',
      courseTitle: 'Охрана труда',
      downloadUrl: '/api/v1/files/file_x/download',
      isDownloadable: true,
      revocationReason: 'Ошибка ФИО',
      replacedByDocumentId: 'd_3'
    };
    expect(doc.qrToken).toBe('qr_abc');
    expect(doc.revocationReason).toBe('Ошибка ФИО');
  });

  it('LearnerDocumentsResponse — обёртка с items', () => {
    const response: LearnerDocumentsResponse = { items: [] };
    expect(response.items).toEqual([]);
  });
});

describe('learner-documents — компоненты экспортированы как функции', () => {
  it('LearnerDocumentsList', () => {
    expect(typeof LearnerDocumentsList).toBe('function');
  });
  it('LearnerDocumentsScreen', () => {
    expect(typeof LearnerDocumentsScreen).toBe('function');
  });
});

describe('learnerDocumentsApi — поверхность API', () => {
  it('экспортирует listMine и listForEnrollment', () => {
    expect(typeof learnerDocumentsApi.listMine).toBe('function');
    expect(typeof learnerDocumentsApi.listForEnrollment).toBe('function');
  });
});
