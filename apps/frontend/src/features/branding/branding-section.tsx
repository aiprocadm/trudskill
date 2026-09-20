'use client';

import { useQueryClient } from '@tanstack/react-query';
import { AA_NORMAL_TEXT, contrastRatio } from '@trudskill/ui';
import { useEffect, useState } from 'react';

import { brandingApi } from './api';
import { useTenantBranding } from './context';
import { isHexColor } from './theme';
import { SectionCard, SectionError } from '../../components/state-wrappers';
import { useUnsavedForm } from '../../components/use-unsaved-form';
import { useAuth } from '../auth/context';

/**
 * ФТ-D3.1: настройка бренда центра в /settings. Секция видна только с правом
 * `tenant.branding.configure` (0075). Цвета вводятся штатным color-пикером —
 * он отдаёт всегда валидный #rrggbb; кривые значения возможны только в
 * логотипе/имени и в правленом вручную payload — их отбрасывает сервер.
 */
/*
 * Цвета по умолчанию — те же, что подставляет тема, когда центр свой цвет не выбрал. Названы
 * здесь один раз: форма стартует с них, и с ними же сравнивается «что человек изменил».
 */
const DEFAULT_BRAND_COLOR = '#3b4fe4';
const DEFAULT_ACCENT_COLOR = '#ff7a45';

export function BrandingSettingsSection() {
  const { session } = useAuth();
  const branding = useTenantBranding();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [brandColor, setBrandColor] = useState(DEFAULT_BRAND_COLOR);
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT_COLOR);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  /*
   * Что должно лежать в форме при открытии. Вынесено функцией, потому что этим же значением
   * защита от потери правок отличает «человек печатал» от «пришли данные» (ТЗ 10.3): второй
   * такой же список разъехался бы с первым при первой же правке умолчаний.
   */
  const brandingForm = {
    displayName: branding.displayName ?? '',
    logoUrl: branding.logoUrl ?? '',
    brandColor: isHexColor(branding.brandColor) ? branding.brandColor : DEFAULT_BRAND_COLOR,
    accentColor: isHexColor(branding.accentColor) ? branding.accentColor : DEFAULT_ACCENT_COLOR
  };

  // Форма наполняется текущим брендом после его загрузки (контекст стартует пустым).
  useEffect(() => {
    setDisplayName(brandingForm.displayName);
    setLogoUrl(brandingForm.logoUrl);
    setBrandColor(brandingForm.brandColor);
    setAccentColor(brandingForm.accentColor);
  }, [branding.displayName, branding.logoUrl, branding.brandColor, branding.accentColor]);

  // Возвращаем null целиком (вместе с карточкой) — пустая рамка «Бренд центра»
  // у методиста выглядела бы как сломанная секция.
  /*
   * Защита от потери несохранённых правок (ТЗ 10.3). Ключ — сам бренд из контекста: пока он
   * грузится, форма пуста, и без ключа её наполнение выглядело бы как правка человека.
   */
  const unsavedGuard = useUnsavedForm(
    { displayName, logoUrl, brandColor, accentColor },
    { saving: busy, initial: brandingForm }
  );

  if (!session?.permissions.includes('tenant.branding.configure')) return null;

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await brandingApi.update(session, {
        displayName,
        logoUrl,
        brandColor,
        accentColor
      });
      await queryClient.invalidateQueries({ queryKey: ['tenant-branding'] });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить бренд');
    } finally {
      setBusy(false);
    }
  };

  /* Лучший из двух вариантов текста — ровно то, что подставит brandingToThemeVars. */
  const accentContrast = isHexColor(accentColor)
    ? Math.max(
        contrastRatio('#0f172a', accentColor) ?? 0,
        contrastRatio('#ffffff', accentColor) ?? 0
      )
    : null;

  return (
    <SectionCard title="Оформление под ваш центр">
      {unsavedGuard}
      <p className="ui-text-muted">
        Название, логотип и цвета вашего центра: в шапке кабинета, в письмах слушателям и на
        публичной странице проверки документов. Пустое поле возвращает значение по умолчанию.
      </p>
      {error ? <SectionError message={error} /> : null}
      <div className="ui-inline">
        <label>
          Название центра
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="УЦ «Пример»"
            maxLength={120}
          />
        </label>
        <label>
          Адрес логотипа (https)
          <input
            value={logoUrl}
            onChange={(event) => setLogoUrl(event.target.value)}
            placeholder="https://…/logo.png"
            maxLength={500}
          />
        </label>
        <label>
          Основной цвет
          <input
            type="color"
            value={brandColor}
            onChange={(event) => setBrandColor(event.target.value)}
          />
        </label>
        <label>
          Акцентный цвет
          <input
            type="color"
            value={accentColor}
            onChange={(event) => setAccentColor(event.target.value)}
          />
        </label>
        <button type="button" disabled={busy} onClick={() => void save()}>
          Сохранить бренд
        </button>
        {saved ? <span className="ui-text-muted">Сохранено — тема обновится сразу.</span> : null}
      </div>

      {/*
        UI-005: цвет текста на кнопке подбирается автоматически, но есть цвета, на которых
        НЕ читается ни тёмный, ни белый — средние по яркости (например, фиолетовый #8b5cf6
        даёт лучшие 4.2:1 при норме 4.5:1). Запрещать чужой фирменный цвет мы не вправе,
        а вот предупредить обязаны — иначе слушатель получит кабинет с нечитаемой кнопкой.
      */}
      {accentContrast !== null && accentContrast < AA_NORMAL_TEXT ? (
        <p className="ui-callout ui-callout--warning">
          На этом акцентном цвете подпись кнопки будет читаться плохо: контраст{' '}
          {accentContrast.toFixed(1)} при норме 4,5. Возьмите заметно темнее или заметно светлее —
          средние по яркости цвета не дают контраста ни с тёмным текстом, ни с белым.
        </p>
      ) : null}
    </SectionCard>
  );
}
