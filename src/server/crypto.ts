import 'server-only';

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM for third-party secrets stored in Postgres (WhatsApp access tokens).
// CREDENTIALS_KEY: 32 random bytes, base64 (`openssl rand -base64 32`). Losing it
// means every stored token must be re-entered, so back it up with the DB password.
function key() {
  const k = Buffer.from(process.env.CREDENTIALS_KEY ?? '', 'base64');
  if (k.length !== 32) throw new Error('CREDENTIALS_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)');
  return k;
}

/** Returns "iv.tag.ciphertext", each part base64. */
export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export function decryptSecret(enc: string) {
  const [iv, tag, data] = enc.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}
