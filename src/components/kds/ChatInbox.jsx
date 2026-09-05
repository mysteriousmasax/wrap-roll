import { useEffect, useState } from 'react';
import { CheckCheck, Image, Mail, MapPin, MessageCircle, Phone, Send, ShoppingBag, UserRound, X } from 'lucide-react';
import { api } from '../../api/client';
import { useWebSocket } from '../../hooks/useWebSocket';

export default function ChatInbox({ onClose }) {
  const [conversations, setConversations] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [selectedConversationId, setSelectedConversationId] = useState(null);

  const loadConversations = () => api.getChatConversations().then(({ conversations: saved }) => {
    setConversations(saved);
    setSelectedConversationId((current) => current || saved[0]?.id || null);
  }).catch(() => {});
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

  const selectedConversation = conversations.find((conversation) => conversation.id === selectedConversationId) || conversations[0];
  const selectedMessages = selectedConversation?.messages || [];
  const selectedDraft = selectedConversation ? drafts[selectedConversation.id] || '' : '';

  const renderMessageContent = (message) => (
    <>
      <span>{message.type === 'cart' && <ShoppingBag size={13} />} {message.type === 'location' && <MapPin size={13} />} {message.type === 'image' && <Image size={13} />} {message.text}</span>
      {message.type === 'image' && message.attachmentUrl && <img className="kds-chat-attachment-image" src={message.attachmentUrl} alt="Customer attachment" />}
      {message.type === 'audio' && message.attachmentUrl && <audio controls src={message.attachmentUrl} />}
      {message.type === 'cart' && message.metadata?.items?.length > 0 && <small className="kds-chat-cart-items">{message.metadata.items.map((item) => `${item.qty}x ${item.name}`).join(' · ')}</small>}
      <small>{message.from === 'staff' && <CheckCheck size={12} />}{formatTime(message.createdAt)}</small>
    </>
  );

  return (
    <section className="kds-chat-inbox">
      <div className="kds-chat-inbox-heading"><div className="flex items-center gap-3"><div className="kds-chat-inbox-icon"><MessageCircle size={17} /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Customer support</p><h2 className="font-display text-base font-bold">Live customer messages</h2></div></div><div className="flex items-center gap-3"><span className="kds-chat-online"><span /> Online</span>{onClose && <button className="kds-chat-close" onClick={onClose} aria-label="Close customer support"><X size={17} /></button>}</div></div>
      {conversations.length === 0 ? <p className="text-xs text-surface-on-variant">No customer messages yet.</p> : <div className="kds-chat-layout">
        <div className="kds-chat-list">
          <div className="kds-chat-search">Search customer chats</div>
          {conversations.slice(0, 12).map((conversation) => {
            const lastMessage = conversation.messages[conversation.messages.length - 1];
            return <button className={`kds-chat-list-item ${selectedConversation?.id === conversation.id ? 'is-selected' : ''}`} key={conversation.id} onClick={() => setSelectedConversationId(conversation.id)}>
              <span className="kds-chat-avatar"><UserRound size={15} /></span>
              <span className="kds-chat-list-copy"><strong>{conversation.customer_name || 'Website customer'}</strong><small>{conversation.customer_phone || conversation.customer_email || lastMessage?.text || 'Start a conversation'}</small></span>
              <span className="kds-chat-list-time">{formatTime(lastMessage?.createdAt)}</span>
            </button>;
          })}
        </div>
        <div className="kds-chat-active">
          {selectedConversation && <>
            <div className="kds-chat-active-header"><span className="kds-chat-avatar"><UserRound size={15} /></span><div><strong>{selectedConversation.customer_name || 'Website customer'}</strong><small>Website chat · Online</small></div><div className="kds-chat-contact"><span><Phone size={12} /> {selectedConversation.customer_phone || 'Phone not provided'}</span><span><Mail size={12} /> {selectedConversation.customer_email || 'Email not provided'}</span></div></div>
            <div className="kds-chat-active-thread">
              {selectedMessages.length === 0 && <p className="kds-chat-empty">No messages yet. Reply to start the conversation.</p>}
              {selectedMessages.map((message) => <div className={`kds-chat-bubble-row ${message.from === 'customer' ? 'from-customer' : 'from-staff'}`} key={message.id}><p className={message.from === 'customer' ? 'customer-message' : 'agent-message'}>{renderMessageContent(message)}</p></div>)}
            </div>
            <form className="kds-chat-active-form" onSubmit={(event) => { event.preventDefault(); reply(selectedConversation.id); }}><input value={selectedDraft} onChange={(event) => setDrafts((current) => ({ ...current, [selectedConversation.id]: event.target.value }))} placeholder="Type a message" /><button type="submit" aria-label="Send reply"><Send size={16} /></button></form>
          </>}
        </div>
      </div>}
    </section>
  );
}