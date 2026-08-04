/**
 * ФТ-D3.2: адрес не принадлежит платформе или центр по нему не заведён.
 *
 * Страница публичная и намеренно НЕ внутри AppShell: пользователь сюда попадает ДО входа,
 * и предлагать ему меню кабинета несуществующего центра — бессмыслица. Белый экран или
 * «Application error» здесь недопустимы: чаще всего человек просто ошибся в адресе.
 */
export default function TenantNotFoundPage() {
  return (
    <main className="ui-auth-center">
      <article className="ui-section-card ui-auth-card">
        <h1 className="ui-section-title">Учебный центр не найден</h1>
        <div className="ui-stack">
          <p className="ui-callout ui-callout--danger">
            По этому адресу нет учебного центра платформы.
          </p>
          <p className="ui-prose-muted">
            Проверьте адрес в строке браузера: у каждого центра он свой. Если адрес дал вам учебный
            центр — попросите у него действующую ссылку: кабинет мог быть переименован или ещё не
            открыт.
          </p>
        </div>
      </article>
    </main>
  );
}
