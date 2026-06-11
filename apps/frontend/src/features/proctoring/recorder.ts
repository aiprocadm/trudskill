/**
 * Phase 4 Plan B: pure recording state machine over injected browser deps.
 * idle → acquiring → recording → uploading-tail → completed | error.
 * No direct MediaRecorder/getUserMedia usage — screens.tsx wires the real APIs,
 * tests inject fakes (project convention: no React render / no browser in tests).
 */

export type RecorderPhase =
  | 'idle'
  | 'acquiring'
  | 'recording'
  | 'uploading-tail'
  | 'completed'
  | 'error';

export interface MediaStreamLike {
  getTracks(): Array<{ stop(): void }>;
}

export interface MediaRecorderLike {
  start(timesliceMs: number): void;
  stop(): void;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
}

export interface ProctoringRecorderDeps {
  getUserMedia: () => Promise<MediaStreamLike>;
  createRecorder: (stream: MediaStreamLike) => MediaRecorderLike;
  /** Uploads one chunk (presigned intent + PUT); throws on failure. */
  uploadChunk: (sequence: number, blob: Blob) => Promise<void>;
  /** MediaRecorder timeslice; spec §2.2 = 30 seconds. */
  timesliceMs?: number;
  onPhaseChange?: (phase: RecorderPhase) => void;
}

export const DEFAULT_TIMESLICE_MS = 30_000;

export class ProctoringRecorder {
  private phaseValue: RecorderPhase = 'idle';
  private nextSequence: number;
  /** Sequential queue: at most one chunk in flight, order preserved. */
  private uploadQueue: Promise<void> = Promise.resolve();
  private stream: MediaStreamLike | null = null;
  private recorder: MediaRecorderLike | null = null;
  /** stop() during 'acquiring': remember the intent so the camera never outlives the user's exit. */
  private stopRequested = false;
  /** Sequences dropped after 1 failed retry — the admin sees them as gaps. */
  readonly skippedSequences: number[] = [];

  constructor(
    private readonly deps: ProctoringRecorderDeps,
    startSequence = 0
  ) {
    this.nextSequence = startSequence;
  }

  get phase(): RecorderPhase {
    return this.phaseValue;
  }

  private setPhase(phase: RecorderPhase): void {
    this.phaseValue = phase;
    this.deps.onPhaseChange?.(phase);
  }

  /** idle → acquiring → recording. Throws camera_unavailable (phase 'error') on denial. */
  async start(): Promise<void> {
    if (this.phaseValue !== 'idle') return;
    this.setPhase('acquiring');
    try {
      this.stream = await this.deps.getUserMedia();
    } catch {
      this.setPhase('error');
      throw new Error('camera_unavailable');
    }
    if (this.stopRequested) {
      // The user bailed out while the permission prompt was open — release the camera at once.
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
      this.setPhase('completed');
      return;
    }
    this.recorder = this.deps.createRecorder(this.stream);
    this.recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) this.enqueueChunk(event.data);
    };
    this.recorder.start(this.deps.timesliceMs ?? DEFAULT_TIMESLICE_MS);
    this.setPhase('recording');
  }

  /** 1 retry then skip — an upload problem must never interrupt the exam (spec §2.3). */
  private enqueueChunk(blob: Blob): void {
    const sequence = this.nextSequence;
    this.nextSequence += 1;
    this.uploadQueue = this.uploadQueue.then(async () => {
      try {
        await this.deps.uploadChunk(sequence, blob);
      } catch {
        try {
          await this.deps.uploadChunk(sequence, blob);
        } catch {
          this.skippedSequences.push(sequence);
        }
      }
    });
  }

  /**
   * recording → uploading-tail (final dataavailable flushes) → completed. Releases the camera.
   * During 'acquiring' it only marks intent — start() releases the stream as soon as it lands.
   * Mid-recording device loss has no onerror path BY DESIGN: the recording keeps partial chunks
   * and the admin sees the gap (spec §2.3 — recording problems never invalidate the exam).
   */
  async stop(): Promise<void> {
    if (this.phaseValue === 'acquiring') {
      this.stopRequested = true;
      return;
    }
    if (this.phaseValue !== 'recording') return;
    this.setPhase('uploading-tail');
    await new Promise<void>((resolve) => {
      if (!this.recorder) {
        resolve();
        return;
      }
      this.recorder.onstop = () => resolve();
      this.recorder.stop();
    });
    await this.uploadQueue;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.setPhase('completed');
  }
}
