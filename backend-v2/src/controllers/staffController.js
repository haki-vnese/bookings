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
  deleted_at,
  deleted_by,
  created_at,
  updated_at
`;

const STAFF_ASSIGNMENT_FIELDS = `
  id,
  staff_id,
  salon_id,
  active,
  from_date,
  to_date,
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
    throw new ApiError(500, 'Staff, staff salon assignments, or users table is missing.', { details: error });
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
    throw new ApiError(409, 'Staff member already has an active salon assignment', { details: error, expose: true });
  }

  throw new ApiError(500, `Failed to ${action}`, { details: error });
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
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

function toApiStaff(row, user = null, assignment = null) {
  return {
    id: row.id,
    salonId: assignment?.salon_id || row.salon_id,
    assignmentId: assignment?.id || null,
    assignmentActive: assignment ? Boolean(assignment.active) : Boolean(row.is_active),
    fromDate: assignment?.from_date || null,
    toDate: assignment?.to_date || null,
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
    deletedAt: row.deleted_at || null,
    deletedBy: row.deleted_by || null,
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

function normalizeAssignmentInput(input = {}, currentSalonId) {
  const payload = {
    salon_id: input.salonId || input.salon_id || currentSalonId
  };

  if (input.assignmentActive !== undefined) payload.active = Boolean(input.assignmentActive);
  if (input.assignment_active !== undefined) payload.active = Boolean(input.assignment_active);
  if (input.fromDate !== undefined) payload.from_date = input.fromDate || null;
  if (input.from_date !== undefined) payload.from_date = input.from_date || null;
  if (input.toDate !== undefined) payload.to_date = input.toDate || null;
  if (input.to_date !== undefined) payload.to_date = input.to_date || null;

  if (!payload.salon_id) {
    throw new ApiError(400, 'Salon ID is required', { expose: true });
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

async function loadAssignmentForStaff(staffId, salonId) {
  const { data, error } = await supabase
    .from('staff_salon_assignments')
    .select(STAFF_ASSIGNMENT_FIELDS)
    .eq('staff_id', staffId)
    .eq('salon_id', salonId)
    .order('active', { ascending: false })
    .order('from_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throwStaffDatabaseError('fetch staff salon assignment', error);
  }

  return data || null;
}

async function loadStaffRowById(id) {
  const { data, error } = await supabase
    .from('staff')
    .select(STAFF_FIELDS)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new ApiError(404, 'Staff member not found', { expose: true });
    }
    throwStaffDatabaseError('fetch staff member', error);
  }

  return data;
}

async function loadStaffById(id, salonId) {
  const assignment = await loadAssignmentForStaff(id, salonId);
  if (!assignment) {
    throw new ApiError(404, 'Staff member not found in this salon', { expose: true });
  }

  const staff = await loadStaffRowById(id);
  const usersById = await loadUsersById([staff.user_id]);
  return toApiStaff(staff, usersById.get(staff.user_id), assignment);
}

async function closeActiveAssignments(staffId, exceptSalonId = null) {
  let query = supabase
    .from('staff_salon_assignments')
    .update({
      active: false,
      to_date: todayDateString(),
      updated_at: new Date().toISOString()
    })
    .eq('staff_id', staffId)
    .eq('active', true);

  if (exceptSalonId) {
    query = query.neq('salon_id', exceptSalonId);
  }

  const { error } = await query;

  if (error) {
    throwStaffDatabaseError('close active staff salon assignments', error);
  }
}

async function createAssignment(staffId, assignmentInput) {
  const payload = {
    staff_id: staffId,
    salon_id: assignmentInput.salon_id,
    active: assignmentInput.active ?? true,
    from_date: assignmentInput.from_date || todayDateString(),
    to_date: assignmentInput.to_date || null
  };

  if (payload.active) {
    await closeActiveAssignments(staffId, payload.salon_id);
  }

  const { data, error } = await supabase
    .from('staff_salon_assignments')
    .insert([payload])
    .select(STAFF_ASSIGNMENT_FIELDS)
    .single();

  if (error) {
    throwStaffDatabaseError('create staff salon assignment', error);
  }

  return data;
}

async function updateAssignment(assignment, patch) {
  if (patch.active === true) {
    await closeActiveAssignments(assignment.staff_id, assignment.salon_id);
  }

  const payload = {
    updated_at: new Date().toISOString()
  };

  if (patch.active !== undefined) payload.active = Boolean(patch.active);
  if (patch.from_date !== undefined) payload.from_date = patch.from_date || null;
  if (patch.to_date !== undefined) payload.to_date = patch.to_date || null;

  const { data, error } = await supabase
    .from('staff_salon_assignments')
    .update(payload)
    .eq('id', assignment.id)
    .select(STAFF_ASSIGNMENT_FIELDS)
    .single();

  if (error) {
    throwStaffDatabaseError('update staff salon assignment', error);
  }

  return data;
}

async function deleteLinkedUserIfRequested(userId, shouldDeleteUser) {
  if (!shouldDeleteUser || !userId) {
    return;
  }

  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', userId);

  if (error) {
    throw new ApiError(409, 'Linked user cannot be deleted while related records exist', { details: error, expose: true });
  }
}

export const getAllStaff = async (req, res) => {
  const salonId = req.salonId;
  const includeDeleted = String(req.query.includeDeleted || '').toLowerCase() === 'true';
  const includeInactiveAssignments = String(req.query.includeInactiveAssignments || '').toLowerCase() === 'true';

  let assignmentQuery = supabase
    .from('staff_salon_assignments')
    .select(STAFF_ASSIGNMENT_FIELDS)
    .eq('salon_id', salonId)
    .order('active', { ascending: false })
    .order('from_date', { ascending: false });

  if (!includeInactiveAssignments) {
    assignmentQuery = assignmentQuery.eq('active', true);
  }

  const { data: assignments, error: assignmentError } = await assignmentQuery;

  if (assignmentError) {
    throwStaffDatabaseError('fetch staff salon assignments', assignmentError);
  }

  const assignmentRows = assignments || [];
  const staffIds = [...new Set(assignmentRows.map((assignment) => assignment.staff_id).filter(Boolean))];
  if (!staffIds.length) {
    return res.json([]);
  }

  let staffQuery = supabase
    .from('staff')
    .select(STAFF_FIELDS)
    .in('id', staffIds)
    .order('sort_order', { ascending: true })
    .order('display_name', { ascending: true });

  if (!includeDeleted) {
    staffQuery = staffQuery.is('deleted_at', null);
  }

  const { data, error } = await staffQuery;

  if (error) {
    throwStaffDatabaseError('fetch staff', error);
  }

  const rows = data || [];
  const usersById = await loadUsersById(rows.map((staff) => staff.user_id));
  const assignmentByStaffId = new Map(assignmentRows.map((assignment) => [assignment.staff_id, assignment]));

  res.json(rows.map((staff) => toApiStaff(staff, usersById.get(staff.user_id), assignmentByStaffId.get(staff.id))));
};

export const getStaffById = async (req, res) => {
  res.json(await loadStaffById(req.params.id, req.salonId));
};

export const createStaff = async (req, res) => {
  const payload = normalizeStaffInput(req.body || {}, req.salonId);
  const assignmentInput = normalizeAssignmentInput(req.body || {}, req.salonId);
  payload.salon_id = assignmentInput.salon_id;

  const { data, error } = await supabase
    .from('staff')
    .insert([payload])
    .select(STAFF_FIELDS)
    .single();

  if (error) {
    throwStaffDatabaseError('create staff member', error);
  }

  const assignment = await createAssignment(data.id, assignmentInput);
  const usersById = await loadUsersById([data.user_id]);
  res.status(201).json(toApiStaff(data, usersById.get(data.user_id), assignment));
};

export const updateStaff = async (req, res) => {
  const currentAssignment = await loadAssignmentForStaff(req.params.id, req.salonId);
  if (!currentAssignment) {
    throw new ApiError(404, 'Staff member not found in this salon', { expose: true });
  }

  const assignmentInput = normalizeAssignmentInput(req.body || {}, req.salonId);
  const shouldMoveSalon = assignmentInput.salon_id && assignmentInput.salon_id !== currentAssignment.salon_id;
  const payload = normalizeStaffInput(req.body || {}, req.salonId, { partial: true });

  let data = await loadStaffRowById(req.params.id);

  if (Object.keys(payload).length) {
    const { data: updatedStaff, error } = await supabase
      .from('staff')
      .update(payload)
      .eq('id', req.params.id)
      .select(STAFF_FIELDS)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new ApiError(404, 'Staff member not found', { expose: true });
      }
      throwStaffDatabaseError('update staff member', error);
    }

    data = updatedStaff;
  }

  let assignment = currentAssignment;

  if (shouldMoveSalon) {
    await updateAssignment(currentAssignment, {
      active: false,
      to_date: assignmentInput.to_date || todayDateString()
    });

    assignment = await createAssignment(req.params.id, {
      salon_id: assignmentInput.salon_id,
      active: assignmentInput.active ?? true,
      from_date: assignmentInput.from_date || todayDateString(),
      to_date: null
    });

    const { error: syncError } = await supabase
      .from('staff')
      .update({ salon_id: assignmentInput.salon_id })
      .eq('id', req.params.id);

    if (syncError) {
      throwStaffDatabaseError('sync staff primary salon', syncError);
    }
  } else if (
    assignmentInput.active !== undefined ||
    assignmentInput.from_date !== undefined ||
    assignmentInput.to_date !== undefined
  ) {
    assignment = await updateAssignment(currentAssignment, assignmentInput);
  }

  const usersById = await loadUsersById([data.user_id]);
  res.json(toApiStaff(data, usersById.get(data.user_id), assignment));
};

export const deleteStaff = async (req, res) => {
  const shouldDeleteUser = String(req.query.deleteLinkedUser || req.body?.deleteLinkedUser || '').toLowerCase() === 'true';
  const staff = await loadStaffById(req.params.id, req.salonId);
  const currentAssignment = await loadAssignmentForStaff(req.params.id, req.salonId);

  const assignment = await updateAssignment(currentAssignment, {
    active: false,
    to_date: todayDateString()
  });

  const { data: activeAssignments, error: activeAssignmentsError } = await supabase
    .from('staff_salon_assignments')
    .select('id')
    .eq('staff_id', req.params.id)
    .eq('active', true)
    .limit(1);

  if (activeAssignmentsError) {
    throwStaffDatabaseError('check active staff salon assignments', activeAssignmentsError);
  }

  let staffRow = await loadStaffRowById(req.params.id);
  if (!activeAssignments?.length) {
    const updatePayload = {
      is_active: false,
      bookable: false
    };

    if (shouldDeleteUser) {
      updatePayload.user_id = null;
    }

    const { data: updatedStaff, error: updateStaffError } = await supabase
      .from('staff')
      .update(updatePayload)
      .eq('id', req.params.id)
      .select(STAFF_FIELDS)
      .single();

    if (updateStaffError) {
      throwStaffDatabaseError('deactivate staff member', updateStaffError);
    }

    staffRow = updatedStaff;
  }

  await deleteLinkedUserIfRequested(staff.userId, shouldDeleteUser);
  const usersById = await loadUsersById([staffRow.user_id]);
  res.status(200).json({
    staff: toApiStaff(staffRow, usersById.get(staffRow.user_id), assignment),
    deleted: false,
    softDeleted: true
  });
};
