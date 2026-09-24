'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '../../lib/api/client';
import { useAuth } from '../auth/context';
import { withAuth } from '../mvp/api';

import type { UserSession } from '../../entities/session/model';

/**
 * МГ-F1.1 (срез 18.2): вид документа учебного центра — приказ о зачислении, протокол проверки
 * знаний, удостоверение… Каталог живёт на сервере (`GET /document-kinds`, РМ123) — экран его не
 * дублирует, чтобы четырнадцать названий не разъехались с бэкендом.
 */
export interface DocumentKind {
  code: string;
  name: string;
  /** Тип бланка («приказ», «протокол»…), к которому вид подходит. */
  templateType: string;
  scope: string;
  requiresCommission: boolean;
  requiresProtocol: boolean;
  numbering: string;
}

export const documentKindsApi = {
  list: (session: UserSession): Promise<{ items: DocumentKind[] }> =>
    apiRequest<{ items: DocumentKind[] }>('/document-kinds', withAuth(session))
};

/** Каталог одинаков для всех центров; общий кэш запросов не перезапрашивает его при каждом открытии. */
export function useDocumentKinds() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['document-kinds'],
    enabled: Boolean(session),
    queryFn: () => documentKindsApi.list(session!),
    meta: { suppressGlobalErrorToast: true }
  });
}

/** Виды, которые подходят бланку этого типа: у приказа их пять, у удостоверения — один. */
export const kindsForTemplateType = (
  kinds: readonly DocumentKind[],
  templateType: string | undefined
): DocumentKind[] => (templateType ? kinds.filter((k) => k.templateType === templateType) : []);

/**
 * Вид, который подставляется сам при выборе бланка: только если он единственный для типа
 * (удостоверение, диплом, выписка). У приказа видов пять — там человек выбирает сам.
 */
export const defaultKindFor = (
  kinds: readonly DocumentKind[],
  templateType: string | undefined
): string | undefined => {
  const fitting = kindsForTemplateType(kinds, templateType);
  return fitting.length === 1 ? fitting[0]?.code : undefined;
};

/** Название вида для таблицы. Незнакомый код не показывается как есть — правило «ни одного кода». */
export const documentKindLabel = (
  kinds: readonly DocumentKind[],
  code: string | undefined
): string => {
  if (!code) return 'Любой вид этого типа';
  return kinds.find((k) => k.code === code)?.name ?? 'Вид не найден в справочнике';
};
