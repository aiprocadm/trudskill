// Курируемый реестр иконок навигации — ЕДИНСТВЕННОЕ место в apps/frontend,
// где разрешён прямой импорт из lucide-react (см. eslint.config.mjs → no-restricted-imports).
// Все остальные модули импортируют готовые глифы отсюда и передают их в <Icon icon={...} /> из @trudskill/ui.
import {
  BookOpen,
  Building2,
  ChartColumn,
  ChevronDown,
  ClipboardCheck,
  FileBadge,
  GraduationCap,
  LayoutDashboard,
  MessagesSquare,
  Search,
  Settings,
  Users
} from 'lucide-react';

import type { LucideIcon } from '@trudskill/ui';

// Иконки блоков навигации (10 блоков ИА).
export const LayoutDashboardIcon: LucideIcon = LayoutDashboard;
export const GraduationCapIcon: LucideIcon = GraduationCap;
export const BookOpenIcon: LucideIcon = BookOpen;
export const ClipboardCheckIcon: LucideIcon = ClipboardCheck;
export const UsersIcon: LucideIcon = Users;
export const Building2Icon: LucideIcon = Building2;
export const FileBadgeIcon: LucideIcon = FileBadge;
// lucide-react@1.23.0: канонический глиф — ChartColumn; BarChart3 — устаревший алиас того же глифа.
// Используем ChartColumn напрямую; имя экспортируемой константы (BarChart3Icon) сохранено для читаемости.
export const BarChart3Icon: LucideIcon = ChartColumn;
export const MessagesSquareIcon: LucideIcon = MessagesSquare;
export const SettingsIcon: LucideIcon = Settings;

// Служебные иконки оболочки.
export const ChevronDownIcon: LucideIcon = ChevronDown;
export const SearchIcon: LucideIcon = Search;
