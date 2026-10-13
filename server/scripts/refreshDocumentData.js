import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedFromDocuments } from '../db/documentSeed.js';

export function refreshDocumentData(db) {
  return seedFromDocuments(db);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dbPath = process.env.DB_PATH || path.join(path.dirname(fileURLToPath(import.meta.url)), '../db/wraproll.db');
  const db = new DatabaseSync(dbPath);
  try {
    const result = refreshDocumentData(db);
    console.log(JSON.stringify({ refreshed: true, ...result }, null, 2));
  } finally {
    db.close();
  }
}
