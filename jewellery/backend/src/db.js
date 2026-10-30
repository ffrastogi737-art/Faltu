import pg from 'pg';

// numeric columns (upi_discount_percent) come back as numbers, not strings
pg.types.setTypeParser(1700, Number);

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://jewel:jewel@127.0.0.1:5432/jewellery',
});

export const query = (text, params) => pool.query(text, params);

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
