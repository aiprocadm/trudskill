import { mvpApi } from '../mvp/api';

import type { CourseTree } from './types';
import type { SessionDto } from '../mvp/types';

export const loadCourseTree = async (
  session: SessionDto,
  courseVersionId: string
): Promise<CourseTree> => {
  const modulesResp = await mvpApi.listModules(session, courseVersionId);
  const modules = [...modulesResp.items].sort((a, b) => a.sortOrder - b.sortOrder);
  const materialsByModule = await Promise.all(
    modules.map((m) => mvpApi.listMaterials(session, m.id))
  );
  return modules.map((module, idx) => ({
    module,
    materials: [...materialsByModule[idx].items].sort((a, b) => a.sortOrder - b.sortOrder)
  }));
};
