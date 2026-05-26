'use client';

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

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: '#f5f5f7'
      }}
    >
      <article
        style={{
          width: '100%',
          maxWidth: 480,
          background: 'white',
          borderRadius: 12,
          padding: 24,
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
        }}
      >
        <h1 style={{ margin: '0 0 16px', fontSize: 20 }}>Проверка подлинности документа</h1>

        {state.kind === 'loading' ? <p>Проверяем…</p> : null}

        {state.kind === 'not_found' ? (
          <div>
            <StatusBadge variant="error" label="Документ не найден" />
            <p style={{ marginTop: 12 }}>
              QR-код не соответствует ни одному выпущенному документу. Проверьте, что вы
              отсканировали актуальный документ.
            </p>
          </div>
        ) : null}

        {state.kind === 'error' ? (
          <div>
            <StatusBadge variant="error" label="Ошибка проверки" />
            <p style={{ marginTop: 12, color: 'crimson' }}>{state.message}</p>
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
    <div>
      {isRevoked ? (
        <StatusBadge variant="error" label="Аннулирован" />
      ) : (
        <StatusBadge variant="success" label="Действителен" />
      )}
      <dl style={{ margin: '16px 0 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt style={{ color: '#666', fontSize: 14 }}>{label}</dt>
      <dd style={{ margin: 0, fontWeight: 600 }}>{value}</dd>
    </>
  );
}

function StatusBadge({ variant, label }: { variant: 'success' | 'error'; label: string }) {
  const color = variant === 'success' ? '#0a8a0a' : '#c81e1e';
  const bg = variant === 'success' ? '#e8f5e8' : '#fde8e8';
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 12px',
        borderRadius: 999,
        background: bg,
        color,
        fontSize: 14,
        fontWeight: 600
      }}
    >
      {label}
    </span>
  );
}
