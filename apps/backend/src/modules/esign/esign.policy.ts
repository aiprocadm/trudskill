import { BadRequestException, ConflictException } from '@nestjs/common';
import type { EsignApplicationStatus, SigningParticipantEntity, SigningParticipantStatus, SigningProcessEntity, SigningProcessStatus } from './esign.types.js';

const appTransitions: Record<EsignApplicationStatus, ReadonlyArray<EsignApplicationStatus>> = {
  draft: ['submitted'],
  submitted: ['under_review', 'rejected', 'expired'],
  under_review: ['approved', 'rejected', 'expired'],
  approved: ['reused', 'expired'],
  rejected: [],
  expired: [],
  reused: []
};

const processTransitions: Record<SigningProcessStatus, ReadonlyArray<SigningProcessStatus>> = {
  draft: ['prepared', 'cancelled'],
  prepared: ['awaiting_participants', 'cancelled'],
  awaiting_participants: ['in_signing', 'cancelled', 'failed'],
  in_signing: ['signed', 'failed', 'cancelled'],
  signed: [],
  failed: [],
  cancelled: []
};

const participantTransitions: Record<SigningParticipantStatus, ReadonlyArray<SigningParticipantStatus>> = {
  pending: ['invited', 'skipped', 'expired', 'signed'],
  invited: ['viewed', 'signed', 'rejected', 'skipped', 'expired'],
  viewed: ['signed', 'rejected', 'skipped', 'expired'],
  signed: [],
  rejected: [],
  skipped: [],
  expired: []
};

export class EsignStateMachine {
  static transitionApplication(current: EsignApplicationStatus, next: EsignApplicationStatus) {
    if (!appTransitions[current].includes(next)) throw new BadRequestException(`Invalid application transition: ${current} -> ${next}`);
  }

  static transitionProcess(current: SigningProcessStatus, next: SigningProcessStatus) {
    if (!processTransitions[current].includes(next)) throw new BadRequestException(`Invalid process transition: ${current} -> ${next}`);
  }

  static transitionParticipant(current: SigningParticipantStatus, next: SigningParticipantStatus) {
    if (!participantTransitions[current].includes(next)) throw new BadRequestException(`Invalid participant transition: ${current} -> ${next}`);
  }

  static assertApplicationReusable(status: EsignApplicationStatus) {
    if (status !== 'approved') throw new BadRequestException('Only approved application can be reused');
  }

  static assertApplicationEligibleForSigning(status: EsignApplicationStatus) {
    if (!['approved', 'reused'].includes(status)) throw new BadRequestException('Application must be approved or reused before signing process');
  }

  static assertProcessMutable(process: SigningProcessEntity) {
    if (process.status === 'signed' || process.status === 'cancelled') throw new BadRequestException('Terminal process is immutable');
  }

  static assertSigningOrder(process: SigningProcessEntity, participant: SigningParticipantEntity, allParticipants: SigningParticipantEntity[]) {
    if (!process.sequential) return;
    const minPending = allParticipants
      .filter((p) => !['signed', 'skipped', 'rejected', 'expired'].includes(p.status))
      .sort((a, b) => a.signOrder - b.signOrder)[0];
    if (!minPending || minPending.id !== participant.id) throw new BadRequestException('Participant cannot sign out of order for sequential process');
  }

  static assertSignedHasSignedAt(nextStatus: SigningParticipantStatus, signedAt?: string) {
    if (nextStatus === 'signed' && !signedAt) throw new BadRequestException('signed_at is required when participant status is signed');
  }

  static assertParticipantActor(participantUserId: string, actorId?: string) {
    if (!actorId || participantUserId !== actorId) throw new ConflictException('Participant can act only on their own signing assignment');
  }
}
