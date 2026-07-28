'use client';

import { ExternalLinkViewer } from './external-link-viewer';
import { HlsVideoPlayer } from './hls-video-player';
import { PdfViewer } from './pdf-viewer';
import { TextViewer } from './text-viewer';
import { VideoPlayer } from './video-player';
import { ScormPlayer } from '../scorm/scorm-player';

import type { Material } from '../mvp/types';

interface Props {
  material: Material;
  onMaterialEnded?: (() => void) | undefined;
  enrollmentId?: string | undefined;
}

export const MaterialPlayer = ({ material, onMaterialEnded, enrollmentId }: Props) => {
  switch (material.materialType) {
    case 'video':
      // Ссылка на видео выдаётся ПО ЗАЧИСЛЕНИЮ (ФТ-B2.1) — без него показывать нечего.
      if (!enrollmentId) {
        return <VideoPlayer material={material} videoUrl={null} onEnded={onMaterialEnded} />;
      }
      return (
        <HlsVideoPlayer material={material} enrollmentId={enrollmentId} onEnded={onMaterialEnded} />
      );
    case 'file':
      // ФТ-B4.1: файл выдаётся ПО ЗАЧИСЛЕНИЮ, оно же фиксирует факт открытия.
      return <PdfViewer material={material} enrollmentId={enrollmentId} />;
    case 'text':
      return <TextViewer material={material} />;
    case 'external_url':
      return <ExternalLinkViewer material={material} externalUrl={null} />;
    case 'scorm':
      if (!enrollmentId) {
        return (
          <div className="course-player__placeholder">
            SCORM-материал доступен в контексте зачисления
          </div>
        );
      }
      return (
        <ScormPlayer
          material={material}
          enrollmentId={enrollmentId}
          onCompleted={onMaterialEnded}
        />
      );
    default: {
      const _exhaustive: never = material.materialType;
      return (
        <div className="course-player__placeholder" data-testid="material-unknown">
          Неизвестный тип материала: {_exhaustive}
        </div>
      );
    }
  }
};
