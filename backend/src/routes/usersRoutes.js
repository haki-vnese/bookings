/**
 * User routes.
 *
 * Most endpoints are admin/superuser-only.  PUT /me allows any authenticated
 * user to update their own profile fields.
 */
import express from 'express'
import catchAsync from '../utils/catchAsync.js'
import validate from '../middleware/validate.js'
import { verifyAuth, authorize } from '../middleware/auth.js'
import { userSchemas } from '../validation/schemas.js'
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getStaff,
  updateCurrentUser
} from '../controllers/usersController.js'

const router = express.Router()

router.get('/', verifyAuth, authorize('admin', 'superuser'), catchAsync(getAllUsers))
router.get('/staff', verifyAuth, authorize('admin', 'superuser'), catchAsync(getStaff))
router.put('/me', verifyAuth, validate(userSchemas.update), catchAsync(updateCurrentUser))
router.get('/:id', verifyAuth, authorize('admin', 'superuser'), catchAsync(getUserById))
router.post('/', verifyAuth, authorize('admin', 'superuser'), validate(userSchemas.create), catchAsync(createUser))
router.put('/:id', verifyAuth, authorize('admin', 'superuser'), validate(userSchemas.update), catchAsync(updateUser))
router.delete('/:id', verifyAuth, authorize('admin', 'superuser'), catchAsync(deleteUser))

export default router
