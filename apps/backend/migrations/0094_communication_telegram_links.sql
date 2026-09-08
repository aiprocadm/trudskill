-- ФТ-F3 — привязка Telegram-чата к учётной записи.
--
-- ЗАЧЕМ. Уведомление можно отправить только в тот чат, который человек сам связал со своей
-- учётной записью: идентификатор чата приходит от Telegram и ничего не говорит о том, кто
-- за ним. Привязка и есть ответ на вопрос «кому это писать».
--
-- ПОЧЕМУ ДВА ОГРАНИЧЕНИЯ УНИКАЛЬНОСТИ:
--   * один чат — один человек: иначе уведомления двух слушателей приходили бы в один чат,
--     а это чужие персональные данные (кто, чему учится, когда истекает удостоверение);
--   * один человек в центре — один чат: повторная привязка ЗАМЕНЯЕТ прежнюю, иначе после
--     смены телефона сообщения продолжали бы уходить на старое устройство.
CREATE TABLE IF NOT EXISTS communication.telegram_links (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  user_id text NOT NULL,
  chat_id text NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_telegram_links_chat ON communication.telegram_links (chat_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_telegram_links_user
  ON communication.telegram_links (tenant_id, user_id);

-- Рассылка ищет чат по получателю — без индекса это перебор всей таблицы на каждое письмо.
CREATE INDEX IF NOT EXISTS ix_telegram_links_tenant_user
  ON communication.telegram_links (tenant_id, user_id);
