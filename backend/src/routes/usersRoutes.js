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
  getTechnicians,
  getCustomers
} from '../controllers/usersController.js'

const router = express.Router()

router.get('/', verifyAuth, authorize('admin'), catchAsync(getAllUsers))
router.get('/technicians', verifyAuth, authorize('admin'), catchAsync(getTechnicians))
router.get('/customers', verifyAuth, authorize('admin'), catchAsync(getCustomers))
router.get('/:id', verifyAuth, authorize('admin'), catchAsync(getUserById))
router.post('/', validate(userSchemas.create), verifyAuth, authorize('admin'), catchAsync(createUser))
router.put('/:id', validate(userSchemas.update), verifyAuth, authorize('admin'), catchAsync(updateUser))
router.delete('/:id', verifyAuth, authorize('admin'), catchAsync(deleteUser))

export default router
