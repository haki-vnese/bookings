/**
 * Data-enrichment helpers shared across controllers.
 *
 * Supabase doesn't support automatic JOINs in PostgREST select for
 * every relationship shape, so we batch-fetch related rows and merge
 * them in application code.  Centralising that logic here avoids three
 * near-identical copies of `withSalonName` across controllers.
 */

import { supabase } from '../db/supabase.js';

// ── Salon name enrichment ───────────────────────────────────────────────

/**
 * Appends `salon_name` to every row that carries a `salon_id`.
 *
 * 1. Collects unique `salon_id` values from the input array.
 * 2. Batch-fetches salon names in a single query.
 * 3. Maps names back onto each row.
 *
 * Rows without a `salon_id` receive `salon_name: null`.
 * If the salon lookup fails, the original rows are returned unchanged
 * so that a secondary enrichment failure never blocks the primary response.
 *
 * @param {Array<Object>} rows  Array of DB row objects (users, staff, customers, …)
 * @returns {Array<Object>}     Same rows with an added `salon_name` property
 */
export async function withSalonName(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const salonIds = [...new Set(list.map((row) => row.salon_id).filter(Boolean))];
  if (salonIds.length === 0) return list;

  const { data: salons, error } = await supabase
    .from('salons')
    .select('id, name')
    .in('id', salonIds);

  // Graceful degradation — don't fail the whole response over a missing name.
  if (error) return list;

  const salonMap = new Map((salons || []).map((s) => [s.id, s.name]));
  return list.map((row) => ({
    ...row,
    salon_name: row.salon_id ? salonMap.get(row.salon_id) || null : null,
  }));
}
