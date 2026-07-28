'use client';

import { useEffect, useState } from 'react';

import {
  WATERMARK_MOVE_INTERVAL_MS,
  type WatermarkPosition,
  watermarkPositionAt
} from './video-watermark';

/**
 * Полупрозрачная именная надпись поверх видео (ФТ-B2.2, Фаза 2 Task 5).
 *
 * Знак — элемент DOM внутри плеера, а не CSS-фон видео: так он ложится поверх картинки
 * при любом способе воспроизведения (нативный HLS, hls.js, оригинал) и не зависит от
 * того, как браузер рисует сам `<video>`.
 *
 * Скрыть его через инструменты разработчика можно — но это ручная работа на каждом
 * ролике, а защищаемся мы от массовой перепродажи записи, а не от одного упорного
 * человека. `pointer-events: none` обязателен: иначе знак перехватывал бы клики по видео.
 */

interface Props {
  label: string;
}

export const VideoWatermark = ({ label }: Props) => {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setStep((prev) => prev + 1), WATERMARK_MOVE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  if (!label) return null;

  const position: WatermarkPosition = watermarkPositionAt(step);

  return (
    <span
      aria-hidden="true"
      data-testid="video-watermark"
      style={{
        position: 'absolute',
        top: `${position.topPercent}%`,
        left: `${position.leftPercent}%`,
        // Клики должны доходить до видео, а не упираться в надпись.
        pointerEvents: 'none',
        userSelect: 'none',
        color: 'rgba(255, 255, 255, 0.45)',
        // Тень нужна на светлых кадрах: без неё белая надпись пропадает.
        textShadow: '0 1px 2px rgba(0, 0, 0, 0.55)',
        fontSize: '0.85rem',
        whiteSpace: 'nowrap',
        transition: 'top 1s linear, left 1s linear'
      }}
    >
      {label}
    </span>
  );
};
