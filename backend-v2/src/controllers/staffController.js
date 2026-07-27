import supabase from '../db/supabase.js';
import ApiError from '../utils/ApiError.js';

const STAFF_FIELDS = `
  id,
  salon_id,
  user_id,
  display_name,
  email,
  phone,
  title,
  color,
  sort_order,
  is_active,
  bookable,
  created_at,
  updated_at
`;

const USER_FIELDS = `
  id,
  full_name,
  email,
  phone,
  status
`;

function throwStaffDatabaseError(action, error) {
  if (error?.code === '42P01') {
    throw new ApiError(500, 'Staff or users table is missing.', { details: error });
  }

  if (error?.code === '42703') {
    throw new ApiError(500, 'Staff schema is missing a required column.', { details: error });
  }

  if (error?.code === '42501') {
    throw new ApiError(500, 'Supabase permissions blocked staff access. Check RLS policies or the backend Supabase key.', {
      details: error
    });
  }

  if (error?.code === '23503') {
    throw new ApiError(409, 'Staff references a user or salon that does not exist', { details: error, expose: true });
  }

  if (error?.code === '23505') {
    throw new ApiError(409, 'Staff member already exists', { details: error, expose: true });
  }

  throw new ApiError(500, `Failed to ${action}`, { details: error });
}

function toApiLinkedUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone || '',
    status: row.status
  };
}

function toApiStaff(row, user = null) {
  return {
    id: row.id,
    salonId: row.salon_id,
    userId: row.user_id,
    user: toApiLinkedUser(user),
    displayName: row.display_name,
    email: row.email || '',
    phone: row.phone || '',
    title: row.title || '',
    color: row.color || '',
    sortOrder: row.sort_order ?? 0,
    isActive: Boolean(row.is_active),
    bookable: Boolean(row.bookable),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeStaffInput(input = {}, salonId, { partial = false } = {}) {
  const payload = {};

  if (!partial) {
    payload.salon_id = salonId;
  }

  if (input.userId !== undefined) payload.user_id = input.userId || null;
  if (input.user_id !== undefined) payload.user_id = input.user_id || null;
  if (input.displayName !== undefined) payload.display_name = String(input.displayName).trim();
  if (input.display_name !== undefined) payload.display_name = String(input.display_name).trim();
  if (input.email !== undefined) payload.email = String(input.email).trim().toLowerCase();
  if (input.phone !== undefined) payload.phone = String(input.phone).trim();
  if (input.title !== undefined) payload.title = String(input.title).trim();
  if (input.color !== undefined) payload.color = String(input.color).trim();
  if (input.sortOrder !== undefined) payload.sort_order = Number(input.sortOrder) || 0;
  if (input.sort_order !== undefined) payload.sort_order = Number(input.sort_order) || 0;
  if (input.isActive !== undefined) payload.is_active = Boolean(input.isActive);
  if (input.is_active !== undefined) payload.is_active = Boolean(input.is_active);
  if (input.bookable !== undefined) payload.bookable = Boolean(input.bookable);

  if (!partial) {
    if (!payload.salon_id) {
      throw new ApiError(400, 'Salon ID is required', { expose: true });
    }
    if (!payload.display_name) {
      throw new ApiError(400, 'Staff display name is required', { expose: true });
    }
    if (!payload.email) {
      throw new ApiError(400, 'Staff email is required', { expose: true });
    }
    if (!payload.phone) {
      throw new ApiError(400, 'Staff phone is required', { expose: true });
    }
    if (payload.is_active === undefined) payload.is_active = true;
    if (payload.bookable === undefined) payload.bookable = true;
  }

  if (partial && input.displayName !== undefined && !payload.display_name) {
    throw new ApiError(400, 'Staff display name cannot be empty', { expose: true });
  }

  if (partial && input.email !== undefined && !payload.email) {
    throw new ApiError(400, 'Staff email cannot be empty', { expose: true });
  }

  if (partial && input.phone !== undefined && !payload.phone) {
    throw new ApiError(400, 'Staff phone cannot be empty', { expose: true });
  }

  return payload;
}

async function loadUsersById(userIds) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueIds.length) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('users')
    .select(USER_FIELDS)
    .in('id', uniqueIds);

  if (error) {
    throwStaffDatabaseError('fetch staff users', error);
  }

  return new Map((data || []).map((user) => [user.id, user]));
}

async function loadStaffById(id, salonId) {
  const { data, error } = await supabase
    .from('staff')
    .select(STAFF_FIELDS)
    .eq('salon_id', salonId)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new ApiError(404, 'Staff member not found', { expose: true });
    }
    throwStaffDatabaseError('fetch staff member', error);
  }

  const usersById = await loadUsersById([data.user_id]);
  return toApiStaff(data, usersById.get(data.user_id));
}

export const getAllStaff = async (req, res) => {
  const salonId = req.salonId;

  const { data, error } = await supabase
    .from('staff')
    .select(STAFF_FIELDS)
    .eq('salon_id', salonId)
    .order('sort_order', { ascending: true })
    .order('display_name', { ascending: true });

  if (error) {
    throwStaffDatabaseError('fetch staff', error);
  }

  const rows = data || [];
  const usersById = await loadUsersById(rows.map((staff) => staff.user_id));
  res.json(rows.map((staff) => toApiStaff(staff, usersById.get(staff.user_id))));
};

export const getStaffById = async (req, res) => {
  res.json(await loadStaffById(req.params.id, req.salonId));
};

export const createStaff = async (req, res) => {
  const payload = normalizeStaffInput(req.body || {}, req.salonId);

  const { data, error } = await supabase
    .from('staff')
    .insert([payload])
    .select(STAFF_FIELDS)
    .single();

  if (error) {
    throwStaffDatabaseError('create staff member', error);
  }

  const usersById = await loadUsersById([data.user_id]);
  res.status(201).json(toApiStaff(data, usersById.get(data.user_id)));
};

export const updateStaff = async (req, res) => {
  const payload = normalizeStaffInput(req.body || {}, req.salonId, { partial: true });

  if (!Object.keys(payload).length) {
    return res.json(await loadStaffById(req.params.id, req.salonId));
  }

  const { data, error } = await supabase
    .from('staff')
    .update(payload)
    .eq('salon_id', req.salonId)
    .eq('id', req.params.id)
    .select(STAFF_FIELDS)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new ApiError(404, 'Staff member not found', { expose: true });
    }
    throwStaffDatabaseError('update staff member', error);
  }

  const usersById = await loadUsersById([data.user_id]);
  res.json(toApiStaff(data, usersById.get(data.user_id)));
};

export const deleteStaff = async (req, res) => {
  const { data, error } = await supabase
    .from('staff')
    .delete()
    .eq('salon_id', req.salonId)
    .eq('id', req.params.id)
    .select('id');

  if (error) {
    throw new ApiError(409, 'Staff member cannot be deleted while related records exist', { details: error, expose: true });
  }

  if (!data || !data.length) {
    throw new ApiError(404, 'Staff member not found', { expose: true });
  }

  res.status(204).send();
};
