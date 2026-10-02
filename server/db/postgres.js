import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

export const postgresPool = new Pool({
  connectionString,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ...(process.env.PG_SSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {}),
});

export async function queryPostgres(text, values = []) {
  if (!connectionString) throw new Error('DATABASE_URL is required for PostgreSQL access.');
  return postgresPool.query(text, values);
}

export async function withPostgresTransaction(task) {
  if (!connectionString) throw new Error('DATABASE_URL is required for PostgreSQL access.');
  const client = await postgresPool.connect();
  try {
    await client.query('BEGIN');
    const result = await task(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function checkPostgresConnection() {
  const result = await queryPostgres('SELECT 1 AS connected');
  return result.rows[0]?.connected === 1;
}
