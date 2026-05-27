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
    <video
      className="course-player__video"
      controls
      src={videoUrl}
      onEnded={onEnded}
      data-testid="video-player"
    />
  );
};
