import express from 'express'
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

router.get('/', getAllUsers)
router.get('/technicians', getTechnicians)
router.get('/customers', getCustomers)
router.get('/:id', getUserById)
router.post('/', createUser)
router.put('/:id', updateUser)
router.delete('/:id', deleteUser)

export default router
