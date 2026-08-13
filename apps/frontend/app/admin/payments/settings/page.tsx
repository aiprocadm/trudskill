import { redirect } from 'next/navigation';

/*
 * IA-018 — ⚠️ меняет поведение (ТЗ §4.9).
 *
 * Настройка платёжного провайдера — три поля, ради которых был отдельный пункт меню.
 * Теперь она раздел общего экрана настроек; адрес сохранён редиректом на якорь,
 * чтобы сохранённые ссылки продолжали работать.
 */
export default function AdminPaymentSettingsPage() {
  redirect('/settings#payments');
}
