'use client';

import { useQuery } from '@tanstack/react-query';

import { buildProgramTree } from './program-tree';
import { useAuth } from '../auth/context';
import { mvpApi } from '../mvp/api';

/**
 * Программа версии курса целиком — дерево «модуль → материалы» (ТЗ 8.4).
 *
 * **Почему не один запрос.** Ручки «вся программа разом» на сервере нет, а заводить её ради
 * одного экрана значило бы расширить контракт под вид. Модули берутся одним запросом, материалы
 * — по одному запросу на модуль параллельно: программ с сотнями модулей не бывает, а разница
 * с отдельной ручкой для человека незаметна.
 *
 * **Ключ запроса включает версию.** Методист создаёт новую версию и остаётся на той же
 * странице; без версии в ключе он увидел бы программу прежней редакции и правил бы не то.
 */
export const useProgramTree = (courseVersionId: string | undefined) => {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ['mvp', 'programTree', courseVersionId ?? null],
    enabled: Boolean(session) && Boolean(courseVersionId),
    queryFn: async () => {
      const modules = (await mvpApi.listModules(session!, courseVersionId!)).items;
      const perModule = await Promise.all(
        modules.map((module) => mvpApi.listMaterials(session!, module.id))
      );
      return buildProgramTree(
        modules,
        perModule.flatMap((response) => response.items)
      );
    }
  });

  return {
    nodes: query.data?.nodes ?? [],
    orphans: query.data?.orphans ?? [],
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: query.refetch
  };
};
