'use client';

import type { Material } from '../mvp/types';

interface Props {
  material: Material;
  externalUrl: string | null;
}

export const ExternalLinkViewer = ({ material, externalUrl }: Props) => {
  if (!externalUrl) {
    return (
      <div className="course-player__placeholder" data-testid="external-placeholder">
        Ссылка для «{material.title}» пока не задана администратором.
      </div>
    );
  }
  return (
    <div className="course-player__external" data-testid="external-viewer">
      <p>
        Этот материал откроется во внешнем ресурсе. Не оставляйте конфиденциальные данные на
        сторонних сайтах.
      </p>
      <a
        href={externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="ui-button ui-button--primary"
      >
        Открыть «{material.title}» в новой вкладке
      </a>
    </div>
  );
};
