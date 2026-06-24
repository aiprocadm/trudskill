'use client';

import { LoadingState } from '@trudskill/ui';
import { useEffect, useState } from 'react';

import { fetchVerifyDocument } from './api';
import { DOCUMENT_TYPE_LABELS, type VerifyResult } from './types';

interface VerifyPageProps {
  token: string;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: VerifyResult };

export function VerifyPage({ token }: VerifyPageProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void fetchVerifyDocument(token)
      .then((result) => {
        if (cancelled) return;
        if (result === null) {
          setState({ kind: 'not_found' });
        } else {
          setState({ kind: 'ready', data: result });
        }
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setState({
          kind: 'error',
          message: caught instanceof Error ? caught.message : 'Ошибка проверки'
        });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Публичная страница вне AppShell: центрируем средствами дизайн-системы (.ui-auth-center),
  // карточка — фирменная .ui-section-card. Тема (вкл. тёмную) приходит из UiThemeProvider на корне.
  return (
    <main className="ui-auth-center">
      <article className="ui-section-card ui-auth-card">
        <h1 className="ui-section-title">Проверка подлинности документа</h1>

        {state.kind === 'loading' ? <LoadingState message="Проверяем…" /> : null}

        {state.kind === 'not_found' ? (
          <div className="ui-stack">
            <p className="ui-callout ui-callout--danger">Документ не найден</p>
            <p className="ui-prose-muted">
              QR-код не соответствует ни одному выпущенному документу. Проверьте, что вы
              отсканировали актуальный документ.
            </p>
          </div>
        ) : null}

        {state.kind === 'error' ? (
          <div className="ui-stack">
            <p className="ui-callout ui-callout--danger">Ошибка проверки</p>
            <p className="ui-prose-muted">{state.message}</p>
          </div>
        ) : null}

        {state.kind === 'ready' ? <VerifyCard data={state.data} /> : null}
      </article>
    </main>
  );
}

function VerifyCard({ data }: { data: VerifyResult }) {
  const isRevoked = data.status === 'revoked';
  return (
    <div className="ui-stack">
      {/* Заметная плашка статуса: зелёная «Действителен» / красная «Аннулирован» из токенов темы */}
      <p className={`ui-callout ${isRevoked ? 'ui-callout--danger' : 'ui-callout--success'}`}>
        <strong>{isRevoked ? 'Аннулирован' : 'Действителен'}</strong>
      </p>
      <dl className="ui-defs">
        {data.documentNumber ? <Row label="№ документа" value={data.documentNumber} /> : null}
        {data.documentType ? (
          <Row label="Тип" value={DOCUMENT_TYPE_LABELS[data.documentType] ?? data.documentType} />
        ) : null}
        {data.issueDate ? <Row label="Дата выдачи" value={data.issueDate} /> : null}
        {data.learnerFullName ? <Row label="Слушатель" value={data.learnerFullName} /> : null}
        {data.programTitle ? <Row label="Программа" value={data.programTitle} /> : null}
        {data.academicHours !== undefined ? (
          <Row label="Часов" value={String(data.academicHours)} />
        ) : null}
        {data.issuerName ? <Row label="Кто выдал" value={data.issuerName} /> : null}
        {isRevoked && data.revokedAt ? (
          <Row label="Дата аннулирования" value={data.revokedAt} />
        ) : null}
        {isRevoked && data.revocationReason ? (
          <Row label="Причина" value={data.revocationReason} />
        ) : null}
      </dl>
    </div>
  );
}

// Пара «метка → значение» внутри .ui-defs: цвета и типографика берутся из классов дизайн-системы.
function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
