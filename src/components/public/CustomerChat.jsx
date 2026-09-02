import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { api } from '../../api/client';
import { useWebSocket } from '../../hooks/useWebSocket';

export default function CustomerChat({ t }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  const [conversationId] = useState(() => {
    const stored = localStorage.getItem('wraproll_chat_id');
    if (stored) return stored;
    const id = crypto.randomUUID();
    localStorage.setItem('wraproll_chat_id', id);
    return id;
  });
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const quickReplies = [
    ['chatMenu', 'chatMenuReply'],
    ['chatHours', 'chatHoursReply'],
    ['chatLocation', 'chatLocationReply'],
  ];

  useEffect(() => {
    api.getPublicChat(conversationId).then(({ messages: savedMessages }) => {
      setMessages(savedMessages.length ? savedMessages : [{ from: 'agent', text: t('chatGreeting') }]);
    }).catch(() => setMessages([{ from: 'agent', text: t('chatGreeting') }]));
  }, [conversationId, t]);

  useWebSocket((event, data) => {
    if (event !== 'chat:message' || data.conversationId !== conversationId) return;
    setMessages((current) => current.some((message) => message.id === data.message.id) ? current : [...current, data.message]);
  });

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!panelRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
  }, [open]);

  const sendMessage = async (text = draft) => {
    if (!text.trim()) return;
    try {
      const message = await api.sendPublicChatMessage(conversationId, text);
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
    } catch {
      setMessages((current) => [...current, { from: 'agent', text: 'We could not send your message. Please try again.' }]);
    }
    setDraft('');
  };

  return (
    <>
      <button ref={triggerRef} className="customer-chat-trigger" onClick={() => setOpen(true)} aria-label={t('chatTitle')}><MessageCircle size={22} /></button>
      {open && <aside ref={panelRef} className="customer-chat-panel" aria-label={t('chatTitle')}>
        <header><div><strong>{t('chatTitle')}</strong><span>Online</span></div><button onClick={() => setOpen(false)} aria-label="Close chat"><X size={18} /></button></header>
        <div className="customer-chat-messages">{messages.map((message, index) => <p key={index} className={message.from === 'customer' ? 'customer-message' : 'agent-message'}>{message.text}</p>)}</div>
        <div className="customer-chat-quick">{quickReplies.map(([labelKey]) => <button key={labelKey} onClick={() => sendMessage(t(labelKey))}>{t(labelKey)}</button>)}</div>
        <form onSubmit={(event) => { event.preventDefault(); sendMessage(); }}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={t('chatPlaceholder')} /><button type="submit" aria-label={t('send')}><Send size={16} /></button></form>
      </aside>}
    </>
  );
}
