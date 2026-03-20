/**
 * Shared tenant-scoping helpers.
 *
 * Multi-tenancy in this system is two-tier:
 *   company  (top-level organisation)
 *     └─ salon  (physical location within a company)
 *
 * Every staff member, customer, and booking is associated with a salon,
 * and transitively with that salon's company.  Admin users carry
 * `company_id` and optionally `salon_id` on their JWT — these fields
 * determine which subset of data they may access.
 *
 * The helpers below verify and resolve those relationships so individual
 * controllers don't have to re-implement the same logic.
 */

import { supabase } from '../db/supabase.js';
import ApiError from './ApiError.js';

// ── Salon → Company resolution ──────────────────────────────────────────

/**
 * Given a salon UUID, returns the owning `company_id`.
 *
 * Used when creating a staff user with only a `salon_id` — the company
 * is derived automatically so the tenant link is always complete.
 *
 * @param {string} salonId  UUID of the salon
 * @returns {string|null}   The owning company's UUID, or null
 * @throws {ApiError} 400 if `salonId` doesn't match any salon row
 */
export async function resolveCompanyIdFromSalon(salonId) {
  if (!salonId) return null;

  const { data, error } = await supabase
    .from('salons')
    .select('company_id')
    .eq('id', salonId)
    .maybeSingle();

  if (error) throw new ApiError(500, error.message);
  if (!data) throw new ApiError(400, 'Invalid salon_id', { expose: true });
  return data.company_id || null;
}

// ── Salon ↔ Company relationship guard ──────────────────────────────────

/**
 * Throws 400 if the given salon does not belong to the given company.
 *
 * Prevents staff being assigned to a salon outside the admin's company,
 * which would break tenant isolation.
 *
 * @param {string} salonId    UUID of the salon
 * @param {string} companyId  UUID of the expected owning company
 */
export async function ensureSalonBelongsToCompany(salonId, companyId) {
  const { data, error } = await supabase
    .from('salons')
    .select('id')
    .eq('id', salonId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) throw new ApiError(500, error.message);
  if (!data) throw new ApiError(400, 'salon_id does not belong to company_id', { expose: true });
}
