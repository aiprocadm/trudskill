'use client';

import type { Material } from '../mvp/types';

interface Props {
  material: Material;
  videoUrl: string | null;
  onEnded?: (() => void) | undefined;
}

export const VideoPlayer = ({ material, videoUrl, onEnded }: Props) => {
  if (!videoUrl) {
    return (
      <div className="course-player__placeholder" data-testid="video-placeholder">
        Видео «{material.title}» пока не загружено.
      </div>
    );
  }
  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption -- Phase 10B: out-of-scope; tenant-uploaded course videos have no caption track available. Captions tracking deferred (separate content-authoring feature).
    <video
      className="course-player__video"
      controls
      src={videoUrl}
      onEnded={onEnded}
      data-testid="video-player"
    />
  );
};
