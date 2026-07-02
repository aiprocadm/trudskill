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
// BarChart3 не экспортируется в установленной версии lucide-react (1.23.0) — переименован
// в рамках ребрендинга glyph-имён библиотеки. Ближайший семантический эквивалент — ChartColumn
// (столбчатая диаграмма, тот же смысл блока «Отчёты и выгрузки»).
export const BarChart3Icon: LucideIcon = ChartColumn;
export const MessagesSquareIcon: LucideIcon = MessagesSquare;
export const SettingsIcon: LucideIcon = Settings;

// Служебные иконки оболочки.
export const ChevronDownIcon: LucideIcon = ChevronDown;
export const SearchIcon: LucideIcon = Search;
