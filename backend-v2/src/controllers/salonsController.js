import supabase from '../db/supabase.js';
import ApiError from '../utils/ApiError.js';
import {
  createAddressRecord,
  updateAddressRecord,
  toApiAddress
} from './addressesController.js';

const SALON_FIELDS = `
  id,
  company_id,
  name,
  address_id,
  phone,
  email,
  created_at,
  updated_at,
  created_by,
  updated_by
`;

const ADDRESS_FIELDS = `
  id,
  line1,
  line2,
  city,
  state,
  postal_code,
  country,
  created_at,
  updated_at
`;

function throwSalonDatabaseError(action, error) {
  if (error?.code === '42P01') {
    throw new ApiError(500, 'Salons or addresses table is missing.', { details: error });
  }

  if (error?.code === '42703') {
    throw new ApiError(500, 'Salons schema is missing a required column.', { details: error });
  }

  if (error?.code === '42501') {
    throw new ApiError(500, 'Supabase permissions blocked salons access. Check RLS policies or the backend Supabase key.', {
      details: error
    });
  }

  if (error?.code === '23505') {
    throw new ApiError(409, 'Salon already exists', { details: error, expose: true });
  }

  throw new ApiError(500, `Failed to ${action}`, { details: error });
}

function toApiSalon(row, address = null) {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    addressId: row.address_id,
    address: toApiAddress(address),
    phone: row.phone,
    email: row.email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by
  };
}

function normalizeSalonInput(input = {}, { partial = false } = {}) {
  const payload = {};

  if (input.name !== undefined) payload.name = String(input.name).trim();
  if (input.phone !== undefined) payload.phone = String(input.phone).trim();
  if (input.email !== undefined) payload.email = String(input.email).trim();
  if (input.companyId !== undefined) payload.company_id = input.companyId;
  if (input.company_id !== undefined) payload.company_id = input.company_id;
  if (input.addressId !== undefined) payload.address_id = input.addressId;
  if (input.address_id !== undefined) payload.address_id = input.address_id;

  if (partial && input.email !== undefined && !payload.email) {
    throw new ApiError(400, 'Salon email cannot be empty', { expose: true });
  }

  if (partial && input.phone !== undefined && !payload.phone) {
    throw new ApiError(400, 'Salon phone cannot be empty', { expose: true });
  }

  if (!partial) {
    if (!payload.company_id) {
      throw new ApiError(400, 'Company is required for salon', { expose: true });
    }
    if (!payload.name) {
      throw new ApiError(400, 'Salon name is required', { expose: true });
    }
    if (!payload.email) {
      throw new ApiError(400, 'Salon email is required', { expose: true });
    }
    if (!payload.phone) {
      throw new ApiError(400, 'Salon phone is required', { expose: true });
    }
    if (!payload.address_id && !input.address) {
      throw new ApiError(400, 'Salon address is required', { expose: true });
    }
  }

  return payload;
}

async function loadAddressesById(addressIds) {
  const uniqueIds = [...new Set(addressIds.filter(Boolean))];
  if (!uniqueIds.length) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('addresses')
    .select(ADDRESS_FIELDS)
    .in('id', uniqueIds);

  if (error) {
    throwSalonDatabaseError('fetch salon addresses', error);
  }

  return new Map((data || []).map((address) => [address.id, address]));
}

async function loadSalonById(id) {
  const { data, error } = await supabase
    .from('salons')
    .select(SALON_FIELDS)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new ApiError(404, 'Salon not found', { expose: true });
    }
    throwSalonDatabaseError('fetch salon', error);
  }

  const addressesById = await loadAddressesById([data.address_id]);
  return toApiSalon(data, addressesById.get(data.address_id));
}

export const getSalonsByCompanyId = async (req, res) => {
  const { companyId } = req.params;

  const { data, error } = await supabase
    .from('salons')
    .select(SALON_FIELDS)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) {
    throwSalonDatabaseError('fetch salons', error);
  }

  const rows = data || [];
  const addressesById = await loadAddressesById(rows.map((salon) => salon.address_id));
  res.json(rows.map((salon) => toApiSalon(salon, addressesById.get(salon.address_id))));
};

export const createSalon = async (req, res) => {
  const payload = normalizeSalonInput({
    ...(req.body || {}),
    companyId: req.params.companyId
  });

  if (!payload.address_id && req.body?.address) {
    const address = await createAddressRecord(req.body.address);
    payload.address_id = address.id;
  }

  const { data, error } = await supabase
    .from('salons')
    .insert([payload])
    .select(SALON_FIELDS)
    .single();

  if (error) {
    throwSalonDatabaseError('create salon', error);
  }

  const addressesById = await loadAddressesById([data.address_id]);
  res.status(201).json(toApiSalon(data, addressesById.get(data.address_id)));
};

export const updateSalon = async (req, res) => {
  const existing = await loadSalonById(req.params.id);
  const payload = normalizeSalonInput(req.body || {}, { partial: true });

  if (req.body?.address) {
    if (existing.addressId) {
      const address = await updateAddressRecord(existing.addressId, req.body.address);
      payload.address_id = address.id;
    } else {
      const address = await createAddressRecord(req.body.address);
      payload.address_id = address.id;
    }
  }

  if (!Object.keys(payload).length) {
    return res.json(existing);
  }

  const { data, error } = await supabase
    .from('salons')
    .update(payload)
    .eq('id', req.params.id)
    .select(SALON_FIELDS)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new ApiError(404, 'Salon not found', { expose: true });
    }
    throwSalonDatabaseError('update salon', error);
  }

  const addressesById = await loadAddressesById([data.address_id]);
  res.json(toApiSalon(data, addressesById.get(data.address_id)));
};

export const deleteSalon = async (req, res) => {
  const { data, error } = await supabase
    .from('salons')
    .delete()
    .eq('id', req.params.id)
    .select('id');

  if (error) {
    throw new ApiError(409, 'Salon cannot be deleted while related records exist', { details: error, expose: true });
  }

  if (!data || !data.length) {
    throw new ApiError(404, 'Salon not found', { expose: true });
  }

  res.status(204).send();
};
