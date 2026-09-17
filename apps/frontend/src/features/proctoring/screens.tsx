'use client';

import {
  KeyValueList,
  ListPage,
  LoadingState,
  ProgressBar,
  SelectField,
  StatusChip
} from '@trudskill/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { getActiveProctoring, setActiveProctoring } from './active-recording';
import { proctoringApi } from './api';
import { chunkIssueLabel, formatDateShort, formatProctoringStatus } from './format';
import {
  makeChunkUploader,
  useActiveProctoringSession,
  useProctoringDetail,
  useProctoringQueue
} from './hooks';
import { ProctoringRecorder } from './recorder';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionError
} from '../../components/state-wrappers';
import { ATTEMPT_STATUS_LABELS, statusLabel } from '../assessment/labels';
import { useAuth } from '../auth/context';
import { useObjectCrumb } from '../navigation/use-object-crumb';

import type { MediaRecorderLike, MediaStreamLike } from './recorder';
import type { ProctoringRecordingStatus } from './types';
import type { UserSession } from '../../entities/session/model';
import type { ReactElement } from 'react';

/** Prefer vp8/opus webm (valid chunk concatenation); Safari falls back to the browser default (mp4). */
function supportedRecorderOptions(): MediaRecorderOptions {
  const preferred = 'video/webm;codecs=vp8,opus';
  if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(preferred)) {
    return { mimeType: preferred };
  }
  return {};
}

/** Shared by the consent panel (fresh start) and the resume banner (after a mid-exam refresh). */
function buildRecorder(
  session: UserSession,
  recordingId: string,
  stream: MediaStream,
  startSequence: number
): ProctoringRecorder {
  return new ProctoringRecorder(
    {
      getUserMedia: async () => stream as unknown as MediaStreamLike,
      // Casts are deliberate: the recorder's structural types are narrower than the DOM ones
      // (MediaRecorderLike.ondataavailable takes { data: Blob }, the DOM handler a full BlobEvent).
      createRecorder: (s) =>
        new MediaRecorder(
          s as unknown as MediaStream,
          supportedRecorderOptions()
        ) as unknown as MediaRecorderLike,
      uploadChunk: makeChunkUploader(session, recordingId)
    },
    startSequence
  );
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
      const recorder = buildRecorder(session, recording.id, streamRef.current, startSequence);
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
      <label className="ui-inline">
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
 * Индикатор «идёт запись» на экране попытки. Читает модульный держатель во время
 * отрисовки —
 * it mounts AFTER the recording started (navigation to the attempt page), so a static
 * read is sufficient; no subscription machinery for v1.
 */
export function ProctoringRecIndicator(): ReactElement | null {
  const active = getActiveProctoring();
  if (!active || active.recorder.phase !== 'recording') return null;
  return (
    <span
      className="ui-subheading"
      style={{ color: 'var(--ui-danger-600)' }}
      aria-label="Идёт видеозапись экзамена"
      data-testid="proctoring-rec-indicator"
    >
      {/*
        Журнал 148: индикатор был подписан латиницей «REC» — слово из аппаратуры, а не из
        языка продукта. Сторож `latin-titles-ban` его не видел: он проверяет заголовки, а
        это значок. Кружок оставлен глазу, смысл — словом.
      */}
      <span aria-hidden="true">●</span> Идёт запись
    </span>
  );
}

/**
 * Holistic-review fix I1: a mid-exam F5 kills the module-singleton recorder while the backend
 * session stays 'recording'. Rendered on the attempt screen; when the server reports an active
 * session and no local recorder exists, shows a blocking-style banner with a resume button:
 * re-acquire the camera, restart the recorder from `nextSequence` (consent is already on record
 * server-side — no new checkbox) and re-register the module holder. Renders nothing when
 * proctoring is not required or the session is already completed.
 */
export function ProctoringResumeBanner({
  enrollmentId,
  courseId,
  onResumed
}: {
  enrollmentId: string;
  courseId: string;
  /** Позволяет экрану попытки перерисоваться, чтобы индикатор «Идёт запись» вернулся. */
  onResumed: () => void;
}): ReactElement | null {
  const { session } = useAuth();
  const hasLocalRecorder = Boolean(getActiveProctoring());
  const [isResuming, setIsResuming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: active } = useActiveProctoringSession(enrollmentId, courseId, !hasLocalRecorder);

  if (hasLocalRecorder || !active || active.recording.recordingStatus !== 'recording') return null;

  const onResume = async () => {
    if (!session) return;
    setIsResuming(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      // New MediaRecorder segment starts with a fresh container header; the admin player
      // tolerates it and the sequence gap is reported in detail anyway (spec §2.8).
      const recorder = buildRecorder(session, active.recording.id, stream, active.nextSequence);
      await recorder.start();
      setActiveProctoring({ recordingId: active.recording.id, recorder });
      onResumed();
    } catch {
      setError(
        'Не удалось возобновить запись: камера недоступна. Разрешите доступ к камере и микрофону и попробуйте ещё раз.'
      );
    } finally {
      setIsResuming(false);
    }
  };

  return (
    <div
      className="ui-callout ui-callout--danger"
      role="alert"
      data-testid="proctoring-resume-banner"
    >
      <div className="ui-stack">
        <p className="ui-subheading" style={{ margin: 0 }}>
          Запись прервана обновлением страницы — возобновите запись. Экзамен записывается на видео
          (прокторинг); согласие уже учтено.
        </p>
        {error ? <SectionError message={error} /> : null}
        <button
          type="button"
          className="ui-button"
          disabled={isResuming}
          onClick={() => void onResume()}
        >
          {isResuming ? 'Включаем запись…' : 'Возобновить запись'}
        </button>
      </div>
    </div>
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
  statusView: ReactElement;
  startedAtView: string;
  videoView: string;
}

export function AdminProctoringQueueScreen(): ReactElement {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<ProctoringRecordingStatus | undefined>(
    undefined
  );
  const { data, isLoading, error } = useProctoringQueue(statusFilter);

  const rows: QueueRow[] = (data ?? []).map((item) => ({
    id: item.id,
    learnerNameView: item.learnerName || '—',
    courseTitleView: item.courseTitle || '—',
    /*
     * Ревизия 2026-08-26. Запись, начатая давно и всё ещё числящаяся идущей, выглядела так
     * же, как экзамен, который идёт прямо сейчас: администратор не мог их отличить, а по
     * этим записям потом разбирают, кто сдавал. Признак считает сервер (`connectionLost`),
     * и подпись говорит ровно то, что известно: связь потеряна, а не «запись прервана».
     */
    statusView: (
      <StatusChip
        status={item.connectionLost ? 'failed' : item.recordingStatus}
        label={
          item.connectionLost
            ? 'Идёт запись — связь потеряна'
            : formatProctoringStatus(item.recordingStatus)
        }
      />
    ),
    startedAtView: formatDateShort(item.startedAt),
    /*
     * Колонка про видео, а не про «фрагменты»: количество кусков записи — внутренняя
     * подробность загрузки, администратору важно, есть ли что смотреть.
     */
    videoView: item.purgedAt
      ? 'удалено по сроку хранения'
      : item.chunks.length === 0
        ? 'нет'
        : 'есть'
  }));

  return (
    <PageContainer>
      <PageHeader
        title="Видеозаписи экзаменов"
        subtitle="Запись с камеры слушателя во время итогового экзамена. Хранится ограниченный срок, потом удаляется автоматически."
      />
      <ListPage<QueueRow>
        filters={
          <SelectField
            label="Статус"
            value={statusFilter ?? ''}
            onChange={(e) =>
              setStatusFilter(
                e.target.value === '' ? undefined : (e.target.value as ProctoringRecordingStatus)
              )
            }
            options={STATUS_FILTER_OPTIONS.map((o) => ({ value: o.value ?? '', label: o.label }))}
          />
        }
        columns={[
          { key: 'learnerNameView', title: 'Слушатель' },
          { key: 'courseTitleView', title: 'Курс' },
          { key: 'statusView', title: 'Статус', render: (row) => row.statusView },
          { key: 'startedAtView', title: 'Начата' },
          { key: 'videoView', title: 'Видео' }
        ]}
        rows={rows}
        isLoading={isLoading}
        error={error ? new Error('Не удалось загрузить видеозаписи экзаменов') : undefined}
        rowKey={(row) => row.id}
        rowActions={(row) => [
          {
            label: 'Смотреть запись',
            onSelect: () => router.push(`/admin/proctoring-recordings/${row.id}`)
          }
        ]}
        emptyMessage="Видеозаписей пока нет"
        emptyHint="Запись создаётся, когда слушатель сдаёт экзамен с включённым наблюдением. Наблюдение включается в настройках курса или группы."
      />
    </PageContainer>
  );
}

export function AdminProctoringDetailScreen({ id }: { id: string }): ReactElement {
  const { session } = useAuth();
  const { data: detail, isLoading, error } = useProctoringDetail(id);
  useObjectCrumb(detail ? detail.learnerName || 'Видеозапись экзамена' : undefined, {
    failed: Boolean(error)
  });
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
        title={detail.learnerName || 'Видеозапись экзамена'}
        subtitle={`${detail.courseTitle} — ${formatProctoringStatus(detail.recordingStatus)}`}
      />
      <SectionCard title="Сеанс">
        <KeyValueList
          items={[
            { label: 'Согласие на видеозапись (152-ФЗ)', value: formatDateShort(detail.consentAt) },
            { label: 'Начата', value: formatDateShort(detail.startedAt) },
            { label: 'Завершена', value: formatDateShort(detail.completedAt) },
            /*
             * Раньше здесь стоял идентификатор попытки и её код в скобках («3f7a-… (in_progress)»).
             * Администратору важно состояние экзамена словом, а идентификатор ему ни о чём
             * не говорит — правило продукта: ни одного кода как значения.
             */
            {
              label: 'Экзамен',
              value: detail.attemptStatus
                ? statusLabel(ATTEMPT_STATUS_LABELS, detail.attemptStatus)
                : 'ещё не начинался'
            }
          ]}
        />
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
                    {chunkIssueLabel(issue)}
                  </li>
                ))}
              </ul>
            ) : null}
            {assembleWarnings.length > 0 ? (
              <ul className="ui-list" data-testid="proctoring-assemble-warnings">
                {assembleWarnings.map((warning) => (
                  <li key={warning} className="ui-text-muted">
                    {warning}
                  </li>
                ))}
              </ul>
            ) : null}
            {detail.playbackChunks.length === 0 ? (
              <p className="ui-text-muted">
                Видео не записалось: слушатель начал экзамен, но ни одной части записи не пришло.
              </p>
            ) : videoUrl ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption -- Phase 10B: out-of-scope; proctoring recordings (MediaRecorder chunks) have no caption track. Captions not applicable to silent exam-screen captures.
              <video
                controls
                src={videoUrl}
                aria-label={`Запись экзамена — ${detail.learnerName || detail.id}`}
                className="ui-video-player"
              />
            ) : (
              <div className="ui-stack">
                <button
                  type="button"
                  className="ui-button-primary"
                  disabled={isAssembling}
                  onClick={() => void onAssemble()}
                >
                  {isAssembling ? 'Загружаем запись…' : 'Посмотреть запись'}
                </button>
                {/*
                 * Запись экзамена — сотни мегабайт: без полосы ожидание выглядит как зависший
                 * экран. Раньше ход загрузки был спрятан в подписи кнопки («5 из 20»).
                 */}
                {isAssembling && assembleProgress ? (
                  <ProgressBar
                    value={(assembleProgress.done / Math.max(1, assembleProgress.total)) * 100}
                    label="Загрузка записи"
                    caption={`Загружено ${assembleProgress.done} из ${assembleProgress.total} частей`}
                  />
                ) : null}
              </div>
            )}
            {playerError ? <SectionError message={playerError} /> : null}
          </div>
        )}
      </SectionCard>
    </PageContainer>
  );
}
