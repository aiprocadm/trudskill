'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LoadingState } from '@trudskill/ui';
import { useRef, useState } from 'react';

import {
  TENANT_IMAGE_MIMES,
  type TenantImageSlot,
  type TenantImagesDto,
  putTenantImage,
  tenantImagesApi
} from './api';
import { SectionCard, SectionError } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';

/**
 * Подпись и печать учебного центра (ФТ-A7.1, Фаза 1 Task 9).
 *
 * Админ загружает картинку один раз, а в бланке ставит тег `{%tenant.signature_image}`.
 * Здесь же — ширина в миллиметрах: без неё скан подписи встал бы в натуральную величину
 * и занял пол-листа.
 */

const SLOTS: Array<{ slot: TenantImageSlot; title: string; tag: string; hint: string }> = [
  {
    slot: 'signature',
    title: 'Подпись руководителя',
    tag: '{%tenant.signature_image}',
    hint: 'PNG с прозрачным фоном выглядит на бланке аккуратнее всего.'
  },
  {
    slot: 'stamp',
    title: 'Печать учебного центра',
    tag: '{%tenant.stamp_image}',
    hint: 'Ставьте тег там, где на бланке место «М.П.».'
  }
];

const MAX_BYTES = 5 * 1024 * 1024;

export function TenantImagesSection() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const inputs = useRef<Partial<Record<TenantImageSlot, HTMLInputElement | null>>>({});

  const [widths, setWidths] = useState<Partial<Record<TenantImageSlot, string>>>({});
  const [busySlot, setBusySlot] = useState<TenantImageSlot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const imagesQuery = useQuery({
    queryKey: ['tenant-images', session?.user.id],
    enabled: Boolean(session),
    queryFn: () => tenantImagesApi.list(session!)
  });
  const images: TenantImagesDto = imagesQuery.data?.images ?? {};

  const run = async (slot: TenantImageSlot, action: () => Promise<unknown>, failure: string) => {
    setBusySlot(slot);
    setError(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ['tenant-images'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : failure);
    } finally {
      setBusySlot(null);
    }
  };

  const widthFor = (slot: TenantImageSlot): number | undefined => {
    const raw = widths[slot] ?? (images[slot]?.widthMm ? String(images[slot]!.widthMm) : '');
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };

  const upload = (slot: TenantImageSlot, file: File) =>
    run(
      slot,
      async () => {
        // Проверяем до загрузки: иначе пользователь ждёт PUT ради ответа «формат не тот».
        if (!(TENANT_IMAGE_MIMES as readonly string[]).includes(file.type)) {
          throw new Error('Нужен файл PNG или JPEG');
        }
        if (file.size > MAX_BYTES) {
          throw new Error('Файл больше 5 МБ — для факсимиле это слишком много');
        }
        const intent = await tenantImagesApi.uploadUrl(session!, {
          originalName: file.name,
          sizeBytes: file.size,
          contentType: file.type
        });
        await putTenantImage(intent.uploadUrl, file, file.type);
        const widthMm = widthFor(slot);
        return tenantImagesApi.save(session!, slot, {
          fileId: intent.fileId,
          ...(widthMm ? { widthMm } : {})
        });
      },
      'Не удалось загрузить картинку'
    );

  const saveWidth = (slot: TenantImageSlot) => {
    const current = images[slot];
    if (!current) return;
    const widthMm = widthFor(slot);
    return run(
      slot,
      () =>
        tenantImagesApi.save(session!, slot, {
          fileId: current.fileId,
          ...(widthMm ? { widthMm } : {})
        }),
      'Не удалось сохранить размер'
    );
  };

  const remove = (slot: TenantImageSlot) =>
    run(slot, () => tenantImagesApi.save(session!, slot, { fileId: null }), 'Не удалось убрать картинку');

  return (
    <SectionCard title="Подпись и печать">
      <p className="ui-text-muted">
        Загруженные картинки подставляются в бланк по тегу — их не нужно вставлять в файл руками.
        Юридически это факсимиле: усиленная подпись выдаётся отдельно, через электронную подпись.
      </p>

      {imagesQuery.error ? (
        <SectionError
          message={
            imagesQuery.error instanceof Error
              ? imagesQuery.error.message
              : 'Не удалось загрузить настройки'
          }
        />
      ) : null}
      {error ? <SectionError message={error} /> : null}
      {imagesQuery.isLoading ? <LoadingState message="Загрузка настроек…" /> : null}

      {!imagesQuery.isLoading
        ? SLOTS.map(({ slot, title, tag, hint }) => {
            const current = images[slot];
            return (
              <div key={slot} className="ui-stack">
                <h4>{title}</h4>
                <p className="ui-text-muted">
                  Тег для бланка: <code>{tag}</code>. {hint}
                </p>
                <p>{current ? 'Загружена' : 'Не загружена — бланк напечатается без неё'}</p>
                <div className="ui-inline">
                  <input
                    ref={(node) => {
                      inputs.current[slot] = node;
                    }}
                    type="file"
                    accept={TENANT_IMAGE_MIMES.join(',')}
                    aria-label={`${title}: выбрать файл`}
                    disabled={busySlot !== null}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void upload(slot, file);
                      event.target.value = '';
                    }}
                  />
                  <label>
                    Ширина на бланке, мм
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={widths[slot] ?? (current?.widthMm ? String(current.widthMm) : '')}
                      placeholder={slot === 'signature' ? '40' : '35'}
                      onChange={(event) =>
                        setWidths((prev) => ({ ...prev, [slot]: event.target.value }))
                      }
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busySlot !== null || !current}
                    onClick={() => void saveWidth(slot)}
                  >
                    Сохранить размер
                  </button>
                  <button
                    type="button"
                    disabled={busySlot !== null || !current}
                    onClick={() => void remove(slot)}
                  >
                    Убрать
                  </button>
                </div>
              </div>
            );
          })
        : null}
    </SectionCard>
  );
}
