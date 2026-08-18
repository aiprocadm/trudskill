'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FilePicker, LoadingState, StatusChip } from '@trudskill/ui';
import { useState } from 'react';

import {
  type UploadProgress,
  VIDEO_MIME_TYPES,
  type VideoAssetDto,
  formatBytes,
  uploadVideoFile,
  videoApi
} from './api';
import { SectionCard, SectionEmpty, SectionError } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';

/**
 * Загрузка видео методистом (ФТ-B1.1, Фаза 2 Task 2).
 *
 * Отдельная секция, а не часть редактора урока: единого мастера курса ещё нет — он
 * появится в Task 11 (ФТ-E1), и тогда эта форма переедет туда. Пока методисту важнее
 * иметь возможность залить ролик вообще, чем ждать мастера.
 */

const STATUS_LABEL: Record<VideoAssetDto['status'], string> = {
  uploading: 'Загружается',
  processing: 'Обрабатывается',
  ready: 'Готово',
  failed: 'Ошибка'
};

const STATUS_CHIP: Record<VideoAssetDto['status'], string> = {
  uploading: 'pending',
  processing: 'pending',
  ready: 'active',
  failed: 'inactive'
};

/** Размер в мегабайтах и длительность словами: «12,4 МБ · 5 мин 30 с». */
const describeAsset = (item: { sizeBytes: number; durationSeconds?: number }): string => {
  const megabytes = item.sizeBytes / 1024 ** 2;
  const size =
    megabytes >= 1 ? `${megabytes.toFixed(1)} МБ` : `${Math.round(item.sizeBytes / 1024)} КБ`;
  if (item.durationSeconds === undefined) return size;
  const minutes = Math.floor(item.durationSeconds / 60);
  const seconds = Math.round(item.durationSeconds % 60);
  const duration = minutes > 0 ? `${minutes} мин ${seconds} с` : `${seconds} с`;
  return `${size} · ${duration}`;
};

export function VideoUploadSection() {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const [materialId, setMaterialId] = useState('');
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAssetId, setLastAssetId] = useState<string | null>(null);

  // Пока хоть одно видео обрабатывается, список обновляется сам — методисту не нужно
  // гадать, дошло ли дело до конца, и жать F5. Когда всё в терминальном статусе,
  // опрос замолкает: держать вечный таймер ради неменяющихся данных незачем.
  const [polling, setPolling] = useState(false);

  const assetsQuery = useQuery({
    queryKey: ['video-assets', session?.user.id, materialId],
    enabled: Boolean(session && materialId),
    queryFn: async () => {
      const result = await videoApi.listByMaterial(session!, materialId);
      setPolling(result.items.some((item) => item.status !== 'ready' && item.status !== 'failed'));
      return result;
    },
    ...(polling ? { refetchInterval: 5000 } : {})
  });

  // ФТ-B1.3: остаток места виден ДО выбора файла — иначе методист узнает о лимите
  // после часа заливки четырёхгигабайтного ролика.
  const storageQuery = useQuery({
    queryKey: ['video-storage', session?.user.id],
    enabled: Boolean(session),
    queryFn: () => videoApi.storage(session!)
  });

  const upload = async (file: File) => {
    if (!session) return;
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      const assetId = await uploadVideoFile(session, file, setProgress);
      setLastAssetId(assetId);
      if (materialId) {
        await videoApi.attach(session, assetId, materialId);
        await queryClient.invalidateQueries({ queryKey: ['video-assets'] });
      }
      // Место изменилось — обновляем счётчик, иначе он врёт до перезагрузки страницы.
      await queryClient.invalidateQueries({ queryKey: ['video-storage'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить видео');
    } finally {
      setBusy(false);
    }
  };

  const items = assetsQuery.data?.items ?? [];

  return (
    <SectionCard title="Видео урока">
      <p className="ui-text-muted">
        Ролик загружается частями, поэтому обрыв связи стоит одной части, а не всей заливки.
        Поддерживаются MP4, MOV, MKV и WebM до 4 ГБ. После загрузки видео обрабатывается — это
        занимает время, статус обновляется сам.
      </p>

      {storageQuery.data ? (
        <p data-testid="video-storage-usage">
          {storageQuery.data.limitBytes === null
            ? `Занято в хранилище: ${formatBytes(storageQuery.data.usedBytes)} (лимит не задан)`
            : `Занято ${formatBytes(storageQuery.data.usedBytes)} из ${formatBytes(
                storageQuery.data.limitBytes
              )}, свободно ${formatBytes(storageQuery.data.remainingBytes ?? 0)}`}
        </p>
      ) : null}

      <div className="ui-inline">
        <label>
          ID материала
          <input
            value={materialId}
            onChange={(event) => setMaterialId(event.target.value)}
            placeholder="mat_..."
            aria-label="ID материала"
          />
        </label>
        <FilePicker
          ariaLabel="Выбрать видеофайл"
          accept={VIDEO_MIME_TYPES.join(',')}
          disabled={busy}
          resetAfterSelect
          onSelect={(file) => {
            if (file) void upload(file);
          }}
        />
      </div>

      {!materialId ? (
        <p className="ui-text-muted">
          Укажите ID материала — тогда загруженное видео сразу привяжется к уроку.
        </p>
      ) : null}

      {busy && progress ? (
        <p data-testid="video-upload-progress">
          Загружено частей: {progress.uploadedParts} из {progress.totalParts}
        </p>
      ) : null}
      {busy && !progress ? <LoadingState message="Подготовка загрузки…" /> : null}

      {error ? <SectionError message={error} /> : null}
      {lastAssetId && !error ? (
        <p data-testid="video-upload-done">Видео загружено, идентификатор: {lastAssetId}</p>
      ) : null}

      {materialId && assetsQuery.isLoading ? <LoadingState message="Загрузка списка…" /> : null}
      {materialId && !assetsQuery.isLoading && !items.length ? (
        <SectionEmpty
          message="К этому материалу видео пока не привязано"
          hint="Загруженное видео слушатель увидит внутри материала курса."
        />
      ) : null}

      {items.map((item) => (
        <div key={item.id} className="ui-inline" data-testid="video-asset-row">
          <StatusChip status={STATUS_CHIP[item.status]} />
          <span>{STATUS_LABEL[item.status]}</span>
          {/*
            Здесь стоял идентификатор записи («3f7a-…»): по нему нельзя понять, какое это
            видео. Имени файла сервер не присылает, поэтому показываем то, что отличает
            записи на глаз, — размер и длительность.
          */}
          <span>{describeAsset(item)}</span>
          {item.errorMessage ? <span className="ui-error">{item.errorMessage}</span> : null}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void videoApi
                .remove(session!, item.id)
                .then(async () => {
                  await queryClient.invalidateQueries({ queryKey: ['video-assets'] });
                  await queryClient.invalidateQueries({ queryKey: ['video-storage'] });
                })
                .catch((err: unknown) =>
                  setError(err instanceof Error ? err.message : 'Не удалось удалить видео')
                )
            }
          >
            Удалить
          </button>
        </div>
      ))}
    </SectionCard>
  );
}
