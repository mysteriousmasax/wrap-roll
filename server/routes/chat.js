import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db/database.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { broadcast } from '../ws.js';

const router = Router();
const staffRoles = ['admin', 'manager', 'foh', 'kitchen'];

function mapMessage(row) {
  return { id: row.id, from: row.sender_type, text: row.message, staffName: row.staff_name || null, createdAt: row.created_at };
}

function getMessages(conversationId) {
  return db.prepare(`SELECT chat_messages.*, users.name AS staff_name
    FROM chat_messages LEFT JOIN users ON users.id = chat_messages.staff_id
    WHERE conversation_id = ? ORDER BY chat_messages.id`).all(conversationId).map(mapMessage);
}

function ensureConversation(id, customerName = '') {
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT id FROM chat_conversations WHERE id = ?').get(id);
  if (!existing) {
    db.prepare('INSERT INTO chat_conversations (id, customer_name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, customerName || null, now, now);
  }
  return id;
}

router.get('/public/:conversationId', (req, res) => {
  const conversationId = ensureConversation(req.params.conversationId);
  res.json({ conversationId, messages: getMessages(conversationId) });
});

router.post('/public/:conversationId/messages', (req, res) => {
  const message = String(req.body.message || '').trim();
  if (!message || message.length > 1000) return res.status(400).json({ error: 'Message must be between 1 and 1000 characters' });
  const conversationId = ensureConversation(req.params.conversationId, req.body.customerName);
  const now = new Date().toISOString();
  const result = db.prepare('INSERT INTO chat_messages (conversation_id, sender_type, message, created_at) VALUES (?, \'customer\', ?, ?)').run(conversationId, message, now);
  db.prepare('UPDATE chat_conversations SET updated_at = ?, status = \'open\' WHERE id = ?').run(now, conversationId);
  const created = mapMessage(db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(result.lastInsertRowid));
  broadcast('chat:message', { conversationId, message: created });
  res.status(201).json(created);
});

router.get('/', authMiddleware, requireRole(...staffRoles), (_req, res) => {
  const conversations = db.prepare(`SELECT c.*, COUNT(m.id) AS message_count
    FROM chat_conversations c LEFT JOIN chat_messages m ON m.conversation_id = c.id
    GROUP BY c.id ORDER BY c.updated_at DESC`).all();
  res.json({ conversations: conversations.map((conversation) => ({ ...conversation, messages: getMessages(conversation.id) })) });
});

router.post('/:conversationId/messages', authMiddleware, requireRole(...staffRoles), (req, res) => {
  const message = String(req.body.message || '').trim();
  if (!message || message.length > 1000) return res.status(400).json({ error: 'Message must be between 1 and 1000 characters' });
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