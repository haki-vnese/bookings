import crypto from 'node:crypto';
import supabase from '../db/supabase.js';
import ApiError from '../utils/ApiError.js';
import { hashPassword, verifyPassword } from '../utils/passwords.js';
import {
  randomToken,
  refreshTokenExpiresAt,
  resetTokenExpiresAt,
  signAccessToken,
  tokenHash
} from '../utils/authTokens.js';
import { buildPasswordResetUrl, sendPasswordResetEmail } from '../utils/mailService.js';

const AUTH_USER_FIELDS = `
  id,
  full_name,
  email,
  phone,
  status,
  password_hash,
  created_at,
  updated_at
`;

function toApiUser(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone || '',
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizePassword(password) {
  return String(password || '');
}

async function loadUserByEmail(email) {
  const { data, error } = await supabase
    .from('users')
    .select(AUTH_USER_FIELDS)
    .ilike('email', normalizeEmail(email))
    .maybeSingle();

  if (error) {
    throw new ApiError(500, 'Failed to load user for login', { details: error });
  }

  return data;
}

async function loadUserById(id) {
  const { data, error } = await supabase
    .from('users')
    .select(AUTH_USER_FIELDS)
    .eq('id', id)
    .single();

  if (error) {
    throw new ApiError(401, 'Invalid or expired session', { expose: true, details: error });
  }

  return data;
}

async function createRefreshToken(user, req) {
  const token = randomToken();
  const familyId = crypto.randomUUID();
  const { error } = await supabase
    .from('auth_sessions')
    .insert([{
      user_id: user.id,
      token_hash: tokenHash(token),
      session_family_id: familyId,
      expires_at: refreshTokenExpiresAt(),
      user_agent: req.header('user-agent') || '',
      ip_address: req.ip || ''
    }]);

  if (error) {
    throw new ApiError(500, 'Failed to create login session', { details: error });
  }

  return token;
}

async function issueSession(user, req) {
  const { accessToken, expiresIn } = signAccessToken(user);
  const refreshToken = await createRefreshToken(user, req);

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'bearer',
    expires_in: expiresIn,
    user: toApiUser(user)
  };
}

export async function createPasswordResetForUser(user, { returnToken = false } = {}) {
  const token = randomToken();
  const resetUrl = buildPasswordResetUrl(token);
  const { error } = await supabase
    .from('password_reset_tokens')
    .insert([{
      user_id: user.id,
      token_hash: tokenHash(token),
      expires_at: resetTokenExpiresAt()
    }]);

  if (error) {
    throw new ApiError(500, 'Failed to create password reset link', { details: error });
  }

  const delivery = await sendPasswordResetEmail({
    to: user.email,
    fullName: user.full_name,
    resetUrl
  });

  return {
    emailSent: delivery.sent,
    resetUrl: returnToken || !delivery.sent ? resetUrl : undefined
  };
}

export const login = async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = normalizePassword(req.body?.password);

  if (!email || !password) {
    throw new ApiError(400, 'Email and password are required', { expose: true });
  }

  const user = await loadUserByEmail(email);
  if (!user || user.status !== 'active' || !user.password_hash) {
    throw new ApiError(401, 'Invalid email or password', { expose: true });
  }

  const passwordOk = await verifyPassword(password, user.password_hash);
  if (!passwordOk) {
    throw new ApiError(401, 'Invalid email or password', { expose: true });
  }

  res.json(await issueSession(user, req));
};

export const requestPasswordReset = async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email) {
    throw new ApiError(400, 'Email is required', { expose: true });
  }

  const user = await loadUserByEmail(email);
  if (user && user.status !== 'inactive') {
    await createPasswordResetForUser(user);
  }

  res.json({
    ok: true,
    message: 'If that account exists, a password reset link has been sent.'
  });
};

export const refresh = async (req, res) => {
  const refreshToken = String(req.body?.refresh_token || req.body?.refreshToken || '').trim();
  if (!refreshToken) {
    throw new ApiError(400, 'Refresh token is required', { expose: true });
  }

  const { data: session, error } = await supabase
    .from('auth_sessions')
    .select('id, user_id, session_family_id, expires_at, revoked_at')
    .eq('token_hash', tokenHash(refreshToken))
    .maybeSingle();

  if (error || !session) {
    throw new ApiError(401, 'Invalid or expired session', { expose: true, details: error });
  }

  if (session.revoked_at) {
    await supabase
      .from('auth_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('session_family_id', session.session_family_id);
    throw new ApiError(401, 'Invalid or expired session', { expose: true });
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    throw new ApiError(401, 'Invalid or expired session', { expose: true });
  }

  const user = await loadUserById(session.user_id);
  if (user.status !== 'active') {
    throw new ApiError(403, 'This account is not active', { expose: true });
  }

  const nextRefreshToken = randomToken();
  const now = new Date().toISOString();
  const { data: rotatedRows, error: rotateError } = await supabase
    .from('auth_sessions')
    .update({ revoked_at: now })
    .eq('id', session.id)
    .is('revoked_at', null)
    .select('id');

  if (rotateError || !rotatedRows?.length) {
    throw new ApiError(500, 'Failed to rotate login session', { details: rotateError });
  }

  const { error: insertError } = await supabase
    .from('auth_sessions')
    .insert([{
      user_id: user.id,
      token_hash: tokenHash(nextRefreshToken),
      session_family_id: session.session_family_id,
      rotated_from_session_id: session.id,
      expires_at: refreshTokenExpiresAt(),
      user_agent: req.header('user-agent') || '',
      ip_address: req.ip || ''
    }]);

  if (insertError) {
    throw new ApiError(500, 'Failed to create refreshed session', { details: insertError });
  }

  const { accessToken, expiresIn } = signAccessToken(user);
  res.json({
    access_token: accessToken,
    refresh_token: nextRefreshToken,
    token_type: 'bearer',
    expires_in: expiresIn,
    user: toApiUser(user)
  });
};

export const logout = async (req, res) => {
  const refreshToken = String(req.body?.refresh_token || req.body?.refreshToken || '').trim();

  if (refreshToken) {
    await supabase
      .from('auth_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token_hash', tokenHash(refreshToken));
  }

  res.status(204).send();
};

export const resetPassword = async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const password = normalizePassword(req.body?.password);

  if (!token || !password) {
    throw new ApiError(400, 'Reset token and password are required', { expose: true });
  }

  if (password.length < 8) {
    throw new ApiError(400, 'Password must be at least 8 characters', { expose: true });
  }

  const { data: resetToken, error } = await supabase
    .from('password_reset_tokens')
    .select('id, user_id, expires_at, used_at')
    .eq('token_hash', tokenHash(token))
    .maybeSingle();

  if (error || !resetToken || resetToken.used_at || new Date(resetToken.expires_at).getTime() <= Date.now()) {
    throw new ApiError(401, 'Invalid or expired password reset link', { expose: true, details: error });
  }

  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();

  const { data: user, error: updateError } = await supabase
    .from('users')
    .update({
      password_hash: passwordHash,
      status: 'active',
      updated_at: now
    })
    .eq('id', resetToken.user_id)
    .select(AUTH_USER_FIELDS)
    .single();

  if (updateError) {
    throw new ApiError(500, 'Failed to set password', { details: updateError });
  }

  const [
    membershipResult,
    resetTokenResult,
    sessionResult
  ] = await Promise.all([
    supabase
      .from('user_memberships')
      .update({ status: 'active', updated_at: now })
      .eq('user_id', resetToken.user_id)
      .eq('status', 'invited'),
    supabase
      .from('password_reset_tokens')
      .update({ used_at: now })
      .eq('id', resetToken.id),
    supabase
      .from('auth_sessions')
      .update({ revoked_at: now })
      .eq('user_id', resetToken.user_id)
      .is('revoked_at', null)
  ]);

  const followUpError = membershipResult.error || resetTokenResult.error || sessionResult.error;
  if (followUpError) {
    throw new ApiError(500, 'Password was set but account activation cleanup failed', { details: followUpError });
  }

  res.json({
    user: toApiUser(user)
  });
};
