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

router.get('/', verifyAuth, authorize('admin', 'superuser'), catchAsync(getAllTechnicianServices)) 
router.get('/:id', verifyAuth, authorize('admin', 'superuser'), catchAsync(getTechnicianServiceById))
router.post('/', validate(technicianServiceSchemas.create), verifyAuth, authorize('admin', 'superuser'), catchAsync(createTechnicianService))
router.delete('/:id', verifyAuth, authorize('admin', 'superuser'), catchAsync(deleteTechnicianService))

export default router
