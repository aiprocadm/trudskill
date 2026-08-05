/** ФТ-H2 (Фаза 5 Task 2): дашборд методиста — «где сейчас горит по обучению». */

export interface GroupDeadline {
  groupId: string;
  groupName: string;
  dueAt: string;
  learnersCount: number;
  daysLeft: number;
}

export interface OverdueGroup {
  groupId: string;
  groupName: string;
  since: string;
  learnersCount: number;
  daysOverdue: number;
}

export interface CourseWithoutExam {
  courseId: string;
  courseTitle: string;
  /** Группа приходит только тем, кому разрешено видеть состав обучения. */
  groupId?: string;
  groupName?: string;
}

export interface MethodistDashboard {
  asOf: string;
  horizonDays: number;
  upcomingDeadlines: GroupDeadline[];
  overdueGroups: OverdueGroup[];
  coursesWithoutExam: CourseWithoutExam[];
  totals: {
    activeGroups: number;
    activeLearners: number;
    upcomingDeadlines: number;
    overdueGroups: number;
    coursesWithoutExam: number;
  };
  /** Приходит только тем, кто проверяет работы. */
  reviewQueue?: {
    pendingAttempts: number;
    pendingSubmissions: number;
    total: number;
  };
  /** Разделы, скрытые из-за нехватки прав — показываются как «нет доступа». */
  hiddenSections: string[];
}
