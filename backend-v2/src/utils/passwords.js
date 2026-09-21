import { promisify } from 'node:util';
import crypto from 'node:crypto';

const scryptAsync = promisify(crypto.scrypt);

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

function timingSafeEqualHex(left, right) {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function generateTemporaryPassword() {
  return crypto.randomBytes(18).toString('base64url');
}

export async function hashPassword(password) {
  const normalized = String(password || '');
  if (normalized.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scryptAsync(normalized, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024
  });

  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(password, storedHash) {
  const parts = String(storedHash || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }

  const [, nValue, rValue, pValue, salt, expectedHex] = parts;
  const key = await scryptAsync(String(password || ''), salt, KEY_LENGTH, {
    N: Number(nValue),
    r: Number(rValue),
    p: Number(pValue),
    maxmem: 64 * 1024 * 1024
  });

  return timingSafeEqualHex(key.toString('hex'), expectedHex);
}
