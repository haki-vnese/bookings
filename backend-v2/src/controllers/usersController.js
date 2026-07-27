import supabase from '../db/supabase.js';
import ApiError from '../utils/ApiError.js';

const USER_FIELDS = `
  id,
  full_name,
  email,
  phone,
  status,
  created_at,
  updated_at
`;

const VALID_STATUSES = new Set(['active', 'inactive', 'invited']);

function throwUserDatabaseError(action, error) {
  if (error?.code === '42P01') {
    throw new ApiError(500, 'Users table is missing.', { details: error });
  }

  if (error?.code === '42703') {
    throw new ApiError(500, 'Users schema is missing a required column.', { details: error });
  }

  if (error?.code === '42501') {
    throw new ApiError(500, 'Supabase permissions blocked users access. Check RLS policies or the backend Supabase key.', {
      details: error
    });
  }

  if (error?.code === '23505') {
    throw new ApiError(409, 'User email is already in use', { details: error, expose: true });
  }

  throw new ApiError(500, `Failed to ${action}`, { details: error });
}

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

function normalizeUserInput(input = {}, { partial = false } = {}) {
  const payload = {};

  if (input.fullName !== undefined) payload.full_name = String(input.fullName).trim();
  if (input.full_name !== undefined) payload.full_name = String(input.full_name).trim();
  if (input.email !== undefined) payload.email = String(input.email).trim().toLowerCase();
  if (input.phone !== undefined) payload.phone = String(input.phone).trim();
  if (input.status !== undefined) payload.status = String(input.status).trim();

  if (!partial) {
    if (!payload.full_name) {
      throw new ApiError(400, 'User full name is required', { expose: true });
    }
    if (!payload.email) {
      throw new ApiError(400, 'User email is required', { expose: true });
    }
  }

  if (partial && input.fullName !== undefined && !payload.full_name) {
    throw new ApiError(400, 'User full name cannot be empty', { expose: true });
  }

  if (partial && input.email !== undefined && !payload.email) {
    throw new ApiError(400, 'User email cannot be empty', { expose: true });
  }

  if (!payload.status && !partial) {
    payload.status = 'active';
  }

  if (payload.status !== undefined && !VALID_STATUSES.has(payload.status)) {
    throw new ApiError(400, 'User status is invalid', { expose: true });
  }

  return payload;
}

async function loadUserById(id) {
  const { data, error } = await supabase
    .from('users')
    .select(USER_FIELDS)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new ApiError(404, 'User not found', { expose: true });
    }
    throwUserDatabaseError('fetch user', error);
  }

  return toApiUser(data);
}

export const getAllUsers = async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select(USER_FIELDS)
    .order('created_at', { ascending: false });

  if (error) {
    throwUserDatabaseError('fetch users', error);
  }

  res.json((data || []).map(toApiUser));
};

export const getUserById = async (req, res) => {
  res.json(await loadUserById(req.params.id));
};

export const createUser = async (req, res) => {
  const payload = normalizeUserInput(req.body || {});

  const { data, error } = await supabase
    .from('users')
    .insert([payload])
    .select(USER_FIELDS)
    .single();

  if (error) {
    throwUserDatabaseError('create user', error);
  }

  res.status(201).json(toApiUser(data));
};

export const updateUser = async (req, res) => {
  const payload = normalizeUserInput(req.body || {}, { partial: true });

  if (!Object.keys(payload).length) {
    return res.json(await loadUserById(req.params.id));
  }

  const { data, error } = await supabase
    .from('users')
    .update(payload)
    .eq('id', req.params.id)
    .select(USER_FIELDS)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new ApiError(404, 'User not found', { expose: true });
    }
    throwUserDatabaseError('update user', error);
  }

  res.json(toApiUser(data));
};

export const deleteUser = async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .delete()
    .eq('id', req.params.id)
    .select('id');

  if (error) {
    throw new ApiError(409, 'User cannot be deleted while related records exist', { details: error, expose: true });
  }

  if (!data || !data.length) {
    throw new ApiError(404, 'User not found', { expose: true });
  }

  res.status(204).send();
};
