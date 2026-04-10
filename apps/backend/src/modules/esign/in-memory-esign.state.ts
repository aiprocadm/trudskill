import { Injectable } from '@nestjs/common';

import type {
  EsignApplicationEntity,
  EsignApplicationFileEntity,
  LegalLogEntryEntity,
  SignatureEventEntity,
  SigningParticipantEntity,
  SigningProcessEntity
} from './esign.types.js';

@Injectable()
export class InMemoryEsignState {
  applications: EsignApplicationEntity[] = [];
  applicationFiles: EsignApplicationFileEntity[] = [];
  processes: SigningProcessEntity[] = [];
  participants: SigningParticipantEntity[] = [];
  signatureEvents: SignatureEventEntity[] = [];
  legalLogEntries: LegalLogEntryEntity[] = [];
  idempotency = new Map<string, string>();
}
