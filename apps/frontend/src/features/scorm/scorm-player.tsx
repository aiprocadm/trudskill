'use client';

import { LoadingState } from '@cdoprof/ui';
import { useEffect, useRef, useState } from 'react';

import { scormApi } from './api';
import { buildCommitPayload, buildInitialCmi } from './cmi-mapping';
import { SectionError } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';

import type { ScormAttemptDto, ScormLaunchDto } from './types';
import type { Material } from '../mvp/types';

/**
 * Minimal structural interface for reading the SCORM 1.2 cmi snapshot from
 * scorm-again's Scorm12API instance. Only the fields we actually commit are
 * listed here; everything else is left to the library. Cast via
 * `api.cmi as unknown as ScormCmiSnapshot` when reading.
 */
interface ScormCmiSnapshot {
  core: {
    lesson_status: string;
    lesson_location: string;
    session_time: string;
    score: {
      raw: string;
      max: string;
      min: string;
    };
  };
  suspend_data: string;
}

interface Props {
  material: Material;
  enrollmentId: string;
  onCompleted?: (() => void) | undefined;
}

type PlayerState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; launch: ScormLaunchDto };

export const ScormPlayer = ({ material, enrollmentId, onCompleted }: Props) => {
  const { session } = useAuth();
  const [playerState, setPlayerState] = useState<PlayerState>({ phase: 'loading' });
  const [apiReady, setApiReady] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);

  // Keep a stable ref to the current attempt so the commit callback always
  // sees the latest value without re-registering listeners.
  const attemptRef = useRef<ScormAttemptDto | null>(null);

  // Track whether the component is still mounted to avoid state updates after unmount.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Refs for onCompleted so the commit closure always sees the latest callback
  // without being re-registered.
  const onCompletedRef = useRef(onCompleted);
  useEffect(() => {
    onCompletedRef.current = onCompleted;
  }, [onCompleted]);

  // Session ref so the cleanup closure (unmount) can commit even after the
  // component's outer effect has already run its cleanup teardown phase.
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Stable ref for the commit handler so we can unsubscribe exactly the same
  // function reference we subscribed.
  const commitHandlerRef = useRef<(() => void) | null>(null);

  // Tracks the live API instance so synchronous cleanup can confirm ownership
  // before deleting window.API (avoids deleting a freshly-mounted replacement).
  const apiInstanceRef = useRef<unknown>(null);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;

    const launch = async () => {
      try {
        const launchDto = await scormApi.launch(session, material.id, enrollmentId);
        if (cancelled) return undefined;

        attemptRef.current = launchDto.attempt;

        // Dynamic import — must be inside an effect (browser-only, never SSR).
        const { Scorm12API } = await import('scorm-again');
        if (cancelled) return undefined;

        const api = new Scorm12API({ autocommit: false, logLevel: 4 });

        api.loadFromJSON(
          buildInitialCmi(launchDto.attempt, {
            studentId: session.user.id,
            studentName: session.user.displayName
          })
        );

        // Build and register the commit handler BEFORE setting window.API so the
        // SCO can immediately call LMSCommit and still have the callback in place.
        const doCommit = async () => {
          const currentAttempt = attemptRef.current;
          const currentSession = sessionRef.current;
          if (!currentAttempt || !currentSession) return;

          const snapshot = api.cmi as unknown as ScormCmiSnapshot;
          const payload = buildCommitPayload({
            core: {
              lesson_status: snapshot.core.lesson_status,
              lesson_location: snapshot.core.lesson_location,
              session_time: snapshot.core.session_time,
              score: {
                raw: snapshot.core.score.raw,
                max: snapshot.core.score.max,
                min: snapshot.core.score.min
              }
            },
            suspend_data: snapshot.suspend_data
          });

          try {
            const updated = await scormApi.commit(currentSession, currentAttempt.id, payload);
            // Keep the attempt ref current (backend may update fields).
            attemptRef.current = updated;

            if (mountedRef.current) {
              const now = new Date();
              const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
              setSaveNote(`Сохранено ${hhmm}`);
            }

            const terminal: Array<string> = ['passed', 'completed'];
            if (terminal.includes(updated.lessonStatus)) {
              onCompletedRef.current?.();
            }
          } catch {
            if (mountedRef.current) {
              setSaveNote('Не удалось сохранить прогресс');
            }
          }
        };

        // Fix 1: guard against cancelled BEFORE attaching handlers or exposing
        // window.API.  If unmount raced the dynamic import, the api instance
        // was created but never attached — cleanup has nothing to delete.
        if (cancelled) return undefined;

        commitHandlerRef.current = doCommit;
        api.on('LMSCommit', doCommit);
        api.on('LMSFinish', doCommit);

        // Expose the SCORM API in the parent window BEFORE the iframe renders.
        apiInstanceRef.current = api;
        (window as unknown as { API?: unknown }).API = api;

        if (mountedRef.current) {
          setPlayerState({ phase: 'ready', launch: launchDto });
          setApiReady(true);
        }

        return api;
      } catch (err: unknown) {
        if (cancelled) return undefined;
        const errMsg = err instanceof Error ? err.message : 'Не удалось запустить SCORM-материал';
        const isNotReady =
          errMsg.includes('scorm_package_not_ready') ||
          (typeof err === 'object' &&
            err !== null &&
            'code' in err &&
            (err as { code: unknown }).code === 'scorm_package_not_ready');
        if (mountedRef.current) {
          setPlayerState({
            phase: 'error',
            message: isNotReady ? 'Курс ещё обрабатывается администратором' : errMsg
          });
        }
        return undefined;
      }
    };

    type Scorm12APIInstance = Awaited<ReturnType<typeof launch>>;
    let resolvedApi: Scorm12APIInstance | undefined;
    void launch().then((api) => {
      resolvedApi = api;
    });

    return () => {
      cancelled = true;

      // Fix 2: delete window.API SYNCHRONOUSLY and only if it still points to
      // this player's instance — prevents a freshly-mounted replacement from
      // being deleted by the outgoing cleanup.
      const ours = apiInstanceRef.current;
      const w = window as unknown as { API?: unknown };
      if (ours && w.API === ours) {
        delete w.API;
      }
      // Reset our own ref so it doesn't linger.
      apiInstanceRef.current = null;

      // Async best-effort: detach listeners and flush a final commit.
      // window.API is already cleared above; errors here are swallowed.
      void (async () => {
        if (resolvedApi) {
          const handler = commitHandlerRef.current;
          if (handler) {
            resolvedApi.off('LMSCommit', handler);
            resolvedApi.off('LMSFinish', handler);
          }
          // Best-effort final commit — ignore errors.
          const currentAttempt = attemptRef.current;
          const currentSession = sessionRef.current;
          if (currentAttempt && currentSession) {
            const snapshot = resolvedApi.cmi as unknown as ScormCmiSnapshot;
            const payload = buildCommitPayload({
              core: {
                lesson_status: snapshot.core.lesson_status,
                lesson_location: snapshot.core.lesson_location,
                session_time: snapshot.core.session_time,
                score: {
                  raw: snapshot.core.score.raw,
                  max: snapshot.core.score.max,
                  min: snapshot.core.score.min
                }
              },
              suspend_data: snapshot.suspend_data
            });
            try {
              await scormApi.commit(currentSession, currentAttempt.id, payload);
            } catch {
              // Best-effort: ignore.
            }
          }
        }
      })();
    };
  }, [material.id, enrollmentId, session]);

  if (playerState.phase === 'loading') {
    return <LoadingState message="Загружаем SCORM-курс…" />;
  }

  if (playerState.phase === 'error') {
    return <SectionError message={playerState.message} />;
  }

  return (
    <div className="scorm-player">
      {saveNote ? (
        <p className="scorm-player__save-note ui-text-muted" aria-live="polite">
          {saveNote}
        </p>
      ) : null}
      {apiReady ? (
        <iframe
          src={playerState.launch.launchUrl}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          title={material.title}
          style={{ width: '100%', height: '70vh', border: 0, display: 'block' }}
        />
      ) : null}
    </div>
  );
};
