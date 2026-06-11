'use client';

import { useEffect, useRef, useState } from 'react';

import { getActiveProctoring, setActiveProctoring } from './active-recording';
import { proctoringApi } from './api';
import { makeChunkUploader } from './hooks';
import { ProctoringRecorder } from './recorder';
import { SectionError } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';

import type { MediaRecorderLike, MediaStreamLike } from './recorder';
import type { ReactElement } from 'react';

/** Prefer vp8/opus webm (valid chunk concatenation); Safari falls back to the browser default (mp4). */
function supportedRecorderOptions(): MediaRecorderOptions {
  const preferred = 'video/webm;codecs=vp8,opus';
  if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(preferred)) {
    return { mimeType: preferred };
  }
  return {};
}

/**
 * Consent + camera preview + start, rendered inside the tests-list proctoring interstitial.
 * Flow (spec §2.5): start session (idempotent resume) → MediaRecorder → onRecordingStarted()
 * (the caller re-fires startAttempt — the gate now passes).
 */
export function ProctoringStartPanel({
  enrollmentId,
  courseId,
  onRecordingStarted
}: {
  enrollmentId: string;
  courseId: string;
  onRecordingStarted: () => void;
}): ReactElement {
  const { session } = useAuth();
  const [consent, setConsent] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Camera preview — the learner sees what will be recorded BEFORE consenting (152-ФЗ).
  useEffect(() => {
    let cancelled = false;
    void navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() =>
        setError(
          'Камера недоступна. Разрешите доступ к камере и микрофону в браузере. Если камеры нет, обратитесь в учебный центр — администратор может освободить вас от видеозаписи.'
        )
      );
    return () => {
      cancelled = true;
      // Once recording started, the recorder owns the stream — do not stop the tracks here.
      if (!getActiveProctoring()) streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const onStart = async () => {
    if (!session || !consent || !streamRef.current) return;
    setIsStarting(true);
    setError(null);
    try {
      // Idempotent: returns the existing active session after a refresh; its chunks give resume point.
      const recording = await proctoringApi.start(session, {
        enrollmentId,
        courseId,
        consent: true
      });
      const startSequence = recording.chunks.reduce((max, c) => Math.max(max, c.sequence), -1) + 1;
      const stream = streamRef.current;
      const recorder = new ProctoringRecorder(
        {
          getUserMedia: async () => stream as unknown as MediaStreamLike,
          // Casts are deliberate: the recorder's structural types are narrower than the DOM ones
          // (MediaRecorderLike.ondataavailable takes { data: Blob }, the DOM handler a full BlobEvent).
          createRecorder: (s) =>
            new MediaRecorder(
              s as unknown as MediaStream,
              supportedRecorderOptions()
            ) as unknown as MediaRecorderLike,
          uploadChunk: makeChunkUploader(session, recording.id)
        },
        startSequence
      );
      await recorder.start();
      setActiveProctoring({ recordingId: recording.id, recorder });
      onRecordingStarted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось начать запись');
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="ui-stack">
      {/* Preview is muted: the learner must not hear their own microphone. */}
      <video ref={videoRef} autoPlay muted playsInline style={{ maxWidth: 320 }} />
      <label className="ui-inline" style={{ gap: 8 }}>
        <input
          type="checkbox"
          checked={consent}
          disabled={isStarting}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>Даю согласие на видеозапись экзамена и обработку персональных данных (152-ФЗ)</span>
      </label>
      {error ? <SectionError message={error} /> : null}
      <button
        type="button"
        className="ui-button"
        disabled={!consent || isStarting}
        onClick={() => void onStart()}
      >
        {isStarting ? 'Включаем запись…' : 'Начать запись и экзамен'}
      </button>
    </div>
  );
}

/**
 * ● REC badge for the attempt screen. Reads the module-level holder at render time —
 * it mounts AFTER the recording started (navigation to the attempt page), so a static
 * read is sufficient; no subscription machinery for v1.
 */
export function ProctoringRecIndicator(): ReactElement | null {
  const active = getActiveProctoring();
  if (!active || active.recorder.phase !== 'recording') return null;
  return (
    <span
      style={{ color: '#c00', fontWeight: 700 }}
      aria-label="Идёт видеозапись экзамена"
      data-testid="proctoring-rec-indicator"
    >
      ● REC
    </span>
  );
}
