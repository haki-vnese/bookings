import { supabase } from '../db/supabase.js';
import ApiError from '../utils/ApiError.js';

const STAFF_SELECT_FIELDS = 'staff_id, user_id, name, phone, email, address_id, company_id, salon_id, created_at, created_by, updated_at, updated_by';

function isSuperuser(req) {
  return req.user?.role === 'superuser';
}

function isAdmin(req) {
  return req.user?.role === 'admin';
}

function isStaff(req) {
  return req.user?.role === 'staff';
}

function ensureAdminCompany(req) {
  if (isAdmin(req) && !req.user?.company_id) {
    throw new ApiError(403, 'Admin account is missing company scope', { expose: true });
  }
}

function applyStaffScope(query, req) {
  if (isSuperuser(req)) return query;
  if (isAdmin(req)) {
    ensureAdminCompany(req);
    return query.eq('company_id', req.user.company_id);
  }
  if (isStaff(req)) {
    return query.eq('user_id', req.user.userId);
  }
  return query;
}

async function ensureSalonBelongsToCompany(salonId, companyId) {
  const { data, error } = await supabase
    .from('salons')
    .select('id')
    .eq('id', salonId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) throw new ApiError(500, error.message);
  if (!data) throw new ApiError(400, 'salon_id does not belong to company_id', { expose: true });
}

async function withSalonName(staffRows) {
  const rows = Array.isArray(staffRows) ? staffRows : [];
  const salonIds = [...new Set(rows.map((row) => row.salon_id).filter(Boolean))];
  if (salonIds.length === 0) return rows;

  const { data: salons, error } = await supabase
    .from('salons')
    .select('id, name')
    .in('id', salonIds);

  if (error) return rows;

  const salonMap = new Map((salons || []).map((salon) => [salon.id, salon.name]));
  return rows.map((row) => ({ ...row, salon_name: row.salon_id ? salonMap.get(row.salon_id) || null : null }));
}

export const getAllStaff = async (req, res) => {
  let query = supabase.from('staff').select(STAFF_SELECT_FIELDS);
  query = applyStaffScope(query, req);

  const { data, error } = await query;
  if (error) throw new ApiError(500, error.message);
  res.json(await withSalonName(data || []));
};

export const getStaffById = async (req, res) => {
  const { id } = req.params;
  let query = supabase.from('staff').select(STAFF_SELECT_FIELDS).eq('staff_id', id).maybeSingle();
  query = applyStaffScope(query, req);

  const { data, error } = await query;
  if (error) throw new ApiError(500, error.message);
  if (!data) throw new ApiError(404, 'Staff not found', { expose: true });

  const rows = await withSalonName([data]);
  res.json(rows[0]);
};

export const createStaff = async (req, res) => {
  const { name, phone, email, address_id, company_id, salon_id, user_id } = req.body;

  const payload = {
    name,
    phone: phone || null,
    email: email || null,
    address_id: address_id || null,
    company_id,
    salon_id,
    user_id: user_id || null,
    created_by: req.user?.userId,
    updated_by: req.user?.userId,
  };

  if (isAdmin(req)) {
    ensureAdminCompany(req);
    payload.company_id = req.user.company_id;
  }

  await ensureSalonBelongsToCompany(payload.salon_id, payload.company_id);

  const { data, error } = await supabase.from('staff').insert([payload]).select(STAFF_SELECT_FIELDS);
  if (error) throw new ApiError(500, error.message);

  res.status(201).json(await withSalonName(data || []));
};

export const updateStaff = async (req, res) => {
  const { id } = req.params;
  const { name, phone, email, address_id, company_id, salon_id, user_id } = req.body;

  const updates = {
    ...(name !== undefined ? { name } : {}),
    ...(phone !== undefined ? { phone } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(address_id !== undefined ? { address_id } : {}),
    ...(company_id !== undefined ? { company_id } : {}),
    ...(salon_id !== undefined ? { salon_id } : {}),
    ...(user_id !== undefined ? { user_id } : {}),
    updated_by: req.user?.userId,
  };

  if (isAdmin(req)) {
    ensureAdminCompany(req);
    updates.company_id = req.user.company_id;
  }

  if (updates.salon_id && updates.company_id) {
    await ensureSalonBelongsToCompany(updates.salon_id, updates.company_id);
  }

  let query = supabase.from('staff').update(updates).eq('staff_id', id);
  query = applyStaffScope(query, req);

  const { data, error } = await query.select(STAFF_SELECT_FIELDS);
  if (error) throw new ApiError(500, error.message);
  if (!data || data.length === 0) throw new ApiError(404, 'Staff not found', { expose: true });

  res.json(await withSalonName(data));
};

export const deleteStaff = async (req, res) => {
  const { id } = req.params;

  let query = supabase.from('staff').delete().eq('staff_id', id);
  query = applyStaffScope(query, req);

  const { data, error } = await query.select('staff_id');
  if (error) throw new ApiError(500, error.message);
  if (!data || data.length === 0) throw new ApiError(404, 'Staff not found', { expose: true });
  res.status(204).send();
};

export const getMyStaffProfile = async (req, res) => {
  if (!isStaff(req)) {
    throw new ApiError(403, 'Only staff can access this profile endpoint', { expose: true });
  }

  const { data, error } = await supabase
    .from('staff')
    .select(STAFF_SELECT_FIELDS)
    .eq('user_id', req.user.userId)
    .maybeSingle();

  if (error) throw new ApiError(500, error.message);
  if (!data) throw new ApiError(404, 'Staff profile not found', { expose: true });

  const rows = await withSalonName([data]);
  res.json(rows[0]);
};
