'use client';

import { useEffect, useMemo, useState } from 'react';

import { PageHeader } from '../../src/components/state-wrappers';
import { useAuth } from '../../src/features/auth/context';
import { communicationApi, useChatRealtime } from '../../src/features/communication/hooks';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function ChatPage() {
  const { session } = useAuth();
  const [dialogs, setDialogs] = useState<{ id: string; title: string }[]>([]);
  const [selectedDialogId, setSelectedDialogId] = useState<string | undefined>();
  const [messages, setMessages] = useState<
    { id: string; authorUserId: string; textBody: string }[]
  >([]);
  const [text, setText] = useState('');
  const selected = useMemo(
    () => dialogs.find((item) => item.id === selectedDialogId),
    [dialogs, selectedDialogId]
  );

  const refreshDialogs = () =>
    session &&
    communicationApi.listDialogs(session).then((rows) => {
      setDialogs(rows);
      if (!selectedDialogId && rows[0]?.id) setSelectedDialogId(rows[0].id);
    });

  const refreshMessages = () =>
    session &&
    selectedDialogId &&
    communicationApi.listMessages(session, selectedDialogId).then((rows) => setMessages(rows));

  useEffect(() => {
    void refreshDialogs();
  }, [session]);

  useEffect(() => {
    void refreshMessages();
  }, [selectedDialogId, session]);

  useChatRealtime(selectedDialogId, () => void refreshMessages());

  return (
    <ProtectedPage>
      <div className="ui-page" style={{ paddingTop: 12 }}>
        <PageHeader title="Чат" subtitle="Диалоги и сообщения в реальном времени" />
        <div className="ui-chat-layout ui-section-card" style={{ padding: 0, overflow: 'hidden' }}>
          <aside className="ui-chat-sidebar">
            <h3 className="ui-chat-sidebar-title">Диалоги</h3>
            <div className="ui-stack" style={{ gap: 6 }}>
              {dialogs.map((dialog) => (
                <button
                  key={dialog.id}
                  type="button"
                  className="ui-button ui-chat-dialog-btn"
                  aria-current={dialog.id === selectedDialogId ? 'true' : undefined}
                  onClick={() => setSelectedDialogId(dialog.id)}
                >
                  {dialog.title} · {dialog.id.slice(0, 8)}…
                </button>
              ))}
            </div>
          </aside>
          <section className="ui-chat-main">
            <div className="ui-chat-messages">
              <h3 className="ui-section-title" style={{ marginBottom: 12 }}>
                {selected ? `Диалог ${selected.id}` : 'Выберите диалог'}
              </h3>
              {messages.map((message) => (
                <p key={message.id} className="ui-chat-msg">
                  <strong>{message.authorUserId}: </strong>
                  {message.textBody}
                </p>
              ))}
            </div>
            <form
              className="ui-chat-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (session && selectedDialogId && text.trim()) {
                  void communicationApi.postMessage(session, selectedDialogId, text).then(() => {
                    setText('');
                    void refreshMessages();
                  });
                }
              }}
            >
              <input
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Текст сообщения"
                aria-label="Текст сообщения"
                style={{ flex: '1 1 200px', minWidth: 0 }}
              />
              <button type="submit" className="ui-button ui-button--primary">
                Отправить
              </button>
            </form>
          </section>
        </div>
      </div>
    </ProtectedPage>
  );
}
