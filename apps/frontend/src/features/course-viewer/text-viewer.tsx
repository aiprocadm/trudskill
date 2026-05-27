'use client';

import type { Material } from '../mvp/types';

interface Props {
  material: Material;
}

export const TextViewer = ({ material }: Props) => {
  return (
    <div className="course-player__placeholder" data-testid="text-placeholder">
      <div>
        <strong>{material.title}</strong>
        <p>
          Текстовый материал станет доступен после расширения backend полем <code>textBody</code>.
        </p>
      </div>
    </div>
  );
};
