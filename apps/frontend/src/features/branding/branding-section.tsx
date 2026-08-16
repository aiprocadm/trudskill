'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { brandingApi } from './api';
import { useTenantBranding } from './context';
import { isHexColor } from './theme';
import { SectionCard, SectionError } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';

/**
 * ФТ-D3.1: настройка бренда центра в /settings. Секция видна только с правом
 * `tenant.branding.configure` (0075). Цвета вводятся штатным color-пикером —
 * он отдаёт всегда валидный #rrggbb; кривые значения возможны только в
 * логотипе/имени и в правленом вручную payload — их отбрасывает сервер.
 */
export function BrandingSettingsSection() {
  const { session } = useAuth();
  const branding = useTenantBranding();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [brandColor, setBrandColor] = useState('#3b4fe4');
  const [accentColor, setAccentColor] = useState('#ff7a45');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Форма наполняется текущим брендом после его загрузки (контекст стартует пустым).
  useEffect(() => {
    setDisplayName(branding.displayName ?? '');
    setLogoUrl(branding.logoUrl ?? '');
    if (isHexColor(branding.brandColor)) setBrandColor(branding.brandColor);
    if (isHexColor(branding.accentColor)) setAccentColor(branding.accentColor);
  }, [branding.displayName, branding.logoUrl, branding.brandColor, branding.accentColor]);

  // Возвращаем null целиком (вместе с карточкой) — пустая рамка «Бренд центра»
  // у методиста выглядела бы как сломанная секция.
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

  return (
    <SectionCard title="Оформление под ваш центр">
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
    </SectionCard>
  );
}
