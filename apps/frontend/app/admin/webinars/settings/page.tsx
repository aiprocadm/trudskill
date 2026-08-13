import { redirect } from 'next/navigation';

/*
 * IA-018 — ⚠️ меняет поведение (ТЗ §4.9). Выбор площадки вебинаров стал разделом
 * общего экрана настроек; старый адрес сохранён редиректом на якорь.
 */
export default function AdminWebinarSettingsPage() {
  redirect('/settings#webinars');
}
