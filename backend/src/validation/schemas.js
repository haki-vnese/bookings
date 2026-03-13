import Joi from 'joi';

// Auth validation schemas
export const authSchemas = {
  register: Joi.object({
    name: Joi.string().required().max(255).messages({
      'string.empty': 'Name is required',
      'string.max': 'Name must be less than 255 characters',
    }),
    email: Joi.string().email().required().max(255).messages({
      'string.email': 'Must be a valid email address',
    }),
    username: Joi.string().alphanum().min(3).max(50).optional().messages({
      'string.alphanum': 'Username can only contain letters and numbers',
      'string.min': 'Username must be at least 3 characters',
      'string.max': 'Username must be less than 50 characters',
    }),
    password: Joi.string().required().min(6).max(128).messages({
      'string.empty': 'Password is required',
      'string.min': 'Password must be at least 6 characters',
      'string.max': 'Password must be less than 128 characters',
    }),
    role: Joi.string().valid('superuser', 'admin', 'staff', 'customer').required().messages({
      'any.only': 'Role must be one of "superuser", "admin", "staff", or "customer"',
    }),
    company_id: Joi.string().uuid().allow(null).optional(),
    salon_id: Joi.string().uuid().optional(),
  }),
  login: Joi.object({
    identifier: Joi.string().min(3).max(255).optional().messages({
      'string.empty': 'Email or username is required',
    }),
    password: Joi.string().required().messages({
      'string.empty': 'Password is required',
    }),
  })
    .or('identifier', 'email')
    .keys({
      email: Joi.string().email().optional(),
    }),
};

// Services validation schemas
export const serviceSchemas = {
  create: Joi.object({
    name: Joi.string().required().max(255).messages({
      'string.empty': 'Service name is required',
      'string.max': 'Service name must be less than 255 characters',
    }),
    description: Joi.string().max(1000).allow('').optional(),
    duration_minutes: Joi.number().integer().min(1).required().messages({
      'number.min': 'Duration must be at least 1 minute',
    }),
    price: Joi.number().precision(2).min(0).required().messages({
      'number.min': 'Price must be 0 or greater',
    }),
  }),
  update: Joi.object({
    name: Joi.string().max(255).optional(),
    description: Joi.string().max(1000).allow('').optional(),
    duration_minutes: Joi.number().integer().min(1).optional(),
    price: Joi.number().precision(2).min(0).optional(),
  }).min(1),
};

// Users validation schemas
export const userSchemas = {
  create: Joi.object({
    name: Joi.string().required().max(255).messages({
      'string.empty': 'User name is required',
    }),
    email: Joi.string().email().required().max(255).messages({
      'string.email': 'Must be a valid email address',
    }),
    username: Joi.string().alphanum().min(3).max(50).optional(),
    password: Joi.string().required().min(6).max(128).messages({
      'string.empty': 'Password is required',
      'string.min': 'Password must be at least 6 characters',
      'string.max': 'Password must be less than 128 characters',
    }),
    role: Joi.string().valid('superuser', 'admin', 'staff').required().messages({
      'any.only': 'Role must be one of "superuser", "admin", or "staff"',
    }),
    company_id: Joi.string().uuid().allow(null).optional(),
    salon_id: Joi.string().uuid().allow(null).optional(),
  }),
  update: Joi.object({
    name: Joi.string().max(255).optional(),
    email: Joi.string().email().max(255).optional(),
    username: Joi.string().alphanum().min(3).max(50).optional(),
    role: Joi.string().valid('superuser', 'admin', 'staff').optional(),
    company_id: Joi.string().uuid().allow(null).optional(),
    salon_id: Joi.string().uuid().allow(null).optional(),
  }).min(1),
};

export const companySchemas = {
  create: Joi.object({
    name: Joi.string().required().max(255).messages({
      'string.empty': 'Company name is required',
    }),
    address_id: Joi.string().uuid().allow(null).optional(),
  }),
  update: Joi.object({
    name: Joi.string().max(255).optional(),
    address_id: Joi.string().uuid().allow(null).optional(),
  }).min(1),
};

export const staffSchemas = {
  create: Joi.object({
    name: Joi.string().required().max(255),
    phone: Joi.string().max(30).allow('', null).optional(),
    email: Joi.string().email().allow('', null).optional(),
    address_id: Joi.string().uuid().allow(null).optional(),
    company_id: Joi.string().uuid().required(),
    salon_id: Joi.string().uuid().required(),
    user_id: Joi.string().uuid().allow(null).optional(),
  }),
  update: Joi.object({
    name: Joi.string().max(255).optional(),
    phone: Joi.string().max(30).allow('', null).optional(),
    email: Joi.string().email().allow('', null).optional(),
    address_id: Joi.string().uuid().allow(null).optional(),
    company_id: Joi.string().uuid().optional(),
    salon_id: Joi.string().uuid().optional(),
    user_id: Joi.string().uuid().allow(null).optional(),
  }).min(1),
};

export const customerSchemas = {
  create: Joi.object({
    name: Joi.string().required().max(255).messages({
      'string.empty': 'Customer name is required',
    }),
    email: Joi.string().email().required().max(255).messages({
      'string.email': 'Must be a valid email address',
    }),
    salon_id: Joi.string().uuid().optional(),
  }),
  update: Joi.object({
    name: Joi.string().max(255).optional(),
    email: Joi.string().email().max(255).optional(),
    salon_id: Joi.string().uuid().allow(null).optional(),
  }).min(1),
};

// Technician Services validation schemas
export const technicianServiceSchemas = {
  create: Joi.object({
    technician_id: Joi.string().uuid().required().messages({
      'string.guid': 'technician_id must be a valid UUID',
    }),
    service_id: Joi.string().uuid().required().messages({
      'string.guid': 'service_id must be a valid UUID',
    }),
    price: Joi.number().precision(2).min(0).optional(),
  }),
};

// Bookings validation schemas
export const bookingSchemas = {
  create: Joi.object({
    technician_id: Joi.string().uuid().required().messages({
      'string.guid': 'technician_id must be a valid UUID',
    }),
    customer_id: Joi.string().uuid().required().messages({
      'string.guid': 'customer_id must be a valid UUID',
    }),
    service_id: Joi.string().uuid().required().messages({
      'string.guid': 'service_id must be a valid UUID',
    }),
    start_time: Joi.date().iso().required().messages({
      'date.base': 'start_time must be a valid ISO date',
    }),
    end_time: Joi.date().iso().required().messages({
      'date.base': 'end_time must be a valid ISO date',
    }),
    note: Joi.string().max(1000).allow('').optional(),
  }).custom((value) => {
    // custom validation: end_time must be after start_time
    if (new Date(value.end_time) <= new Date(value.start_time)) {
      throw new Error('end_time must be after start_time');
    }
    return value;
  }),
  update: Joi.object({
    technician_id: Joi.string().uuid().optional(),
    customer_id: Joi.string().uuid().optional(),
    service_id: Joi.string().uuid().optional(),
    start_time: Joi.date().iso().optional(),
    end_time: Joi.date().iso().optional(),
    note: Joi.string().max(1000).allow('').optional(),
  }).min(1),
};
