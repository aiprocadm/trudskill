'use client';

import type { Material } from '../mvp/types';

interface Props {
  material: Material;
  pdfUrl: string | null;
}

export const PdfViewer = ({ material, pdfUrl }: Props) => {
  if (!pdfUrl) {
    return (
      <div className="course-player__placeholder" data-testid="pdf-placeholder">
        Файл «{material.title}» пока не загружен.
      </div>
    );
  }
  return (
    <iframe
      className="course-player__pdf"
      src={pdfUrl}
      title={material.title}
      data-testid="pdf-viewer"
    />
  );
};
