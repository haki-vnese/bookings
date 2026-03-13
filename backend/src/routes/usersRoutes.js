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
router.put('/me', validate(userSchemas.update), verifyAuth, catchAsync(updateCurrentUser))
router.get('/:id', verifyAuth, authorize('admin', 'superuser'), catchAsync(getUserById))
router.post('/', validate(userSchemas.create), verifyAuth, authorize('admin', 'superuser'), catchAsync(createUser))
router.put('/:id', validate(userSchemas.update), verifyAuth, authorize('admin', 'superuser'), catchAsync(updateUser))
router.delete('/:id', verifyAuth, authorize('admin', 'superuser'), catchAsync(deleteUser))

export default router
