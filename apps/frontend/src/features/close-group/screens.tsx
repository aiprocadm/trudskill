'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { closeGroupApi, describeProgress } from './api';
import { SectionCard, SectionError } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';

/**
 * Закрытие группы одной кнопкой (ФТ-A5, Фаза 1 Task 7b).
 *
 * Оператор вводит группу, шаблоны и список сдавших — сервер ставит протокол и
 * удостоверения на рендер. Повторное нажатие безопасно: добивает только упавшие
 * (это же и есть штатный «перезапуск» из ФТ-A5.3). Готовый комплект скачивается
 * одним ZIP — ходить по 25 документам поштучно нереально.
 */
export function CloseGroupSection() {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const [groupId, setGroupId] = useState('');
  const [protocolTemplateId, setProtocolTemplateId] = useState('');
  const [certificateTemplateId, setCertificateTemplateId] = useState('');
  const [enrollments, setEnrollments] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const trimmedGroup = groupId.trim();
  const enrollmentIds = enrollments
    .split(/[\s,;]+/u)
    .map((id) => id.trim())
    .filter(Boolean);

  // Пока рендер идёт, прогресс обновляется сам — иначе оператор жмёт F5 и
  // гадает, доехала ли группа. Как только всё готово, опрос прекращается.
  const [settled, setSettled] = useState(false);
  const statusQuery = useQuery({
    queryKey: ['group-closure', session?.user.id, trimmedGroup],
    enabled: Boolean(session && trimmedGroup),
    queryFn: async () => {
      const result = await closeGroupApi.status(session!, trimmedGroup);
      setSettled(result.isComplete);
      return result;
    },
    refetchInterval: settled ? undefined : 5000
  });

  const canClose =
    Boolean(trimmedGroup) &&
    Boolean(protocolTemplateId.trim()) &&
    Boolean(certificateTemplateId.trim()) &&
    enrollmentIds.length > 0;

  const run = async (action: () => Promise<string>, failure: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setNotice(await action());
      await queryClient.invalidateQueries({ queryKey: ['group-closure'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : failure);
    } finally {
      setBusy(false);
    }
  };

  const closeGroup = () =>
    run(async () => {
      const result = await closeGroupApi.close(session!, {
        groupId: trimmedGroup,
        protocolTemplateId: protocolTemplateId.trim(),
        certificateTemplateId: certificateTemplateId.trim(),
        enrollmentIds
      });
      if (result.created === 0 && result.retried === 0) {
        return 'Всё уже выпущено — новых задач не потребовалось';
      }
      const parts: string[] = [];
      if (result.created > 0) parts.push(`поставлено задач: ${result.created}`);
      if (result.retried > 0) parts.push(`перезапущено упавших: ${result.retried}`);
      return parts.join(', ');
    }, 'Не удалось закрыть группу');

  const downloadPackage = () =>
    run(async () => {
      await closeGroupApi.downloadPackage(session!, trimmedGroup);
      return 'Комплект скачан';
    }, 'Не удалось скачать комплект');

  const status = statusQuery.data;

  return (
    <SectionCard title="Закрыть группу">
      <p className="ui-text-muted">
        Одной операцией: протокол на группу и удостоверение каждому сдавшему. Повторное нажатие
        безопасно — добиваются только упавшие, готовые документы не перевыпускаются.
      </p>

      {error ? <SectionError message={error} /> : null}
      {notice ? <p role="status">{notice}</p> : null}

      <div className="ui-stack" style={{ marginTop: 12 }}>
        <div className="ui-inline">
          <input
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            placeholder="ID группы"
          />
          <input
            value={protocolTemplateId}
            onChange={(e) => setProtocolTemplateId(e.target.value)}
            placeholder="ID шаблона протокола"
          />
          <input
            value={certificateTemplateId}
            onChange={(e) => setCertificateTemplateId(e.target.value)}
            placeholder="ID шаблона удостоверения"
          />
        </div>
        <textarea
          value={enrollments}
          onChange={(e) => setEnrollments(e.target.value)}
          placeholder="ID записей сдавших — через пробел, запятую или с новой строки"
          rows={3}
        />
        <div className="ui-inline">
          <button
            type="button"
            className="ui-button"
            onClick={() => void closeGroup()}
            disabled={busy || !canClose}
          >
            Закрыть группу{enrollmentIds.length ? ` (${enrollmentIds.length} чел.)` : ''}
          </button>
          <button
            type="button"
            className="ui-button"
            onClick={() => void downloadPackage()}
            disabled={busy || !status || status.completed === 0}
          >
            Скачать комплект (ZIP)
          </button>
        </div>
      </div>

      {trimmedGroup ? (
        <p style={{ marginTop: 12 }}>
          Прогресс: <strong>{status ? describeProgress(status) : 'загрузка…'}</strong>
          {status && status.failed > 0 ? (
            <span className="ui-text-muted">
              {' '}
              — нажмите «Закрыть группу» ещё раз, чтобы повторить упавшие
            </span>
          ) : null}
        </p>
      ) : null}
    </SectionCard>
  );
}
