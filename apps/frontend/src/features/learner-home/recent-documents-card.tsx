'use client';

import Link from 'next/link';

import { pickRecentDocuments } from './recent-documents';
import { SectionCard } from '../../components/state-wrappers';
import { useMyDocuments } from '../learner-documents/hooks';
// Словарь видов — из общего слоя: здесь жила ТРЕТЬЯ копия, уже разъехавшаяся со словарём
// карточки слушателя («Свидетельство» против «Свидетельства об аттестации»).
import { DOCUMENT_TYPE_LABELS, formatDate } from '../mvp/screen-helpers';

import type { ReactElement } from 'react';

/**
 * Компактный список «последние документы» на главной слушателя.
 *
 * Поведение:
 * - Скрывается, пока загружается (`isLoading`) — не светим пустым плейсхолдером.
 * - Скрывается, если документов нет совсем — главная не должна пугать слушателя
 *   секцией «здесь пусто» (это уже делает `MyCoursesList`).
 * - Полностью переход на `/learner/documents` — здесь только 3 свежих.
 */
export const RecentDocumentsCard = (): ReactElement | null => {
  const { data, isLoading } = useMyDocuments();
  const recent = pickRecentDocuments(data?.items);

  if (isLoading || recent.length === 0) return null;

  return (
    <SectionCard title="Недавно выданные документы">
      <ul className="learner-home-recent-docs">
        {recent.map((d) => (
          <li key={d.id} className="learner-home-recent-docs__item">
            <div>
              <strong>{DOCUMENT_TYPE_LABELS[d.documentType] ?? d.documentType}</strong>
              {d.documentNumber ? ` №${d.documentNumber}` : ''}
              {d.courseTitle ? ` — ${d.courseTitle}` : ''}
            </div>
            {d.documentDate ? (
              <span className="ui-text-muted">{formatDate(d.documentDate)}</span>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="ui-text-muted">
        <Link href="/learner/documents">Все мои документы →</Link>
      </p>
    </SectionCard>
  );
};
