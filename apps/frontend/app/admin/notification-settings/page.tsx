import { redirect } from 'next/navigation';

/*
 * IA-018 — ⚠️ меняет поведение (ТЗ §4.9). Адреса для копий писем стали разделом
 * общего экрана настроек; старый адрес сохранён редиректом на якорь.
 */
export default function AdminNotificationSettingsPage() {
  redirect('/settings#notifications');
}
