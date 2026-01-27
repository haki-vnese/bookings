import express from 'express'
import catchAsync from '../utils/catchAsync.js'
import validate from '../middleware/validate.js'
import { verifyAuth, authorize } from '../middleware/auth.js'
import { technicianServiceSchemas } from '../validation/schemas.js'
import {
  getAllTechnicianServices,
  getTechnicianServiceById,
  createTechnicianService,
  deleteTechnicianService 
} from '../controllers/technicianServicesController.js'

const router = express.Router()

router.get('/', verifyAuth, authorize('admin'), catchAsync(getAllTechnicianServices)) 
router.get('/:id', verifyAuth, authorize('admin'), catchAsync(getTechnicianServiceById))
router.post('/', validate(technicianServiceSchemas.create), verifyAuth, authorize('admin'), catchAsync(createTechnicianService))
router.delete('/:id', verifyAuth, authorize('admin'), catchAsync(deleteTechnicianService))

export default router
