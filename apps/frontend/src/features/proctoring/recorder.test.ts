import { describe, expect, it, vi } from 'vitest';

import { ProctoringRecorder } from './recorder';

import type { MediaRecorderLike, MediaStreamLike, RecorderPhase } from './recorder';

class FakeMediaRecorder implements MediaRecorderLike {
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  started = false;
  timeslice: number | null = null;

  start(timesliceMs: number): void {
    this.started = true;
    this.timeslice = timesliceMs;
  }

  stop(): void {
    // Mirrors the real MediaRecorder: a final dataavailable fires before onstop.
    this.emit('tail');
    this.onstop?.();
  }

  emit(content: string): void {
    this.ondataavailable?.({ data: new Blob([content], { type: 'video/webm' }) });
  }
}

function makeRecorder(opts?: {
  startSequence?: number;
  failSequences?: Map<number, number>; // sequence → how many times to fail
  getUserMedia?: () => Promise<MediaStreamLike>;
}) {
  const stream: MediaStreamLike = { getTracks: () => [{ stop: vi.fn() }] };
  const fake = new FakeMediaRecorder();
  const uploads: number[] = [];
  const failures = opts?.failSequences ?? new Map<number, number>();
  const phases: RecorderPhase[] = [];
  const uploadChunk = vi.fn(async (sequence: number, _blob: Blob) => {
    const remaining = failures.get(sequence) ?? 0;
    if (remaining > 0) {
      failures.set(sequence, remaining - 1);
      throw new Error('upload failed');
    }
    uploads.push(sequence);
  });
  const recorder = new ProctoringRecorder(
    {
      getUserMedia: opts?.getUserMedia ?? (async () => stream),
      createRecorder: () => fake,
      uploadChunk,
      timesliceMs: 30_000,
      onPhaseChange: (phase) => phases.push(phase)
    },
    opts?.startSequence ?? 0
  );
  return { recorder, fake, uploads, uploadChunk, phases, stream };
}

describe('ProctoringRecorder state machine', () => {
  it('idle → acquiring → recording; passes the timeslice to MediaRecorder', async () => {
    const { recorder, fake, phases } = makeRecorder();
    expect(recorder.phase).toBe('idle');
    await recorder.start();
    expect(recorder.phase).toBe('recording');
    expect(fake.started).toBe(true);
    expect(fake.timeslice).toBe(30_000);
    expect(phases).toEqual(['acquiring', 'recording']);
  });

  it('camera denial → phase error and a camera_unavailable throw', async () => {
    const { recorder } = makeRecorder({
      getUserMedia: async () => {
        throw new Error('NotAllowedError');
      }
    });
    await expect(recorder.start()).rejects.toThrow('camera_unavailable');
    expect(recorder.phase).toBe('error');
  });

  it('uploads chunks sequentially with monotonic sequences', async () => {
    const { recorder, fake, uploads } = makeRecorder();
    await recorder.start();
    fake.emit('a');
    fake.emit('b');
    await recorder.stop(); // flushes the queue (+tail chunk)
    expect(uploads).toEqual([0, 1, 2]);
  });

  it('retries a failed chunk once, then skips it and continues (exam never interrupted)', async () => {
    const { recorder, fake, uploads, uploadChunk } = makeRecorder({
      failSequences: new Map([[1, 2]]) // sequence 1 fails twice → first try + retry → skipped
    });
    await recorder.start();
    fake.emit('a');
    fake.emit('b');
    fake.emit('c');
    await recorder.stop();
    expect(uploads).toEqual([0, 2, 3]); // 1 skipped; tail = 3
    expect(recorder.skippedSequences).toEqual([1]);
    // sequence 1 attempted exactly twice (1 try + 1 retry)
    expect(uploadChunk.mock.calls.filter(([seq]) => seq === 1)).toHaveLength(2);
  });

  it('a single transient failure recovers on the retry (nothing skipped)', async () => {
    const { recorder, fake, uploads } = makeRecorder({
      failSequences: new Map([[0, 1]])
    });
    await recorder.start();
    fake.emit('a');
    await recorder.stop();
    expect(uploads).toEqual([0, 1]);
    expect(recorder.skippedSequences).toEqual([]);
  });

  it('stop: recording → uploading-tail → completed, releases camera tracks', async () => {
    const trackStop = vi.fn();
    const stream: MediaStreamLike = { getTracks: () => [{ stop: trackStop }] };
    const { recorder, fake, phases } = makeRecorder({ getUserMedia: async () => stream });
    await recorder.start();
    fake.emit('a');
    await recorder.stop();
    expect(recorder.phase).toBe('completed');
    expect(phases).toEqual(['acquiring', 'recording', 'uploading-tail', 'completed']);
    expect(trackStop).toHaveBeenCalled();
  });

  it('resume: a recorder constructed with startSequence continues numbering from there', async () => {
    const { recorder, fake, uploads } = makeRecorder({ startSequence: 5 });
    await recorder.start();
    fake.emit('a');
    await recorder.stop();
    expect(uploads).toEqual([5, 6]); // 5 = first new chunk, 6 = tail
  });

  it('start is a no-op when not idle; stop is a no-op when not recording', async () => {
    const { recorder, fake } = makeRecorder();
    await recorder.start();
    await recorder.start(); // ignored
    expect(recorder.phase).toBe('recording');
    fake.emit('a');
    await recorder.stop();
    await recorder.stop(); // ignored
    expect(recorder.phase).toBe('completed');
  });

  it('empty dataavailable blobs are ignored (no zero-byte uploads)', async () => {
    const { recorder, fake, uploadChunk } = makeRecorder();
    await recorder.start();
    fake.ondataavailable?.({ data: new Blob([], { type: 'video/webm' }) });
    await recorder.stop();
    // only the tail chunk (non-empty) was uploaded
    expect(uploadChunk.mock.calls.map(([seq]) => seq)).toEqual([0]);
  });

  it('stop during acquiring: camera is released as soon as getUserMedia resolves (no live camera leak)', async () => {
    const trackStop = vi.fn();
    let resolveMedia!: (stream: MediaStreamLike) => void;
    const pendingMedia = new Promise<MediaStreamLike>((resolve) => {
      resolveMedia = resolve;
    });
    const { recorder } = makeRecorder({ getUserMedia: () => pendingMedia });
    const starting = recorder.start();
    expect(recorder.phase).toBe('acquiring');
    await recorder.stop(); // user bails while the permission prompt is open
    resolveMedia({ getTracks: () => [{ stop: trackStop }] });
    await starting;
    expect(trackStop).toHaveBeenCalled();
    expect(recorder.phase).toBe('completed');
  });
});
