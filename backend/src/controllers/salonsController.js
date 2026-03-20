/**
 * Salons controller — read-only list of salons visible to the user.
 *
 * Admins see salons belonging to their company; superusers see all.
 * Write operations for salons would typically be added here if needed.
 */
import { supabase } from '../db/supabase.js';
import ApiError from '../utils/ApiError.js';
import { isSuperuser, isAdmin } from '../utils/roles.js';

const SALON_SELECT_FIELDS = 'id, name, company_id, address_id, created_at, updated_at';

/**
 * Narrows a Supabase query to the salons visible to the current user.
 *
 * - Superuser  → no filter (sees all salons).
 * - Admin      → only salons whose `company_id` matches the admin's.
 * - Other      → query is returned unmodified (route-level auth should
 *                prevent non-admin/non-superuser access).
 *
 * @param {object} query  — Supabase query builder
 * @param {object} req    — Express request with `req.user`
 * @returns {object}        The (possibly narrowed) Supabase query
 */
function applySalonScope(query, req) {
  if (isSuperuser(req)) return query;
  if (isAdmin(req) && req.user?.company_id) {
    return query.eq('company_id', req.user.company_id);
  }
  return query;
}

/**
 * GET /api/salons
 *
 * Returns all salons visible to the authenticated user.
 * Admins see salons within their company; superusers see all.
 *
 * @example
 * // Response 200
 * [{ "id": "...", "name": "Downtown Nails", "company_id": "..." }, ...]
 */
export const getAllSalons = async (req, res) => {
  let query = supabase.from('salons').select(SALON_SELECT_FIELDS);
  query = applySalonScope(query, req);

  const { data, error } = await query;
  if (error) throw new ApiError(500, error.message);
  res.json(data || []);
};
