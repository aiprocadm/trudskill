// Курируемый реестр иконок навигации — ЕДИНСТВЕННОЕ место в apps/frontend,
// где разрешён прямой импорт из lucide-react (см. eslint.config.mjs → no-restricted-imports).
// Все остальные модули импортируют готовые глифы отсюда и передают их в <Icon icon={...} /> из @trudskill/ui.
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Building2,
  ChartColumn,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleX,
  ClipboardCheck,
  Clock,
  FileBadge,
  GraduationCap,
  LayoutDashboard,
  Lock,
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

/*
 * Значки состояний (`UI-024`). Раньше эти места рисовали символами прямо в разметке —
 * «🔒 ✓ ⏳ ☐» в оглавлении курса, «✓ / ✕» в результате теста, «↑ ↓ →» в карточке
 * показателя. Символ приходится помечать `aria-hidden` (иначе читалка произносит
 * «песочные часы»), и тогда смысл пропадает совсем: слушатель со скринридером слышал
 * название урока, не зная, пройден он или закрыт.
 */
export const CheckCircleIcon: LucideIcon = CheckCircle2;
export const CheckIcon: LucideIcon = Check;
export const ClockIcon: LucideIcon = Clock;
export const CircleIcon: LucideIcon = Circle;
export const CircleXIcon: LucideIcon = CircleX;
export const LockIcon: LucideIcon = Lock;
export const ArrowUpIcon: LucideIcon = ArrowUp;
export const ArrowDownIcon: LucideIcon = ArrowDown;
export const ArrowRightIcon: LucideIcon = ArrowRight;
