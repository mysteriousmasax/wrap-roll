import { useEffect, useState } from 'react';
import { CheckCheck, Image, Mail, MapPin, MessageCircle, Phone, Search, Send, ShoppingBag, UserRound, X } from 'lucide-react';
import { api } from '../../api/client';
import { useWebSocket } from '../../hooks/useWebSocket';

export default function ChatInbox({ onClose }) {
  const [conversations, setConversations] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadConversations = () => api.getChatConversations().then(({ conversations: saved }) => {
    setConversations(saved);
    setSelectedConversationId((current) => current || saved[0]?.id || null);
    setLoadError('');
  }).catch(() => setLoadError('Unable to load customer chats')).finally(() => setLoading(false));
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
  const normalizedSearch = search.trim().toLowerCase();
  const visibleConversations = conversations.filter((conversation) => {
    if (!normalizedSearch) return true;
    const lastMessage = conversation.messages[conversation.messages.length - 1];
    return [conversation.customer_name, conversation.customer_phone, conversation.customer_email, lastMessage?.text].filter(Boolean).join(' ').toLowerCase().includes(normalizedSearch);
  }).slice(0, 12);

  const renderMessageContent = (message) => (
    <>
      <span>{message.type === 'cart' && <ShoppingBag size={13} />} {message.type === 'location' && <MapPin size={13} />} {message.type === 'image' && <Image size={13} />} {message.text}</span>
      {message.type === 'location' && message.metadata?.latitude && <a href={`https://www.google.com/maps?q=${message.metadata.latitude},${message.metadata.longitude}`} target="_blank" rel="noreferrer" className="kds-chat-location-link">{message.metadata.address || 'Open delivery location in Maps'}</a>}
      {message.type === 'image' && message.attachmentUrl && <img className="kds-chat-attachment-image" src={message.attachmentUrl} alt="Customer attachment" />}
      {message.type === 'audio' && message.attachmentUrl && <audio controls src={message.attachmentUrl} />}
      {message.type === 'cart' && message.metadata?.items?.length > 0 && <small className="kds-chat-cart-items">{message.metadata.items.map((item) => `${item.qty}x ${item.name}`).join(' · ')}{message.metadata.deliveryAddress ? ` · Delivery: ${message.metadata.deliveryAddress}` : ''}</small>}
      <small>{message.from === 'staff' && <CheckCheck size={12} />}{formatTime(message.createdAt)}</small>
    </>
  );

  return (
    <section className="kds-chat-inbox">
      <div className="kds-chat-inbox-heading"><div className="flex items-center gap-3"><div className="kds-chat-inbox-icon"><MessageCircle size={17} /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Customer support</p><h2 className="font-display text-base font-bold">Live customer messages</h2><span className="kds-chat-count">{conversations.length} {conversations.length === 1 ? 'conversation' : 'conversations'}</span></div></div><div className="flex items-center gap-3"><span className="kds-chat-online"><span /> Live</span>{onClose && <button className="kds-chat-close" onClick={onClose} aria-label="Close customer support"><X size={17} /></button>}</div></div>
      {loading ? <div className="kds-chat-state"><MessageCircle size={20} /><span>Loading customer chats...</span></div> : loadError ? <div className="kds-chat-state is-error"><span>{loadError}</span><button type="button" onClick={loadConversations}>Retry</button></div> : conversations.length === 0 ? <div className="kds-chat-state"><MessageCircle size={20} /><span>No customer messages yet.</span></div> : <div className="kds-chat-layout">
        <div className="kds-chat-list">
          <label className="kds-chat-search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" /></label>
          {visibleConversations.map((conversation) => {
            const lastMessage = conversation.messages[conversation.messages.length - 1];
            return <button className={`kds-chat-list-item ${selectedConversation?.id === conversation.id ? 'is-selected' : ''}`} key={conversation.id} onClick={() => setSelectedConversationId(conversation.id)}>
              <span className="kds-chat-avatar"><UserRound size={15} /></span>
              <span className="kds-chat-list-copy"><strong>{conversation.customer_name || 'Website customer'}</strong><small>{conversation.customer_phone || conversation.customer_email || lastMessage?.text || 'Start a conversation'}</small></span>
              <span className="kds-chat-list-time">{formatTime(lastMessage?.createdAt)}</span>
            </button>;
          })}
          {!visibleConversations.length && <p className="kds-chat-no-results">No matching conversations.</p>}
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