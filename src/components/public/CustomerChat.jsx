import { useEffect, useRef, useState } from 'react';
import { Image, MapPin, MessageCircle, Mic, Send, ShoppingBag, Square, X } from 'lucide-react';
import { api } from '../../api/client';
import { useWebSocket } from '../../hooks/useWebSocket';

export default function CustomerChat({ t, cartItems = [], deliveryAddress = '', onOpenCart }) {
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
  const [pendingImage, setPendingImage] = useState(null);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef(null);
  const audioChunksRef = useRef([]);
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

  const sendMessage = async (text = draft, options = {}) => {
    if (!text.trim() && !options.attachmentUrl) return;
    try {
      const response = await api.sendPublicChatMessage(
        conversationId,
        text,
        localStorage.getItem('wraproll_customer_name') || '',
        localStorage.getItem('wraproll_customer_phone') || '',
        localStorage.getItem('wraproll_customer_email') || '',
        options.messageType || 'text',
        options.attachmentUrl || null,
        options.metadata || {}
      );
      const sentMessage = response.message || response;
      const autoReply = response.autoReply;
      setMessages((current) => {
        const next = current.some((item) => item.id === sentMessage.id) ? current : [...current, sentMessage];
        return autoReply && !next.some((item) => item.id === autoReply.id) ? [...next, autoReply] : next;
      });
    } catch {
      setMessages((current) => [...current, { from: 'agent', text: 'We could not send your message. Please try again.' }]);
    }
    setDraft('');
  };

  const sendCart = () => {
    if (!cartItems.length) return sendMessage('I have not selected items yet. Please help me choose.', { messageType: 'cart' });
    const summary = cartItems.map((item) => `${item.qty}x ${item.name}`).join(', ');
    sendMessage(`I would like help with my cart: ${summary}`, { messageType: 'cart', metadata: { items: cartItems, deliveryAddress } });
  };

  const sendLocation = () => {
    if (!navigator.geolocation) return sendMessage('My delivery location is not available. I will type it here.');
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const fallback = `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`;
        let address = fallback;
        try {
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.latitude}&lon=${coords.longitude}`);
          const result = await response.json();
          address = result.display_name || fallback;
        } catch {}
        sendMessage(`Please deliver to: ${address}`, { messageType: 'location', metadata: { latitude: coords.latitude, longitude: coords.longitude, address } });
      },
      () => sendMessage('I could not share my location. I will type the delivery address here.')
    );
  };

  const sendImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const image = new window.Image();
      image.onload = () => {
        const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        setPendingImage({ name: file.name, url: canvas.toDataURL('image/jpeg', 0.8) });
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const sendPendingImage = () => {
    if (!pendingImage) return;
    sendMessage(draft.trim() || `Attached image: ${pendingImage.name}`, { messageType: 'image', attachmentUrl: pendingImage.url });
    setPendingImage(null);
  };

  const toggleRecording = async () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) return sendMessage('Voice notes are not supported on this device.');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMessages((current) => [...current, { from: 'agent', text: 'Microphone access was not granted. You can type your request instead.' }]);
      return;
    }
    const recorder = new MediaRecorder(stream);
    audioChunksRef.current = [];
    recorder.ondataavailable = (event) => audioChunksRef.current.push(event.data);
    recorder.onstop = () => {
      const reader = new FileReader();
      reader.onload = () => sendMessage('Voice message', { messageType: 'audio', attachmentUrl: reader.result });
      reader.readAsDataURL(new Blob(audioChunksRef.current, { type: recorder.mimeType }));
      stream.getTracks().forEach((track) => track.stop());
      setRecording(false);
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
  };

  const hasProfile = Boolean(profile.name.trim() && profile.phone.trim() && profile.email.trim());

  const renderMessage = (message) => (
    <div className="customer-chat-message-content">
      {message.type === 'image' && message.attachmentUrl && <img src={message.attachmentUrl} alt="Customer attachment preview" className="customer-chat-image" />}
      {message.type === 'audio' && message.attachmentUrl && <audio controls src={message.attachmentUrl} />}
      {message.text && <span>{message.text}</span>}
      {message.type === 'location' && message.metadata?.latitude && (
        <a href={`https://www.google.com/maps?q=${message.metadata.latitude},${message.metadata.longitude}`} target="_blank" rel="noreferrer" className="customer-chat-location-link">
          Open delivery location in Maps
        </a>
      )}
      {message.type === 'cart' && message.metadata?.items?.length > 0 && (
        <div className="customer-chat-cart-card">
          <strong>Selected cart</strong>
          {message.metadata.items.map((item) => <span key={`${item.id}-${item.name}`}>{item.qty}x {item.name}</span>)}
          {message.metadata.deliveryAddress && <small>Delivery: {message.metadata.deliveryAddress}</small>}
          {onOpenCart && <button type="button" onClick={onOpenCart}>View cart</button>}
        </div>
      )}
    </div>
  );

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
          <div className="customer-chat-messages">{messages.map((message, index) => <div key={message.id || index} className={message.from === 'customer' ? 'customer-message' : 'agent-message'}>{renderMessage(message)}</div>)}</div>
          <div className="customer-chat-quick">{quickReplies.map(([labelKey]) => <button key={labelKey} onClick={() => sendMessage(t(labelKey))}>{t(labelKey)}</button>)}</div>
          {pendingImage && <div className="customer-chat-image-preview"><img src={pendingImage.url} alt="Selected upload preview" /><div><strong>{pendingImage.name}</strong><span>Add a caption or send this image</span></div><button type="button" onClick={() => setPendingImage(null)} aria-label="Remove image"><X size={15} /></button></div>}
          <div className="customer-chat-actions"><button type="button" onClick={sendCart} title="Send cart summary"><ShoppingBag size={15} /></button><button type="button" onClick={sendLocation} title="Share location"><MapPin size={15} /></button><label title="Attach image"><Image size={15} /><input type="file" accept="image/*" onChange={sendImage} /></label><button type="button" onClick={toggleRecording} title={recording ? 'Stop recording' : 'Record voice'}>{recording ? <Square size={14} /> : <Mic size={15} />}</button></div>
          <form onSubmit={(event) => { event.preventDefault(); pendingImage ? sendPendingImage() : sendMessage(); }}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={pendingImage ? 'Add an image caption...' : 'Type your question or order...'} /><button type="submit" aria-label={t('send')}><Send size={16} /></button></form>
        </>}
      </aside>}
    </>
  );
}
