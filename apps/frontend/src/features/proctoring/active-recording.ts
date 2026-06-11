'use client';

import { proctoringApi } from './api';

import type { ProctoringRecorder } from './recorder';
import type { UserSession } from '../../entities/session/model';

/**
 * Phase 4 Plan B: the running recorder must survive the client-side navigation
 * tests list → attempt page (Next App Router does not reload the page). A module-level
 * holder is the deliberate, minimal mechanism: the consent panel sets it, the attempt
 * screen reads it (● REC) and stops + completes it after submit.
 */
interface ActiveProctoringEntry {
  recordingId: string;
  recorder: ProctoringRecorder;
}

let active: ActiveProctoringEntry | null = null;

export function setActiveProctoring(entry: ActiveProctoringEntry): void {
  active = entry;
}

export function getActiveProctoring(): ActiveProctoringEntry | null {
  return active;
}

/**
 * Stops the MediaRecorder (flushes the tail chunk) and completes the backend session.
 * Idempotent and swallow-all: a completion problem must never block the result screen —
 * `POST :id/complete` is idempotent and gets retried by the admin-side semantics anyway.
 */
export async function stopAndCompleteActiveProctoring(session: UserSession): Promise<void> {
  if (!active) return;
  const entry = active;
  active = null;
  try {
    await entry.recorder.stop();
  } finally {
    await proctoringApi.complete(session, entry.recordingId).catch(() => undefined);
  }
}
