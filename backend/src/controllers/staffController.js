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

/**
 * Narrows a Supabase query to the staff rows visible to the current user.
 *
 * - Superuser  → no filter (sees all staff across all tenants).
 * - Admin      → scoped to their company and/or salon.
 * - Staff      → sees only their own row (`user_id` match).
 * - Other      → query returned unmodified.
 *
 * @param {object} query  — Supabase query builder
 * @param {object} req    — Express request with `req.user`
 * @returns {object}        The (possibly narrowed) Supabase query
 */
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

/**
 * GET /api/staff
 *
 * Returns all staff profiles visible to the authenticated user,
 * enriched with `salon_name`.  Admin/superuser only.
 *
 * @example
 * // Response 200
 * [{ "staff_id": "...", "name": "Alice", "salon_name": "Downtown Nails" }]
 */
export const getAllStaff = async (req, res) => {
  let query = supabase.from('staff').select(STAFF_SELECT_FIELDS);
  query = applyStaffScope(query, req);

  const { data, error } = await query;
  if (error) throw new ApiError(500, error.message);
  res.json(await withSalonName(data || []));
};

/**
 * GET /api/staff/:id
 *
 * Returns a single staff member by `staff_id`, scope-checked and
 * enriched with `salon_name`.  Returns 404 if not found or out of scope.
 */
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

/**
 * POST /api/staff
 *
 * Creates a new staff profile.  The salon–company relationship is
 * validated via `ensureSalonBelongsToCompany` to prevent cross-tenant
 * assignment.
 *
 * For admin users, `company_id` is automatically set to the admin's
 * company so staff cannot be created outside the admin's tenant.
 *
 * @param {string} req.body.name        — staff member's display name
 * @param {string} [req.body.phone]     — optional phone number
 * @param {string} [req.body.email]     — optional email
 * @param {string} [req.body.address_id]— optional address UUID
 * @param {string} req.body.company_id  — owning company UUID
 * @param {string} req.body.salon_id    — assigned salon UUID
 * @param {string} [req.body.user_id]   — optional linked user UUID
 */
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

/**
 * PUT /api/staff/:id
 *
 * Partially updates a staff profile.  If both `salon_id` and
 * `company_id` are being changed, the new salon–company relationship
 * is validated.  Admins are pinned to their own company.
 */
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

/**
 * DELETE /api/staff/:id
 *
 * Removes a staff profile.  Scope-checked — admins can only delete
 * staff within their own tenant.  Returns 204 on success.
 */
export const deleteStaff = async (req, res) => {
  const { id } = req.params;

  let query = supabase.from('staff').delete().eq('staff_id', id);
  query = applyStaffScope(query, req);

  const { data, error } = await query.select('staff_id');
  if (error) throw new ApiError(500, error.message);
  if (!data || data.length === 0) throw new ApiError(404, 'Staff not found', { expose: true });
  res.status(204).send();
};

/**
 * GET /api/staff/me
 *
 * Returns the authenticated staff user's own profile, enriched with
 * `salon_name`.  Only accessible to users with the `staff` role.
 *
 * @example
 * // Response 200
 * { "staff_id": "...", "name": "Alice", "salon_name": "Downtown Nails" }
 */
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
