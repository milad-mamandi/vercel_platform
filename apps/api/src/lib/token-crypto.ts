import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../env.js';

const ENCRYPTION_ALGO = 'aes-256-gcm';
const IV_BYTES = 12;

const parseKey = () => {
  const key = Buffer.from(env.TOKEN_ENCRYPTION_KEY, 'base64');
  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be base64-encoded 32-byte key');
  }
  return key;
};

const key = parseKey();

export const encryptToken = (token: string) => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ENCRYPTION_ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString('base64url'), authTag.toString('base64url'), encrypted.toString('base64url')].join('.');
};

export const decryptToken = (storedValue: string) => {
  const parts = storedValue.split('.');

  if (parts.length === 3) {
    const [ivPart, authTagPart, encryptedPart] = parts;
    const iv = Buffer.from(ivPart, 'base64url');
    const authTag = Buffer.from(authTagPart, 'base64url');
    const encrypted = Buffer.from(encryptedPart, 'base64url');

    const decipher = createDecipheriv(ENCRYPTION_ALGO, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  }

  // Backward compatibility for previous placeholder storage used before milestone completion.
  return Buffer.from(storedValue, 'base64').toString('utf8');
};
