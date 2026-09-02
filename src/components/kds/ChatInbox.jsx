import { useEffect, useState } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { api } from '../../api/client';
import { useWebSocket } from '../../hooks/useWebSocket';

export default function ChatInbox() {
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

  return (
    <section className="kds-chat-inbox">
      <div className="kds-chat-inbox-heading"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Customer support</p><h2 className="font-display text-sm font-bold">Live customer messages</h2></div><MessageCircle size={18} className="text-primary" /></div>
      {conversations.length === 0 ? <p className="text-xs text-surface-on-variant">No customer messages yet.</p> : conversations.slice(0, 6).map((conversation) => {
        const lastMessage = conversation.messages[conversation.messages.length - 1];
        return <div className="kds-chat-conversation" key={conversation.id}><div className="kds-chat-meta"><strong>{conversation.customer_name || 'Website customer'}</strong><span>{lastMessage?.from === 'customer' ? 'Needs reply' : 'Replied'}</span></div><div className="kds-chat-thread">{conversation.messages.slice(-3).map((message) => <p className={message.from === 'customer' ? 'customer-message' : 'agent-message'} key={message.id}>{message.from === 'staff' && `${message.staffName}: `}{message.text}</p>)}</div><form onSubmit={(event) => { event.preventDefault(); reply(conversation.id); }}><input value={drafts[conversation.id] || ''} onChange={(event) => setDrafts((current) => ({ ...current, [conversation.id]: event.target.value }))} placeholder="Reply to customer..." /><button type="submit" aria-label="Send reply"><Send size={14} /></button></form></div>;
      })}
    </section>
  );
}