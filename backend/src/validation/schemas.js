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
    password: Joi.string().required().min(6).max(128).messages({
      'string.empty': 'Password is required',
      'string.min': 'Password must be at least 6 characters',
      'string.max': 'Password must be less than 128 characters',
    }),
    role: Joi.string().valid('technician', 'customer').required().messages({
      'any.only': 'Role must be either "technician" or "customer"',
    }),
  }),
  login: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Must be a valid email address',
    }),
    password: Joi.string().required().messages({
      'string.empty': 'Password is required',
    }),
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
    role: Joi.string().valid('technician', 'customer').required().messages({
      'any.only': 'Role must be either "technician" or "customer"',
    }),
  }),
  update: Joi.object({
    name: Joi.string().max(255).optional(),
    email: Joi.string().email().max(255).optional(),
    role: Joi.string().valid('technician', 'customer').optional(),
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
