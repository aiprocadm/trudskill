'use client';

import { useEffect, useState } from 'react';

/**
 * Ссылка на предпросмотр выбранного изображения (ТЗ 5.9 / Э9).
 *
 * Зачем. Слушатель снимает селфи с телефона и до отправки не видел НИЧЕГО, кроме имени файла
 * вроде `IMG_20260918_094512.jpg`. Тот ли это снимок, не смазан ли, не перевёрнут — выяснялось
 * после проверки, через отказ и повторную подачу (журнал 469).
 *
 * Ссылка освобождается при смене файла и при уходе с экрана: без этого каждая перевыборка
 * оставляла бы в памяти вкладки целую фотографию.
 */
export const usePreviewUrl = (file: File | null): string | null => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    /* Превью есть только у изображений: PDF браузер так не покажет. */
    if (!file || !file.type.startsWith('image/')) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  return url;
};
