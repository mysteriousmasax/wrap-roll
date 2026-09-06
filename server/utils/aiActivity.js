import db from '../db/database.js';

export function recordAiActivity({ surface, action, provider = 'offline', status = 'completed', userId = null, durationMs = 0, inputLength = 0 }) {
  db.prepare(`INSERT INTO ai_activity
    (surface, action, provider, status, user_id, duration_ms, input_length, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(String(surface || 'unknown'), String(action || 'unknown'), String(provider || 'offline'), String(status || 'completed'), userId || null, Math.max(0, Math.round(Number(durationMs) || 0)), Math.max(0, Math.round(Number(inputLength) || 0)), new Date().toISOString());
}

export function aiProvider() {
  return process.env.GEMINI_API_KEY ? 'gemini' : 'offline';
}