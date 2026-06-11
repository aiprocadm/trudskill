'use client';

import { DataTable, LoadingState } from '@cdoprof/ui';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { getActiveProctoring, setActiveProctoring } from './active-recording';
import { proctoringApi } from './api';
import { chunkIssueLabel, formatDateShort, formatProctoringStatus } from './format';
import { makeChunkUploader, useProctoringDetail, useProctoringQueue } from './hooks';
import { ProctoringRecorder } from './recorder';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
import { useAuth } from '../auth/context';

import type { MediaRecorderLike, MediaStreamLike } from './recorder';
import type { ProctoringRecordingStatus } from './types';
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
  const [streamReady, setStreamReady] = useState(false);
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
        setStreamReady(true);
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
      const message = err instanceof Error ? err.message : '';
      setError(
        message === 'camera_unavailable' || message === ''
          ? 'Не удалось начать запись: камера недоступна. Проверьте доступ к камере и попробуйте ещё раз.'
          : message
      );
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
        disabled={!consent || isStarting || !streamReady}
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

// ─── Admin screens ────────────────────────────────────────────────────────────

const STATUS_FILTER_OPTIONS: Array<{
  value: ProctoringRecordingStatus | undefined;
  label: string;
}> = [
  { value: undefined, label: 'Все' },
  { value: 'recording', label: 'Идёт запись' },
  { value: 'completed', label: 'Завершённые' }
];

interface QueueRow {
  id: string;
  learnerNameView: string;
  courseTitleView: string;
  statusView: string;
  startedAtView: string;
  chunksView: string;
  actionView: ReactElement;
}

export function AdminProctoringQueueScreen(): ReactElement {
  const [statusFilter, setStatusFilter] = useState<ProctoringRecordingStatus | undefined>(
    undefined
  );
  const { data, isLoading, error } = useProctoringQueue(statusFilter);

  const rows: QueueRow[] = (data ?? []).map((item) => ({
    id: item.id,
    learnerNameView: item.learnerName || '—',
    courseTitleView: item.courseTitle || '—',
    statusView: formatProctoringStatus(item.recordingStatus),
    startedAtView: formatDateShort(item.startedAt),
    chunksView: item.purgedAt ? 'удалена по сроку' : String(item.chunks.length),
    actionView: (
      <Link href={`/admin/proctoring-recordings/${item.id}`} className="ui-button">
        Открыть
      </Link>
    )
  }));

  return (
    <PageContainer>
      <PageHeader
        title="Записи прокторинга"
        subtitle="Видеозаписи итоговых экзаменов (веб-камера слушателя)"
      />
      <SectionCard title="Сеансы записи">
        <div className="ui-inline" style={{ marginBottom: 12, gap: 8 }}>
          <span>Статус:</span>
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value ?? 'all'}
              type="button"
              className="ui-button"
              style={statusFilter === opt.value ? { fontWeight: 700 } : undefined}
              aria-pressed={statusFilter === opt.value}
              onClick={() => setStatusFilter(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {isLoading ? <LoadingState message="Загрузка…" /> : null}
        {error ? <SectionError message="Не удалось загрузить записи прокторинга" /> : null}
        {!isLoading && !error && rows.length === 0 ? (
          <SectionEmpty message="Записей нет" hint="Нет сеансов с выбранным статусом" />
        ) : null}
        {!isLoading && !error && rows.length > 0 ? (
          <DataTable<QueueRow>
            columns={[
              { key: 'learnerNameView', title: 'Слушатель' },
              { key: 'courseTitleView', title: 'Курс' },
              { key: 'statusView', title: 'Статус' },
              { key: 'startedAtView', title: 'Начата' },
              { key: 'chunksView', title: 'Фрагменты' },
              { key: 'actionView', title: '', render: (row) => row.actionView }
            ]}
            rows={rows}
          />
        ) : null}
      </SectionCard>
    </PageContainer>
  );
}

export function AdminProctoringDetailScreen({ id }: { id: string }): ReactElement {
  const { session } = useAuth();
  const { data: detail, isLoading, error } = useProctoringDetail(id);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isAssembling, setIsAssembling] = useState(false);
  const [assembleProgress, setAssembleProgress] = useState<{ done: number; total: number } | null>(
    null
  );
  const [playerError, setPlayerError] = useState<string | null>(null);
  // Holistic-review fix C1: per-chunk download failures (e.g. a phantom chunk registered without
  // an object) degrade gracefully — the chunk is skipped with a warning, the rest still plays.
  const [assembleWarnings, setAssembleWarnings] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // Revoke the blob URL on unmount/replace (memory hygiene for multi-hundred-MB videos).
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  // Abort in-flight chunk downloads when the admin leaves the page.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  if (isLoading) return <LoadingState message="Загрузка…" />;
  if (error || !detail) return <SectionError message="Не удалось загрузить запись" />;

  // Chunks of ONE MediaRecorder session concatenate validly (container header in chunk 0);
  // after a resume the new segment starts with a fresh header — players tolerate it, and the
  // gap is reported below anyway (spec §2.8).
  const onAssemble = async () => {
    setIsAssembling(true);
    setPlayerError(null);
    setAssembleWarnings([]);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      // Presigned GET urls expire in 15 minutes — re-request so a long-open page still plays.
      const fresh = session ? await proctoringApi.get(session, id) : detail;
      const total = fresh.playbackChunks.length;
      setAssembleProgress({ done: 0, total });
      const parts: Blob[] = [];
      const warnings: string[] = [];
      let done = 0;
      for (const chunk of fresh.playbackChunks) {
        // AbortError rejects the fetch itself and lands in the outer catch (silent exit).
        const res = await fetch(chunk.url, { signal: controller.signal });
        done += 1;
        if (!res.ok) {
          // One unavailable chunk (404 phantom, expired url, …) must not kill the whole video.
          warnings.push(`Фрагмент ${chunk.sequence} недоступен (HTTP ${res.status})`);
        } else {
          parts.push(await res.blob());
        }
        setAssembleProgress({ done, total });
      }
      setAssembleWarnings(warnings);
      if (parts.length === 0) {
        setPlayerError('Не удалось собрать запись — попробуйте ещё раз');
        return;
      }
      const assembled = new Blob(parts, { type: 'video/webm' });
      setVideoUrl(URL.createObjectURL(assembled));
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setPlayerError('Не удалось собрать запись — попробуйте ещё раз');
      }
    } finally {
      setIsAssembling(false);
      setAssembleProgress(null);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={`Запись: ${detail.learnerName || detail.id}`}
        subtitle={`${detail.courseTitle} · ${formatProctoringStatus(detail.recordingStatus)}`}
      />
      <SectionCard title="Сеанс">
        <p>
          <strong>Согласие на видеозапись (152-ФЗ):</strong> {formatDateShort(detail.consentAt)}
        </p>
        <p>
          <strong>Начата:</strong> {formatDateShort(detail.startedAt)} · <strong>Завершена:</strong>{' '}
          {formatDateShort(detail.completedAt)}
        </p>
        <p>
          <strong>Попытка:</strong> {detail.attemptId ?? '—'}
          {detail.attemptStatus ? ` (${detail.attemptStatus})` : ''}
        </p>
      </SectionCard>
      <SectionCard title="Видео">
        {detail.purgedAt ? (
          <p className="ui-text-muted">
            Видео удалено по сроку хранения ({formatDateShort(detail.purgedAt)}). Метаданные сеанса
            сохранены.
          </p>
        ) : (
          <div className="ui-stack">
            {detail.chunkIssues.length > 0 ? (
              <ul className="ui-list">
                {detail.chunkIssues.map((issue) => (
                  <li key={`${issue.sequence}:${issue.code}`} className="ui-text-muted">
                    ⚠ {chunkIssueLabel(issue)}
                  </li>
                ))}
              </ul>
            ) : null}
            {assembleWarnings.length > 0 ? (
              <ul className="ui-list" data-testid="proctoring-assemble-warnings">
                {assembleWarnings.map((warning) => (
                  <li key={warning} className="ui-text-muted">
                    ⚠ {warning}
                  </li>
                ))}
              </ul>
            ) : null}
            {detail.playbackChunks.length === 0 ? (
              <p className="ui-text-muted">Нет доступных фрагментов</p>
            ) : videoUrl ? (
              <video
                controls
                src={videoUrl}
                aria-label={`Запись экзамена — ${detail.learnerName || detail.id}`}
                style={{ maxWidth: 640, width: '100%' }}
              />
            ) : (
              <button
                type="button"
                className="ui-button"
                disabled={isAssembling}
                onClick={() => void onAssemble()}
              >
                {isAssembling
                  ? `Скачиваем фрагменты…${assembleProgress ? ` ${assembleProgress.done} из ${assembleProgress.total}` : ''}`
                  : `Собрать и воспроизвести (${detail.playbackChunks.length} фрагм.)`}
              </button>
            )}
            {playerError ? <SectionError message={playerError} /> : null}
          </div>
        )}
      </SectionCard>
    </PageContainer>
  );
}
