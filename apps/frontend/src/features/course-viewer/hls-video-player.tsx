'use client';

import { useEffect, useRef, useState } from 'react';

import { type PlaybackSourceDto, refreshDelayMs, videoPlaybackApi } from './video-playback-api';
import { watermarkLabel } from './video-watermark';
import { VideoWatermark } from './video-watermark-overlay';
import { useAuth } from '../auth/context';

import type { Material } from '../mvp/types';

/**
 * Плеер защищённого видео (ФТ-B2.1, Фаза 2 Task 4).
 *
 * Заменяет голый `<video src>`: ссылка берётся по зачислению, живёт минуты и обновляется
 * до истечения, иначе просмотр оборвался бы посреди урока.
 *
 * Про «защиту от скачивания» честно: `controlsList="nodownload"` и запрет контекстного
 * меню — это **барьер удобства**, а не защита. Браузер по определению может сохранить то,
 * что показывает, и обойти это невозможно. Реальная мера против перепродажи записи —
 * водяной знак с данными слушателя (ФТ-B2.2, Task 5) плюс короткий срок жизни ссылки.
 */

interface Props {
  material: Material;
  enrollmentId: string;
  onEnded?: (() => void) | undefined;
}

export const HlsVideoPlayer = ({ material, enrollmentId, onEnded }: Props) => {
  const { session } = useAuth();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [source, setSource] = useState<PlaybackSourceDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Берём ссылку и переспрашиваем её до истечения срока.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
      try {
        const next = await videoPlaybackApi.get(session, material.id, enrollmentId);
        if (cancelled) return;
        setSource(next);
        setError(null);
        timer = setTimeout(() => void load(), refreshDelayMs(next.expiresInSeconds));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Не удалось получить видео');
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [session, material.id, enrollmentId]);

  // HLS: нативно в Safari, через hls.js везде остальное. Библиотека грузится динамически —
  // ~200 КБ незачем тянуть тем, кто открыл урок с текстом.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;
    if (source.kind !== 'hls') {
      video.src = source.url;
      return;
    }
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = source.url;
      return;
    }
    let destroy: (() => void) | undefined;
    void import('hls.js').then(({ default: Hls }) => {
      if (!Hls.isSupported()) {
        setError('Браузер не поддерживает воспроизведение этого видео');
        return;
      }
      const hls = new Hls();
      hls.loadSource(source.url);
      hls.attachMedia(video);
      destroy = () => hls.destroy();
    });
    return () => destroy?.();
  }, [source]);

  if (error) {
    return (
      <div className="course-player__placeholder" role="alert" data-testid="video-error">
        {error}
      </div>
    );
  }
  if (!source) {
    return (
      <div className="course-player__placeholder" data-testid="video-loading">
        Готовим видео «{material.title}»…
      </div>
    );
  }

  return (
    // Обёртка с position:relative — система координат для водяного знака (ФТ-B2.2).
    <div className="course-player__video-frame" style={{ position: 'relative' }}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- субтитры к видео тенанта не предоставляются; отдельная задача авторинга контента */}
      <video
        ref={videoRef}
        className="course-player__video"
        controls
        controlsList="nodownload"
        disablePictureInPicture
        onContextMenu={(event) => event.preventDefault()}
        onEnded={onEnded}
        data-testid="video-player"
      />
      {session ? <VideoWatermark label={watermarkLabel(session.user)} /> : null}
    </div>
  );
};
