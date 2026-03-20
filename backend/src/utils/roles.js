/**
 * Shared role-checking predicates for request authorization.
 *
 * Every controller imports these instead of redefining locally, so the
 * role hierarchy stays consistent across the entire API surface.
 *
 * Role hierarchy (highest → lowest):
 *   superuser  – unrestricted, cross-tenant access
 *   admin      – tenant-scoped (company / salon), manages staff & customers
 *   staff      – can only access own data (bookings, profile)
 *   customer   – can only access own bookings
 */

import ApiError from './ApiError.js';

// ── Individual role checks ──────────────────────────────────────────────

/** True when the authenticated user has the `superuser` role. */
export const isSuperuser = (req) => req.user?.role === 'superuser';

/** True when the authenticated user has the `admin` role (strict — excludes superuser). */
export const isAdmin = (req) => req.user?.role === 'admin';

/** True when the authenticated user is admin *or* superuser. */
export const isAdminOrAbove = (req) => isAdmin(req) || isSuperuser(req);

/** True when the authenticated user has the `staff` role (technician). */
export const isStaff = (req) => req.user?.role === 'staff';

/** True when the authenticated user has the `customer` role. */
export const isCustomer = (req) => req.user?.role === 'customer';

// ── Guard: require tenant scope on admin accounts ───────────────────────

/**
 * Throws 403 if an admin user is missing both `company_id` and `salon_id`.
 *
 * Superusers are intentionally exempt — they operate cross-tenant.
 * Call this at the top of any handler that filters data by tenant scope
 * so that un-scoped admins receive a clear error instead of silently
 * seeing an empty result set.
 */
export function ensureAdminScope(req) {
  if (isAdmin(req) && !req.user?.company_id && !req.user?.salon_id) {
    throw new ApiError(403, 'Admin account is missing scope', { expose: true });
  }
}
