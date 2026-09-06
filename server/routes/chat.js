import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db/database.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { broadcast } from '../ws.js';
import { generateCustomerChatReply } from '../utils/gemini.js';
import { generateOfflineCustomerReply } from '../utils/offlineAssistant.js';
import { aiProvider, recordAiActivity } from '../utils/aiActivity.js';

const router = Router();
const staffRoles = ['admin', 'manager', 'foh', 'kitchen'];

function mapMessage(row) {
  let metadata = {};
  try { metadata = JSON.parse(row.metadata || '{}'); } catch {}
  const from = row.sender_type === 'staff' && metadata.automated ? 'agent' : row.sender_type;
  return { id: row.id, from, text: row.message, type: row.message_type || 'text', attachmentUrl: row.attachment_url || null, metadata, staffName: row.staff_name || null, createdAt: row.created_at };
}

function getMessages(conversationId) {
  return db.prepare(`SELECT chat_messages.*, users.name AS staff_name
    FROM chat_messages LEFT JOIN users ON users.id = chat_messages.staff_id
    WHERE conversation_id = ? ORDER BY chat_messages.id`).all(conversationId).map(mapMessage);
}

function findAutoReply(message) {
  const normalized = message.toLowerCase();
  const faqs = db.prepare('SELECT * FROM chat_faqs WHERE active = 1 ORDER BY id').all();
  return faqs.find((faq) => faq.keywords.split(',').map((keyword) => keyword.trim().toLowerCase()).filter(Boolean).some((keyword) => normalized.includes(keyword)));
}

function formatWeeklyHours() {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('weekly_hours');
  try {
    const schedule = JSON.parse(row?.value || '{}');
    const labels = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    return labels.map((day) => {
      const entry = schedule[day];
      if (!entry || entry.closed) return `${day[0].toUpperCase()}${day.slice(1)}: Closed`;
      return `${day[0].toUpperCase()}${day.slice(1)}: ${(entry.periods || []).map((period) => `${period.open}-${period.close}`).join(', ') || 'Closed'}`;
    }).join('; ');
  } catch {
    return db.prepare('SELECT value FROM settings WHERE key = ?').get('operating_hours')?.value || 'Daily from 7:00 AM to 11:00 PM';
  }
}

function getAutoReplyText(faq, message = '') {
  const swahili = /\b(naomba|tafadhali|wapi|saa|chakula|bei|oda|imefunguliwa|asante|habari|mna|mnayo)\b/i.test(message);
  const question = faq.question.toLowerCase();
  if (question.includes('opening') || question.includes('hours')) return swahili ? `Tunafungua: ${formatWeeklyHours()}` : `Our weekly opening hours are: ${formatWeeklyHours()}`;
  if (question.includes('located') || question.includes('location')) {
    const location = db.prepare('SELECT value FROM settings WHERE key = ?').get('branch_location')?.value || 'Wikicha Tower, Mwai Kibaki Road, Dar es Salaam';
    return swahili ? `Tupo ${location}.` : `We are located at ${location}.`;
  }
  return swahili && faq.answer_sw ? faq.answer_sw : faq.answer;
}

function getCustomerContext(req, message) {
  const settings = db.prepare("SELECT key, value FROM settings WHERE key IN ('branch_location', 'weekly_hours', 'operating_hours')").all();
  const settingsMap = Object.fromEntries(settings.map((setting) => [setting.key, setting.value]));
  const menu = db.prepare('SELECT name, description, price, category FROM menu_items WHERE active = 1 ORDER BY category, name').all();
  const context = {
    location: settingsMap.branch_location || 'Wikicha Tower, Mwai Kibaki Road, Dar es Salaam',
    openingHours: formatWeeklyHours(),
    menu,
    orderStatus: null,
  };
  const orderId = message.match(/\bWR-\d+\b/i)?.[0]?.toUpperCase();
  if (!orderId) return context;
  const order = db.prepare('SELECT id, status, payment_status, total, customer_phone, customer_email FROM orders WHERE upper(id) = ?').get(orderId);
  const phoneMatches = order && req.body.customerPhone && order.customer_phone === String(req.body.customerPhone).trim();
  const emailMatches = order && req.body.customerEmail && order.customer_email && order.customer_email.toLowerCase() === String(req.body.customerEmail).trim().toLowerCase();
  if (order && (phoneMatches || emailMatches)) {
    context.orderStatus = { id: order.id, status: order.status, paymentStatus: order.payment_status, total: order.total };
  } else {
    context.orderStatus = 'No matching order was verified for the supplied customer contact details.';
  }
  return context;
}

function getMenuFactsReply(message, context) {
  const normalized = message.toLowerCase();
  const vegetarian = /vegetarian|veggie|meatless|no meat|mboga/.test(normalized);
  const candidates = context.menu.filter((item) => {
    const searchable = `${item.name} ${item.description || ''} ${item.category || ''}`.toLowerCase();
    if (vegetarian) return /vegetable|veggie|mushroom|cheese|salad/.test(searchable) && !/chicken|beef|steak|tuna|pastrami|meat/.test(searchable);
    return true;
  }).slice(0, 6);
  if (!candidates.length) return '';
  const swahili = /\b(naomba|tafadhali|wapi|saa|chakula|bei|oda|imefunguliwa|asante|habari|mna|mnayo|mboga)\b/i.test(message);
  const label = vegetarian ? (swahili ? 'Chakula cha mboga' : 'Vegetarian-labelled options') : (swahili ? 'Baadhi ya vyakula kwenye menyu' : 'Some menu options');
  return `${label}: ${candidates.map((item) => `${item.name} (TZS ${Number(item.price || 0).toLocaleString()})`).join(', ')}.`;
}

function ensureConversation(id, customerName = '', customerPhone = '', customerEmail = '') {
  const now = new Date().toISOString();
  const normalizedEmail = String(customerEmail || '').trim().toLowerCase();
  if (normalizedEmail) {
    const byEmail = db.prepare('SELECT id FROM chat_conversations WHERE lower(customer_email) = ? ORDER BY updated_at DESC LIMIT 1').get(normalizedEmail);
    if (byEmail) id = byEmail.id;
  }
  const existing = db.prepare('SELECT id FROM chat_conversations WHERE id = ?').get(id);
  if (!existing) {
    db.prepare('INSERT INTO chat_conversations (id, customer_name, customer_phone, customer_email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, customerName || null, customerPhone || null, customerEmail || null, now, now);
  } else if (customerName || customerPhone || customerEmail) {
    db.prepare('UPDATE chat_conversations SET customer_name = COALESCE(?, customer_name), customer_phone = COALESCE(?, customer_phone), customer_email = COALESCE(?, customer_email), updated_at = ? WHERE id = ?').run(customerName || null, customerPhone || null, customerEmail || null, now, id);
  }
  return id;
}

router.get('/public/:conversationId', (req, res) => {
  const conversationId = ensureConversation(req.params.conversationId, req.query.customerName, req.query.customerPhone, req.query.customerEmail);
  res.json({ conversationId, messages: getMessages(conversationId) });
});

router.post('/public/:conversationId/messages', async (req, res) => {
  const message = String(req.body.message || '').trim();
  const messageType = String(req.body.messageType || 'text');
  const attachmentUrl = req.body.attachmentUrl || null;
  const metadata = req.body.metadata || {};
  if ((!message && !attachmentUrl) || message.length > 4000) return res.status(400).json({ error: 'Message is required and must be 4000 characters or fewer' });
  const conversationId = ensureConversation(req.params.conversationId, req.body.customerName, req.body.customerPhone, req.body.customerEmail);
  const now = new Date().toISOString();
  const result = db.prepare('INSERT INTO chat_messages (conversation_id, sender_type, message, message_type, attachment_url, metadata, created_at) VALUES (?, \'customer\', ?, ?, ?, ?, ?)').run(conversationId, message, messageType, attachmentUrl, JSON.stringify(metadata), now);
  db.prepare('UPDATE chat_conversations SET updated_at = ?, status = \'open\' WHERE id = ?').run(now, conversationId);
  const created = mapMessage(db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(result.lastInsertRowid));
  broadcast('chat:message', { conversationId, message: created });
  const autoReply = messageType === 'text' ? findAutoReply(message) : null;
  let autoReplyMessage = null;
  let autoReplyText = null;
  let replyProvider = 'gemini';
  let customerContext = null;
  if (messageType === 'text') {
    const startedAt = Date.now();
    try {
      customerContext = getCustomerContext(req, message);
      autoReplyText = await generateCustomerChatReply(message, customerContext);
      const menuQuestion = /menu|food|dish|meal|vegetarian|veggie|price|cost|available|chakula|mboga|bei|menyu|vyakula|kiasi/.test(message.toLowerCase());
      const mentionsMenuItem = autoReplyText && customerContext.menu.some((item) => autoReplyText.toLowerCase().includes(item.name.toLowerCase()));
      if (menuQuestion && !mentionsMenuItem) {
        const menuFacts = getMenuFactsReply(message, customerContext);
        if (menuFacts) autoReplyText = `${autoReplyText.replace(/[:.]?\s*$/, '')}. ${menuFacts}`;
      }
      recordAiActivity({ surface: 'customer-chat', action: 'auto-reply', provider: aiProvider(), status: autoReplyText ? 'completed' : 'fallback', durationMs: Date.now() - startedAt, inputLength: message.length });
    } catch (error) {
      recordAiActivity({ surface: 'customer-chat', action: 'auto-reply', provider: 'gemini', status: 'failed', durationMs: Date.now() - startedAt, inputLength: message.length });
      console.error('Gemini customer chat reply unavailable:', error.message);
    }
  }
  if (!autoReplyText && messageType === 'text') {
    const startedAt = Date.now();
    try {
      customerContext ||= getCustomerContext(req, message);
      autoReplyText = generateOfflineCustomerReply(message, customerContext, db);
      if (autoReplyText) replyProvider = 'offline';
      recordAiActivity({ surface: 'customer-chat', action: 'auto-reply', provider: 'offline', status: 'completed', durationMs: Date.now() - startedAt, inputLength: message.length });
    } catch (error) {
      recordAiActivity({ surface: 'customer-chat', action: 'auto-reply', provider: 'offline', status: 'failed', durationMs: Date.now() - startedAt, inputLength: message.length });
      console.error('Offline customer chat reply unavailable:', error.message);
    }
  }
  if (!autoReplyText && autoReply) {
    autoReplyText = getAutoReplyText(autoReply, message);
    replyProvider = 'faq';
  }
  if (autoReplyText) {
    const replyResult = db.prepare('INSERT INTO chat_messages (conversation_id, sender_type, message, message_type, metadata, created_at) VALUES (?, \'staff\', ?, \'text\', ?, ?)')
      .run(conversationId, autoReplyText, JSON.stringify({ ...(autoReply ? { faqId: autoReply.id } : {}), provider: replyProvider, automated: true }), new Date().toISOString());
    autoReplyMessage = mapMessage(db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(replyResult.lastInsertRowid));
    db.prepare('UPDATE chat_conversations SET updated_at = ? WHERE id = ?').run(autoReplyMessage.createdAt, conversationId);
    broadcast('chat:message', { conversationId, message: autoReplyMessage });
  }
  res.status(201).json({ message: created, autoReply: autoReplyMessage });
});

router.get('/faq', authMiddleware, requireRole('admin', 'manager'), (_req, res) => {
  res.json(db.prepare('SELECT * FROM chat_faqs ORDER BY active DESC, id').all());
});

router.get('/training', authMiddleware, requireRole('admin'), (_req, res) => {
  const latest = db.prepare('SELECT * FROM chat_training_runs ORDER BY id DESC LIMIT 1').get() || null;
  const stats = db.prepare(`SELECT COUNT(*) AS approved,
    SUM(CASE WHEN answer_sw IS NOT NULL AND trim(answer_sw) != '' THEN 1 ELSE 0 END) AS bilingual
    FROM chat_faqs WHERE active = 1`).get();
  const staffExamples = db.prepare("SELECT COUNT(*) AS count FROM chat_messages WHERE sender_type = 'staff' AND staff_id IS NOT NULL").get().count;
  res.json({ stats: { approvedExamples: stats.approved || 0, bilingualExamples: stats.bilingual || 0, staffExamples }, latest, languageCoverage: { English: stats.approved || 0, Swahili: stats.bilingual || 0 } });
});

router.post('/training/retrain', authMiddleware, requireRole('admin'), (req, res) => {
  const stats = db.prepare(`SELECT COUNT(*) AS approved,
    SUM(CASE WHEN answer_sw IS NOT NULL AND trim(answer_sw) != '' THEN 1 ELSE 0 END) AS bilingual
    FROM chat_faqs WHERE active = 1`).get();
  const staffExamples = db.prepare("SELECT COUNT(*) AS count FROM chat_messages WHERE sender_type = 'staff' AND staff_id IS NOT NULL").get().count;
  const result = `Retrained offline knowledge from ${stats.approved || 0} approved FAQ examples and ${staffExamples} staff-approved replies. ${stats.bilingual || 0} FAQ examples include Swahili answers.`;
  const now = new Date().toISOString();
  const saved = db.prepare('INSERT INTO chat_training_runs (language, approved_examples, bilingual_examples, staff_examples, result, created_at) VALUES (?, ?, ?, ?, ?, ?)').run('English + Swahili', stats.approved || 0, stats.bilingual || 0, staffExamples, result, now);
  recordAiActivity({ surface: 'settings', action: 'retrain-chat-assistant', provider: 'offline', userId: req.user?.id, inputLength: stats.approved || 0 });
  res.json({ ok: true, result, run: db.prepare('SELECT * FROM chat_training_runs WHERE id = ?').get(saved.lastInsertRowid) });
});

router.post('/faq', authMiddleware, requireRole('admin', 'manager'), (req, res) => {
  const question = String(req.body.question || '').trim();
  const keywords = String(req.body.keywords || '').trim();
  const answer = String(req.body.answer || '').trim();
  const answerSw = String(req.body.answerSw || '').trim();
  if (!question || !keywords || !answer) return res.status(400).json({ error: 'Question, keywords, and answer are required' });
  const now = new Date().toISOString();
  const result = db.prepare('INSERT INTO chat_faqs (question, keywords, answer, answer_sw, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(question, keywords, answer, answerSw || null, req.body.active === false ? 0 : 1, now, now);
  res.status(201).json(db.prepare('SELECT * FROM chat_faqs WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/faq/:id', authMiddleware, requireRole('admin', 'manager'), (req, res) => {
  const existing = db.prepare('SELECT * FROM chat_faqs WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'FAQ not found' });
  const question = String(req.body.question ?? existing.question).trim();
  const keywords = String(req.body.keywords ?? existing.keywords).trim();
  const answer = String(req.body.answer ?? existing.answer).trim();
  const answerSw = String(req.body.answerSw ?? existing.answer_sw ?? '').trim();
  if (!question || !keywords || !answer) return res.status(400).json({ error: 'Question, keywords, and answer are required' });
  db.prepare('UPDATE chat_faqs SET question = ?, keywords = ?, answer = ?, answer_sw = ?, active = ?, updated_at = ? WHERE id = ?').run(question, keywords, answer, answerSw || null, req.body.active == null ? existing.active : (req.body.active ? 1 : 0), new Date().toISOString(), req.params.id);
  res.json(db.prepare('SELECT * FROM chat_faqs WHERE id = ?').get(req.params.id));
});

router.delete('/faq/:id', authMiddleware, requireRole('admin', 'manager'), (req, res) => {
  const result = db.prepare('UPDATE chat_faqs SET active = 0, updated_at = ? WHERE id = ?').run(new Date().toISOString(), req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'FAQ not found' });
  res.json({ ok: true });
});

router.get('/', authMiddleware, requireRole(...staffRoles), (_req, res) => {
  const conversations = db.prepare(`SELECT c.*, COUNT(m.id) AS message_count
    FROM chat_conversations c LEFT JOIN chat_messages m ON m.conversation_id = c.id
    GROUP BY c.id ORDER BY c.updated_at DESC`).all();
  res.json({ conversations: conversations.map((conversation) => ({ ...conversation, messages: getMessages(conversation.id) })) });
});

router.post('/:conversationId/messages', authMiddleware, requireRole(...staffRoles), (req, res) => {
  const message = String(req.body.message || '').trim();
  if (!message || message.length > 4000) return res.status(400).json({ error: 'Message must be between 1 and 4000 characters' });
  const conversationId = ensureConversation(req.params.conversationId);
  const now = new Date().toISOString();
  const result = db.prepare('INSERT INTO chat_messages (conversation_id, sender_type, staff_id, message, created_at) VALUES (?, \'staff\', ?, ?, ?)').run(conversationId, req.user.id, message, now);
  db.prepare('UPDATE chat_conversations SET updated_at = ?, status = \'open\' WHERE id = ?').run(now, conversationId);
  const created = mapMessage(db.prepare(`SELECT chat_messages.*, users.name AS staff_name
    FROM chat_messages LEFT JOIN users ON users.id = chat_messages.staff_id WHERE chat_messages.id = ?`).get(result.lastInsertRowid));
  broadcast('chat:message', { conversationId, message: created });
  res.status(201).json(created);
});

export default router;