import ApiError from "../utils/ApiError.js";
import { resolveReadableSalonIds } from "../utils/accessControl.js";

/**
 * Resolve salon context cho các route còn cần `req.salonId` legacy.
 *
 * Input:
 * - req.access: scope actor đã được requireAuthContext tạo.
 * - Header optional `x-salon-id`: salon client muốn filter.
 * - ENV optional DEV_SALON_ID khi chạy development.
 *
 * Output:
 * - Gắn vào req:
 *   - req.salonId: salon chính cho controller cũ.
 *   - req.salonIds: danh sách salon actor được phép đọc, hoặc null nếu super_admin.
 * - Gọi next() nếu hợp lệ.
 *
 * Lỗi:
 * - 400 nếu route cần salon nhưng không resolve được salon nào.
 * - 403 được throw từ resolveReadableSalonIds nếu client yêu cầu salon ngoài scope.
 */
export function requireSalonHeader(req, res, next) {
  const salonIdFromHeader = req.header("x-salon-id");
  const devSalonId = process.env.DEV_SALON_ID;
  const isDev = process.env.NODE_ENV === "development";
  const scopedSalonIds = req.access ? resolveReadableSalonIds(req) : null;

  if (scopedSalonIds?.length) {
    req.salonId = salonIdFromHeader || scopedSalonIds[0];
    req.salonIds = scopedSalonIds;
    return next();
  }

  if (scopedSalonIds === null) {
    req.salonId = salonIdFromHeader || devSalonId || null;
    req.salonIds = null;
    return next();
  }

  if (!salonIdFromHeader && !(isDev && devSalonId)) {
    return next(new ApiError(400, "Missing x-salon-id header", { expose: true }));
  }

  req.salonId = salonIdFromHeader || devSalonId;
  req.salonIds = req.salonId ? [req.salonId] : [];
  return next();
}
