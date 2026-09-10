import supabase from '../db/supabase.js';

/**
 * Chuyển row users nội bộ sang shape API cho frontend.
 *
 * Input:
 * - row: row từ bảng `users`.
 *
 * Output:
 * - Object user camelCase, chỉ gồm field cần cho UI.
 */
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

/**
 * Chuyển row user_memberships sang shape API.
 *
 * Input:
 * - membership: row từ bảng `user_memberships`.
 *
 * Output:
 * - Object membership camelCase.
 */
function toApiMembership(membership) {
  return {
    id: membership.id,
    userId: membership.user_id,
    companyId: membership.company_id,
    salonId: membership.salon_id,
    role: membership.role,
    status: membership.status,
    createdAt: membership.created_at,
    updatedAt: membership.updated_at
  };
}

/**
 * Load danh sách company actor được phép thấy/chọn.
 *
 * Input:
 * - req: Express request đã có `req.access`.
 *
 * Output:
 * - Promise resolve mảng `{ id, name }`.
 */
async function loadAllowedCompanies(req) {
  if (req.access.isSuperAdmin) {
    const { data, error } = await supabase
      .from('companies')
      .select('id, name')
      .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  if (!req.access.companyIds?.length) return [];

  const { data, error } = await supabase
    .from('companies')
    .select('id, name')
    .in('id', req.access.companyIds)
    .order('name', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Load danh sách salon actor được phép thấy/chọn.
 *
 * Input:
 * - req: Express request đã có `req.access`.
 *
 * Output:
 * - Promise resolve mảng `{ id, company_id, name }`.
 */
async function loadAllowedSalons(req) {
  if (req.access.isSuperAdmin) {
    const { data, error } = await supabase
      .from('salons')
      .select('id, company_id, name')
      .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  if (!req.access.salonIds?.length) return [];

  const { data, error } = await supabase
    .from('salons')
    .select('id, company_id, name')
    .in('id', req.access.salonIds)
    .order('name', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Trả context hiện tại cho frontend khi app khởi động.
 *
 * Input:
 * - req.actor: user nội bộ đã xác thực.
 * - req.actorMemberships: membership active.
 * - req.access: quyền/scope đã tính sẵn.
 *
 * Output:
 * - JSON gồm user, effectiveRole, permissions, memberships và scope chọn được.
 */
export const getMe = async (req, res) => {
  const [companies, salons] = await Promise.all([
    loadAllowedCompanies(req),
    loadAllowedSalons(req)
  ]);

  res.json({
    user: toApiUser(req.actor),
    effectiveRole: req.access.effectiveRole,
    permissions: {
      canUseAdmin: req.access.canUseAdmin,
      canMoveSalon: req.access.canMoveSalon,
      canManageCompanies: req.access.isSuperAdmin,
      canManageSalons: ['super_admin', 'company_admin'].includes(req.access.effectiveRole),
      canManageUsers: req.access.canUseAdmin,
      canManageStaff: req.access.canUseAdmin
    },
    memberships: req.actorMemberships.map(toApiMembership),
    scope: {
      companyIds: req.access.companyIds,
      salonIds: req.access.salonIds,
      companies: companies.map((company) => ({
        id: company.id,
        name: company.name
      })),
      salons: salons.map((salon) => ({
        id: salon.id,
        companyId: salon.company_id,
        name: salon.name
      }))
    }
  });
};
