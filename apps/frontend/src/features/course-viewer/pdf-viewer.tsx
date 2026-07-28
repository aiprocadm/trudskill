'use client';

import { useEffect, useState } from 'react';

import { documentMaterialApi } from './document-api';
import { useAuth } from '../auth/context';

import type { Material } from '../mvp/types';

/**
 * Просмотр документа урока (ФТ-B4.1, Фаза 2 Task 9).
 *
 * Раньше сюда всегда приходил `pdfUrl={null}` — файл не отдавался вообще, ровно как
 * видео до Task 4. Теперь ссылка берётся по зачислению, и тот же запрос фиксирует факт
 * открытия: для документа «ознакомлен» не должно зависеть от того, докрутил ли слушатель
 * до последней страницы — во встроенном вьювере это технически не отследить.
 */

interface Props {
  material: Material;
  enrollmentId?: string | undefined;
}

export const PdfViewer = ({ material, enrollmentId }: Props) => {
  const { session } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !enrollmentId) return;
    let cancelled = false;
    documentMaterialApi
      .open(session, material.id, enrollmentId)
      .then((view) => {
        if (!cancelled) setUrl(view.url);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Не удалось открыть файл');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session, material.id, enrollmentId]);

  if (!enrollmentId) {
    return (
      <div className="course-player__placeholder" data-testid="pdf-placeholder">
        Файл «{material.title}» доступен в контексте зачисления.
      </div>
    );
  }
  if (error) {
    return (
      <div className="course-player__placeholder" role="alert" data-testid="pdf-error">
        {error}
      </div>
    );
  }
  if (!url) {
    return (
      <div className="course-player__placeholder" data-testid="pdf-placeholder">
        Открываем «{material.title}»…
      </div>
    );
  }
  return (
    <iframe
      className="course-player__pdf"
      src={url}
      title={material.title}
      data-testid="pdf-viewer"
    />
  );
};
