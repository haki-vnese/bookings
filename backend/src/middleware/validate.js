import ApiError from '../utils/ApiError.js';

/**
 * Validate middleware: validates request body against a Joi schema
 * Throws ApiError(400) with detailed validation messages if validation fails
 * @param {Joi.Schema} schema - The Joi schema to validate against
 * @returns {Function} Express middleware
 */
export default function validate(schema) {
  return async (req, res, next) => {
    try {
      // Use validateAsync() to support Joi schemas with external() rules
      const value = await schema.validateAsync(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });
      req.body = value;
      next();
    } catch (error) {
      if (error.isJoi) {
        const messages = error.details
          .map((detail) => detail.message)
          .join('; ');
        return next(new ApiError(400, `Validation failed: ${messages}`, { expose: true }));
      }
      next(error);
    }
  };
}
