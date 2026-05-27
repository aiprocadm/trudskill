import { mvpApi } from '../mvp/api';

import type { CourseTree } from './types';
import type { UserSession } from '../../entities/session/model';

export const loadCourseTree = async (
  session: UserSession,
  courseVersionId: string
): Promise<CourseTree> => {
  const modulesResp = await mvpApi.listModules(session, courseVersionId);
  const modules = [...modulesResp.items].sort((a, b) => a.sortOrder - b.sortOrder);
  const materialsByModule = await Promise.all(
    modules.map((m) => mvpApi.listMaterials(session, m.id))
  );
  return modules.map((module, idx) => ({
    module,
    materials: [...(materialsByModule[idx]?.items ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
  }));
};
