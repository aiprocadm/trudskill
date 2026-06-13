'use client';

import { ExternalLinkViewer } from './external-link-viewer';
import { PdfViewer } from './pdf-viewer';
import { TextViewer } from './text-viewer';
import { VideoPlayer } from './video-player';

import type { Material } from '../mvp/types';

interface Props {
  material: Material;
  onMaterialEnded?: (() => void) | undefined;
}

export const MaterialPlayer = ({ material, onMaterialEnded }: Props) => {
  switch (material.materialType) {
    case 'video':
      return <VideoPlayer material={material} videoUrl={null} onEnded={onMaterialEnded} />;
    case 'file':
      return <PdfViewer material={material} pdfUrl={null} />;
    case 'text':
      return <TextViewer material={material} />;
    case 'external_url':
      return <ExternalLinkViewer material={material} externalUrl={null} />;
    case 'scorm':
      // Phase 9 Plan A (Task 15): full ScormPlayer wired here; placeholder until then.
      return (
        <div className="course-player__placeholder">
          SCORM-материал доступен в контексте зачисления
        </div>
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
