import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db/database.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { broadcast } from '../ws.js';

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

router.post('/public/:conversationId/messages', (req, res) => {
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
  if (autoReply) {
    const replyResult = db.prepare('INSERT INTO chat_messages (conversation_id, sender_type, message, message_type, metadata, created_at) VALUES (?, \'staff\', ?, \'text\', ?, ?)')
      .run(conversationId, autoReply.answer, JSON.stringify({ faqId: autoReply.id, automated: true }), new Date().toISOString());
    autoReplyMessage = mapMessage(db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(replyResult.lastInsertRowid));
    db.prepare('UPDATE chat_conversations SET updated_at = ? WHERE id = ?').run(autoReplyMessage.createdAt, conversationId);
    broadcast('chat:message', { conversationId, message: autoReplyMessage });
  }
  res.status(201).json({ message: created, autoReply: autoReplyMessage });
});

router.get('/faq', authMiddleware, requireRole('admin', 'manager'), (_req, res) => {
  res.json(db.prepare('SELECT * FROM chat_faqs ORDER BY active DESC, id').all());
});

router.post('/faq', authMiddleware, requireRole('admin', 'manager'), (req, res) => {
  const question = String(req.body.question || '').trim();
  const keywords = String(req.body.keywords || '').trim();
  const answer = String(req.body.answer || '').trim();
  if (!question || !keywords || !answer) return res.status(400).json({ error: 'Question, keywords, and answer are required' });
  const now = new Date().toISOString();
  const result = db.prepare('INSERT INTO chat_faqs (question, keywords, answer, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(question, keywords, answer, req.body.active === false ? 0 : 1, now, now);
  res.status(201).json(db.prepare('SELECT * FROM chat_faqs WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/faq/:id', authMiddleware, requireRole('admin', 'manager'), (req, res) => {
  const existing = db.prepare('SELECT * FROM chat_faqs WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'FAQ not found' });
  const question = String(req.body.question ?? existing.question).trim();
  const keywords = String(req.body.keywords ?? existing.keywords).trim();
  const answer = String(req.body.answer ?? existing.answer).trim();
  if (!question || !keywords || !answer) return res.status(400).json({ error: 'Question, keywords, and answer are required' });
  db.prepare('UPDATE chat_faqs SET question = ?, keywords = ?, answer = ?, active = ?, updated_at = ? WHERE id = ?').run(question, keywords, answer, req.body.active == null ? existing.active : (req.body.active ? 1 : 0), new Date().toISOString(), req.params.id);
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