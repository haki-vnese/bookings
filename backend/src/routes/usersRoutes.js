import express from 'express'
import catchAsync from '../utils/catchAsync.js'
import validate from '../middleware/validate.js'
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

router.get('/', catchAsync(getAllUsers))
router.get('/technicians', catchAsync(getTechnicians))
router.get('/customers', catchAsync(getCustomers))
router.get('/:id', catchAsync(getUserById))
router.post('/', validate(userSchemas.create), catchAsync(createUser))
router.put('/:id', validate(userSchemas.update), catchAsync(updateUser))
router.delete('/:id', catchAsync(deleteUser))

export default router
