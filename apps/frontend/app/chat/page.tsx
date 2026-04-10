'use client';

import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '../../src/features/auth/context';
import { communicationApi, useChatRealtime } from '../../src/features/communication/hooks';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function ChatPage() {
  const { session } = useAuth();
  const [dialogs, setDialogs] = useState<any[]>([]);
  const [selectedDialogId, setSelectedDialogId] = useState<string | undefined>();
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const selected = useMemo(() => dialogs.find((item) => item.id === selectedDialogId), [dialogs, selectedDialogId]);

  const refreshDialogs = () => session && communicationApi.listDialogs(session).then((rows) => { setDialogs(rows); if (!selectedDialogId && rows[0]?.id) setSelectedDialogId(rows[0].id); });
  const refreshMessages = () => session && selectedDialogId && communicationApi.listMessages(session, selectedDialogId).then((rows) => setMessages(rows));

  useEffect(() => { void refreshDialogs(); }, [session]);
  useEffect(() => { void refreshMessages(); }, [selectedDialogId, session]);
  useChatRealtime(selectedDialogId, () => void refreshMessages());

  return (
    <ProtectedPage>
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', height: 'calc(100vh - 64px)' }}>
        <aside style={{ borderRight: '1px solid #ddd', padding: 12 }}>
          <h3>Dialogs</h3>
          {dialogs.map((dialog) => (
            <button key={dialog.id} style={{ display: 'block', width: '100%', textAlign: 'left' }} onClick={() => setSelectedDialogId(dialog.id)}>
              {dialog.type} / {dialog.id}
            </button>
          ))}
        </aside>
        <section style={{ padding: 12, display: 'grid', gridTemplateRows: '1fr auto' }}>
          <div>
            <h3>{selected ? `Dialog ${selected.id}` : 'Выберите диалог'}</h3>
            {messages.map((message) => (
              <p key={message.id}><strong>{message.senderUserId}: </strong>{message.textBody}</p>
            ))}
          </div>
          <form onSubmit={(event) => { event.preventDefault(); if (session && selectedDialogId && text.trim()) { void communicationApi.postMessage(session, selectedDialogId, text).then(() => { setText(''); void refreshMessages(); }); } }}>
            <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Type message" />
            <button type="submit">Send</button>
          </form>
        </section>
      </div>
    </ProtectedPage>
  );
}
