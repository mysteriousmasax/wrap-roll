import { useEffect, useState } from 'react';
import { CheckCheck, MessageCircle, Send, UserRound, X } from 'lucide-react';
import { api } from '../../api/client';
import { useWebSocket } from '../../hooks/useWebSocket';

export default function ChatInbox({ onClose }) {
  const [conversations, setConversations] = useState([]);
  const [drafts, setDrafts] = useState({});

  const loadConversations = () => api.getChatConversations().then(({ conversations: saved }) => setConversations(saved)).catch(() => {});
  useEffect(() => { loadConversations(); }, []);
  useWebSocket((event, data) => {
    if (event !== 'chat:message') return;
    loadConversations();
  });

  const reply = async (conversationId) => {
    const message = drafts[conversationId]?.trim();
    if (!message) return;
    const created = await api.sendChatReply(conversationId, message);
    setConversations((current) => current.map((conversation) => conversation.id === conversationId ? { ...conversation, messages: [...conversation.messages, created] } : conversation));
    setDrafts((current) => ({ ...current, [conversationId]: '' }));
  };

  const formatTime = (value) => {
    if (!value) return '';
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
  };

  return (
    <section className="kds-chat-inbox">
      <div className="kds-chat-inbox-heading"><div className="flex items-center gap-3"><div className="kds-chat-inbox-icon"><MessageCircle size={17} /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Customer support</p><h2 className="font-display text-base font-bold">Live customer messages</h2></div></div><div className="flex items-center gap-3"><span className="kds-chat-online"><span /> Online</span>{onClose && <button className="kds-chat-close" onClick={onClose} aria-label="Close customer support"><X size={17} /></button>}</div></div>
      {conversations.length === 0 ? <p className="text-xs text-surface-on-variant">No customer messages yet.</p> : conversations.slice(0, 6).map((conversation) => {
        const lastMessage = conversation.messages[conversation.messages.length - 1];
        const needsReply = lastMessage?.from === 'customer';
        const conversationStatus = !lastMessage ? 'New chat' : needsReply ? 'Needs reply' : 'Replied';
        return <article className="kds-chat-conversation" key={conversation.id}>
          <div className="kds-chat-meta">
            <div className="kds-chat-customer"><span className="kds-chat-avatar"><UserRound size={15} /></span><div><strong>{conversation.customer_name || 'Website customer'}</strong><small>Website chat</small></div></div>
            <span className={!lastMessage || needsReply ? 'kds-chat-status needs-reply' : 'kds-chat-status'}>{conversationStatus}</span>
          </div>
          <div className="kds-chat-thread">
            {conversation.messages.length === 0 && <p className="kds-chat-empty">Conversation started. Waiting for the first message.</p>}
            {conversation.messages.slice(-5).map((message) => <div className={`kds-chat-bubble-row ${message.from === 'customer' ? 'from-customer' : 'from-staff'}`} key={message.id}>
              <p className={message.from === 'customer' ? 'customer-message' : 'agent-message'}><span>{message.text}</span><small>{message.from === 'staff' && <CheckCheck size={12} />}{formatTime(message.createdAt)}</small></p>
            </div>)}
          </div>
          <form onSubmit={(event) => { event.preventDefault(); reply(conversation.id); }}><input value={drafts[conversation.id] || ''} onChange={(event) => setDrafts((current) => ({ ...current, [conversation.id]: event.target.value }))} placeholder="Write a reply..." /><button type="submit" aria-label="Send reply"><Send size={14} /></button></form>
        </article>;
      })}
    </section>
  );
}