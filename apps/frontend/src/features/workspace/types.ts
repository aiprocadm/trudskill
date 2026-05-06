export interface WorkspaceSummary {
  overdueCount: number;
  blockersCount: number;
  nextActions: Array<{ id: string; title: string; route: string }>;
  deepLinks?: Array<{ key: string; route: string }>;
}

export interface WorkspaceTaskItem {
  id: string;
  title: string;
  status: 'open' | 'in_progress' | 'overdue';
  dueAt?: string;
  route: string;
}

export interface WorkspaceBlockerItem {
  id: string;
  title: string;
  severity: 'low' | 'medium' | 'high';
  route: string;
}
