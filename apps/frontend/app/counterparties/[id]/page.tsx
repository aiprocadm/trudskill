import { redirect } from 'next/navigation';

/*
 * IA-017: карточка заказчика сведена с карточкой компании (решение владельца).
 * Идентификатор тот же — сущность одна, поэтому старая ссылка открывает ту же
 * организацию, только на оставшемся экране.
 */
export default async function CounterpartyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/clients/${id}`);
}
