import supabase from '../db/supabase.js';
import ApiError from '../utils/ApiError.js';
import { loadSalonScope } from '../utils/accessControl.js';

const SERVICE_FIELDS = `
  id,
  salon_id,
  company_id,
  category_id,
  name,
  description,
  price,
  duration_minutes,
  is_active,
  created_at,
  updated_at,
  created_by,
  updated_by,
  category:categories!services_category_company_fkey(name),
  creator:users!services_created_by_fkey(full_name),
  updater:users!services_updated_by_fkey(full_name)
`;

function toApiService(row) {
  return {
    id: row.id,
    salonId: row.salon_id,
    categoryId: row.category_id,
    categoryName: row.category?.name || '',
    name: row.name,
    description: row.description || '',
    price: Number(row.price),
    durationMinutes: row.duration_minutes,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.creator?.full_name || 'Former team member',
    updatedBy: row.updater?.full_name || row.creator?.full_name || 'Former team member'
  };
}

async function resolveSalon(req) {
  if (!req.salonId) throw new ApiError(400, 'Salon ID is required', { expose: true });
  const salon = await loadSalonScope(req.salonId);
  if (!salon?.company_id) throw new ApiError(400, 'This salon is not linked to a company', { expose: true });
  return salon;
}

async function validateCategory(categoryId, companyId, { requireActive = true } = {}) {
  if (!categoryId) throw new ApiError(400, 'Choose a category for this service', { expose: true });
  const { data, error } = await supabase
    .from('categories')
    .select('id, is_active')
    .eq('id', categoryId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) throw new ApiError(500, 'Failed to validate the service category', { details: error });
  if (!data || (requireActive && !data.is_active)) {
    throw new ApiError(400, 'Choose an active category from this company', { expose: true });
  }
}

function normalizeServiceInput(input, { partial = false } = {}) {
  const data = {};
  if (input.name !== undefined || !partial) {
    const name = String(input.name || '').trim();
    if (!name) throw new ApiError(400, 'Service name is required', { expose: true });
    data.name = name;
  }
  if (input.description !== undefined || !partial) data.description = String(input.description || '').trim();
  if (input.price !== undefined || !partial) {
    const price = input.price;
    const parsedPrice = Number(price);
    if (price === '' || price === null || price === undefined || !Number.isFinite(parsedPrice) || parsedPrice < 0 || parsedPrice > 99999999.99 || Math.round(parsedPrice * 100) / 100 !== parsedPrice) {
      throw new ApiError(400, 'Enter a valid price of zero or more', { expose: true });
    }
    data.price = parsedPrice;
  }
  if (input.durationMinutes !== undefined || input.duration_minutes !== undefined || !partial) {
    const duration = Number(input.durationMinutes ?? input.duration_minutes);
    if (!Number.isInteger(duration) || duration < 1) {
      throw new ApiError(400, 'Duration must be a whole number of minutes greater than zero', { expose: true });
    }
    data.duration_minutes = duration;
  }
  if (input.isActive !== undefined || input.active !== undefined || !partial) {
    data.is_active = Boolean(input.isActive ?? input.active ?? true);
  }
  if (input.categoryId !== undefined || input.category_id !== undefined || !partial) {
    data.category_id = input.categoryId ?? input.category_id;
    if (!data.category_id) throw new ApiError(400, 'Choose a category for this service', { expose: true });
  }
  return data;
}

function throwServiceError(action, error) {
  if (error?.code === '23503') {
    throw new ApiError(409, 'This service is being used by bookings or other records. Deactivate it instead.', {
      details: error,
      expose: true
    });
  }
  if (error?.code === '23505') {
    throw new ApiError(409, 'A service with this name already exists for this salon', { details: error, expose: true });
  }
  throw new ApiError(500, `Failed to ${action}`, { details: error });
}

export const getServices = async (req, res) => {
  await resolveSalon(req);
  const { data, error } = await supabase
    .from('services')
    .select(SERVICE_FIELDS)
    .eq('salon_id', req.salonId)
    .order('name', { ascending: true });

  if (error) throw new ApiError(500, 'Failed to fetch services', { details: error });
  res.json((data || []).map(toApiService));
};

export const getServiceById = async (req, res) => {
  await resolveSalon(req);
  const { data, error } = await supabase
    .from('services')
    .select(SERVICE_FIELDS)
    .eq('salon_id', req.salonId)
    .eq('id', req.params.id)
    .maybeSingle();

  if (error) throw new ApiError(500, 'Failed to fetch service', { details: error });
  if (!data) throw new ApiError(404, 'Service not found', { expose: true });
  res.json(toApiService(data));
};

export const createService = async (req, res) => {
  const salon = await resolveSalon(req);
  const service = normalizeServiceInput(req.body || {});
  await validateCategory(service.category_id, salon.company_id);

  const { data, error } = await supabase
    .from('services')
    .insert({
      ...service,
      salon_id: salon.id,
      company_id: salon.company_id,
      created_by: req.actor.id,
      updated_by: req.actor.id
    })
    .select(SERVICE_FIELDS)
    .single();

  if (error) throwServiceError('create service', error);
  res.status(201).json(toApiService(data));
};

export const updateService = async (req, res) => {
  const salon = await resolveSalon(req);
  const changes = normalizeServiceInput(req.body || {}, { partial: true });
  if (!Object.keys(changes).length) throw new ApiError(400, 'No service changes were provided', { expose: true });
  if (changes.category_id) {
    const { data: current, error: currentError } = await supabase
      .from('services')
      .select('category_id')
      .eq('salon_id', salon.id)
      .eq('id', req.params.id)
      .maybeSingle();
    if (currentError) throw new ApiError(500, 'Failed to load service', { details: currentError });
    if (!current) throw new ApiError(404, 'Service not found', { expose: true });
    await validateCategory(changes.category_id, salon.company_id, { requireActive: changes.category_id !== current.category_id });
  }

  const { data, error } = await supabase
    .from('services')
    .update({ ...changes, updated_by: req.actor.id, updated_at: new Date().toISOString() })
    .eq('salon_id', salon.id)
    .eq('id', req.params.id)
    .select(SERVICE_FIELDS)
    .maybeSingle();

  if (error) throwServiceError('update service', error);
  if (!data) throw new ApiError(404, 'Service not found', { expose: true });
  res.json(toApiService(data));
};

export const deleteService = async (req, res) => {
  const salon = await resolveSalon(req);
  const { data, error } = await supabase
    .from('services')
    .delete()
    .eq('salon_id', salon.id)
    .eq('id', req.params.id)
    .select('id')
    .maybeSingle();

  if (error) throwServiceError('delete service', error);
  if (!data) throw new ApiError(404, 'Service not found', { expose: true });
  res.status(204).send();
};
