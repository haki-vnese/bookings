import supabase from '../db/supabase.js';
import ApiError from '../utils/ApiError.js';
import {
  SALON_SCOPED_ROLES,
  assertMembershipAssignable,
  normalizeMembershipScope
} from '../utils/accessControl.js';

const USER_FIELDS = `
  id,
  full_name,
  email,
  phone,
  status,
  created_at,
  updated_at
`;

const MEMBERSHIP_FIELDS = `
  id,
  user_id,
  company_id,
  salon_id,
  role,
  status,
  created_at,
  updated_at
`;

const HISTORY_FIELDS = `
  id,
  user_id,
  membership_id,
  from_role,
  from_company_id,
  from_salon_id,
  to_role,
  to_company_id,
  to_salon_id,
  changed_by,
  created_at
`;

const VALID_STATUSES = new Set(['active', 'inactive', 'invited']);

function throwUserDatabaseError(action, error) {
  if (error?.code === '42P01') {
    throw new ApiError(500, 'Users, memberships, or membership history table is missing.', { details: error });
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
    throw new ApiError(409, 'User email or membership is already in use', { details: error, expose: true });
  }

  if (error?.code === '23503') {
    throw new ApiError(409, 'User membership references a company or salon that does not exist', { details: error, expose: true });
  }

  throw new ApiError(500, `Failed to ${action}`, { details: error });
}

/**
 * Chuyển membership database sang object API kèm tên company/salon nếu có.
 *
 * Input:
 * - membership: row từ `user_memberships`.
 * - companiesById: Map company id -> company row.
 * - salonsById: Map salon id -> salon row.
 *
 * Output:
 * - Object membership camelCase, hoặc null nếu input rỗng.
 */
function toApiMembership(membership, companiesById = new Map(), salonsById = new Map()) {
  if (!membership) return null;

  const company = membership.company_id ? companiesById.get(membership.company_id) : null;
  const salon = membership.salon_id ? salonsById.get(membership.salon_id) : null;

  return {
    id: membership.id,
    userId: membership.user_id,
    role: membership.role,
    status: membership.status,
    companyId: membership.company_id,
    companyName: company?.name || '',
    salonId: membership.salon_id,
    salonName: salon?.name || '',
    createdAt: membership.created_at,
    updatedAt: membership.updated_at
  };
}

/**
 * Chuyển row lịch sử membership sang object API dễ render.
 *
 * Input:
 * - history: row từ `user_membership_history`.
 * - companiesById: Map company id -> company row.
 * - salonsById: Map salon id -> salon row.
 *
 * Output:
 * - Object history camelCase có cả id và tên scope cũ/mới.
 */
function toApiHistory(history, companiesById = new Map(), salonsById = new Map()) {
  return {
    id: history.id,
    userId: history.user_id,
    membershipId: history.membership_id,
    fromRole: history.from_role,
    fromCompanyId: history.from_company_id,
    fromCompanyName: history.from_company_id ? companiesById.get(history.from_company_id)?.name || '' : '',
    fromSalonId: history.from_salon_id,
    fromSalonName: history.from_salon_id ? salonsById.get(history.from_salon_id)?.name || '' : '',
    toRole: history.to_role,
    toCompanyId: history.to_company_id,
    toCompanyName: history.to_company_id ? companiesById.get(history.to_company_id)?.name || '' : '',
    toSalonId: history.to_salon_id,
    toSalonName: history.to_salon_id ? salonsById.get(history.to_salon_id)?.name || '' : '',
    changedBy: history.changed_by,
    createdAt: history.created_at
  };
}

/**
 * Chuyển user database sang response API đầy đủ cho tab Users.
 *
 * Input:
 * - row: row từ bảng `users`.
 * - memberships: các membership actor được phép thấy của user.
 * - history: lịch sử đổi membership của user.
 * - companiesById/salonsById: lookup map để enrich tên scope.
 *
 * Output:
 * - Object user camelCase gồm membership hiện tại, memberships và membershipHistory.
 */
function toApiUser(row, memberships = [], history = [], companiesById = new Map(), salonsById = new Map()) {
  const apiMemberships = memberships.map((membership) => toApiMembership(membership, companiesById, salonsById));

  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone || '',
    status: row.status,
    membership: apiMemberships[0] || null,
    memberships: apiMemberships,
    membershipHistory: history.map((item) => toApiHistory(item, companiesById, salonsById)),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Chuẩn hóa body user create/update về shape database.
 *
 * Input:
 * - input: body từ client, nhận camelCase hoặc snake_case.
 * - partial: true khi update để cho phép gửi một phần field.
 *
 * Output:
 * - Object payload dùng cho bảng `users`.
 *
 * Lỗi:
 * - 400 nếu thiếu required field khi create, field rỗng khi update, hoặc status sai.
 */
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

/**
 * Chuẩn hóa role/scope membership từ request và tự điền default an toàn.
 *
 * Input:
 * - req: Express request đã có `req.access`.
 * - input: body request hoặc object merge từ membership hiện tại.
 *
 * Output:
 * - Object `{ role, company_id, salon_id }` đã validate bằng normalizeMembershipScope.
 */
function membershipInputWithDefaults(req, input = {}) {
  const role = input.role || input.membership?.role || 'user';
  let companyId = input.companyId || input.company_id || input.membership?.companyId || input.membership?.company_id || null;
  let salonId = input.salonId || input.salon_id || input.membership?.salonId || input.membership?.salon_id || null;

  if (SALON_SCOPED_ROLES.has(role) && !salonId && req.access?.effectiveRole === 'salon_admin' && req.access.salonIds?.length === 1) {
    salonId = req.access.salonIds[0];
  }

  if (role === 'company_admin' && !companyId && req.access?.effectiveRole === 'company_admin' && req.access.companyIds?.length === 1) {
    companyId = req.access.companyIds[0];
  }

  return normalizeMembershipScope({ role, companyId, salonId });
}

async function loadCompaniesById(companyIds) {
  const uniqueIds = [...new Set((companyIds || []).filter(Boolean))];
  if (!uniqueIds.length) return new Map();

  const { data, error } = await supabase
    .from('companies')
    .select('id, name')
    .in('id', uniqueIds);

  if (error) throwUserDatabaseError('fetch membership companies', error);
  return new Map((data || []).map((company) => [company.id, company]));
}

async function loadSalonsById(salonIds) {
  const uniqueIds = [...new Set((salonIds || []).filter(Boolean))];
  if (!uniqueIds.length) return new Map();

  const { data, error } = await supabase
    .from('salons')
    .select('id, name, company_id')
    .in('id', uniqueIds);

  if (error) throwUserDatabaseError('fetch membership salons', error);
  return new Map((data || []).map((salon) => [salon.id, salon]));
}

/**
 * Load các membership actor được phép nhìn thấy.
 *
 * Input:
 * - req: Express request đã có `req.access`.
 *
 * Output:
 * - Promise resolve mảng membership đã lọc theo scope.
 */
async function loadVisibleMemberships(req) {
  if (req.access.isSuperAdmin) {
    const { data, error } = await supabase
      .from('user_memberships')
      .select(MEMBERSHIP_FIELDS)
      .eq('status', 'active');

    if (error) throwUserDatabaseError('fetch memberships', error);
    return data || [];
  }

  const queries = [];
  if (req.access.companyIds?.length) {
    queries.push(
      supabase
        .from('user_memberships')
        .select(MEMBERSHIP_FIELDS)
        .eq('status', 'active')
        .in('company_id', req.access.companyIds)
    );
  }
  if (req.access.salonIds?.length) {
    queries.push(
      supabase
        .from('user_memberships')
        .select(MEMBERSHIP_FIELDS)
        .eq('status', 'active')
        .in('salon_id', req.access.salonIds)
    );
  }

  const results = await Promise.all(queries);
  const byId = new Map();
  for (const result of results) {
    if (result.error) throwUserDatabaseError('fetch scoped memberships', result.error);
    (result.data || []).forEach((membership) => byId.set(membership.id, membership));
  }

  const memberships = [...byId.values()];
  if (req.access.effectiveRole === 'salon_admin') {
    return memberships.filter((membership) => ['user', 'staff'].includes(membership.role));
  }

  return memberships;
}

/**
 * Load membership của một user cụ thể trong scope actor.
 *
 * Input:
 * - req: Express request đã có `req.access`.
 * - userId: UUID user cần kiểm tra.
 *
 * Output:
 * - Promise resolve mảng membership của user mà actor được phép thấy.
 */
async function loadVisibleMembershipsForUser(req, userId) {
  const memberships = await loadVisibleMemberships(req);
  return memberships.filter((membership) => String(membership.user_id) === String(userId));
}

/**
 * Load lịch sử membership theo danh sách user.
 *
 * Input:
 * - userIds: mảng UUID user.
 *
 * Output:
 * - Promise resolve Map userId -> mảng history mới nhất trước.
 */
async function loadHistoryForUsers(userIds) {
  const uniqueIds = [...new Set((userIds || []).filter(Boolean))];
  if (!uniqueIds.length) return new Map();

  const { data, error } = await supabase
    .from('user_membership_history')
    .select(HISTORY_FIELDS)
    .in('user_id', uniqueIds)
    .order('created_at', { ascending: false });

  if (error) throwUserDatabaseError('fetch user membership history', error);

  const byUserId = new Map();
  (data || []).forEach((item) => {
    const history = byUserId.get(item.user_id) || [];
    history.push(item);
    byUserId.set(item.user_id, history);
  });
  return byUserId;
}

async function loadUserRows(userIds = null) {
  let query = supabase
    .from('users')
    .select(USER_FIELDS)
    .order('created_at', { ascending: false });

  if (userIds) {
    if (!userIds.length) return [];
    query = query.in('id', userIds);
  }

  const { data, error } = await query;
  if (error) throwUserDatabaseError('fetch users', error);
  return data || [];
}

async function loadUserRowById(id) {
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

  return data;
}

/**
 * Enrich danh sách user với membership, scope name và history.
 *
 * Input:
 * - rows: mảng row từ bảng `users`.
 * - memberships: mảng membership đã lọc scope.
 * - historyByUserId: Map userId -> history rows.
 *
 * Output:
 * - Promise resolve mảng user response đã format bằng toApiUser.
 */
async function enrichUsers(rows, memberships, historyByUserId = new Map()) {
  const companyIds = [
    ...memberships.map((membership) => membership.company_id),
    ...[...historyByUserId.values()].flat().flatMap((history) => [history.from_company_id, history.to_company_id])
  ];
  const salonIds = [
    ...memberships.map((membership) => membership.salon_id),
    ...[...historyByUserId.values()].flat().flatMap((history) => [history.from_salon_id, history.to_salon_id])
  ];
  const [companiesById, salonsById] = await Promise.all([
    loadCompaniesById(companyIds),
    loadSalonsById(salonIds)
  ]);
  const membershipsByUserId = new Map();
  memberships.forEach((membership) => {
    const userMemberships = membershipsByUserId.get(membership.user_id) || [];
    userMemberships.push(membership);
    membershipsByUserId.set(membership.user_id, userMemberships);
  });

  return rows.map((row) => toApiUser(
    row,
    membershipsByUserId.get(row.id) || [],
    historyByUserId.get(row.id) || [],
    companiesById,
    salonsById
  ));
}

/**
 * Ghi lịch sử khi membership đổi role/company/salon.
 *
 * Input:
 * - userId: UUID user bị thay đổi.
 * - membership: membership hiện tại trước khi đổi.
 * - nextScope: scope mới `{ role, company_id, salon_id }`.
 * - changedBy: UUID actor thực hiện thay đổi.
 *
 * Output:
 * - Promise resolve undefined.
 *
 * Side effects:
 * - Insert vào `user_membership_history` nếu có thay đổi thật sự.
 */
async function insertMembershipHistory(userId, membership, nextScope, changedBy) {
  const changed = membership.role !== nextScope.role ||
    membership.company_id !== nextScope.company_id ||
    membership.salon_id !== nextScope.salon_id;

  if (!changed) return;

  const { error } = await supabase
    .from('user_membership_history')
    .insert([{
      user_id: userId,
      membership_id: membership.id,
      from_role: membership.role,
      from_company_id: membership.company_id,
      from_salon_id: membership.salon_id,
      to_role: nextScope.role,
      to_company_id: nextScope.company_id,
      to_salon_id: nextScope.salon_id,
      changed_by: changedBy
    }]);

  if (error) throwUserDatabaseError('write user membership history', error);
}

/**
 * GET /api/users
 *
 * Input:
 * - req.access: scope actor từ middleware auth.
 *
 * Output:
 * - JSON array users actor được phép thấy.
 *
 * Quy tắc:
 * - super_admin thấy tất cả.
 * - company_admin thấy user thuộc company/salon trong company của họ.
 * - salon_admin chỉ thấy user/staff trong salon của họ.
 */
export const getAllUsers = async (req, res) => {
  const visibleMemberships = await loadVisibleMemberships(req);
  const visibleUserIds = req.access.isSuperAdmin
    ? null
    : [...new Set(visibleMemberships.map((membership) => membership.user_id))];

  const rows = await loadUserRows(visibleUserIds);
  const historyByUserId = await loadHistoryForUsers(rows.map((row) => row.id));
  const users = await enrichUsers(rows, visibleMemberships, historyByUserId);
  res.json(users);
};

/**
 * GET /api/users/:id
 *
 * Input:
 * - req.params.id: UUID user cần xem.
 * - req.access: scope actor.
 *
 * Output:
 * - JSON user đã enrich membership/history.
 *
 * Lỗi:
 * - 404 nếu user không tồn tại hoặc nằm ngoài scope actor.
 */
export const getUserById = async (req, res) => {
  const row = await loadUserRowById(req.params.id);
  const memberships = req.access.isSuperAdmin
    ? (await loadVisibleMemberships(req)).filter((membership) => String(membership.user_id) === String(row.id))
    : await loadVisibleMembershipsForUser(req, row.id);

  if (!req.access.isSuperAdmin && !memberships.length) {
    throw new ApiError(404, 'User not found', { expose: true });
  }

  const historyByUserId = await loadHistoryForUsers([row.id]);
  const [user] = await enrichUsers([row], memberships, historyByUserId);
  res.json(user);
};

/**
 * POST /api/users
 *
 * Input:
 * - req.body.fullName/email/phone/status: thông tin user.
 * - req.body.role/companyId/salonId hoặc req.body.membership: membership ban đầu.
 *
 * Output:
 * - 201 JSON user vừa tạo kèm membership.
 *
 * Side effects:
 * - Insert vào `users`.
 * - Insert vào `user_memberships`.
 * - Nếu tạo membership lỗi, rollback thủ công bằng cách xóa user vừa tạo.
 */
export const createUser = async (req, res) => {
  const payload = normalizeUserInput(req.body || {});
  const membershipScope = membershipInputWithDefaults(req, req.body || {});
  await assertMembershipAssignable(req, membershipScope);

  const { data, error } = await supabase
    .from('users')
    .insert([payload])
    .select(USER_FIELDS)
    .single();

  if (error) throwUserDatabaseError('create user', error);

  const { data: membership, error: membershipError } = await supabase
    .from('user_memberships')
    .insert([{
      user_id: data.id,
      ...membershipScope,
      status: payload.status || 'active'
    }])
    .select(MEMBERSHIP_FIELDS)
    .single();

  if (membershipError) {
    await supabase.from('users').delete().eq('id', data.id);
    throwUserDatabaseError('create user membership', membershipError);
  }

  const [user] = await enrichUsers([data], [membership]);
  res.status(201).json(user);
};

/**
 * PUT /api/users/:id
 *
 * Input:
 * - req.params.id: UUID user cần update.
 * - req.body: field user partial và/hoặc role/companyId/salonId/membershipId.
 *
 * Output:
 * - JSON user sau khi update, đã enrich membership/history.
 *
 * Side effects:
 * - Update `users` nếu có field user.
 * - Update `user_memberships` nếu có field role/scope.
 * - Insert `user_membership_history` nếu membership thật sự đổi.
 */
export const updateUser = async (req, res) => {
  const existing = await loadUserRowById(req.params.id);
  const visibleMemberships = req.access.isSuperAdmin
    ? (await loadVisibleMemberships(req)).filter((membership) => String(membership.user_id) === String(existing.id))
    : await loadVisibleMembershipsForUser(req, existing.id);

  if (!req.access.isSuperAdmin && !visibleMemberships.length) {
    throw new ApiError(404, 'User not found', { expose: true });
  }

  const payload = normalizeUserInput(req.body || {}, { partial: true });
  const hasMembershipPatch = req.body?.role !== undefined ||
    req.body?.companyId !== undefined ||
    req.body?.company_id !== undefined ||
    req.body?.salonId !== undefined ||
    req.body?.salon_id !== undefined ||
    req.body?.membership !== undefined;

  let row = existing;
  if (Object.keys(payload).length) {
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
    row = data;
  }

  let memberships = visibleMemberships;
  if (hasMembershipPatch) {
    // Nếu user có nhiều membership, client có thể gửi membershipId.
    // Nếu không, backend dùng membership đầu tiên trong scope actor nhìn thấy.
    const membershipId = req.body?.membershipId || req.body?.membership_id || req.body?.membership?.id || null;
    const currentMembership = membershipId
      ? visibleMemberships.find((membership) => String(membership.id) === String(membershipId))
      : visibleMemberships[0];

    if (!currentMembership) {
      throw new ApiError(404, 'User membership not found', { expose: true });
    }

    const nextScope = membershipInputWithDefaults(req, {
      ...currentMembership,
      role: req.body.role ?? req.body.membership?.role ?? currentMembership.role,
      companyId: req.body.companyId ?? req.body.company_id ?? req.body.membership?.companyId ?? currentMembership.company_id,
      salonId: req.body.salonId ?? req.body.salon_id ?? req.body.membership?.salonId ?? currentMembership.salon_id
    });
    await assertMembershipAssignable(req, nextScope);
    await insertMembershipHistory(row.id, currentMembership, nextScope, req.actor.id);

    const { data, error } = await supabase
      .from('user_memberships')
      .update({
        ...nextScope,
        updated_at: new Date().toISOString()
      })
      .eq('id', currentMembership.id)
      .select(MEMBERSHIP_FIELDS)
      .single();

    if (error) throwUserDatabaseError('update user membership', error);

    memberships = visibleMemberships.map((membership) => (
      String(membership.id) === String(data.id) ? data : membership
    ));
  }

  const historyByUserId = await loadHistoryForUsers([row.id]);
  const [user] = await enrichUsers([row], memberships, historyByUserId);
  res.json(user);
};

/**
 * DELETE /api/users/:id
 *
 * Input:
 * - req.params.id: UUID user cần xóa.
 *
 * Output:
 * - 204 No Content nếu xóa thành công.
 *
 * Lỗi:
 * - 404 nếu user nằm ngoài scope hoặc không tồn tại.
 * - 409 nếu user còn record liên quan bị FK chặn.
 */
export const deleteUser = async (req, res) => {
  const visibleMemberships = req.access.isSuperAdmin
    ? (await loadVisibleMemberships(req)).filter((membership) => String(membership.user_id) === String(req.params.id))
    : await loadVisibleMembershipsForUser(req, req.params.id);

  if (!req.access.isSuperAdmin && !visibleMemberships.length) {
    throw new ApiError(404, 'User not found', { expose: true });
  }

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
