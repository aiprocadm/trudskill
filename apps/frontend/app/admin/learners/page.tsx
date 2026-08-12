import { redirect } from 'next/navigation';

/*
 * IA-017 — ⚠️ меняет поведение (ТЗ §4.9).
 *
 * `/admin/learners` и `/learners` рендерили ОДИН И ТОТ ЖЕ экран: два адреса на один реестр
 * означают два места в меню, две закладки у пользователя и вечный вопрос «а это то же самое?».
 * Адрес сохранён редиректом, чтобы сохранённые ссылки продолжали работать.
 */
export default function AdminLearnersPage() {
  redirect('/learners');
}
