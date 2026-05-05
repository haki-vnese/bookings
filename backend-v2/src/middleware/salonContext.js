import ApiError from "../utils/ApiError.js";

export function requireSalonHeader(req, res, next) {
  const salonIdFromHeader = req.header("x-salon-id");
  const devSalonId = process.env.DEV_SALON_ID;
  const isDev = process.env.NODE_ENV === "development";

  if (!salonIdFromHeader && !(isDev && devSalonId)) {
    return next(new ApiError(400, "Missing x-salon-id header", { expose: true }));
  }

  req.salonId = salonIdFromHeader || devSalonId;
  return next();
}

