import type { CourseTree, LockState, ProgressByMaterial } from './types';
import type { Material } from '../mvp/types';

const isRequiredCompleted = (material: Material, progress: ProgressByMaterial): boolean => {
  if (!material.isRequired) return true;
  return progress.get(material.id)?.status === 'completed';
};

export const computeUnlockedMaterials = (
  tree: CourseTree,
  progress: ProgressByMaterial
): LockState => {
  const state: LockState = new Map();
  const orderedModules = [...tree].sort((a, b) => a.module.sortOrder - b.module.sortOrder);

  let previousModulesGateOpen = true;

  for (const node of orderedModules) {
    const orderedMaterials = [...node.materials].sort((a, b) => a.sortOrder - b.sortOrder);
    let withinModuleGateOpen = previousModulesGateOpen;

    for (const material of orderedMaterials) {
      state.set(material.id, withinModuleGateOpen ? 'unlocked' : 'locked');
      if (material.isRequired && !isRequiredCompleted(material, progress)) {
        withinModuleGateOpen = false;
      }
    }

    if (!orderedMaterials.every((m) => isRequiredCompleted(m, progress))) {
      previousModulesGateOpen = false;
    }
  }

  return state;
};
