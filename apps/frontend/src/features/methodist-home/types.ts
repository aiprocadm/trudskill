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
  groupId: string;
  groupName: string;
  courseId: string;
  courseTitle: string;
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
  reviewQueue: {
    pendingAttempts: number;
    pendingSubmissions: number;
    total: number;
  };
}
