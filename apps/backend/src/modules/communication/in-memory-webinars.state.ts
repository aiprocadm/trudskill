import { Injectable } from '@nestjs/common';

export interface WebinarRow {
  id: string;
  tenantId: string;
  groupId?: string;
  courseId?: string;
  title: string;
  description?: string;
  providerCode?: string;
  providerSessionId?: string;
  plannedStartAt: string;
  plannedEndAt: string;
  joinUrl?: string;
  hostUrl?: string;
  status: 'draft' | 'planned' | 'live' | 'completed' | 'cancelled';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
export interface WebinarParticipantRow {
  webinarId: string;
  tenantId: string;
  userId?: string;
  learnerId?: string;
  roleCode: string;
  attendanceStatus: 'invited' | 'joined' | 'left';
  joinedAt?: string;
  leftAt?: string;
  durationSeconds?: number;
}

@Injectable()
export class InMemoryWebinarsState {
  webinars: WebinarRow[] = [];
  participants: WebinarParticipantRow[] = [];
}
