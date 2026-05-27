import type { CourseModule, Material, Progress } from '../mvp/types';

export interface CourseTreeNode {
  module: CourseModule;
  materials: Material[];
}

export type CourseTree = CourseTreeNode[];

export type LockStatus = 'unlocked' | 'locked';

export type LockState = Map<string, LockStatus>;

export type ProgressByMaterial = Map<string, Progress>;
