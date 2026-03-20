/**
 * Staff controller — CRUD for staff profiles in the `staff` table.
 *
 * Staff rows are the scheduling/technician entity.  Each staff member
 * belongs to exactly one salon (and transitively one company).  Admins
 * are scoped to their own company/salon; superusers have full access.
 *
 * The `ensureSalonBelongsToCompany` check prevents assigning a staff
 * member to a salon in a different company.
 */
import { supabase } from '../db/supabase.js';
import ApiError from '../utils/ApiError.js';
import { isSuperuser, isAdmin, isStaff, ensureAdminScope } from '../utils/roles.js';
import { ensureSalonBelongsToCompany } from '../utils/tenantScope.js';
import { withSalonName } from '../utils/enrichment.js';

const STAFF_SELECT_FIELDS = 'staff_id, user_id, name, phone, email, address_id, company_id, salon_id, created_at, created_by, updated_at, updated_by';

function applyStaffScope(query, req) {
  if (isSuperuser(req)) return query;
  if (isAdmin(req)) {
    ensureAdminScope(req);
    let scoped = query;
    if (req.user.company_id) scoped = scoped.eq('company_id', req.user.company_id);
    if (req.user.salon_id) scoped = scoped.eq('salon_id', req.user.salon_id);
    return scoped;
  }
  if (isStaff(req)) {
    return query.eq('user_id', req.user.userId);
  }
  return query;
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
    ensureAdminScope(req);
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
    ensureAdminScope(req);
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
