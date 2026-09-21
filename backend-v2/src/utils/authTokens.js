import crypto from 'node:crypto';
import ApiError from './ApiError.js';

const DEFAULT_ACCESS_TOKEN_SECONDS = 15 * 60;
const DEFAULT_RESET_TOKEN_SECONDS = 24 * 60 * 60;
const DEFAULT_REFRESH_TOKEN_DAYS = 14;

function base64Url(input) {
  return Buffer.from(input).toString('base64url');
}

function jsonBase64Url(value) {
  return base64Url(JSON.stringify(value));
}

function getJwtSecret() {
  const secret = process.env.AUTH_JWT_SECRET || process.env.JWT_SECRET || '';
  if (!secret) {
    throw new ApiError(500, 'Auth JWT secret is not configured.');
  }
  return secret;
}

function hmac(value) {
  return crypto.createHmac('sha256', getJwtSecret()).update(value).digest('base64url');
}

function decodeJson(segment) {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

export function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

export function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function resetTokenExpiresAt() {
  return new Date(Date.now() + DEFAULT_RESET_TOKEN_SECONDS * 1000).toISOString();
}

export function refreshTokenExpiresAt() {
  const days = Number(process.env.AUTH_REFRESH_TOKEN_DAYS || DEFAULT_REFRESH_TOKEN_DAYS);
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function signAccessToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = Number(process.env.AUTH_ACCESS_TOKEN_SECONDS || DEFAULT_ACCESS_TOKEN_SECONDS);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: process.env.AUTH_JWT_ISSUER || 'spa-booking-api',
    aud: process.env.AUTH_JWT_AUDIENCE || 'spa-admin',
    sub: user.id,
    typ: 'access',
    iat: now,
    exp: now + expiresIn
  };

  const unsigned = `${jsonBase64Url(header)}.${jsonBase64Url(payload)}`;
  return {
    accessToken: `${unsigned}.${hmac(unsigned)}`,
    expiresIn
  };
}

export function verifyAccessToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) {
    throw new ApiError(401, 'Invalid or expired Authorization token', { expose: true });
  }

  const [headerSegment, payloadSegment, signature] = parts;
  const unsigned = `${headerSegment}.${payloadSegment}`;
  const expected = hmac(unsigned);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw new ApiError(401, 'Invalid or expired Authorization token', { expose: true });
  }

  let header;
  let payload;
  try {
    header = decodeJson(headerSegment);
    payload = decodeJson(payloadSegment);
  } catch (_) {
    throw new ApiError(401, 'Invalid or expired Authorization token', { expose: true });
  }

  const now = Math.floor(Date.now() / 1000);
  const issuer = process.env.AUTH_JWT_ISSUER || 'spa-booking-api';
  const audience = process.env.AUTH_JWT_AUDIENCE || 'spa-admin';
  if (
    header.alg !== 'HS256' ||
    payload.typ !== 'access' ||
    payload.iss !== issuer ||
    payload.aud !== audience ||
    !payload.sub ||
    Number(payload.exp || 0) <= now
  ) {
    throw new ApiError(401, 'Invalid or expired Authorization token', { expose: true });
  }

  return payload;
}
