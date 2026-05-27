'use client';

import Link from 'next/link';

import { pickRecentDocuments } from './recent-documents';
import { SectionCard } from '../../components/state-wrappers';
import { useMyDocuments } from '../learner-documents/hooks';

import type { ReactElement } from 'react';

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  certificate: 'Удостоверение',
  protocol: 'Протокол',
  order: 'Приказ',
  diploma: 'Диплом',
  attestation: 'Свидетельство',
  reference: 'Справка',
  report: 'Отчёт',
  contract: 'Договор'
};

/**
 * Phase 1 §4.3 — компактный preview «последние документы» на главной учащегося.
 *
 * Поведение:
 * - Скрывается, пока загружается (`isLoading`) — не светим пустым плейсхолдером.
 * - Скрывается, если документов нет совсем — главная не должна пугать учащегося
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
            {d.documentDate ? <span className="ui-text-muted">{d.documentDate}</span> : null}
          </li>
        ))}
      </ul>
      <p className="ui-text-muted">
        <Link href="/learner/documents">Все мои документы →</Link>
      </p>
    </SectionCard>
  );
};
