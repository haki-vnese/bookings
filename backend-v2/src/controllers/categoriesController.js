import supabase from '../db/supabase.js';
import ApiError from '../utils/ApiError.js';
import { loadSalonScope } from '../utils/accessControl.js';

const FIELDS = `
  id,
  company_id,
  name,
  slug,
  description,
  sort_order,
  is_active,
  online,
  checkin,
  created_at,
  updated_at,
  color
`;

function toApiCategory(row) {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    slug: row.slug ?? null,
    description: row.description ?? '',
    sortOrder: row.sort_order ?? 0,
    isActive: Boolean(row.is_active),
    online: row.online ?? true,
    checkin: row.checkin ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    color: row.color ?? ''
  };
}

function slugify(name) {
  return name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
}

function canManageCategories(req) {
  return req.access?.isSuperAdmin || req.access?.effectiveRole === 'company_admin';
}

function assertCanManageCategories(req) {
  if (!canManageCategories(req)) {
    throw new ApiError(403, 'Only company administrators can manage shared categories', { expose: true });
  }
}

async function getCompanyId(req) {
  if (!req.salonId) {
    throw new ApiError(400, 'Salon ID is required', { expose: true });
  }
  const salon = await loadSalonScope(req.salonId);
  if (!salon?.company_id) {
    throw new ApiError(400, 'This salon is not linked to a company', { expose: true });
  }
  return salon.company_id;
}

function throwCategoryError(action, error) {
  if (error?.code === '23505') {
    throw new ApiError(409, 'A category with this name already exists for this company', { details: error, expose: true });
  }
  if (error?.code === '23503') {
    throw new ApiError(409, 'This category is in use and cannot be removed', { details: error, expose: true });
  }
  throw new ApiError(500, `Failed to ${action}`, { details: error });
}

export const getAllCategories = async (req, res) => {
  const companyId = await getCompanyId(req);
  const { data, error } = await supabase
    .from('categories')
    .select(FIELDS)
    .eq('company_id', companyId)
    .order('sort_order', { ascending: true })
    .order('is_active', { ascending: false })
    .order('name', { ascending: true });

  if (error) throw new ApiError(500, 'Failed to fetch categories', { details: error });
  res.json((data || []).map(toApiCategory));
};

export const getCategoryById = async (req, res) => {
  const companyId = await getCompanyId(req);
  const { data, error } = await supabase
    .from('categories')
    .select(FIELDS)
    .eq('company_id', companyId)
    .eq('id', req.params.id)
    .maybeSingle();

  if (error) throw new ApiError(500, 'Failed to fetch category', { details: error });
  if (!data) throw new ApiError(404, 'Category not found', { expose: true });
  res.json(toApiCategory(data));
};

export const createCategory = async (req, res) => {
  assertCanManageCategories(req);
  const companyId = await getCompanyId(req);
  const name = String(req.body?.name || '').trim();
  if (!name) throw new ApiError(400, 'Category name is required', { expose: true });

  const { data, error } = await supabase
    .from('categories')
    .insert({
      company_id: companyId,
      name,
      slug: slugify(name),
      description: String(req.body?.description || '').trim(),
      color: String(req.body?.color || '').trim(),
      online: req.body?.online ?? true,
      checkin: req.body?.checkin ?? true
    })
    .select(FIELDS)
    .single();

  if (error) throwCategoryError('create category', error);
  res.status(201).json(toApiCategory(data));
};

export const updateCategory = async (req, res) => {
  assertCanManageCategories(req);
  const companyId = await getCompanyId(req);
  const input = req.body || {};
  const updateData = {};

  if (input.name !== undefined) {
    const name = String(input.name).trim();
    if (!name) throw new ApiError(400, 'Category name is required', { expose: true });
    updateData.name = name;
    updateData.slug = slugify(name);
  }
  if (input.description !== undefined) updateData.description = String(input.description || '').trim();
  if (input.color !== undefined) updateData.color = String(input.color || '').trim();
  if (input.online !== undefined) updateData.online = Boolean(input.online);
  if (input.checkin !== undefined) updateData.checkin = Boolean(input.checkin);
  if (input.isActive !== undefined) updateData.is_active = Boolean(input.isActive);
  if (!Object.keys(updateData).length) throw new ApiError(400, 'No category changes were provided', { expose: true });

  const { data, error } = await supabase
    .from('categories')
    .update(updateData)
    .eq('company_id', companyId)
    .eq('id', req.params.id)
    .select(FIELDS)
    .maybeSingle();

  if (error) throwCategoryError('update category', error);
  if (!data) throw new ApiError(404, 'Category not found', { expose: true });
  res.json(toApiCategory(data));
};

// Keep the existing endpoint compatible while making removal safe for services:
// categories are deactivated, not physically deleted.
export const deleteCategory = async (req, res) => {
  assertCanManageCategories(req);
  const companyId = await getCompanyId(req);
  const { data, error } = await supabase
    .from('categories')
    .update({ is_active: false })
    .eq('company_id', companyId)
    .eq('id', req.params.id)
    .select('id')
    .maybeSingle();

  if (error) throwCategoryError('deactivate category', error);
  if (!data) throw new ApiError(404, 'Category not found', { expose: true });
  res.status(204).send();
};

export const seedCategoriesIfEmpty = async (req, res) => {
  assertCanManageCategories(req);
  const companyId = await getCompanyId(req);
  const { data: existing, error: fetchError } = await supabase
    .from('categories')
    .select('id')
    .eq('company_id', companyId)
    .limit(1);

  if (fetchError) throw new ApiError(500, 'Failed to check existing categories', { details: fetchError });
  if (existing?.length) return res.json({ message: 'Company categories already exist; seeding skipped' });

  const defaults = [
    { name: 'Nail Services', description: 'All nail related services', color: '#FFB6C1' },
    { name: 'Hair Services', description: 'All hair related services', color: '#ADD8E6' },
    { name: 'Skin Care', description: 'Facials and skin treatments', color: '#90EE90' },
    { name: 'Massage', description: 'Relaxing massage services', color: '#FFD700' }
  ];
  const { data, error } = await supabase
    .from('categories')
    .insert(defaults.map((category) => ({
      company_id: companyId,
      name: category.name,
      slug: slugify(category.name),
      description: category.description,
      color: category.color,
      online: true,
      checkin: true
    })))
    .select(FIELDS);

  if (error) throwCategoryError('seed categories', error);
  res.status(201).json((data || []).map(toApiCategory));
};
