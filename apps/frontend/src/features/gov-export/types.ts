// ОТ-реестр (Минтруд/ЕИСОТ) — frontend types mirroring apps/backend/src/modules/mvp/mvp.types.ts

export interface OtTrainingProgram {
  code: string;
  registryId: number;
  exactName: string;
  programKind: 'A' | 'B' | 'V' | 'first_aid' | 'siz' | 'other';
  isActive: boolean;
}

export interface OtRegistryRow {
  enrollmentId: string;
  learnerId: string;
  fullName: string;
  snils: string;
  position: string;
  employerInn: string;
  programCode: string;
  programRegistryId: number;
  programName: string;
  protocolNumber: string;
  knowledgeCheckDate: string; // ДД.ММ.ГГГГ
  result: 'удовлетворительно' | 'неудовлетворительно';
}

export interface OtRegistryRowError {
  enrollmentId: string;
  learnerId: string;
  fullName: string;
  field: string;
  message: string;
}

export type OtRegistryBatchStatus = 'generated' | 'partial' | 'failed';

export interface OtRegistryBatch {
  id: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  sourceFilterJson: Record<string, unknown>;
  fileId?: string;
  totalCandidates: number;
  exportedRows: number;
  failedRows: number;
  batchStatus: OtRegistryBatchStatus;
  generatedBy: string;
  format?: 'xlsx' | 'xml';
  signatureStatus?: 'unsigned' | 'signed' | 'failed';
  signatureFileId?: string;
}

export interface OtRegistryRecord {
  id: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  batchId: string;
  enrollmentId: string;
  learnerId: string;
  snils: string;
  programCode: string;
  programRegistryId: number;
  protocolNumber: string;
  registrationNumber?: string;
}

export interface OtRegistryExportOutcome {
  batchId: string;
  fileId?: string;
  total: number;
  exported: number;
  failed: number;
  rows: OtRegistryRow[];
  errors: OtRegistryRowError[];
}

export interface OtRegistryResponseRow {
  snils: string;
  protocolNumber: string;
  programRegistryId: number;
  registrationNumber: string;
}

export interface OtRegistryImportOutcome {
  matched: number;
  unmatched: number;
  unmatchedRows: OtRegistryResponseRow[];
}

// === ФИС ФРДО (Рособрнадзор) ===

export interface FrdoRegistryRow {
  documentId: string;
  enrollmentId: string;
  learnerId: string;
  documentKindCode: string;
  documentKind: string;
  registrationNumber: string;
  issueDate: string;
  lastName: string;
  firstName: string;
  middleName: string;
  fullName: string;
  snils: string;
  dateOfBirth: string;
  programName: string;
  academicHours: string;
  qualification: string;
}

export interface FrdoRegistryRowError {
  documentId: string;
  learnerId: string;
  fullName: string;
  field: string;
  message: string;
}

export interface FrdoRegistryBatch {
  id: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  sourceFilterJson: Record<string, unknown>;
  fileId?: string;
  totalCandidates: number;
  exportedRows: number;
  failedRows: number;
  batchStatus: 'generated' | 'partial' | 'failed';
  generatedBy: string;
  signatureStatus?: 'unsigned' | 'signed' | 'failed';
  signatureFileId?: string;
}

export interface FrdoRegistryExportOutcome {
  batchId: string;
  fileId?: string;
  total: number;
  exported: number;
  failed: number;
  rows: FrdoRegistryRow[];
  errors: FrdoRegistryRowError[];
}

// === ЕИСОТ «лица на тестирование» (Минтруд / ЛКОТ) ===

export interface EisotTestingRow {
  enrollmentId: string;
  learnerId: string;
  lastName: string;
  firstName: string;
  middleName: string;
  fullName: string;
  snils: string;
  dateOfBirth: string;
  position: string;
  employerName: string;
  employerInn: string;
  programName: string;
  referralDate: string;
}

export interface EisotTestingRowError {
  enrollmentId: string;
  learnerId: string;
  fullName: string;
  field: string;
  message: string;
}

export interface EisotTestingBatch {
  id: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  sourceFilterJson: Record<string, unknown>;
  fileId?: string;
  totalCandidates: number;
  exportedRows: number;
  failedRows: number;
  batchStatus: 'generated' | 'partial' | 'failed';
  generatedBy: string;
  signatureStatus?: 'unsigned' | 'signed' | 'failed';
  signatureFileId?: string;
}

export interface EisotTestingExportOutcome {
  batchId: string;
  fileId?: string;
  total: number;
  exported: number;
  failed: number;
  rows: EisotTestingRow[];
  errors: EisotTestingRowError[];
}

// === Ростехнадзор (промышленная безопасность) — Phase 6 ===

export interface RostechnadzorRow {
  enrollmentId: string;
  learnerId: string;
  lastName: string;
  firstName: string;
  middleName: string;
  fullName: string;
  snils: string;
  position: string;
  employerName: string;
  employerInn: string;
  attestationArea: string;
  protocolNumber: string;
  knowledgeCheckDate: string;
  result: string;
}

export interface RostechnadzorRowError {
  enrollmentId: string;
  learnerId: string;
  fullName: string;
  field: string;
  message: string;
}

export interface RostechnadzorBatch {
  id: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  sourceFilterJson: Record<string, unknown>;
  fileId?: string;
  totalCandidates: number;
  exportedRows: number;
  failedRows: number;
  batchStatus: 'generated' | 'partial' | 'failed';
  generatedBy: string;
  signatureStatus?: 'unsigned' | 'signed' | 'failed';
  signatureFileId?: string;
}

export interface RostechnadzorExportOutcome {
  batchId: string;
  fileId?: string;
  total: number;
  exported: number;
  failed: number;
  rows: RostechnadzorRow[];
  errors: RostechnadzorRowError[];
}

// === Минздрав-НМО (НМО, ЗЕТ) — Phase 6 ===

export interface NmoRow {
  documentId: string;
  enrollmentId: string;
  learnerId: string;
  lastName: string;
  firstName: string;
  middleName: string;
  fullName: string;
  snils: string;
  specialty: string;
  programName: string;
  creditUnits: string;
  completionDate: string;
  documentNumber: string;
}

export interface NmoRowError {
  documentId: string;
  learnerId: string;
  fullName: string;
  field: string;
  message: string;
}

export interface NmoBatch {
  id: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  sourceFilterJson: Record<string, unknown>;
  fileId?: string;
  totalCandidates: number;
  exportedRows: number;
  failedRows: number;
  batchStatus: 'generated' | 'partial' | 'failed';
  generatedBy: string;
  signatureStatus?: 'unsigned' | 'signed' | 'failed';
  signatureFileId?: string;
}

export interface NmoExportOutcome {
  batchId: string;
  fileId?: string;
  total: number;
  exported: number;
  failed: number;
  rows: NmoRow[];
  errors: NmoRowError[];
}
