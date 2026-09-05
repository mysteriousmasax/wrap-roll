import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { api } from '../../api/client';
import { useWebSocket } from '../../hooks/useWebSocket';

export default function CustomerChat({ t }) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(() => ({
    name: localStorage.getItem('wraproll_customer_name') || '',
    phone: localStorage.getItem('wraproll_customer_phone') || '',
    email: localStorage.getItem('wraproll_customer_email') || '',
  }));
  const [profileForm, setProfileForm] = useState(profile);
  const [profileError, setProfileError] = useState('');
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
      const message = await api.sendPublicChatMessage(
        conversationId,
        text,
        localStorage.getItem('wraproll_customer_name') || '',
        localStorage.getItem('wraproll_customer_phone') || '',
        localStorage.getItem('wraproll_customer_email') || ''
      );
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
    } catch {
      setMessages((current) => [...current, { from: 'agent', text: 'We could not send your message. Please try again.' }]);
    }
    setDraft('');
  };

  const hasProfile = Boolean(profile.name.trim() && profile.phone.trim() && profile.email.trim());

  const saveProfile = (event) => {
    event.preventDefault();
    const nextProfile = {
      name: profileForm.name.trim(),
      phone: profileForm.phone.trim(),
      email: profileForm.email.trim().toLowerCase(),
    };
    if (!nextProfile.name || !nextProfile.phone || !nextProfile.email) {
      setProfileError('Enter your name, phone number, and email to start chatting.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(nextProfile.email)) {
      setProfileError('Enter a valid email address.');
      return;
    }
    localStorage.setItem('wraproll_customer_name', nextProfile.name);
    localStorage.setItem('wraproll_customer_phone', nextProfile.phone);
    localStorage.setItem('wraproll_customer_email', nextProfile.email);
    setProfile(nextProfile);
    setProfileForm(nextProfile);
    setProfileError('');
  };

  return (
    <>
      <button ref={triggerRef} className="customer-chat-trigger" onClick={() => setOpen(true)} aria-label={t('chatTitle')}><MessageCircle size={22} /></button>
      {open && <aside ref={panelRef} className="customer-chat-panel" aria-label={t('chatTitle')}>
        <header><div><strong>{t('chatTitle')}</strong><span>Online</span></div><button onClick={() => setOpen(false)} aria-label="Close chat"><X size={18} /></button></header>
        {!hasProfile ? <form className="customer-chat-profile" onSubmit={saveProfile}>
          <div><strong>Start your chat</strong><p>Tell us who you are so we can help with your order and contact you about it.</p></div>
          {profileError && <p className="customer-chat-profile-error">{profileError}</p>}
          <label>Full name<input required value={profileForm.name} onChange={(event) => setProfileForm({ ...profileForm, name: event.target.value })} placeholder="e.g. Rachel F" /></label>
          <label>Phone number<input required type="tel" value={profileForm.phone} onChange={(event) => setProfileForm({ ...profileForm, phone: event.target.value })} placeholder="e.g. 0712 345 678" /></label>
          <label>Email address<input required type="email" value={profileForm.email} onChange={(event) => setProfileForm({ ...profileForm, email: event.target.value })} placeholder="you@example.com" /></label>
          <button type="submit">Continue to chat <Send size={14} /></button>
        </form> : <>
          <div className="customer-chat-profile-summary"><strong>{profile.name}</strong><span>{profile.phone} · {profile.email}</span></div>
          <div className="customer-chat-messages">{messages.map((message, index) => <p key={index} className={message.from === 'customer' ? 'customer-message' : 'agent-message'}>{message.text}</p>)}</div>
          <div className="customer-chat-quick">{quickReplies.map(([labelKey]) => <button key={labelKey} onClick={() => sendMessage(t(labelKey))}>{t(labelKey)}</button>)}</div>
          <form onSubmit={(event) => { event.preventDefault(); sendMessage(); }}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Type your question or order..." /><button type="submit" aria-label={t('send')}><Send size={16} /></button></form>
        </>}
      </aside>}
    </>
  );
}
