import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { pool } from './db';

const scrypt = promisify(scryptCallback);
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function verifyPassword(username: string, password: string) {
  const result = await pool.query('SELECT password_salt,password_hash FROM app_user WHERE username=$1', [username]);
  if (!result.rowCount) return false;
  const { password_salt: salt, password_hash: expectedHex } = result.rows[0];
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(await scrypt(password, salt, expected.length) as Buffer);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createSession(userId: number) {
  const token = randomBytes(32).toString('base64url');
  await pool.query('INSERT INTO app_session(session_hash,user_id,expires_at) VALUES($1,$2,now()+interval \'7 days\')', [hashToken(token), userId]);
  return token;
}

export async function isAuthenticated(token?: string) {
  if (!token || token.length > 100) return false;
  const result = await pool.query('SELECT 1 FROM app_session WHERE session_hash=$1 AND expires_at>now()', [hashToken(token)]);
  return Boolean(result.rowCount);
}

export async function deleteSession(token?: string) {
  if (token && token.length <= 100) await pool.query('DELETE FROM app_session WHERE session_hash=$1', [hashToken(token)]);
}
